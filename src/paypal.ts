import EventEmitter from 'events';
import * as express from 'express';
import axios from 'axios';

export default class PayPalIPN extends EventEmitter
{
	getMiddleware()
	{
		return async (req: express.Request, res: express.Response, next: any) =>
		{
			//Respond with 200
			res.send();

			let resp = await axios.post('https://www.paypal.com/cgi-bin/webscr', null, {
				params: {
					cmd: '_notify-validate',
					...req.body,
				},
				headers: {
					'User-Agent': 'TwitchChatBot'
				}
			});

			if (resp.data != "VERIFIED")
			{
				console.error("Unverified IPN Message. What!?");
			}

			if (req.body.txn_type != "send_money")
				return;

			let amount = req.body.mc_gross;
			let currency = req.body.mc_currency;
			let message = req.body.memo;

			this.emit('payment', {amount, currency, message});
		}
	}
}
