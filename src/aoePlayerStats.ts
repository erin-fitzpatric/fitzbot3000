import axios from 'axios'
import fs from 'fs';

// let cache = { url: "", time: new Date(0) };
export default async function ()
{
	
    // let now = new Date();
    // if ((now.getTime() - cache.time.getTime()) / 1000 > (60 * 30))
    let result = []; 
    for (let i = 1; i < 15; i++) {
        try
        {
            let response = await axios.get("https://api.ageofempires.com/api/AgeIII/GetRLLeaderboard?board=1&page=" + i);
            result.push(response.data.items);
            // cache.time = new Date();
            // return cache.url;
        }
        catch (err)
        {
            console.error(err)
            throw new Error('Error fetching AOE stats page: ' + i);
        }
    }
	
    const aoeJSON = JSON.stringify(result.flatMap(_ => _));
    // write result to json
    fs.writeFileSync('./officialPlayerStats.json', aoeJSON);
};


