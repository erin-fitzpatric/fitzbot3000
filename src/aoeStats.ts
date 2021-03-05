function toTitleCase(str: string): string {
    return str.replace(/\w\S*/g, function (txt: string) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    })
}

let sectionBlacklist = [""];
let statBlackList = ["Introduced in"];

export module AoeStats {
    export function getStat(unit: string, stats: any): Array<string> {
        try {
            let result = []
            let unitName = toTitleCase(unit)

            for (let sectionKey in stats[unitName]) {
                if (sectionBlacklist.includes(sectionKey))
                    continue;
                let formattedString = ''
                formattedString += `${sectionKey} | `;

                const statKeys = Object.keys(stats[unitName][sectionKey]);
                for (let i = 0; i < statKeys.length; ++i) {
                    const stat = statKeys[i];
                    
                    if (statBlackList.includes(stat))
                        continue;
                    formattedString += `${stat}:\xa0${stats[unitName][sectionKey][stat]}`

                    if (i != statKeys.length - 1)
                    {
                        formattedString += ' - ';
                    }
                }
                // TODO: If a single key is more than 509 chars, the message won't send :(. Example: Cow.
                result.push(formattedString);
            }
            return result;
        } catch (err) {
            return [];
        }
    }

    export function getPlayerStat(playerName: string, stats: any): Array<string> {
        try {
            let result = []

            for (let sectionKey in stats[playerName]) {
                if (sectionBlacklist.includes(sectionKey))
                    continue;
                let formattedString = ''
                formattedString += `${sectionKey} | ${stats[playerName][sectionKey]}`;
                result.push(formattedString);
            }
            return result;
        } catch (err) {
            return [];
        }
    }

    export function getOfficialPlayerStat(playerName: string, stats: any): string {
        try {

            let result = (stats.find((_: any) => _.userName.toLowerCase() == playerName))
            if (result) {
                return JSON.stringify(result);
            } 
            return `${playerName} is not in the top 200, or you suck at spelling.`;
        } catch (err) {
            return "No player found...learn to spell good.";
        }
    }
}
