/**
 * The rules for getting about a Realm, kept beside a Realm Scene the way the
 * Blank Realm sheet prints Travel (p18) beside its map, with Exploration (p19)
 * as well. They're split over both sides of the map so neither side is too
 * tall to read. Each group is a heading, the page it's printed on, the side
 * of the map it stands on, and its sections. Wording lives in the language
 * file under `bastionland.travelRules`. Pure, so it can be tested without
 * Foundry.
 */
import { REFEREE_TABLES } from "./referee-rolls.js";

/** The sides of the map the rules stand on. */
export const TRAVEL_SIDES = Object.freeze(["left", "right"]);

/** The bands every travelling table reads a d6 in, worst first. */
export const D6_BANDS = Object.freeze(["1", "2-3", "4-6"]);

/** What the Wilderness Roll turns up on a 1, a 2-3 and a 4-6. */
const WILDERNESS_ROWS = Object.freeze(["randomOmen", "nearestOmen", "landmark"]);

/** @returns {readonly string[]} The results of one of the Referee's tables. */
const refereeRows = (key) => REFEREE_TABLES.find((table) => table.key === key).results;

/**
 * @typedef {object} TravelSection
 * @property {string} key
 * @property {boolean} [intro] Opens its group, so it has no heading of its own.
 * @property {boolean} [lead] A paragraph leads into the list, as the rulebook prints it.
 * @property {string[]} [lines] The labelled lines of a list under its text.
 * @property {readonly string[]} [rows] A d6 table's results, one for each of D6_BANDS.
 * @property {boolean} [note] A second paragraph follows the list or table.
 * @property {string} [roll] What a GM's roll button beside it rolls: "wilderness", "gallop", or one of REFEREE_TABLES.
 * @property {string} [act]  What a GM's button beside it does, where nothing is rolled: "folklore", "search" or "vantage".
 * @property {string} [hardship] The Virtue Loss a GM's button beside it takes from those who suffer it: one of HARDSHIPS.
 */

/**
 * On the left, moving across the map: Travel and the travelling tables, with
 * every roll a GM makes on the road. On the right, stopping and looking about:
 * rest and the day's hardships, exploring the land, and what people know. The
 * right side runs the longer of the two, and each side scrolls on its own.
 * @type {readonly {key: string, page: number, side: "left"|"right", sections: readonly TravelSection[]}[]}
 */
export const TRAVEL_RULES = Object.freeze([
	{
		key: "travel",
		page: 18,
		side: "left",
		sections: [
			{ key: "methods", intro: true, lines: ["trek", "gallop", "cruise"], roll: "gallop" },
			{ key: "wildernessRoll", rows: WILDERNESS_ROWS, roll: "wilderness" },
			{ key: "mythHexes" },
			{ key: "omens", note: true },
			{ key: "barriers" }
		]
	},
	{
		key: "rest",
		page: 18,
		side: "right",
		sections: [
			{ key: "hospitality" },
			{ key: "camping" },
			// Each hardship's button stands under the rule that deals it (p18).
			...["supplies", "night", "sleep", "winter"].map((key) => ({ key, hardship: key }))
		]
	},
	{
		key: "tables",
		page: 18,
		side: "left",
		sections: ["blind", "weather", "mood"].map((key) => ({ key, rows: refereeRows(key), roll: key }))
	},
	{
		key: "exploration",
		page: 19,
		side: "right",
		sections: [
			{ key: "land", note: true },
			{ key: "actions", note: true },
			{ key: "saves", lead: true, lines: ["vig", "cla", "spi"] },
			{ key: "searching", act: "search" },
			{ key: "vision", act: "vantage" }
		]
	},
	{ key: "folklore", page: 19, side: "right", sections: [{ key: "folklore", intro: true, lines: ["vassals", "roamers", "everyone", "seers"], act: "folklore" }] }
].map((group) => Object.freeze({ ...group, sections: Object.freeze(group.sections.map((section) => Object.freeze(section))) })));

/** Every group's key, in order. */
export const TRAVEL_GROUPS = Object.freeze(TRAVEL_RULES.map((group) => group.key));

/**
 * @param {"left"|"right"} side
 * @returns {typeof TRAVEL_RULES} The groups on that side of the map, in order.
 */
export const groupsOnSide = (side) => TRAVEL_RULES.filter((group) => group.side === side);

/**
 * The sections the calendar makes pressing, so they can stand out: Night at
 * night, Sleep and Supplies each morning, and Winter and Dire Weather all
 * Winter.
 * @param {{season?: string, phase?: string}} calendar
 * @returns {Set<string>} Section keys.
 */
export function pressingSections({ season, phase } = {}) {
	const pressing = new Set();
	if (phase === "night") pressing.add("night");
	if (phase === "morning") ["sleep", "supplies"].forEach((key) => pressing.add(key));
	if (season === "winter") ["winter", "weather"].forEach((key) => pressing.add(key));
	return pressing;
}

/**
 * Where one side's rules sit on screen: against that edge of the Realm's map,
 * level with its top and as tall as it, as the Blank Realm sheet prints them.
 * They stay held to the map as it pans, even when that takes their top or foot
 * off the screen, and they're never shorter than `minHeight`.
 * @param {{left: number, top: number, right: number, bottom: number}} map The map on screen, in CSS pixels.
 * @param {object} [options]
 * @param {"left"|"right"} [options.side]
 * @param {number} [options.width] The rules' own width, before the interface scale.
 * @param {number} [options.gap] Between the map's edge and the rules.
 * @param {number} [options.minHeight]
 * @param {number} [options.scale] The interface scale, which each of these grows with.
 * @returns {{left: number, top: number, maxHeight: number}}
 */
export function travelRulesPlacement(map, { side = "right", width = 300, gap = 12, minHeight = 240, scale = 1 } = {}) {
	const [wide, space, least] = [width, gap, minHeight].map((length) => length * scale);
	const left = Math.round(side === "left" ? map.left - space - wide : map.right + space);
	return { left, top: Math.round(map.top), maxHeight: Math.round(Math.max(least, map.bottom - map.top)) };
}

/**
 * How someone has left the rules: which sides they've folded away, and which
 * groups they've closed. Rules saved before they were split fold both sides.
 * @param {unknown} raw As saved.
 * @returns {{folded: string[], closed: string[]}}
 */
export function normaliseTravelRulesView(raw) {
	const folded = raw?.folded === true ? TRAVEL_SIDES : Array.isArray(raw?.folded) ? raw.folded : [];
	const closed = Array.isArray(raw?.closed) ? raw.closed : [];
	return {
		folded: TRAVEL_SIDES.filter((side) => folded.includes(side)),
		closed: TRAVEL_GROUPS.filter((key) => closed.includes(key))
	};
}
