import axios from 'axios';
import  fs from 'fs';


const groupNumber = '1';

// Load in creds JSON file
const creds = JSON.parse(fs.readFileSync('./creds.json', 'UTF-8'));

export module Lights {
    // // Get current light
    // export function async getDefaultLighting() {
    //     axios
    //     .put(`${creds.baseURL}/groups/2/action`, {
    //         on: true,
    //     })
    //     .then(function(response: any) {
    //         console.log('success', response)
    //     })
    //     .catch(function(error: any) {
    //         console.log('fail', error)
    //     })
    // }

    // Light Functions
    export function lightsOn() {
        axios
            .put(`${creds.baseURL}/groups/${groupNumber}/action`, {
                on: true,
            })
            .then(function(response: any) {
                console.log('lights on!')
            })
            .catch(function(error: any) {
                console.log('fail', error)
            })
    }

    export function lightsOff() {
        axios
            .put(`${creds.baseURL}/groups/${groupNumber}/action`, {
                on: false,
            })
            .then(function(response: any) {
                console.log('lights off!')
            })
            .catch(function(error: any) {
                console.log('fail', error)
            })
    }

    export function setScene(sceneID: string) {
        axios
            .put(`${creds.baseURL}/groups/${groupNumber}/action`, {
                scene: sceneID,
            })
            .then(function(response: any) {
                console.log('success', response)
            })
            .catch(function(error: any) {
                console.log('fail', error)
            })
    }

	export async function pickColorCIE(colorSpin: number) {
        try {
			let angle = colorSpin * 2 * Math.PI;

			let x = (Math.cos(colorSpin) + 1) / 2;
			let y = (Math.sin(colorSpin) + 1) / 2;

            const response = await axios.put(
                `${creds.baseURL}/groups/${groupNumber}/action`, {
                    xy: [ x, y]
                }, { timeout: 100 },
            )
            return true
        } catch (err) {
            return false
        }
    }

    export async function pickColor(hue: number, bri?: number, sat?: number) {
        try {
            const response = await axios.put(
                `${creds.baseURL}/groups/${groupNumber}/action`, {
                    hue: Math.round(hue),
                    ...bri != undefined ? { bri } : {},
                    ...sat != undefined ? { sat } : {}
                }, { timeout: 100 },
            )
            return true
        } catch (err) {
            return false
        }
    }
}