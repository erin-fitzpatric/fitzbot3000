import axios from 'axios'
import fs from 'fs';

const creds = JSON.parse(fs.readFileSync('./creds.json', 'UTF-8'));

let cache = { url: "", time: new Date(0) };

export default async function () {
    let now = new Date();
    if ((now.getTime() - cache.time.getTime()) / 1000 > (60 * 30)) {
      let response;
      try {
          response = await axios.get("https://www.googleapis.com/youtube/v3/search", {
              params: {
                  channelId: creds.youtubeChannelID,
                  key: creds.youtubeAPI,
                  part: "snippet",
                  maxResults: 10,
                  order: "date",
                  type: "video"
              }
          });
          cache.url = `https://www.youtube.com/watch?v=${response.data.items[0].id.videoId}`;
          cache.time = new Date();
          return cache.url;
      } catch (err) {
          console.error(err)
          throw new Error('Error fetching YouTube videos.');
      }
    } else {
      return cache.url;
    }
};


