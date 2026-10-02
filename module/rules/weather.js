/**
 * The weather, for a table running FXMaster: the sky the day's Sky and Weather
 * roll draws (rules/sky-weather.js), or the one the GM says it is, drawn on the
 * Scene the players are on.
 * The effects are FXMaster particle effects as its scene flag keeps them,
 * `flags.fxmaster.effects.<key> = {type, options}`, with options stored bare;
 * the numbers are stonetop-pwd's, tuned against FXMaster's own ranges.
 */

/** The modules that draw it: FXMaster, and FXMaster+, which adds to it and keeps its effects in the same flag. */
export const FXMASTER_IDS = Object.freeze(["fxmaster", "fxmaster-plus"]);

/** The flag namespace FXMaster keeps its effects under. */
export const FXMASTER_FLAG = "fxmaster";

/** Our effects' keys start with this, and nothing else's do: a GM's own fireflies are left alone. */
export const WEATHER_KEY_PREFIX = "bastionland-weather-";

/** One wind for the whole sky, as an FXMaster heading: 180 blows right to left. */
const WIND = 180;

/** Falling in that wind, `lean` degrees off straight down. */
const driven = (lean) => 90 + Math.sign(WIND - 90) * lean;

/** Each sky: its icon, and what FXMaster draws for it. A clear sky draws nothing. */
export const WEATHER = Object.freeze({
	clear: { icon: "fa-solid fa-sun", effects: [] },
	fair: { icon: "fa-solid fa-cloud-sun", effects: [{ type: "clouds", options: { density: 0.02, speed: 0.6, alpha: 0.45, direction: WIND } }] },
	cloud: { icon: "fa-solid fa-cloud", effects: [{ type: "clouds", options: { density: 0.12, speed: 0.8, alpha: 0.8, direction: WIND } }] },
	wind: { icon: "fa-solid fa-wind", effects: [{ type: "clouds", options: { density: 0.06, speed: 3.4, alpha: 0.6, direction: WIND } }] },
	fog: { icon: "fa-solid fa-smog", effects: [{ type: "fog", options: { density: 0.1, speed: 0.4, alpha: 0.35 } }] },
	rain: {
		icon: "fa-solid fa-cloud-rain",
		effects: [
			{ type: "clouds", options: { density: 0.06, speed: 1, alpha: 0.55, direction: WIND } },
			{ type: "rain", options: { density: 0.8, speed: 1.2, scale: 1.6, direction: driven(10) } }
		]
	},
	downpour: {
		icon: "fa-solid fa-cloud-showers-heavy",
		effects: [
			{ type: "clouds", options: { density: 0.12, speed: 1.6, alpha: 0.7, direction: WIND } },
			{ type: "rain", options: { density: 2.4, speed: 2, scale: 1.9, direction: driven(15) } }
		]
	},
	storm: {
		icon: "fa-solid fa-cloud-bolt",
		effects: [
			{ type: "clouds", options: { density: 0.16, speed: 2.4, alpha: 0.85, direction: WIND, tint: { value: "#6f7683", apply: true } } },
			{ type: "rain", options: { density: 2.6, speed: 2.6, scale: 2.1, direction: driven(20) } },
			{ type: "hail", options: { density: 0.5, speed: 2.2, direction: driven(20) } }
		]
	},
	snow: { icon: "fa-solid fa-snowflake", effects: [{ type: "snow", options: { density: 1, speed: 0.9, direction: driven(25) } }] },
	blizzard: { icon: "fa-solid fa-icicles", effects: [{ type: "snowstorm", options: { density: 1, speed: 2.6, direction: driven(30) } }] }
});

/** The skies in the order the picker shows them, fairest first. */
export const WEATHER_KEYS = Object.freeze(Object.keys(WEATHER));

/**
 * The parts of the sky a world can switch off one at a time, each with the
 * world setting that does it: an FXMaster effect, or the storm's grey light,
 * which is an option on its clouds rather than an effect of its own.
 */
export const WEATHER_PARTS = Object.freeze([
	Object.freeze({ type: "clouds", setting: "weatherFxClouds" }),
	Object.freeze({ type: "fog", setting: "weatherFxFog" }),
	Object.freeze({ type: "rain", setting: "weatherFxRain" }),
	Object.freeze({ type: "hail", setting: "weatherFxHail" }),
	Object.freeze({ type: "snow", setting: "weatherFxSnow" }),
	Object.freeze({ type: "snowstorm", setting: "weatherFxSnowstorm" }),
	Object.freeze({ tint: true, setting: "weatherFxStormTint" })
]);

/**
 * @typedef {object} PartsOff The parts of the sky switched off.
 * @property {Set<string>} [types] The FXMaster effects left out.
 * @property {boolean} [tint] Whether clouds lose their tint.
 */

/**
 * The parts switched off, from each part's setting. Only an explicit false is
 * off, so a world that never touched them gets the whole sky.
 * @param {(setting: string) => unknown} valueOf
 * @returns {PartsOff}
 */
export function partsOff(valueOf) {
	const off = { types: new Set(), tint: false };
	for (const part of WEATHER_PARTS) {
		if (valueOf(part.setting) !== false) continue;
		if (part.tint) off.tint = true;
		else off.types.add(part.type);
	}
	return off;
}

/** @returns {boolean} Whether `sky` is one of ours. */
export function isWeather(sky) {
	return Object.hasOwn(WEATHER, String(sky));
}

/**
 * The effects a sky draws with some of its parts off, as copies the Scene can keep.
 * @param {string|null} sky
 * @param {PartsOff} off
 * @returns {{type: string, options: object}[]}
 */
function effectsOf(sky, off) {
	return (isWeather(sky) ? WEATHER[sky].effects : [])
		.filter(({ type }) => !off.types?.has(type))
		.map(({ type, options }) => {
			const copy = structuredClone(options);
			if (off.tint) delete copy.tint;
			return { type, options: copy };
		});
}

/**
 * What to write to a Scene's FXMaster effects so it shows `sky`, and what to take
 * off. Each key names its sky as well as its effect, and whether it's tinted, so a
 * change of weather or of tint takes the old keys off whole rather than merging
 * new options into old ones, where a tint taken away would stay.
 * @param {string|null} sky Null takes our weather off.
 * @param {object} current The Scene's `flags.fxmaster.effects`.
 * @param {PartsOff} [off] The parts of the sky switched off.
 * @returns {{set: object, drop: string[]}|null} Null when the Scene already shows it.
 */
export function weatherEffectsChange(sky, current = {}, off = {}) {
	const wanted = Object.fromEntries(effectsOf(sky, off).map((effect) => [`${WEATHER_KEY_PREFIX}${sky}-${effect.type}${effect.options.tint ? "-tint" : ""}`, effect]));
	const ours = Object.keys(current ?? {}).filter((key) => key.startsWith(WEATHER_KEY_PREFIX));
	const set = Object.fromEntries(Object.entries(wanted).filter(([key]) => !ours.includes(key)));
	const drop = ours.filter((key) => !(key in wanted));
	return Object.keys(set).length || drop.length ? { set, drop } : null;
}
