/**
 * The City Quest (p172-173): for the worthiest Companies, a list of 24 Omens
 * that stand in for a random Myth's, and a Cast who turn up in them. Nothing
 * from the pages ships with the system; Import PDF reads them from the
 * GM's own rulebook. Pure, so the page reading can be tested without Foundry.
 */
import { BASELINE_TOLERANCE, readCast, runMiddle, textLines, textRuns } from "./book-art.js";
import { joinLines } from "./text.js";

/** The pages holding the City Quest's Omens and its Cast. */
export const CITY_QUEST_PAGES = Object.freeze({ omens: 172, cast: 173 });

export const CITY_OMEN_COUNT = 24;

/** Encountering this Omen, or any after it, ends the City Quest. */
export const CITY_QUEST_END = 18;

/** Both pages head their text "Omens" or "Cast" at 20pt, centred on the page. */
const HEADING_SIZE = 20;

/** The Omens and Cast are set at 11pt, with smaller capitals in stat lines. */
const TEXT_SIZE = 11;

const OMEN_START = /^(\d+)\.\s*(.*)$/;

/**
 * The text below a centred heading, as lines in each of the page's two
 * columns. The lines are centred or ragged too, so a run belongs to the column
 * its middle falls in, either side of the heading's middle.
 * @param {object[]} items From `page.getTextContent()`.
 * @param {string} word The heading, such as "omens".
 * @returns {{left: ReturnType<typeof textLines>, right: ReturnType<typeof textLines>}|null}
 *   Null without the heading.
 */
function columnsBelow(items, word) {
	const heading = textRuns(items).find((run) => Math.abs(run.size - HEADING_SIZE) <= 2 && run.str.trim().toLowerCase() === word);
	if (!heading) return null;

	const split = runMiddle(heading);
	// Anything set larger than the text, such as the page number, is left out.
	const below = items
		.map((item) => ({ item, run: textRuns([item])[0] }))
		.filter(({ run }) => run && run.y < heading.y - BASELINE_TOLERANCE && run.size <= TEXT_SIZE + 1);
	const column = (left) => textLines(below.filter(({ run }) => (runMiddle(run) < split) === left).map(({ item }) => item));
	return { left: column(true), right: column(false) };
}

/**
 * The City Quest's Omens, which fill two columns below their heading.
 * @param {object[]} items From `page.getTextContent()`.
 * @returns {string[]|null} Each Omen in number order, so Omen n is at n - 1.
 *   Null without the heading, or unless every Omen from 1 to CITY_OMEN_COUNT
 *   was read once.
 */
export function cityQuestOmensFromItems(items) {
	const columns = columnsBelow(items, "omens");
	if (!columns) return null;

	// By number rather than column order, so an Omen that starts a column
	// can't be joined to the end of the one before it.
	const omens = new Map();
	for (const lines of [columns.left, columns.right]) {
		let number = null;
		for (const { text } of lines) {
			const start = OMEN_START.exec(text);
			if (start) {
				number = Number(start[1]);
				if (omens.has(number)) return null;
				omens.set(number, start[2]);
			} else if (number !== null) {
				omens.set(number, joinLines(omens.get(number), text));
			}
		}
	}

	const inOrder = Array.from({ length: CITY_OMEN_COUNT }, (_, index) => omens.get(index + 1));
	return omens.size === CITY_OMEN_COUNT && inOrder.every(Boolean) ? inOrder : null;
}

/**
 * The City Quest's Cast, in two columns of stat blocks below their heading,
 * left column first.
 * @param {object[]} items From `page.getTextContent()`.
 * @returns {{cast: import("./book-art.js").CastEntry[], castNote: string}|null}
 *   As a Myth's Cast is read. Null without the heading or any entry.
 */
export function cityQuestCastFromItems(items) {
	const columns = columnsBelow(items, "cast");
	if (!columns) return null;
	const left = readCast(columns.left);
	const right = readCast(columns.right);
	const cast = [...left.cast, ...right.cast];
	if (!cast.length) return null;
	return { cast, castNote: [left.castNote, right.castNote].filter(Boolean).join(" ") };
}

const isOmen = (number) => Number.isInteger(number) && number >= 1 && number <= CITY_OMEN_COUNT;

/**
 * Which Omen of the City a Company encounters: d12 plus the number of its
 * Omens they have already encountered, treating more than 24 as 24, and taking
 * the next Omen down the list in place of one already encountered.
 * @param {number} d12
 * @param {number[]} [seen] Omens already encountered.
 * @returns {{omen: number|null, ends: boolean}} `ends` when the Omen ends the
 *   City Quest. `omen` is null only once every Omen has been encountered.
 */
export function cityOmen(d12, seen = []) {
	if (!Number.isInteger(d12) || d12 < 1 || d12 > 12) throw new RangeError(`${d12} isn't a d12 roll`);
	const encountered = new Set(seen.filter(isOmen));
	const roll = Math.min(d12 + encountered.size, CITY_OMEN_COUNT);

	let omen = null;
	for (let number = roll; number <= CITY_OMEN_COUNT && omen === null; number++) {
		if (!encountered.has(number)) omen = number;
	}
	// The book doesn't say what follows a duplicate with nothing left further
	// down, such as 24 when 24 has been encountered. Taking the nearest Omen
	// back up the list keeps the roll close to what was rolled. It can only
	// come up after an Omen that ended the Quest.
	for (let number = roll - 1; number >= 1 && omen === null; number--) {
		if (!encountered.has(number)) omen = number;
	}
	return { omen, ends: omen === null || omen >= CITY_QUEST_END };
}

/**
 * @param {number[]} seen Omens of the City already encountered.
 * @returns {boolean} Whether one of them ended the City Quest.
 */
export const cityQuestOver = (seen) => seen.some((number) => isOmen(number) && number >= CITY_QUEST_END);

/**
 * @param {{type: string, hasPlayerOwner?: boolean, system?: {rank?: string}}[]} actors
 * @returns {boolean} Whether any player's Knight is a Knight-Radiant, worthy of the City Quest.
 */
export const worthyOfCityQuest = (actors) => actors.some((actor) => actor.type === "knight" && actor.hasPlayerOwner && actor.system?.rank === "radiant");

/**
 * Whether a Wilderness Roll meets an Omen of the City in place of a random
 * Myth's: the roll was a 1, the Company is worthy, and the Quest hasn't ended.
 * @param {string} result From wildernessResult.
 * @param {boolean} worthy
 * @param {number[]} seen Omens of the City already encountered.
 * @returns {boolean}
 */
export const cityOmenReplaces = (result, worthy, seen) => result === "randomOmen" && worthy && !cityQuestOver(seen);
