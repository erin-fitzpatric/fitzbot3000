# fitzbot3000
Twitch chat bot for playing sounds, controlling Philips Hue lights, and interacting with viewers.

## Installation
Install Node:
https://nodejs.org/en/

From the root directory:
```bash
npm install
npm install -g typescript
```

## Setup
1. Register a new Twitch application [Here](https://dev.twitch.tv/console/apps/create).
2. Fill out 'creds.json' based on 'creds.json.template' with your new application credentials.
3. Fill out 'web.json' based on 'web.json.template' (If you plan on using paypal you *MUST* use port 80)
3. Fill in 'channel' and optionally 'bot' with your channel's username and optionally a second bot account.
4. Forward port 80 in your router to the machine running this code. (Sorry paypal demands port 80 I hope you weren't hosting any other webservers.)
5. Create actions.yaml based on actions.yaml.template
6. Run the bot and follow any auth links it provides.


##For paypal notifications
You must add an IPN address that is this bot.

## Additional Documentation
* [Twitch Authentication](https://dev.twitch.tv/docs/authentication)
* [Twitch API](https://dev.twitch.tv/docs/api/)
* [Philips Hue](https://developers.meethue.com/develop/get-started-2/)



## Contributing 
Pull requests are welcome!

## Support
Reach out to me on:
* [Twitch](https://www.twitch.tv/fitzbro)
* [Twitter](https://twitter.com/Mr_Fitzpatric)
