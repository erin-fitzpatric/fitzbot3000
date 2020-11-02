
import { Lights } from "./lights";
import { Sounds } from "./sounds";
import { Utils } from './utils';
import websocket from 'websocket';

export class ActionQueue
{
	events: any;
	queue: Array<any>;
	wsServer: websocket.server;
	currentAction: Promise<any> | null;


	constructor(config: any, wsServer: websocket.server)
	{
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

		let front = this.queue.shift();

		let frontPromise = this.runAction(front);
		this.currentAction = frontPromise;
		this.currentAction.then(() => this.runNext());
	}


	pushToQueue(actions: Array<any>)
	{
		for (let action of actions)
		{
			this.queue.push(action);
		}
		if (!this.currentAction)
		{
			this.runStartOfQueue();
		}
	}

	async runAction(action: any)
	{
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
		if (action.hue)
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
		if (action.delay)
		{
			//Delay the queue before the next action.
			await Utils.sleep(action.delay * 1000);
		}

		return true;
	}
}

