/**
 * Grand Designs (p21): "Work on existing buildings or infrastructure is
 * generally completed by the next Season. New buildings or infrastructure can
 * be completed in a Season. Grand projects such as castles and roads require
 * an entire Age of work."
 *
 * So each work a Domain has in hand remembers when it was begun, and its scale
 * says when it's done: works on what stands by the next Season; a new building
 * after a whole Season of work, which is the next Season when it was begun as
 * one began and the Season after otherwise; a grand project after a whole Age,
 * likewise. Kept by an id in an object, as the Court is, so the sheet can write
 * one line at a time. Pure, so it can be tested without Foundry.
 */
import { trimmedText } from "./text.js";
import { compareCalendars, nextAge, nextSeason, normalizeCalendar, PHASES, SEASONS } from "./time.js";

/** How big the work is, in the order the book gives them. */
export const DESIGN_SCALES = Object.freeze(["works", "building", "grand"]);

/** Each scale's icon, on the sheet. */
export const DESIGN_ICONS = Object.freeze({
	works: "fa-solid fa-trowel-bricks",
	building: "fa-solid fa-house-chimney",
	grand: "fa-solid fa-chess-rook"
});

/**
 * @typedef {object} GrandDesign
 * @property {string} what   What's being built, written as the GM likes.
 * @property {string} scale  One of DESIGN_SCALES.
 * @property {import("./time.js").Calendar} started When the work was begun.
 * @property {number} at     When it was written down, to keep the list in that order.
 */

/**
 * @param {unknown} raw As stored.
 * @returns {GrandDesign|null} Null for anything that isn't a work in hand.
 */
export function normalizeDesign(raw) {
	if (!raw || typeof raw !== "object" || !DESIGN_SCALES.includes(raw.scale)) return null;
	return {
		what: trimmedText(raw.what),
		scale: raw.scale,
		started: normalizeCalendar(raw.started),
		at: Number.isFinite(raw.at) ? raw.at : 0
	};
}

/**
 * @param {unknown} designs As stored.
 * @returns {(GrandDesign & {id: string})[]} In the order they were begun.
 */
export function grandDesigns(designs) {
	if (!designs || typeof designs !== "object") return [];
	return Object.entries(designs)
		.map(([id, raw]) => ({ id, design: normalizeDesign(raw) }))
		.filter(({ design }) => design)
		.map(({ id, design }) => ({ id, ...design }))
		.sort((a, b) => compareCalendars(a.started, b.started) || a.at - b.at || a.id.localeCompare(b.id));
}

/**
 * A work ready to store.
 * @param {string} scale One of DESIGN_SCALES.
 * @param {import("./time.js").Calendar} started Now.
 * @param {number} at Usually Date.now().
 * @returns {GrandDesign|null} Null for a scale the book doesn't give.
 */
export const newDesign = (scale, started, at) => normalizeDesign({ what: "", scale, started, at });

/** @param {import("./time.js").Calendar} calendar */
const seasonsFirstMorning = ({ day, phase }) => day === 1 && phase === PHASES[0];

/**
 * When a work is done: the first Morning of the Season or Age it's finished by.
 * @param {GrandDesign} design
 * @returns {import("./time.js").Calendar}
 */
export function designReady({ scale, started }) {
	const begun = normalizeCalendar(started);
	switch (scale) {
		case "works":
			return nextSeason(begun);
		case "building":
			// A whole Season of work, so one begun partway through takes the next Season too.
			return seasonsFirstMorning(begun) ? nextSeason(begun) : nextSeason(nextSeason(begun));
		default:
			// A whole Age, likewise: an Age begins on Spring's first Morning.
			return seasonsFirstMorning(begun) && begun.season === SEASONS[0] ? nextAge(begun) : nextAge(nextAge(begun));
	}
}

/**
 * @param {GrandDesign} design
 * @param {import("./time.js").Calendar} now
 * @returns {boolean} Whether its time has come.
 */
export const designDone = (design, now) => compareCalendars(normalizeCalendar(now), designReady(design)) >= 0;
