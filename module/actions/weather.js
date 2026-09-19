import { chooseDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { read } from "../client-settings.js";
import { FXMASTER_FLAG, FXMASTER_IDS, WEATHER, WEATHER_KEYS, isWeather, weatherEffectsChange } from "../rules/weather.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * The weather the GM has set, drawn by FXMaster on the Scene the players are on.
 * Without FXMaster none of it shows, and nothing here runs.
 */

/** The world's weather: a key of WEATHER, or "" before any is set. */
const WEATHER_SETTING = "weather";

/** Whether the GM Toolkit's banner offers the weather, for a GM who has FXMaster and doesn't want it. */
const BUTTON_SETTING = "weatherButton";

/** Called on every client with the new weather whenever it changes. */
export const WEATHER_HOOK = `${SYSTEM_ID}.weatherChanged`;

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

/** @returns {string|null} The weather, or null before any is set. */
export function getWeather() {
	const sky = game.settings.get(SYSTEM_ID, WEATHER_SETTING);
	return isWeather(sky) ? sky : null;
}

/**
 * @param {string|null} sky
 * @returns {{key: string|null, label: string, icon: string}} The weather as the banner shows it.
 */
export function weatherView(sky = getWeather()) {
	return isWeather(sky)
		? { key: sky, label: t(`weather.skies.${sky}`), icon: WEATHER[sky].icon }
		: { key: null, label: t("weather.unset"), icon: "fa-solid fa-cloud-sun" };
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
 * Put the weather on the active Scene, and take ours off every other Scene, so it
 * follows the table from Scene to Scene. Only the Scenes that need a change are written.
 */
export async function drawWeather() {
	if (!game.user.isGM || !weatherShown()) return;
	const active = game.scenes.active;
	const sky = getWeather();
	const path = (key) => `flags.${FXMASTER_FLAG}.effects.${key}`;
	await Promise.all(game.scenes.map(async (scene) => {
		const change = weatherEffectsChange(scene === active ? sky : null, scene.getFlag(FXMASTER_FLAG, "effects"));
		if (!change) return;
		try {
			await scene.update(Object.fromEntries([
				...Object.entries(change.set).map(([key, effect]) => [path(key), effect]),
				...change.drop.map((key) => [path(key), new foundry.data.operators.ForcedDeletion()])
			]));
		} catch (error) {
			// The weather is still set; only the Scene stayed as it was.
			console.warn(`${SYSTEM_ID} | couldn't change the weather on ${scene.name}`, error);
		}
	}));
}

/**
 * Ask the GM for the weather, and set it.
 * @returns {Promise<string|null>} The weather chosen, or null if the window was closed.
 */
export async function pickWeather() {
	if (!game.user.isGM) return null;
	const now = getWeather();
	const sky = await chooseDialog({
		title: t("weather.title"),
		icon: "fa-solid fa-cloud-sun-rain",
		message: t("weather.hint"),
		classes: ["bastionland-weather-picker"],
		buttons: WEATHER_KEYS.map((key) => ({
			action: key,
			label: t(`weather.skies.${key}`),
			icon: WEATHER[key].icon,
			default: key === now,
			class: key === now ? "is-active" : undefined
		}))
	});
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
