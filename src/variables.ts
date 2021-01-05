
import websocket from 'websocket';


export class VariableTable
{
	variables: { [index: string]: number } = {};
	wsServer: websocket.server;

	constructor(wsServer: websocket.server)
	{
		this.wsServer = wsServer;
	}

	handleWebsocketMessage(msg : any, connection : websocket.connection)
	{
		if ("variables" in msg)
		{
			let result: { [index: string]: number } = {};
			for (let variable of msg.variables)
			{
				result[variable] = this.get(variable);
			}
			connection.send(JSON.stringify({ variable: result }));
		}
	}

	ensure(name: string)
	{
		if (!(name in this.variables))
		{
			this.variables[name] = 0;
		}
	}

	get(name: string)
	{
		this.ensure(name);

		return this.variables[name];
	}

	getAll()
	{
		return this.variables;
	}

	set(name: string, value: number)
	{
		this.ensure(name);

		this.variables[name] = value;
		this.wsServer.broadcast(JSON.stringify({
			variable: {
				[name]: value
			}
		}))
	}

	offset(name: string, amount: number)
	{
		this.ensure(name);

		this.variables[name] += amount;
		this.wsServer.broadcast(JSON.stringify({
			variable: {
				[name]: this.variables[name]
			}
		}))
	}
}