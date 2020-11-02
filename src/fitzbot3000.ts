import express from 'express';
import https from 'https';
import http from 'http';
import fs from 'fs';
import ApiClient, { HelixFollow } from 'twitch';
import { SignOn } from './signOn';
import ChatClient, { ChatSubGiftInfo } from 'twitch-chat-client';
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

import { getCaretPosition } from './windows';

// Load in JSON files
const web = JSON.parse(fs.readFileSync('./web.json', 'UTF-8'));
const creds = JSON.parse(fs.readFileSync('./creds.json', 'UTF-8'));
const scopes = JSON.parse(fs.readFileSync('./scopes.json', 'UTF-8'));

https.globalAgent.options.rejectUnauthorized = false;

let authDataPromiseResolver: (para: any) => void;

const port = 6767;

// start server
let app = express();

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
	// app.post("/followers/callback", async (req, res, next) => {

	// });
});

let wsServer = new websocket.server({
	httpServer: server,
	autoAcceptConnections: true
});

let actions = new ActionQueue(JSON.parse(fs.readFileSync('./actions.json', 'UTF-8')), wsServer);

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
	chatClient.say(sayChannel, `Try out some of ${botName}'s commands: '!lights', '!sounds', '!hue', '!games', '!effects'`);

	// Timer Messages
	setInterval(() =>
	{
		chatClient.say(sayChannel, `Try out some of ${botName}'s commands: '!lights', '!sounds', '!hue', '!games', '!effects'`);
	}, 900000);

	webhooks.subscribeToFollowsToUser(userID, async (follow?: HelixFollow) =>
	{
		if (!follow)
			return;
		chatClient.say(sayChannel, `Thanks for the follow ${follow?.userDisplayName}`);
	});

	chatClient.onMessage(async (channel: string, user: string, message: string, msg: any) =>
	{
		if (message.startsWith('!hue'))
		{
			const color = message.slice(4).trim()
			const hueNum = Number(color)

			if (!isNaN(hueNum) && hueNum >= 0 && hueNum <= 1000)
			{
				actions.pushToQueue([{ hue: hueNum }]);
			}
		}

		if (actions.fireEvent('chat', { name: message.toLowerCase() }))
		{
			return;
		}
	});

	// TODO - Follower Event

	// Bits Event
	await pubSubClient.onBits(userID, (message: PubSubBitsMessage) =>
	{
		console.log("Bits bits bits bits!!!", message.bits);
		actions.fireEvent("bits", {number: message.bits});
	});

	//Channel Points Event
	await pubSubClient.onRedemption(userID, (message: PubSubRedemptionMessage) =>
	{
		console.log("On redemtion:", JSON.stringify(message));
		actions.fireEvent("bits", {number: message.rewardName});
	});

	// Subscription Event
	chatClient.onSub((channel: any, user: any) =>
	{
		actions.fireEvent("subscribe", {number: 0});
		chatClient.say(channel, `Thanks to @${user} for subscribing!`);
	});

	// Resub Event
	chatClient.onResub((channel: any, user: any, subInfo: { months: any; }) =>
	{
		actions.fireEvent("subscribe", {number: subInfo.months});
		chatClient.say(channel, `Thanks to @${user} for subscribing to the channel for a total of ${subInfo.months} months!`);
	});

	// Subgift Event
	chatClient.onSubGift((channel: any, user: any, subInfo: ChatSubGiftInfo, msg: any) =>
	{
		console.log(`${user} gifted a sub!`);
		actions.fireEvent('subscribe', {name: "gift"});
		//giftedSubQueue.push({
		//	channel: channel,
		//	user: user,
		//	subInfo: subInfo,
		//	msg: msg
		//})

	});

	// TODO - Raids
}

main();