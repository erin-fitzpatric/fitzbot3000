import express from 'express';
import https from 'https';
import http from 'http';
import fs from 'fs';
import ApiClient, { HelixFollow } from 'twitch';
import { callTwitchApi, TwitchApiCallOptions, TwitchApiCallType } from 'twitch-api-call';
import { SignOn } from './signOn';
import ChatClient, { ChatRaidInfo, ChatSubGiftInfo, ChatSubInfo } from 'twitch-chat-client';
import PubSubClient, { PubSubBitsMessage, PubSubRedemptionMessage } from 'twitch-pubsub-client';
import { getTokenInfo, AccessToken, RefreshableAuthProvider, StaticAuthProvider } from 'twitch-auth';
import { SimpleAdapter, WebHookListener } from 'twitch-webhooks';
import { Lights } from "./lights";
import { Sounds } from "./sounds";
import { Games } from "./games";
import { Effects } from './effects';
import { Utils } from './utils';
import websocket from 'websocket';
import { ActionQueue } from "./actions";
import PayPalIPN from './paypal';
import bodyParser from 'body-parser';

import { getCaretPosition } from './windows';

// Load in JSON files
const settings = JSON.parse(fs.readFileSync('./settings.json', 'UTF-8'));
const web = JSON.parse(fs.readFileSync('./web.json', 'UTF-8'));
const creds = JSON.parse(fs.readFileSync('./creds.json', 'UTF-8'));
const scopes = JSON.parse(fs.readFileSync('./scopes.json', 'UTF-8'));

https.globalAgent.options.rejectUnauthorized = false;

let authDataPromiseResolver: (para: any) => void;

const port = 6767;

// start server
let app = express();

let paypal = new PayPalIPN();
// Parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));

// Parse application/json
app.use(bodyParser.json());
app.use(express.json());

let server = http.createServer(app);
server.listen(web.port, () =>
{
	// sign in with twitch
	app.get("/auth/twitch", (req, res, next) =>
	{
		let redirect_uri = `http://localhost:${port}/auth/signin-twitch`;
		res.redirect(`https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${creds.botCreds.clientID}&redirect_uri=${redirect_uri}&scope=${scopes.scopes.join('+')}`);
		return next();
	})
	// redirect from twitch
	app.get("/auth/signin-twitch", async (req, res, next) =>
	{
		if (!req.query.code)
		{
			let error = req.query.error;
			let errorMsg = req.query.error_description;
			console.error("Auth Error", error, errorMsg);
			throw new Error(`Error: ${error}: ${errorMsg}`);
		}
		let authData = await SignOn.getTokenFromAccessCode(req.query.code as string);
		authDataPromiseResolver(authData);
	})

	app.post('/ipn', paypal.getMiddleware());

	app.use(express.static("./public"));
});

let wsServer = new websocket.server({
	httpServer: server,
	autoAcceptConnections: true
});

wsServer.on('request', function (request)
{
	var connection = request.accept('echo-protocol', request.origin);
	console.log((new Date()) + ' Connection accepted.');
	connection.on('message', function (message: websocket.IMessage)
	{
	});
	connection.on('close', function (reasonCode, description)
	{
		console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
	});
});

