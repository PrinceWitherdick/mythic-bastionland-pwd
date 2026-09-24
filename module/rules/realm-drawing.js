/**
 * Drawing a Realm by hand, as the free Blank Realm sheet's "Creating a Realm
 * (p14)" box sets it out, with a tally of how far the drawing has come beside
 * each step. Wording lives in the language file under
 * `bastionland.realmDrawing`. Pure, so it can be tested without Foundry.
 */
import { HOLDING_COUNT, LANDMARK_TYPES, LANDMARKS_PER_TYPE, MYTH_COUNT, barrierCount } from "./realm.js";
import { hexKey } from "./realm-geometry.js";

/** The Scene flag that marks a Realm Scene still being drawn by hand. */
export const REALM_DRAWING_FLAG = "drawing";

/** The side of the map the drawing rules stand on, where Rest and Exploration stood. */
export const DRAWING_SIDE = "right";

/**
 * @typedef {object} DrawingSection
 * @property {string} key
 * @property {string} tool The Realm tool that draws it, one of REALM_TOOLS.
 * @property {string} [brush] What that tool lays, one of REALM_BRUSHES, for the paint tool.
 * @property {string[]} [lines] The labelled lines of a list under its text.
 */

/**
 * The sheet's steps in its order. Each section names the Realm tool that
 * draws it: everything but the Myths is a brush in the paint tool's one
 * palette, and a Myth is numbered and rolled from the Hex panel. `book` is the
 * heading the rulebook prints over each group, which stays in English.
 * @type {readonly {key: string, book: string, sections: readonly DrawingSection[]}[]}
 */
export const DRAWING_RULES = Object.freeze([
	{
		key: "wilderness",
		book: "Wilderness",
		sections: [
			{ key: "terrain", brush: "terrain" },
			{ key: "barriers", brush: "barrier" },
			{ key: "river", brush: "river" }
		]
	},
	{ key: "holdings", book: "Holdings", sections: [{ key: "holdings", brush: "holding" }] },
	{ key: "myths", book: "Myth Hexes", sections: [{ key: "myths", tool: "inspect" }] },
	{ key: "landmarks", book: "Landmarks", sections: [{ key: "landmarks", brush: "landmark", lines: [...LANDMARK_TYPES] }] }
].map((group) => Object.freeze({ ...group, sections: Object.freeze(group.sections.map((section) => Object.freeze(section))) })));

/**
 * @typedef {object} DrawingBlock One thing printed under a heading.
 * @property {"paragraph"|"bullet"|"term"} kind
 * @property {string} text
 * @property {string} [label] A term's name, such as "Dwellings".
 */

/**
 * @typedef {object} DrawingPart A run of the rules, with the step whose tally and tool follow it.
 * @property {string} key
 * @property {DrawingSection|null} step Null for rules no step draws.
 * @property {DrawingBlock[]} blocks
 */

/** @typedef {{key: string, heading: string, parts: DrawingPart[]}} DrawingGroup */

/**
 * Creating a Realm as the GM's own rulebook prints it (p14), fitted to the
 * drawing steps. Each of the sheet's groups takes the book's section headed
 * as its `book` says, whatever language the sheet is in, and its steps take that section's paragraphs in order,
 * the last step taking whatever is left, so each step's tally and tool follow
 * the book's words for it. The book's other sections stand between them in
 * the book's order.
 * @param {{heading: string, blocks: DrawingBlock[]}[]} book From the index, as rulePageFromItems reads p14.
 * @returns {DrawingGroup[]|null} Null unless the book has a section for every group.
 */
export function bookDrawingGroups(book) {
	const groups = book.map(({ heading, blocks }, index) => {
		const group = DRAWING_RULES.find((rule) => rule.book.toLowerCase() === heading.trim().toLowerCase());
		if (!group) return { key: `book-${index}`, heading, parts: [{ key: `book-${index}`, step: null, blocks }] };
		const last = group.sections.length - 1;
		const parts = group.sections.map((step, at) => ({ key: step.key, step, blocks: blocks.slice(at, at === last ? undefined : at + 1) }));
		return { key: group.key, heading, parts };
	});
	const found = new Set(groups.map((group) => group.key));
	return DRAWING_RULES.every((group) => found.has(group.key)) ? groups : null;
}

