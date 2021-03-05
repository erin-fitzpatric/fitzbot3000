import express from 'express';
import https from 'https';
import http from 'http';
import fs from 'fs';
import ApiClient, { HelixFollow } from 'twitch';
import { AuthManager } from './signOn';
import ChatClient, { ChatRaidInfo } from 'twitch-chat-client';
import PubSubClient, { PubSubBitsMessage, PubSubRedemptionMessage, PubSubSubscriptionMessage } from 'twitch-pubsub-client';
import { SimpleAdapter, WebHookListener, ConnectionAdapter, SimpleAdapterConfig } from 'twitch-webhooks';
import { Games } from "./games";
import websocket from 'websocket';
import { ActionQueue } from "./actions";
import PayPalIPN from './paypal';
import bodyParser from 'body-parser';
import logger from './logger';
import { aoeScraper } from './webScraper';
import { AoeStats } from './aoeStats';
import { VariableTable } from './variables';
import { TwitchPrivateMessage } from 'twitch-chat-client/lib/StandardCommands/TwitchPrivateMessage';
import aoePlayerStats from './aoePlayerStats';


// Load in JSON files
const settings = JSON.parse(fs.readFileSync('./settings.json', 'utf-8'));
const web = JSON.parse(fs.readFileSync('./web.json', 'utf-8'));
const creds = JSON.parse(fs.readFileSync('./creds.json', 'utf-8'));
// const officialPlayerStats = JSON.parse(fs.readFileSync('./officialPlayerStats.json', 'utf-8'));

let stats: any;
let playerStats: any;
let officialPlayerStats: any;

https.globalAgent.options.rejectUnauthorized = false;

let authDataPromiseResolver: (para: any) => void;

// start server
let app = express();
let routes = express.Router();


class ExpressWebhookAdapter extends ConnectionAdapter
{
	private readonly _hostName: string;
	private readonly _basePath: string | undefined;

	constructor(options: SimpleAdapterConfig, basePath: string | undefined)
	{
		super(options);
		this._hostName = options.hostName;
		this._basePath = basePath;
	}

	/** @protected */
	get connectUsingSsl(): boolean
	{
		return this.listenUsingSsl;
	}
	/** @protected */
	async getExternalPort(): Promise<number>
	{
		return this.getListenerPort();
	}

	/** @protected */
	async getHostName(): Promise<string>
	{
		return this._hostName;
	}

	get pathPrefix(): string | undefined
	{
		return this._basePath;
	}
}


// Parse application/x-www-form-urlencoded
routes.use(bodyParser.urlencoded({ extended: false }));

// Parse application/json
routes.use(bodyParser.json());
routes.use(express.json());



let server = http.createServer(app);
server.listen(web.port, () =>
{
	app.use(express.static("./public"));
});

let wsServer = new websocket.server({
	httpServer: server,
	autoAcceptConnections: true
});

let variables: VariableTable;

wsServer.on('connect', function (connection)
{
	connection.on('message', function (data)
	{
		if (data.utf8Data)
		{
			let msg = JSON.parse(data.utf8Data);
			if (variables)
			{
				variables.handleWebsocketMessage(msg, connection);
			}
		}
	});
	connection.on('close', function ()
	{
	});
});


async function getFollowersSet(channelTwitchClient: ApiClient, channelId: string): Promise<Set<String>>
{
	let result = new Set<String>();

	try
	{
		let users = await channelTwitchClient.helix.users.getFollowsPaginated({ followedUser: channelId }).getAll()

		for (let user of users)
		{
			result.add(user.userDisplayName);
		};
	}
	catch (err)
	{
		logger.error(err);
	}

	return result;
}

