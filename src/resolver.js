const axiosPromise = import('https://cdn.skypack.dev/axios');

let al_integmanager;

// Dynamically import agentlang integration manager
const loadIntegrationManager = async () => {
    if (!al_integmanager) {
        try {
            // Try to import from Skypack CDN
            const module = await import('https://cdn.skypack.dev/agentlang@latest');
            al_integmanager = module.integrations || module;
        } catch (error) {
            console.warn('Failed to load agentlang from CDN, using fallback configuration');
            // Fallback: Use window.agentlang if available
            if (typeof window !== 'undefined' && window.agentlang) {
                al_integmanager = window.agentlang.integrations;
            }
        }
    }
    return al_integmanager;
};

const BrowserConfig = {
    config: new Map(),

    init(configObj) {
        if (configObj && typeof configObj === 'object') {
            Object.entries(configObj).forEach(([key, value]) => {
                this.config.set(key, value);
            });
        }

        if (typeof window !== 'undefined' && window.localStorage) {
            const savedConfig = window.localStorage.getItem('slack_integration_config');
            if (savedConfig) {
                try {
                    const parsed = JSON.parse(savedConfig);
                    Object.entries(parsed).forEach(([key, value]) => {
                        if (!this.config.has(key)) {
                            this.config.set(key, value);
                        }
                    });
                } catch (e) {
                    console.warn('Failed to parse saved configuration:', e);
                }
            }
        }
    },

    get(key) {
        return this.config.get(key);
    },

    set(key, value) {
        this.config.set(key, value);
        // Persist to localStorage if available
        if (typeof window !== 'undefined' && window.localStorage) {
            const configObj = Object.fromEntries(this.config.entries());
            window.localStorage.setItem('slack_integration_config', JSON.stringify(configObj));
        }
    }
};

function getApiKey() {
    // Try integration manager first
    if (al_integmanager && al_integmanager.getIntegrationConfig) {
        const key = al_integmanager.getIntegrationConfig('slack', 'apiKey');
        if (key) return key;
    }

    // Fallback to browser config
    return BrowserConfig.get('apiKey');
}

// Get channel from configuration
function getChannel() {
    // Try integration manager first
    if (al_integmanager && al_integmanager.getIntegrationConfig) {
        const channel = al_integmanager.getIntegrationConfig('slack', 'channel');
        if (channel) return channel;
    }

    // Fallback to browser config
    return BrowserConfig.get('channel');
}

const SlackBaseUrl = "https://slack.com/api";

function getUrl(endpoint) {
    return `${SlackBaseUrl}/${endpoint}`;
}

function StandardHeaders() {
    const apiKey = getApiKey();
    if (!apiKey) {
        console.error('Slack API key not configured');
        return {
            "Content-Type": "application/json"
        };
    }

    return {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
    };
}

async function handleAxiosRequest(url, config) {
    try {
        const axios = (await axiosPromise).default;
        const response = await axios(url, config);
        return response.data;
    } catch (error) {
        if (error.response) {
            // Server responded with error status
            return {
                error: `HTTP error! status: ${error.response.status} ${error.response.statusText}`
            };
        } else if (error.request) {
            // Request made but no response
            return {
                error: `No response received from server`
            };
        } else {
            // Error in request setup
            return {
                error: error.message
            };
        }
    }
}

async function waitForReply(thread) {
    const channel = getChannel();
    if (!channel) {
        return { error: 'Channel not configured' };
    }

    const apiUrl = getUrl(`conversations.replies?ts=${thread}&channel=${channel}`);

    // Wait 10 seconds for a reply
    await new Promise(resolve => setTimeout(resolve, 10000));

    const resp = await handleAxiosRequest(apiUrl, {
        method: 'GET',
        headers: StandardHeaders()
    });

    if (resp.error) {
        return resp;
    }

    const msgs = resp['messages'];
    if (msgs && msgs.length >= 2) {
        return msgs[msgs.length - 1]['text'];
    } else {
        return 'no response';
    }
}

// Export send function - sends message to Slack channel
export async function send(channel, message, env) {
    const apiUrl = getUrl("chat.postMessage");
    const slackChannel = getChannel();

    if (!slackChannel) {
        return { error: 'Slack channel not configured' };
    }

    // Build message body
    const messageBody = {
        channel: slackChannel,
        text: message
    };

    const result = await handleAxiosRequest(apiUrl, {
        method: 'POST',
        headers: StandardHeaders(),
        data: messageBody
    });

    if (result.error) {
        console.error('Failed to send Slack message:', result.error);
        return result;
    }

    return result.ts;
}

// Export receive function - receives reply from Slack thread
export async function receive(threadId, env) {
    // Wait for and retrieve reply
    const response = await waitForReply(threadId);
    return response;
}

// Initialize configuration on load
// This can be called by the application to set up Slack configuration
export function initializeSlackConfig(config) {
    BrowserConfig.init(config);
    return loadIntegrationManager();
}

// Export configuration utility for manual setup
export const config = BrowserConfig;
