import { loadArtIndex, sparkPageOf } from "../book-art/art-index.js";
import { postCard, registerCardButtons, t, warn } from "../chat/cards.js";
import { DAY_PAGE, dayTables, fogHides, fogIn, rolledSky } from "../rules/sky-weather.js";
import { sameDay } from "../rules/time.js";
import { SYSTEM_ID } from "../system-id.js";
import { calendarLabel, getCalendar } from "./calendar.js";
import { rollSpark } from "./referee-rolls.js";
import { setWeather, weatherPaused, weatherShown, weatherView } from "./weather.js";

/**
 * The day's sky and weather (p197): rolled on the Nature Spark Tables as the
 * Company breaks camp, and the fog that can come with it, which hides the
 * neighbouring hexes until the day is out.
 */

/** The fog that came down today: {when}, or null. */
const FOG_SETTING = "fog";

/** @returns {import("../rules/sky-weather.js").Fog|null} */
const fogSaid = () => game.settings.get(SYSTEM_ID, FOG_SETTING) ?? null;

/**
 * Whether fog hides the way now, so a vantage point shows nothing of the land
 * around and a move into a new Hex may be made blind.
 * @param {import("../rules/time.js").Calendar} [now]
 * @returns {boolean}
 */
export const fogHidesTheWay = (now = getCalendar()) => fogHides(fogSaid(), now);

/**
 * Bring the fog down until the day is out, or lift it. GMs only.
 * @param {boolean} down
 * @returns {Promise<boolean>} Whether anything was written.
 */
export async function setFog(down) {
	if (!game.user.isGM) return false;
	await game.settings.set(SYSTEM_ID, FOG_SETTING, down ? { when: { ...getCalendar() } } : null);
	return true;
}

/**
 * The Sky and Weather tables the GM's own import read.
 * @returns {Promise<{sky: object, weather: object, page: object}|null>} Null where Import PDF hasn't read them.
 */
export async function daySkyTables() {
	const page = sparkPageOf(await loadArtIndex(), DAY_PAGE);
	const tables = dayTables(page);
	return tables ? { ...tables, page } : null;
}

/**
 * What a card says of fog in the day's weather, and the button it offers.
 * @param {"solid"|"fog"|null} fog
 * @returns {{text: string, action: string, label: string, icon: string}|null}
 */
function fogView(fog) {
	if (fog === "solid") return { text: t("skyWeather.fog.solid"), action: "lift", label: t("skyWeather.fog.lift"), icon: "fa-solid fa-sun" };
	if (fog === "fog") return { text: t("skyWeather.fog.maybe"), action: "down", label: t("skyWeather.fog.down"), icon: "fa-solid fa-smog" };
	return null;
}

/**
 * Roll the day's Sky and Weather, and whisper the Referee one card with both.
 * Solid Fog comes down at once, to hide the way until the day is out; any
 * other fog is the Referee's to bring down from the card. GMs only.
 * @param {Awaited<ReturnType<typeof daySkyTables>>} [found] The tables, where they've been read already.
 * @returns {Promise<{sky: object[], weather: object[], fog: "solid"|"fog"|null, drawn: string|null}|null>}
 *   What was rolled and the sky it drew, or null where the tables haven't been imported.
 */
export async function rollSkyAndWeather(found) {
	if (!game.user.isGM) return null;
	const tables = found ?? await daySkyTables();
	if (!tables) {
		ui.notifications.warn(t("skyWeather.missing"));
		return null;
	}
	// One table after the other, so the dice land in the order the card reads.
	const sky = await rollSpark(tables.sky);
	const weather = await rollSpark(tables.weather);
	const rolls = weather.results.map((result) => result.roll);
	const fog = fogIn(rolls);
	const drawn = rolledSky(rolls);
	await Promise.all([
		// Yesterday's fog lapsed with yesterday, so only today's roll can bring it down.
		fog === "solid" ? setFog(true) : null,
		// The map follows the roll, till the Referee picks another sky from the Toolkit.
		drawn ? setWeather(drawn) : null
	]);

	const when = { ...getCalendar() };
	const reference = t("spark.tagline", { page: tables.page.name, number: tables.page.page });
	await postCard(null, "sky-weather", {
		title: t("skyWeather.title"),
		tagline: calendarLabel(when),
		tables: [[tables.sky, sky], [tables.weather, weather]].map(([table, rolled]) => ({
			name: table.name,
			reference,
			prompt: rolled.prompt,
			results: rolled.results.filter((result) => result.entry)
		})),
		fog: fogView(fog),
		drawn: drawn && weatherShown() && !weatherPaused() ? t("skyWeather.drawn", { sky: weatherView(drawn).label }) : null,
		hint: t("skyWeather.cardHint")
	}, {
		rolls: [sky.roll, weather.roll],
		mode: "gm",
		// The day it was rolled for, so the card's fog button can't reach another day.
		flags: { [SYSTEM_ID]: { skyWeather: { when } } }
	});
	return { sky: sky.results, weather: weather.results, fog, drawn };
}

/** Register the day's fog, and the card's fog button. Called during init. */
export function registerSkyAndWeather() {
	game.settings.register(SYSTEM_ID, FOG_SETTING, { scope: "world", config: false, type: Object, default: null });
	registerCardButtons({
		selector: "[data-sky-fog]",
		gmOnly: true,
		handler: async (button, message) => {
			// A card from another day speaks only of that day's weather. Cards from before the day
			// was kept on them still work as they did.
			const rolledFor = message?.flags?.[SYSTEM_ID]?.skyWeather?.when;
			if (rolledFor && !sameDay(rolledFor, getCalendar())) return warn("skyWeather.fog.pastDay");
			const down = button.dataset.skyFog === "down";
			if (await setFog(down)) ui.notifications.info(t(down ? "skyWeather.fog.fell" : "skyWeather.fog.lifted"));
		}
	});
}