async function main()
{
	if (settings.aoeStats)
	{
		await aoeScraper()
		await aoePlayerStats()
	}

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

	variables = new VariableTable(wsServer);

	let actions = new ActionQueue('./actions.yaml', "./globals.json", wsServer, (msg: string) => chatClient.say(sayChannel, msg), variables);
	actions.allowAudio = "allowAudio" in settings ? settings.allowAudio : true;

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

	//Finish Setting up the web server
	const webhooks = new WebHookListener(channelTwitchClient, new ExpressWebhookAdapter({
		hostName: web.hostname,
		listenerPort: web.port
	}, "/twitch-hooks"));

	webhooks.applyMiddleware(app);

	let paypal = new PayPalIPN();
	routes.post('/ipn', paypal.getMiddleware());
	//Use the router here so that the webhook middleware runs first before any of our other middleware.
	app.use(routes);

	//get current follower count.
	variables.set('subscribers', await channelTwitchClient.kraken.channels.getChannelSubscriptionCount(channelId))
	let follows = await channelTwitchClient.helix.users.getFollows({ followedUser: channelId });
	variables.set("followers", follows.total);


	chatClient.onMessage(async (channel: string, user: string, message: string, msg: TwitchPrivateMessage) =>
	{
		message = message.toLowerCase();

		// Fitzbot Blacklist
		// if (user === "synk_tempaaah" && (message === "!red" || message.startsWith("!hue"))) {
		// 	return;
		// }

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

		// TODO:
		// if (message.startsWith('!rookiestat')) {
		// 	const update = message.slice(11).trim();
		// 	if (update ==="win") {
		// 		//add point for fitz
		// 		console.log("Fitz wins!")
		// 	} else {
		// 		//add point for rookie
		// 		console.log("Rookie wins!")
		// 	}
		// 	console.log(update);
		// }

		if (settings.aoeStats)
		{
			if (stats == null)
			{
				stats = JSON.parse(fs.readFileSync('./aoe3.json', 'utf-8'));
			}

			if (message.startsWith('!stat'))
			{
				const lookupName = message.slice(5).trim();

				if (lookupName.length > 0)
				{
					let arrMessages = AoeStats.getStat(lookupName, stats);
					for (let msg of arrMessages)
					{
						chatClient.say(sayChannel, msg);
					}
					return;
				}
			}


			if (message.startsWith('!rank'))
			{	
				// cache and set timeout
				if (officialPlayerStats == null)
				{
					officialPlayerStats = JSON.parse(fs.readFileSync('./officialPlayerStats.json', 'utf-8'));
				}
				const lookupName = message.slice(5).trim();

				if (lookupName.length > 0)
				{
					let msg = AoeStats.getOfficialPlayerStat(lookupName, officialPlayerStats);
					chatClient.say(sayChannel, msg);
					return;
				}
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
		}

		if (msg.userInfo.isMod || msg.userInfo.isBroadcaster)
		{
			if (actions.fireEvent('modchat', { name: message, user }))
			{
				return;
			}
		}

		if (msg.userInfo.isSubscriber)
		{
			if (actions.fireEvent('subchat', { name: message, user }))
			{
				return;
			}
		}

		if (actions.fireEvent('chat', { name: message, user }))
		{
			return;
		}
	});

	logger.info("Started");

	let followerCache = new Set<String>();
	if (settings.primeFollowerCache)
	{
		followerCache = await getFollowersSet(channelTwitchClient, channelId);
	}

	//Follower Event
	await webhooks.subscribeToFollowsToUser(channelId, async (follow?: HelixFollow) =>
	{
		if (!follow)
			return;

		if (followerCache.has(follow.userId))
			return;

		followerCache.add(follow.userId);

		logger.info(`followed by ${follow?.userDisplayName}`);
		actions.fireEvent('follow', { user: follow?.userDisplayName });

		let follows = await channelTwitchClient.helix.users.getFollows({ followedUser: channelId });
		variables.set("followers", follows.total);
	});

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

	await pubSubClient.onSubscription(channelId, async (message: PubSubSubscriptionMessage) =>
	{
		if (message.isGift)
		{
			logger.info(`Gifted sub ${message.gifterDisplayName} -> ${message.userDisplayName}`);
			actions.fireEvent('subscribe', { name: "gift", gifter: message.gifterDisplayName, user: message.userDisplayName });
		}
		else
		{
			let months = message.months ? message.months : 0;
			logger.info(`Sub ${message.userDisplayName} : ${months}`);
			actions.fireEvent('subscribe', { number: months, user: message.userDisplayName, prime: message.subPlan == "Prime" })
		}

		variables.set('subscribers', await channelTwitchClient.kraken.channels.getChannelSubscriptionCount(channelId))
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