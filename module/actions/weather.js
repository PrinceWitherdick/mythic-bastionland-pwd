import { chooseDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { read } from "../client-settings.js";
import { deletionEntry } from "../compat.js";
import { FXMASTER_FLAG, FXMASTER_IDS, WEATHER, WEATHER_KEYS, WEATHER_PARTS, isWeather, partsOff, weatherEffectsChange } from "../rules/weather.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * The weather the GM has set, or the day's roll has, drawn by FXMaster on the
 * Scene the players are on. The GM can take it off the map, or switch off parts
 * of it. Without FXMaster none of it shows, and nothing here draws.
 */

/** The world's weather: a key of WEATHER, or "" before any is set. */
const WEATHER_SETTING = "weather";

/** Whether the GM Toolkit's banner offers the weather, for a GM who has FXMaster and doesn't want it. */
const BUTTON_SETTING = "weatherButton";

/** Whether the weather is on the map; off, it's kept but not drawn. */
const ON_MAP_SETTING = "weatherOnMap";

/** Called on every client with the new weather whenever it changes. */
export const WEATHER_HOOK = `${SYSTEM_ID}.weatherChanged`;

/** Draw the weather again, once for a form that changed several settings at once. Only the active GM writes. */
let redrawSoon = null;
function redrawWeather() {
	redrawSoon ??= foundry.utils.debounce(() => {
		if (game.users.activeGM?.isSelf) drawWeather();
	}, 100);
	redrawSoon();
}

/** Register the weather. Called during init. */
export function registerWeatherSetting() {
	game.settings.register(SYSTEM_ID, WEATHER_SETTING, {
		scope: "world",
		config: false,
		type: String,
		default: "",
		onChange: (value) => Hooks.callAll(WEATHER_HOOK, isWeather(value) ? value : null)
	});
	game.settings.register(SYSTEM_ID, BUTTON_SETTING, {
		name: "bastionland.weather.settings.button.name",
		hint: "bastionland.weather.settings.button.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		// The banner is drawn again, with or without its button.
		onChange: () => Hooks.callAll(WEATHER_HOOK, getWeather())
	});
	game.settings.register(SYSTEM_ID, ON_MAP_SETTING, {
		name: "bastionland.weather.settings.weatherOnMap.name",
		hint: "bastionland.weather.settings.weatherOnMap.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
		onChange: () => {
			redrawWeather();
			Hooks.callAll(WEATHER_HOOK, getWeather());
		}
	});
	for (const { setting } of WEATHER_PARTS) {
		game.settings.register(SYSTEM_ID, setting, {
			name: `bastionland.weather.settings.${setting}.name`,
			hint: `bastionland.weather.settings.${setting}.hint`,
			scope: "world",
			config: true,
			type: Boolean,
			default: true,
			onChange: redrawWeather
		});
	}
}

/** @returns {boolean} Whether FXMaster, or FXMaster+, is on in this world. */
export function weatherShown() {
	return FXMASTER_IDS.some((id) => game.modules?.get(id)?.active === true);
}

/**
 * @returns {boolean} Whether the GM Toolkit's banner has the weather button:
 *   FXMaster is on, and this GM hasn't hidden it. Hidden, the weather last set
 *   still follows the table.
 */
export function weatherButtonShown() {
	return weatherShown() && read(BUTTON_SETTING, true) !== false;
}

/** @returns {boolean} Whether the GM has taken the weather off the map, keeping it set. */
export function weatherPaused() {
	return read(ON_MAP_SETTING, true) === false;
}

/**
 * Take the weather off the map, or put it back. GMs only; the setting's
 * change draws it.
 * @param {boolean} paused
 */
export async function setWeatherPaused(paused) {
	if (!game.user.isGM) return;
	await game.settings.set(SYSTEM_ID, ON_MAP_SETTING, !paused);
}

/** @returns {string|null} The weather, or null before any is set. */
export function getWeather() {
	const sky = game.settings.get(SYSTEM_ID, WEATHER_SETTING);
	return isWeather(sky) ? sky : null;
}

/**
 * @param {string|null} sky
 * @returns {{key: string|null, label: string, icon: string, paused: boolean}} The weather as the banner shows it.
 */
export function weatherView(sky = getWeather()) {
	const paused = weatherPaused();
	return isWeather(sky)
		? { key: sky, label: t(`weather.skies.${sky}`), icon: WEATHER[sky].icon, paused }
		: { key: null, label: t("weather.unset"), icon: "fa-solid fa-cloud-sun", paused };
}

/**
 * Set the weather and draw it. GMs only.
 * @param {string} sky
 */
export async function setWeather(sky) {
	if (!game.user.isGM || !isWeather(sky)) return;
	await game.settings.set(SYSTEM_ID, WEATHER_SETTING, sky);
	await drawWeather();
}

/**
 * Put the weather on the active Scene, less any parts the world has switched off,
 * and take ours off every other Scene, so it follows the table from Scene to
 * Scene. Taken off the map, it's taken off every Scene. Only the Scenes that need
 * a change are written.
 */
export async function drawWeather() {
	if (!game.user.isGM || !weatherShown()) return;
	const active = game.scenes.active;
	const sky = weatherPaused() ? null : getWeather();
	const off = partsOff((setting) => read(setting, true));
	const path = (key) => `flags.${FXMASTER_FLAG}.effects.${key}`;
	await Promise.all(game.scenes.map(async (scene) => {
		const change = weatherEffectsChange(scene === active ? sky : null, scene.getFlag(FXMASTER_FLAG, "effects"), off);
		if (!change) return;
		try {
			await scene.update(Object.fromEntries([
				...Object.entries(change.set).map(([key, effect]) => [path(key), effect]),
				...change.drop.map((key) => deletionEntry(path(key)))
			]));
		} catch (error) {
			// The weather is still set; only the Scene stayed as it was.
			console.warn(`${SYSTEM_ID} | couldn't change the weather on ${scene.name}`, error);
		}
	}));
}

/**
 * Ask the GM for the weather, and set it. With FXMaster on, the window can also
 * take the weather off the map, or put it back.
 * @returns {Promise<string|null>} The weather chosen, or null if the window was closed or only paused it.
 */
export async function pickWeather() {
	if (!game.user.isGM) return null;
	const now = getWeather();
	const paused = weatherPaused();
	const pause = weatherShown()
		? [{
			action: paused ? "resume" : "pause",
			label: t(paused ? "weather.resume" : "weather.pause"),
			icon: paused ? "fa-solid fa-play" : "fa-solid fa-pause",
			class: "bastionland-weather-picker__pause"
		}]
		: [];
	const sky = await chooseDialog({
		title: t("weather.title"),
		icon: "fa-solid fa-cloud-sun-rain",
		message: t("weather.hint"),
		classes: ["bastionland-weather-picker"],
		buttons: [
			...WEATHER_KEYS.map((key) => ({
				action: key,
				label: t(`weather.skies.${key}`),
				icon: WEATHER[key].icon,
				default: key === now,
				class: key === now ? "is-active" : undefined
			})),
			...pause
		]
	});
	if (sky === "pause" || sky === "resume") {
		await setWeatherPaused(sky === "pause");
		return null;
	}
	if (!isWeather(sky)) return null;
	await setWeather(sky);
	return sky;
}

/** Carry the weather to a newly active Scene. Called during setup; only the active GM writes. */
export function registerWeatherHooks() {
	Hooks.on("updateScene", (scene, changes) => {
		if (changes.active !== true || !game.users.activeGM?.isSelf) return;
		drawWeather();
	});
}
