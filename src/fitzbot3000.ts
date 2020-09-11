import express from 'express';
import https from 'https';
import http from 'http';
import  fs from 'fs';
import ApiClient from 'twitch';
import { SignOn } from './signOn';
import ChatClient, { ChatSubGiftInfo } from 'twitch-chat-client';
import PubSubClient, { PubSubBitsMessage, PubSubRedemptionMessage }  from 'twitch-pubsub-client';
import { getTokenInfo, AccessToken, RefreshableAuthProvider, StaticAuthProvider } from 'twitch-auth'; 
import { Lights } from "./lights";
import { Sounds } from "./sounds";
import { Games } from "./games";
import { Effects } from './effects';
import { Utils } from './utils';

// Load in JSON files
const creds = JSON.parse(fs.readFileSync('./creds.json', 'UTF-8'));
const scopes = JSON.parse(fs.readFileSync('./scopes.json', 'UTF-8'));
const scenes = JSON.parse(fs.readFileSync('./scenes.json', 'UTF-8'));
const sounds = JSON.parse(fs.readFileSync('./sounds.json', 'UTF-8'));

https.globalAgent.options.rejectUnauthorized = false;

let authDataPromiseResolver : (para: any) => void;

// start server
let app = express();
http.createServer(app).listen(8080, () => {
    // sign in with twitch
    app.get("/auth/twitch", (req, res, next) => {
        let redirect_uri = "http://localhost:8080/auth/signin-twitch";
        res.redirect(`https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${creds.botCreds.clientID}&redirect_uri=${redirect_uri}&scope=${scopes.scopes.join('+')}`);
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

    const authProvider = new RefreshableAuthProvider(new StaticAuthProvider(creds.botCreds.clientID, tokenData.access_token, scopes.scopes), {
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
    const botName = creds.botCreds.username;
    const sayChannel = `${creds.channel.toLowerCase()}`;
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
                    chatClient.say(channel, "'!disco', '!police', '!emp', '!torb', '!cat', '!bomb'");
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
                case '!police': {
                    await Effects.police();               
                    break;
                }
                case '!disco': {
                    await Effects.disco(user);
                    break;
                }
                case '!emp': {
                    Effects.emp();
                    break;
                }
                case '!torb': {
                    Effects.moltenCore();
                    break;
                }
                case '!cat': {
                    Effects.angryCat();
                    break;
                }
            }
            // Set Scenes 
            const scene = scenes[message.toLowerCase().substring(1)]
            if (scene) {
                console.log(`${user} set a scene!`);
                Lights.setScene(scene);
            }
            // Play Sounds
            const sound = sounds.soundBites[message.toLowerCase()]
            if (sound) {
                console.log(`${user} played a sound!`);
                Sounds.playSound(sound);
            }
        }
    );

    // TODO - Follower Event

    // Bits Event
    await pubSubClient.onBits(userID, (message: PubSubBitsMessage) => {
        console.log("Bits bits bits bits!!!", message.bits);
        Sounds.playSound(sounds.channelEvents.bits);
    });
    
    //Channel Points Event
    await pubSubClient.onRedemption(userID, (message: PubSubRedemptionMessage) => {
        console.log("On redemtion:", JSON.stringify(message));
    });

    // Subscription Event
    chatClient.onSub((channel: any, user: any) => {
        Sounds.playSound(sounds.channelEvents.sub);
        chatClient.say(channel, `Thanks to @${user} for subscribing!`);
    });

    // Resub Event
    chatClient.onResub((channel: any, user: any, subInfo: { months: any; }) => {
        Sounds.playSound(sounds.channelEvents.resub);
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
            Sounds.playSound(sounds.channelEvents.subGift);
            chatClient.say(sayChannel, `Thanks to ${sub.subInfo.gifter} for gifting a subscription to ${sub.user}!`);
            await Utils.sleep(8000);
        }
        gitedSubQueueComplete = true;
    }

    // TODO - Raids
}

main();