/**
 * Creating a Realm as the free Blank Realm sheet prints it, for a GM who
 * hasn't imported the book, in the same shape as bookDrawingGroups.
 * @param {(key: string) => string} text The sheet's words for a key under `bastionland.realmDrawing`.
 * @returns {DrawingGroup[]}
 */
export function sheetDrawingGroups(text) {
	return DRAWING_RULES.map((group) => ({
		key: group.key,
		heading: text(`groups.${group.key}`),
		parts: group.sections.map((step) => {
			const key = `sections.${step.key}`;
			const lines = (step.lines ?? []).map((line) => ({ kind: "term", label: text(`${key}.lines.${line}.label`), text: text(`${key}.lines.${line}.text`) }));
			return { key: step.key, step, blocks: [{ kind: "paragraph", text: text(`${key}.text`) }, ...lines] };
		})
	}));
}

/**
 * @typedef {object} DrawingCount
 * @property {string} key What's counted, named under `bastionland.realmDrawing.tally`.
 * @property {number} count
 * @property {number|null} target What the book asks for, or null where it gives no number.
 * @property {boolean} done
 * @property {number} [rivers] For the river step: how many rivers there are.
 */

/**
 * How far a Realm's drawing has come against the sheet, section by section.
 * @param {import("./realm.js").Realm} realm
 * @returns {Record<string, DrawingCount[]>} Keyed by DRAWING_RULES' section keys.
 */
export function drawingTally(realm) {
	const count = (key, value, target, done = value >= target) => ({ key, count: value, target, done });
	const hexes = realm.cols * realm.rows;
	const painted = realm.terrain.filter((value) => value > 0).length;
	const seats = realm.holdings.filter((holding) => holding.seat).length;
	const rivers = realm.rivers.filter((river) => river.length > 1);
	const wet = new Set(rivers.flat().map(hexKey)).size;
	return {
		terrain: [count("terrain", painted, hexes)],
		barriers: [count("barriers", realm.barriers.length, barrierCount(realm))],
		// The book gives rivers no length or number; one running through more than a single hex is drawn.
		river: [{ ...count("river", wet, null, rivers.length > 0), rivers: rivers.length }],
		holdings: [count("holdings", realm.holdings.length, HOLDING_COUNT), count("seat", seats, 1, seats === 1)],
		myths: [count("myths", realm.myths.length, MYTH_COUNT)],
		landmarks: LANDMARK_TYPES.map((type) => count(type, realm.landmarks.filter((landmark) => landmark.type === type).length, LANDMARKS_PER_TYPE.min))
	};
}

/**
 * What a Realm still lacks against the sheet, for a last word before it's
 * finished. Nothing here stops it being finished: the sheet is a guide.
 * @param {import("./realm.js").Realm} realm
 * @returns {DrawingCount[]}
 */
export const drawingShortfalls = (realm) => Object.values(drawingTally(realm)).flat().filter((entry) => !entry.done);

/**
 * Where the Finish button sits, and the window a rolled Realm is looked over
 * in with it: centred under the Realm's map, but never lower than `floor`, so
 * it stays on screen above the hotbar however the map is panned.
 * @param {{left: number, right: number, bottom: number}} map The map on screen, in CSS pixels.
 * @param {object} options
 * @param {number} options.width The button's own width, before the interface scale.
 * @param {number} options.height The button's own height, before the interface scale.
 * @param {number} [options.floor] The lowest its foot may go, in CSS pixels.
 * @param {number} [options.gap] Between the map's foot and the button, and between the button and the floor.
 * @param {number} [options.scale] The interface scale, which the button grows with.
 * @returns {{left: number, top: number}}
 */
export function finishPlacement(map, { width, height, floor = Infinity, gap = 12, scale = 1 }) {
	const [wide, tall, space] = [width, height, gap].map((length) => length * scale);
	return {
		left: Math.round(((map.left + map.right) / 2) - (wide / 2)),
		top: Math.round(Math.min(map.bottom + space, floor - space - tall))
	};
}
