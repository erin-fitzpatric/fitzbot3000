import path from 'path';
const sound = require('sound-play');

const basePath = process.cwd();

export module Sounds{
    // Sound Function
    export function playSound(file: string) : Promise<any> {
        return sound.play(path.join(basePath, file))
    }
}
