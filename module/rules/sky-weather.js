/**
 * The day's sky and weather (p197). As the Company wakes and breaks camp, the
 * Referee rolls the Nature Spark Tables' Sky and Weather (p22) to paint the
 * scene. A weather roll of Solid Fog means the Knights can't see into the
 * neighbouring hexes, and without some means of keeping their course they
 * may be Travelling Blind. Pure, so it can be tested without Foundry.
 */
import { SPARK_PAGES, SPARK_TABLES_PER_PAGE } from "./spark-tables.js";
import { sameDay } from "./time.js";

/** The page Sky and Weather are printed on: Nature (p22). */
export const DAY_PAGE = SPARK_PAGES[0].key;

/**
 * Where Sky and Weather stand on the Nature page, which prints its nine tables
 * three to a row: Sky first on the top row, Weather first on the bottom one.
 * No table name from the book ships with the system, so they're found by their
 * place, as the Lay of the Land finds its tables.
 */
export const SKY_POSITION = 0;
export const WEATHER_POSITION = 6;

/**
 * Solid Fog, as the dice land on it: Solid is the eighth entry of the Weather
 * table's first column, and Fog the twelfth of its second (p22).
 */
export const SOLID_FOG = Object.freeze([8, 12]);

/**
 * The Sky and Weather tables from the Nature page the GM's import read. A page
 * missing a table can't be trusted to hold the rest where the book prints them,
 * so it gives neither.
 * @param {{tables?: object[]}|null|undefined} page The Nature page of the art index's `spark`.
 * @returns {{sky: object, weather: object}|null}
 */
export function dayTables(page) {
	const tables = page?.tables ?? [];
	if (tables.length !== SPARK_TABLES_PER_PAGE) return null;
	const sky = tables[SKY_POSITION];
	const weather = tables[WEATHER_POSITION];
	return sky?.columns?.length && weather?.columns?.length === SOLID_FOG.length ? { sky, weather } : null;
}

/**
 * What a weather roll says of fog. Solid Fog hides the neighbouring hexes
 * (p197). Fog of any other sort might, if the Referee says so.
 * @param {number[]} rolls The Weather table's d12s, one for each column.
 * @returns {"solid"|"fog"|null}
 */
export function fogIn(rolls) {
	const [description, element] = rolls ?? [];
	if (element !== SOLID_FOG[1]) return null;
	return description === SOLID_FOG[0] ? "solid" : "fog";
}

/**
 * @typedef {object} Fog The fog that came down on a Day.
 * @property {import("./time.js").Calendar} when When it came down.
 */

/**
 * Whether fog hides the way now: it came down today, and it's still day. By
 * night the dark hides the way anyway, and the Night asks after a guide and
 * light (rules/night-travel.js); by the next Morning the day's weather is rolled
 * again.
 * @param {Fog|null} fog As stored.
 * @param {import("./time.js").Calendar} now
 * @returns {boolean}
 */
export const fogHides = (fog, now) => Boolean(fog) && now?.phase !== "night" && sameDay(fog.when, now);
