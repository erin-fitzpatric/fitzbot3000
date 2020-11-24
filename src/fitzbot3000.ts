import express from 'express';
import https from 'https';
import http from 'http';
import fs from 'fs';
import ApiClient, { HelixFollow } from 'twitch';
import { AuthManager } from './signOn';
import ChatClient, { ChatRaidInfo } from 'twitch-chat-client';
import PubSubClient, { PubSubBitsMessage, PubSubRedemptionMessage, PubSubSubscriptionMessage } from 'twitch-pubsub-client';
import { SimpleAdapter, WebHookListener } from 'twitch-webhooks';
import { Games } from "./games";
import websocket from 'websocket';
import { ActionQueue } from "./actions";
import PayPalIPN from './paypal';
import bodyParser from 'body-parser';
import logger from './logger';

// Load in JSON files
const settings = JSON.parse(fs.readFileSync('./settings.json', 'utf-8'));
const web = JSON.parse(fs.readFileSync('./web.json', 'utf-8'));
const creds = JSON.parse(fs.readFileSync('./creds.json', 'utf-8'));

https.globalAgent.options.rejectUnauthorized = false;

let authDataPromiseResolver: (para: any) => void;

// start server
let app = express();

let paypal = new PayPalIPN();
// Parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));

// Parse application/json
app.use(bodyParser.json());
app.use(express.json());

let server = http.createServer(app);
server.listen(80, () =>
{
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
	connection.on('message', function ()
	{
	});
	connection.on('close', function ()
	{
	});
});

async function main()
{
	let channelAuth = new AuthManager('channel');
	channelAuth.installMiddleware(app);
	await channelAuth.doAuth();

	const channelTwitchClient = new ApiClient({ authProvider: channelAuth.createAuthProvider() });
	let botTwitchClient = channelTwitchClient;

	if (creds.bot != creds.channel)
	{
		let botAuth = new AuthManager('bot');
		botAuth.installMiddleware(app);
		await botAuth.doAuth();

		botTwitchClient = new ApiClient({ authProvider: botAuth.createAuthProvider() });
	}

	let actions = new ActionQueue('./actions.yaml', "./globals.json", wsServer, (msg: string) => chatClient.say(sayChannel, msg));

	let channelId = await (await channelTwitchClient.kraken.users.getMe()).id;
	let botId = await (await botTwitchClient.kraken.users.getMe()).id;

	const pubSubClient = new PubSubClient();
	await pubSubClient.registerUserListener(channelTwitchClient, channelId);

	// Connect to Twitch Chat with Bot Account
	const chatClient = new ChatClient(botTwitchClient, { channels: [creds.channel] });
	await chatClient.connect();

	// On Init
	const botName = creds.bot;
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

	chatClient.onMessage(async (channel: string, user: string, message: string, msg: any) =>
	{
		message = message.toLowerCase();

		let emoteOffsets = Array.from(msg.emoteOffsets, ([name, value]) => ({ name, value }));

		for (let { name, value } of emoteOffsets)
		{
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

	logger.info("Started");

	let followerCache = new Set<String>();
	
	//Follower Event
	const webhooks = new WebHookListener(channelTwitchClient, new SimpleAdapter({
		hostName: web.hostname,
		listenerPort: 80
	}));
	
	await webhooks.subscribeToFollowsToUser(channelId, async (follow?: HelixFollow) =>
	{
		if (!follow)
			return;

		if (followerCache.has(follow.userId))
			return;

		followerCache.add(follow.userId);
		
		logger.info(`followed by ${follow?.userDisplayName}`);
		actions.fireEvent('follow', { user: follow?.userDisplayName });
	});

	webhooks.applyMiddleware(app);

	// Bits Event
	await pubSubClient.onBits(channelId, (message: PubSubBitsMessage) =>
	{
		logger.info(`Bits: ${message.bits}`);
		actions.fireEvent("bits", { number: message.bits, user: message.userName });
	});

	//Channel Points Event
	await pubSubClient.onRedemption(channelId, (message: PubSubRedemptionMessage) =>
	{
		logger.info(`Redemption: ${message.rewardId} ${message.rewardName}`);
		actions.fireEvent("redemption", { name: message.rewardName, msg: message.message, user: message.userName });
	});

	await pubSubClient.onSubscription(channelId, (message: PubSubSubscriptionMessage) => {
		if (message.isGift)
		{
			actions.fireEvent('subscribe', { name: "gift", gifter: message.gifterDisplayName, user: message.userDisplayName });
		}
		else
		{
			actions.fireEvent('subscribe', { number: message.months, user: message.userDisplayName, prime: message.subPlan == "Prime"})
		}
	});


	//Raid Event
	chatClient.onRaid((channel: string, user: string, raidInfo: ChatRaidInfo) =>
	{
		logger.info(`raided by: ${user}`);
		actions.fireEvent("raid", { number: raidInfo.viewerCount, user });
	})

	//Paypal
	paypal.on('payment', (data: any) =>
	{
		logger.info(`paypal ${data.amount} ${data.message}`);
		actions.fireEvent("paypal", { number: data.amount, message: data.message, currency: data.currency });
	});

}

main();