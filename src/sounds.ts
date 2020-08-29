import path from 'path';
const sound = require('sound-play');

const basePath = process.cwd();

export module Sounds{
    // Sound Function
    export function playSound(file: string) {
        sound.play(path.join(basePath, file)).then((response: any) => console.log('sound finished!'))
            // .then(response => console.log('sound played!'));
    }
}
