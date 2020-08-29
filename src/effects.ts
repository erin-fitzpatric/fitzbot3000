import { Sounds } from './sounds';
import { Lights } from './lights';
import { Utils } from './utils';
import  fs from 'fs';

export module Effects {
    // Effects
    export async function police() {
        Sounds.playSound('./sounds/police1.mp3');
        try {
            const counter = 1;
            const policeRed = true;
            const redHue = 0;
            const blueHue = 43690;

            const i = 0
            for (let i = 0; i < 12; ++i) {
                if (i == 0) {
                    await Lights.pickColor(i % 2 == 0 ? redHue : blueHue, 254, 254);
                } else {
                    await Lights.pickColor(i % 2 == 0 ? redHue : blueHue);
                }

                await Utils.sleep(700);
            }
        } catch (err) {
            console.error(err);
        }
    }

    export const getDisco = () => {
        let random = Math.floor(Math.random() * (discoColors.length + 1));
        return discoColors[random];
    }

    const discoColors = [0, (59 / 360) * 65535, (120 / 360) * 65535, (180 / 360) * 65535, 43690, (300 / 360) * 65535, (33 / 360) * 65535];

    export async function disco() {
        
        let randomDiscoSound = getRandomSound("arrDisco");
        Sounds.playSound(randomDiscoSound);
        console.log("DISCO:" + randomDiscoSound);
        for (let i = 0; i < 34; ++i) {
            await Lights.pickColor(discoColors[i % discoColors.length]);
            await Utils.sleep(300);
        }

    }

    function getRandomSound(soundLibrary: string) {
        const sounds = JSON.parse(fs.readFileSync('./sounds.json', 'UTF-8'));
        let random = Math.floor(Math.random() * (sounds[soundLibrary].length));
        return sounds[soundLibrary][random];
    }

    export async function emp() {
        Sounds.playSound('./sounds/emp.mp3');
        setTimeout(() => {
            Lights.lightsOff();
        }, 350);
        setTimeout(() => {
            Lights.lightsOn();
        }, 5000)
    }

    // Cat Bot
    export const angryCat = () => {
        // Sounds
        let angryCatSound = getRandomSound("arrAngryCatSounds");
        Sounds.playSound(angryCatSound);
    }
}

// TODO - !flash