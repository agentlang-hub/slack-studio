module slack

import "resolver.js" @as slack

record channel {
    channel String
}

event sendMessageOnChannel {
    channel String,
    message String,
    @meta {"documentation": "Follow this example to send and receive messages on a Slack channel:

{slack/sendMessageOnChannel {channel \"Xy3673hhj\", message \"hello\"}} @as response
"}
}

workflow sendMessageOnChannel {
    await slack.send(sendMessageOnChannel.channel, sendMessageOnChannel.message)
}
