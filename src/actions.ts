
import { Lights } from "./lights";
import { Sounds } from "./sounds";
import { Utils } from './utils';
import ChatClient from 'twitch-chat-client';
import websocket from 'websocket';
import fs from 'fs';

export class ActionQueue
{
	events: any;
	queue: Array<any>;
	wsServer: websocket.server;
	currentAction: Promise<any> | null;
	chatFunc: any;


	constructor(configFile: string, wsServer: websocket.server, chatFunc: any)
	{
		let config = JSON.parse(fs.readFileSync(configFile, 'UTF-8'));
		fs.watchFile(configFile, (curr: fs.Stats, prev: fs.Stats) =>
		{
			try
			{
				let newConfig = JSON.parse(fs.readFileSync(configFile, 'UTF-8'));
				console.log("Reloading Config");
				this.events = newConfig;
			}
			catch (err)
			{
				console.error("You done broke your json.");
				console.error(err);
			}
		});

		this.chatFunc = chatFunc;
		this.events = config;
		this.queue = [];
		this.wsServer = wsServer;
		this.currentAction = null;
	}

	fireEvent(name: string, options: any)
	{
		let event = this.events[name];

		if (!event)
			return false;

		if (options.number)
		{
			//Handle a numberlike event action
			let selected = null;
			for (let key in event)
			{
				let keyNumber = Number(key);
				if (isNaN(keyNumber))
					continue;
				if (options.number > keyNumber)
					selected = event[key];
			}
			if (selected && selected instanceof Array)
			{
				this.pushToQueue(selected);
				return true;
			}
		}
		else if (options.name)
		{
			//Handle a namelike event
			let namedEvent = event[options.name];
			if (namedEvent)
			{
				this.pushToQueue(namedEvent);
				return true;
			}
		}
		if (event instanceof Array)
		{
			this.pushToQueue(event);
			return true;
		}

		return false;
	}

	runNext()
	{
		if (this.queue.length > 0)
		{
			let front = this.queue.shift();
			let frontPromise = this.runAction(front);
			this.currentAction = frontPromise;
			this.currentAction.then(() => this.runNext());
		}
		else
		{
			this.currentAction = null;
		}
	}

	runStartOfQueue()
	{
		if (this.currentAction)
			return;

		if (this.queue.length == 0)
			return;

		let front = this.queue.shift();
		let frontPromise = this.runAction(front);
		this.currentAction = frontPromise;
		this.currentAction.then(() => this.runNext());
	}


	pushToQueue(actions: any)
	{
		let actionArray = null;
		if (actions instanceof Array)
		{
			actionArray = actions;
		}
		else if ("oneOf" in actions)
		{
			actionArray = actions.oneOf[Math.floor(Math.random() * actions.oneOf.length)]
		}

		if (!(actionArray instanceof Array))
		{
			return;
		}

		this.convertOffsets(actionArray);
		for (let action of actionArray)
		{
			this.queue.push(action);
		}

		this.runStartOfQueue();
	}

	convertOffsets(actions: Array<any>)
	{
		let timeSinceStart = 0;

		for (let a of actions)
		{
			if (a.timestamp)
			{
				a.beforeDelay = a.timestamp - timeSinceStart;
				timeSinceStart = a.timestamp;
			}
		}
	}

	async runAction(action: any)
	{
		if (action.beforeDelay)
		{
			await Utils.sleep(action.beforeDelay * 1000);
		}
		if (action.sound)
		{
			//Play the sound
			Sounds.playSound(action.sound);
		}
		if (action.light)
		{
			//Change the lights
			Lights.pickColor((action.light.hue / 360) * 65535, action.light.bri, action.light.sat, action.light.on);
		}
		if ("hue" in action)
		{
			//Change the lights through hue setting
			Lights.pickColor((action.hue / 1000) * 65535);
			this.wsServer.broadcast(JSON.stringify({ hue: action.hue / 1000 }));
		}
		if (action.websocket)
		{
			//Broadcast the websocket text
			this.wsServer.broadcast(action.websocket);
		}
		if (action.say)
		{
			this.chatFunc(action.say);
		}
		if (action.delay)
		{
			//Delay the queue before the next action.
			await Utils.sleep(action.delay * 1000);
		}
		

		return true;
	}
}

