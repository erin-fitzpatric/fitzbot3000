import axios from 'axios'
import qs from 'querystring'
import  fs from 'fs';

// Load in creds JSON file
const creds = JSON.parse(fs.readFileSync('./creds.json', 'UTF-8'));

export module SignOn {
    // NOT IN USE
    // export async function getToken(getAccessTokenURL: string, client_id: string,client_secret: string) {
    //     let response = await axios.post(getAccessTokenURL)
    //     if (response.status !== 200) {
    //         throw new Error('Error retrieving Access Token')
    //     }
    //     return response.data.access_token
    // }

    export async function getTokenFromAccessCode(code: string) {
        let response;
        try {
            response = await axios.post(
                'https://id.twitch.tv/oauth2/token',
                qs.stringify({
                    client_id: creds.botCreds.clientID,
                    client_secret: creds.botCreds.secret,
                    grant_type: 'authorization_code',
                    redirect_uri: 'http://localhost:6767/auth/signin-twitch',
                    code: code
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }
            )
        } catch (err) {
            console.error(err)
            throw new Error('Error something happened.');
        }
        if (response.status !== 200) {
            throw new Error('Error retrieving Token From Access Code');
        }
        return response.data;
    }

    export function getAuthData() {
        return JSON.parse( fs.readFileSync('./tokens.json', 'UTF-8'));
    }

    export function saveAuthData(authData: any) {
        fs.writeFileSync('./tokens.json', JSON.stringify(authData, null, 4), 'UTF-8')
    }
}