async function main()
{
	// Get credentials
	let tokenData = SignOn.getAuthData();

	// get tokens if missing
	if (!tokenData.access_token || !tokenData.refresh_token) 
	{
		//Wait here for signin to complete.
		let authPromise = new Promise((resolve, reject) =>
		{
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
		onRefresh: async (tokenData: AccessToken) =>
		{
			const newTokenData = {
				access_token: tokenData.accessToken,
				refresh_token: tokenData.refreshToken,
				expiryTimestamp: tokenData.expiryDate === null ? null : tokenData.expiryDate.getTime()
			};
			SignOn.saveAuthData(newTokenData);
		}
	});

	const twitchClient = new ApiClient({ authProvider });
	const chatClient = ChatClient.forTwitchClient(twitchClient, { channels: [creds.channel] });
	const pubSubClient = new PubSubClient();

	let actions = new ActionQueue('./actions.yaml', "./globals.json", wsServer, (msg: string) => chatClient.say(sayChannel, msg));

	const webhooks = new WebHookListener(twitchClient, new SimpleAdapter({
		hostName: web.hostname,
		listenerPort: web.hookPort
	}));
	await webhooks.listen();

	const token = await twitchClient.getAccessToken();
	if (!token)
	{
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

	if (settings.intervalMessage)
	{
		chatClient.say(sayChannel, settings.intervalMessage);

		//Timer Messages
		setInterval(() =>
		{
			chatClient.say(sayChannel, settings.intervalMessage);
		}, 900000);
	}

	let lossCount = 0;
	let winCount = 0;
	let tieCount = 0;

	chatClient.onMessage(async (channel: string, user: string, message: string, msg: any) =>
	{
		message = message.toLowerCase();

		console.log(msg.emoteOffsets);

		let emoteOffsets = Array.from(msg.emoteOffsets, ([name, value]) => ({ name, value }));

		for (let { name, value } of emoteOffsets)
		{
			console.log(`${name} : ${value}`);
			wsServer.broadcast(JSON.stringify({ 'emote': { id: name, qty: value.length } }));
		}

		wsServer.broadcast(JSON.stringify({ chat: message }));

		if (message.startsWith('!hue'))
		{
			const color = message.slice(4).trim()
			const hueNum = Number(color)

			if (color.length > 0 && !isNaN(hueNum) && hueNum >= 0 && hueNum <= 1000)
			{
				actions.pushToQueue([{ hue: hueNum }], { user });
				return;
			}
		}

		//This is a debug message.
		if (message.startsWith('!huec'))
		{
			const color = message.slice(5).trim()
			const hueNum = Number(color)

			if (!isNaN(hueNum) && hueNum >= 0 && hueNum <= 1000)
			{
				actions.pushToQueue([{ light: { hue: hueNum } }], { user });
				return;
			}
		}

		if (settings.games)
		{
			if (settings.games.dice && message.startsWith("!dice")) 
			{
				Games.rollDice(chatClient, channel, user);
				return;
			}
			if (settings.games.pingpong && message.startsWith("!ping"))
			{
				Games.playPingPong(chatClient, channel, user, botName);
				return;
			}
			if (settings.games.score)
			{
				switch (message)
				{
					case '!score': {
						chatClient.say(channel, `The current score is ${winCount} - ${lossCount}`);
						return;
					}
					case '!win': {
						winCount++;
						chatClient.say(channel, `@${creds.channel} wins :) :) :)!!! The current score is ${winCount} - ${lossCount}`);
						return;
					}
					case '!unwin': {
						winCount--;
						chatClient.say(channel, `Someone messed up the score counter...win removed! Updated score: ${winCount} - ${lossCount}`);
						return;
					}
					case '!loss': {
						lossCount++;
						chatClient.say(channel, `@${creds.channel} lost :( :( :(...the current score is ${winCount} - ${lossCount}`);
						return;
					}
					case '!unloss': {
						lossCount--;
						chatClient.say(channel, `Someone messed up the score counter...loss removed! Updated score: ${winCount} - ${lossCount}`);
						return;
					}
					case '!reset': {
						winCount = 0;
						lossCount = 0;
						chatClient.say(channel, `The current score was reset by ${user}! The score is ${winCount} - ${lossCount}`);
						return;
					}
				}
			}
		}


		if (actions.fireEvent('chat', { name: message, user }))
		{
			return;
		}
	});

	//Follower Event
	webhooks.subscribeToFollowsToUser(userID, async (follow?: HelixFollow) =>
	{
		if (!follow)
			return;
		actions.fireEvent('follow', { user: follow?.userDisplayName });
	});

	// Bits Event
	await pubSubClient.onBits(userID, (message: PubSubBitsMessage) =>
	{
		console.log("Bits bits bits bits!!!", message.bits);
		actions.fireEvent("bits", { number: message.bits, user: message.userName });
	});

	//Channel Points Event
	await pubSubClient.onRedemption(userID, (message: PubSubRedemptionMessage) =>
	{
		console.log("On redemption:", JSON.stringify(message));
		actions.fireEvent("redemption", { name: message.rewardName, msg: message.message, user: message.userName });
	});

	/////////////////////////
	// Subscription Events
	///////////////////////////
	chatClient.onSub((channel: any, user: any, subInfo: ChatSubInfo) =>
	{
		actions.fireEvent("subscribe", { number: 0, user, prime: subInfo.isPrime });
	});
	chatClient.onResub((channel: any, user: any, subInfo: ChatSubInfo) =>
	{
		actions.fireEvent("subscribe", { number: subInfo.months, user, prime: subInfo.isPrime });
	});
	chatClient.onSubGift((channel: any, user: any, subInfo: ChatSubGiftInfo, msg: any) =>
	{
		actions.fireEvent('subscribe', { name: "gift", gifter: subInfo.gifterDisplayName, user: subInfo.displayName });
	});

	//Raid Event
	chatClient.onRaid((channel: string, user: string, raidInfo: ChatRaidInfo) =>
	{
		actions.fireEvent("raid", { number: raidInfo.viewerCount, user });
	})

	//Paypal
	paypal.on('payment', (data: any) =>
	{
		actions.fireEvent("paypal", { number: data.amount, message: data.message, currency: data.currency });
	});

}

main();