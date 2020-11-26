import axios from 'axios'
import qs from 'querystring'
import fs from 'fs';
import logger from './logger';
import { AccessToken, RefreshableAuthProvider, StaticAuthProvider } from 'twitch-auth';
import express from 'express';

//We have to redefine this since twitch-auth doesn't export it.
interface AccessTokenData
{
	access_token: string;
	refresh_token: string;
	expires_in?: number;
	scope?: string[];
}

// Load in creds JSON file
const creds = JSON.parse(fs.readFileSync('./creds.json', 'utf-8'));

const scopes = [
	"analytics:read:extensions",
	"analytics:read:games",
	"bits:read",
	"channel:edit:commercial",
	"channel:read:hype_train",
	"channel:read:subscriptions",
	"channel:read:redemptions",
	"channel_subscriptions",
	"clips:edit",
	"user:edit",
	"user_read",
	"user:edit:broadcast",
	"user:edit:follows",
	"user:read:broadcast",
	"user:read:email",
	"channel:moderate",
	"chat:edit",
	"chat:read",
	"whispers:read",
	"whispers:edit"
]

export class AuthManager
{
	authPromise: Promise<AccessTokenData> | null;
	authResolver: ((value: AccessTokenData) => void) | null;
	accessToken: AccessToken | null;
	name: string;

	constructor(name: string)
	{
		this.name = name;
		this.authPromise = null;
		this.authResolver = null;
		this.accessToken = null;
		try
		{
			let tokenJson = JSON.parse(fs.readFileSync(`./${this.name}Tokens.json`, 'utf-8'));
			let obtainmentDate = new Date(tokenJson.obtainment_date);
			let tokens = tokenJson as AccessTokenData;
			this.accessToken = new AccessToken(tokens, obtainmentDate);
		}
		catch (err)
		{ }
	}

	async doAuth()
	{
		if (this.accessToken)
		{
			return this.accessToken;
		}

		this.authPromise = new Promise<AccessTokenData>((resolve) =>
		{
			this.authResolver = resolve;
		});

		logger.info(`Auth is required as ${this.name}`);
		logger.info(`Go to http://localhost/auth/${this.name}/ to sign in. If you're signing into a bot account go in incognito`);

		let tokenResp = await this.authPromise;
		let obtainment_date = new Date();

		fs.writeFileSync(`./${this.name}Tokens.json`, JSON.stringify({ ...tokenResp, obtainment_date }, null, 4), 'utf-8');
		this.accessToken = new AccessToken(tokenResp, obtainment_date);

		return this.accessToken;

	}

	createAuthProvider()
	{
		if (!this.accessToken)
			throw new Error("You forgot to auth before creating the provider")

		const authProvider = new RefreshableAuthProvider(new StaticAuthProvider(creds.app.clientID, this.accessToken.accessToken, scopes), {
			clientSecret: creds.app.secret,
			refreshToken: this.accessToken.refreshToken,
			expiry: this.accessToken.expiryDate ? this.accessToken.expiryDate : null,
			onRefresh: async (tokenData) =>
			{
				let tokenDataObj = tokenData as any; //Hack our way into privates.
				fs.writeFileSync(`./${this.name}Tokens.json`, JSON.stringify({ ...tokenDataObj['_data'], obtainment_date: tokenDataObj["_obtainmentDate"] }, null, 4), 'utf-8');
			}
		});

		return authProvider;
	}

	async completeAuth(access_code: string)
	{
		if (!this.authResolver)
		{
			return;
		}

		let response;
		try
		{
			response = await axios.post(
				'https://id.twitch.tv/oauth2/token',
				qs.stringify({
					client_id: creds.app.clientID,
					client_secret: creds.app.secret,
					grant_type: 'authorization_code',
					redirect_uri: `http://localhost/auth/${this.name}/redirect`,
					code: access_code
				}),
				{
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
					},
				}
			)
		} catch (err)
		{
			logger.error(`Auth Error: ${err}`);
			throw new Error('Error something happened.');
		}

		this.authResolver(response.data as AccessTokenData);
		this.authResolver = null;
	}


	installMiddleware(app: express.Express)
	{
		app.get(`/auth/${this.name}`, (req, res, next) =>
		{
			let redirectUri = `http://localhost/auth/${this.name}/redirect`;
			res.redirect(`https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${creds.app.clientID}&redirect_uri=${redirectUri}&scope=${scopes.join('+')}`);
		});

		app.get(`/auth/${this.name}/redirect`, async (req, res, next) =>
		{
			if (!req.query.code)
			{
				let error = req.query.error;
				let errorMsg = req.query.error_description;
				console.error("Auth Error", error, errorMsg);
				throw new Error(`Error: ${error}: ${errorMsg}`);
			}
			this.completeAuth(req.query.code as string);
		});
	}

}


