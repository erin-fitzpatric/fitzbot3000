const got = require('got')
const jsdom = require('jsdom')
const { JSDOM } = jsdom
const fs = require('fs');

function lastUpdatedDate (file: string) {  
    const { mtime, ctime } = fs.statSync(file);
    return mtime;
  }

const vgmUrl = 'https://ageofempires.fandom.com/wiki/Units_(Age_of_Empires_III)'

// const noParens = (link: { textContent: string; }) => {
//   // Regular expression to determine if the text has parentheses.
//   const parensRegex = /^((?!\().)*$/;
//   return parensRegex.test(link.textContent);
// };

// Only select wiki links
const isWikiLink = (link: { href: string }) => {
    if (typeof link.href === 'undefined') {
        return false
    }

    return link.href.startsWith('/wiki')
}

interface ScrapedData {
    [key: string]: any
}

interface SectionData {
    [key: string]: string
}

export async function aoeScraper() {
    // Check file date...only scrape once a week.
    let msSinceUpdate = (Math.abs(new Date().getTime() - lastUpdatedDate('aoe3.json')));
    if (msSinceUpdate > 6.048e+8) {
        const response = await got(vgmUrl, {
            headers: {
                'user-agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:83.0) Gecko/20100101 Firefox/83.0',
            },
        })
        const dom = new JSDOM(response.body)

        // Create an Array out of the HTML Elements for filtering using spread syntax.
        const nodeList = [
            ...dom.window.document.querySelectorAll('.mw-parser-output li a'),
        ]

        let unitLinks = nodeList.filter(isWikiLink).map((link) => link.href)

        let data = {} as ScrapedData

        for (let unitLink of unitLinks) {
            const unitResp = await got(
                `https://ageofempires.fandom.com${unitLink}`,
                {
                    headers: {
                        'user-agent':
                            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:83.0) Gecko/20100101 Firefox/83.0',
                    },
                },
            )
            const unitDom = new JSDOM(unitResp.body)

            const asides = [
                ...unitDom.window.document.querySelectorAll(
                    'aside.portable-infobox',
                ),
            ]

            for (let aside of asides) {
                //Extract data here.

                const unitNameEl = aside.querySelector('.pi-title');

                if (!unitNameEl)
                continue;

                const unitName = unitNameEl.textContent as string;

                let unitData = {} as ScrapedData;

                const piGroups = [
                    ...aside.querySelectorAll(
                        '.pi-item.pi-group',
                    ),
                ]

                for (let piGroup of piGroups) {
                    const headerEl = piGroup.querySelector('h2.pi-header')

                    if (!headerEl)
                    continue;

                    const header = headerEl.textContent;

                    const sectionData = {} as SectionData

                    const piItems = piGroup.querySelectorAll('.pi-item.pi-data')

                    for (let piItem of piItems) {
                        const labelEl = piItem.querySelector('.pi-data-label')
                        const valueEl = piItem.querySelector('.pi-data-value')
                        
                        if (!labelEl || !valueEl)
                        continue;

                        const label = labelEl.textContent;
                        const value = valueEl.textContent;

                        sectionData[label] = value;
                    }

                    unitData[header] = sectionData
                }

                data[unitName] = unitData;
                console.log(`Scraped ${unitName}`);
            }
            
        }
        console.log(JSON.stringify(data, null, 2));

        fs.writeFileSync('aoe3.json', JSON.stringify(data, null, 2))
    } else {
        return;
    }
}