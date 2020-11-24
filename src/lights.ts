import axios from 'axios';
import fs from 'fs';

const settings = JSON.parse(fs.readFileSync('./settings.json', 'utf-8'));
const groupNumber = settings.lightGroup || 2;

// Load in creds JSON file
const creds = JSON.parse(fs.readFileSync('./creds.json', 'utf-8'));

export module Lights
{
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
	export function lightsOn()
	{
		axios
			.put(`${creds.baseURL}/groups/${groupNumber}/action`, {
				on: true,
			})
			.then(function (response: any)
			{
				console.log('lights on!')
			})
			.catch(function (error: any)
			{
				console.log('fail', error)
			})
	}

	export function lightsOff()
	{
		axios
			.put(`${creds.baseURL}/groups/${groupNumber}/action`, {
				on: false,
			})
			.then(function (response: any)
			{
				console.log('lights off!')
			})
			.catch(function (error: any)
			{
				console.log('fail', error)
			})
	}

	export function setScene(sceneID: string)
	{
		axios
			.put(`${creds.baseURL}/groups/${groupNumber}/action`, {
				scene: sceneID,
			})
			.then(function (response: any)
			{
				console.log('success', response)
			})
			.catch(function (error: any)
			{
				console.log('fail', error)
			})
	}

	export async function pickColorCIE(colorSpin: number)
	{
		try
		{
			let angle = colorSpin * 2 * Math.PI;

			let gamut = {
				r: [0.675, 0.322],
				g: [0.409, 0.518],
				b: [0.167, 0.04]
			};
			

			let x = (Math.cos(colorSpin) + 1) / 2;
			let y = (Math.sin(colorSpin) + 1) / 2;

			const response = await axios.put(
				`${creds.baseURL}/groups/${groupNumber}/action`, {
				xy: [x, y]
			}, { timeout: 100 },
			)
			return true
		} catch (err)
		{
			return false
		}
	}

	export async function pickColor(hue: number, bri?: number, sat?: number, on?: boolean)
	{
		try
		{
			const response = await axios.put(
				`${creds.baseURL}/groups/${groupNumber}/action`, {
				hue: Math.round(hue),
				...bri != undefined ? { bri: Math.round(bri) } : {},
				...sat != undefined ? { sat: Math.round(sat) } : {},
				...on != undefined ? { on } : {}
			}, { timeout: 100 },
			)
			return true
		} catch (err)
		{
			return false
		}
	}
}