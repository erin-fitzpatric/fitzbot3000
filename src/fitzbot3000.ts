import ChatClient, { ChatSubGiftInfo } from 'twitch-chat-client';
import  fs from 'fs';
import ApiClient, {User, UserIdResolvable} from 'twitch';
import https from 'https';
import http from 'http';
import express from 'express';
import { Games } from "./games";
import { Lights } from "./lights";
import { Sounds } from "./sounds";
import { Effects } from './effects';
import PubSubClient, { PubSubBitsMessage, PubSubRedemptionMessage }  from 'twitch-pubsub-client';
import { getTokenInfo, getAppAccessToken, AccessToken, RefreshableAuthProvider, StaticAuthProvider } from 'twitch-auth'; 
import { Utils } from './utils';
import { SignOn } from './signOn';

// Load in creds JSON file
const creds = JSON.parse(fs.readFileSync('./creds.json', 'UTF-8'));

https.globalAgent.options.rejectUnauthorized = false;

let authDataPromiseResolver : (para: any) => void;

let scopes = [
    "analytics:read:extensions",
    "analytics:read:games",
    "bits:read",
    "channel:edit:commercial",
    "channel:read:hype_train",
    "channel:read:subscriptions",
    "channel:read:redemptions",
    "clips:edit",
    "user:edit",
    "user:edit:broadcast",
    "user:edit:follows",
    "user:read:broadcast",
    "user:read:email",
    "channel:moderate",
    "chat:edit",
    "chat:read",
    "whispers:read",
    "whispers:edit",
];

// start server
let app = express();
http.createServer(app).listen(8080, () => {
    // sign in with twitch
    app.get("/auth/twitch", (req, res, next) => {
       
        let redirect_uri = "http://localhost:8080/auth/signin-twitch";

        res.redirect(`https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${creds.botCreds.clientID}&redirect_uri=${redirect_uri}&scope=${scopes.join('+')}`);
        return next();
    })
    // redirect from twitch
    app.get("/auth/signin-twitch", async (req, res, next) => {
        if (!req.query.code) {
            let error = req.query.error;
            let errorMsg = req.query.error_description;
            console.error("Auth Error", error, errorMsg);
            throw new Error(`Error: ${error}: ${errorMsg}`);
        }

        let authData = await SignOn.getTokenFromAccessCode(req.query.code as string);

        authDataPromiseResolver(authData);
    })

    // app.post("/followers/callback", async (req, res, next) => {

    // });
});

