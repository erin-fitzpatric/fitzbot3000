export module Games {
    export function rollDice(chatClient: any, channel: string, user: string) {
        const diceRoll = Math.floor(Math.random() * 6) + 1;
        chatClient.say(channel, `@${user} rolled a ${diceRoll}`)
    }

    // Ping Pong Counters
    let pingPongCounter = 0;
    let fitzBotWin = 0;
    let chatWin = 0;
    
    export function playPingPong(chatClient: any, channel: string, user: string, botName: string) {
        pingPongCounter++;
        if (pingPongCounter < 3) {
            chatClient.say(channel, 'Pong!');
        } else {
            if (Math.floor(Math.random() * Math.floor(2))) {
                fitzBotWin++
                chatClient.say(channel, `${user} missed the shot... ${botName} wins! The score is - ${botName}: ${fitzBotWin} Chat: ${chatWin}`);
            } else {
                chatWin++
                chatClient.say(channel, `${botName} missed the shot... ${user} wins! The score is - ${botName}: ${fitzBotWin} Chat: ${chatWin}`);
            }
            pingPongCounter = 0;
        }
    }
}