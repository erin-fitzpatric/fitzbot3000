import axios from 'axios';
import  fs from 'fs';

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
            .put(`${creds.baseURL}/groups/2/action`, {
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
            .put(`${creds.baseURL}/groups/2/action`, {
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
            .put(`${creds.baseURL}/groups/2/action`, {
                scene: sceneID,
            })
            .then(function(response: any) {
                console.log('success', response)
            })
            .catch(function(error: any) {
                console.log('fail', error)
            })
    }


    export async function pickColor(hue: number, bri?: number, sat?: number) {
        try {
            const response = await axios.put(
                `${creds.baseURL}/groups/2/action`, {
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