async function main() {
    // Get credentials
    let tokenData = SignOn.getAuthData();

    // get tokens if missing
    if (!tokenData.access_token || !tokenData.refresh_token) 
    {
        //Wait here for signin to complete.
        let authPromise = new Promise((resolve, reject) => {
            authDataPromiseResolver = resolve;
        });

        let authData = await authPromise;
        SignOn.saveAuthData(authData);
        tokenData = authData;

        console.log("Successfully got signin callback.");
    }

    const authProvider = new RefreshableAuthProvider(new StaticAuthProvider(creds.botCreds.clientID, tokenData.access_token, scopes), {
        clientSecret: creds.botCreds.secret,
        refreshToken: tokenData.refresh_token,
        expiry: tokenData.expiryTimestamp === null ? null : new Date(tokenData.expiryTimestamp),
        onRefresh: async (tokenData: AccessToken) => {
            const newTokenData = {
                access_token: tokenData.accessToken,
                refresh_token: tokenData.refreshToken,
                expiryTimestamp: tokenData.expiryDate === null ? null : tokenData.expiryDate.getTime()
            };
            SignOn.saveAuthData(newTokenData);
        }
    });

    const twitchClient = new ApiClient({authProvider});
    const chatClient = ChatClient.forTwitchClient(twitchClient, { channels: [creds.channel] });
    const pubSubClient = new PubSubClient();
    
    const token = await twitchClient.getAccessToken();
    if (!token) {
        console.log("No token!");
        return;
    }
    let userID = (await getTokenInfo(token.accessToken)).userId;
    
    await pubSubClient.registerUserListener(twitchClient);
    
    // Connect to Twitch
    await chatClient.connect();

    // On Init
    const botName = creds.botcreds.username;
    const sayChannel = `#${creds.channel.toLowerCase()}`;
    chatClient.say(sayChannel, `${botName} is online!`);
    chatClient.say(sayChannel, `Try out some of ${botName}'s commands: '!lights', '!sounds', '!hue', '!games', '!effects'`);

    // Timer Messages
    setInterval(() => { 
        chatClient.say(sayChannel, `Try out some of ${botName}'s commands: '!lights', '!sounds', '!hue', '!games', '!effects'`);
    }, 900000);

    chatClient.onMessage(async (channel: string, user: string, message: string, msg: any) => {
            if (message.startsWith('!hue')) {
                const color = message.slice(4).trim()
                const hueNum = Number(color)
                if (!isNaN(hueNum) && hueNum >= 0 && hueNum <= 1000) {
                    const hueApiNum = (hueNum / 1000) * 65535
                    Lights.pickColor(hueApiNum);
                }
            }
            switch (message.toLowerCase()) {
                // Fitzbot Messages
                case '!commands': {
                    chatClient.say(channel, "'!lights', '!sounds', '!hue', '!games', '!effects'");
                    break;
                }
                case '!discord': {
                    chatClient.say(channel, `Join the discord! ${creds.discord}`);
                    break;
                }
                case '!lights': {
                    chatClient.say(channel, `You can change the lights on ${channel}'s stream! Try it out: '!red', '!purple', '!blue', or by following, subscribing, and donating bits. You can also pick a color with '!hue'.`);
                    break;
                }
                case '!sounds': {
                    chatClient.say(channel, `Try out a sound such as: '!scream', '!suspense', or '!dolphin'. A full list of commands can be found in the discord: ${creds.discord}`);
                    break;
                }
                case '!hue': {
                    chatClient.say(channel, "Enter '!hue' followed by a number between 0-1000 to pick a color.");
                    break;
                }
                case '!games': {
                    chatClient.say(channel, "'!ping', '!dice'");
                    break;
                }
                case '!effects': {
                    chatClient.say(channel, "'!disco', '!police', '!emp', '!cat'");
                    break;
                }
                // Games
                case '!dice': {
                    Games.rollDice(chatClient, channel, user);
                    break;
                }
                case '!ping': {
                    Games.playPingPong(chatClient, channel, user, botName);
                    break;
                }
                // Set lights
                case '!off': {
                    Lights.lightsOff();
                    break;
                }
                case '!on': {
                    Lights.lightsOn();
                    break;
                }
                // Scenes
                case '!red': {
                    Lights.setScene(Lights.scenes.red);
                    break;
                }
                case '!orange': {
                    Lights.setScene(Lights.scenes.orange);
                    break;
                }
                case '!blue': {
                    Lights.setScene(Lights.scenes.blue);
                    break;
                }
                case '!purple': {
                    Lights.setScene(Lights.scenes.purple);
                    break;
                }
                // Play effects
                case '!police': {
                    await Effects.police();               
                    break;
                }
                case '!disco': {
                    await Effects.disco();
                    break;
                }
                case '!emp': {
                    Effects.emp();
                    break;
                }
                case '!cat': {
                    Effects.angryCat();
                    break;
                }
            }

            // Load in sounds JSON file
            const sounds = JSON.parse(fs.readFileSync('./sounds/sounds.json', 'UTF-8'));

            // Play sounds
            const sound = sounds.soundBites[message.toLowerCase()]
            if (sound) {
                Sounds.playSound(sound);
            }
        }
    );

    // Bits Event
    await pubSubClient.onBits(userID, (message: PubSubBitsMessage) => {
        console.log("Bits bits bits bits!!!", message.bits);
        Sounds.playSound('./sounds/20thCenturyFoxFlute.mp3');
    });
    
    //Channel Points Event
    await pubSubClient.onRedemption(userID, (message: PubSubRedemptionMessage) => {
        console.log("On redemtion:", JSON.stringify(message));
    });

    // Subscription Event
    chatClient.onSub((channel: any, user: any) => {
        Sounds.playSound('./sounds/20thCenturyFoxFlute.mp3');
        chatClient.say(channel, `Thanks to @${user} for subscribing to the channel!`);
    });

    // Resub Event
    chatClient.onResub((channel: any, user: any, subInfo: { months: any; }) => {
        Sounds.playSound('./sounds/20thCenturyFoxFlute.mp3');
        chatClient.say(channel, `Thanks to @${user} for subscribing to the channel for a total of ${subInfo.months} months!`);
    });

    // Subgift Event
    let giftedSubQueue: { channel: any; user: any, subInfo: ChatSubGiftInfo, msg: any}[] = [];
    let gitedSubQueueComplete = true;
    chatClient.onSubGift((channel: any, user: any, subInfo: ChatSubGiftInfo, msg: any) => {
        console.log(`${user} gifted a sub!`);
        giftedSubQueue.push({
                channel: channel,
                user: user,
                subInfo: subInfo,
                msg: msg
            })
            if (gitedSubQueueComplete) {
                playSubQueue();
            } 
        });
    async function playSubQueue () {
        gitedSubQueueComplete = false;
        // While gifted subs are in queue
        while (giftedSubQueue.length) {
            let sub = giftedSubQueue.pop();
            if (!sub) {
                console.log("no giftedSubs!");
                return;
            } 
            Sounds.playSound('./sounds/merryXmasFilthyAnimal.mp3');
            chatClient.say(sayChannel, `Thanks to ${sub.subInfo.gifter} for gifting a subscription to ${sub.user}!`);
            await Utils.sleep(8000);
        }
        gitedSubQueueComplete = true;
    }
}

main();