/**
 * Drawing a Realm by hand, as the free Blank Realm sheet's "Creating a Realm
 * (p14)" box sets it out, with a tally of how far the drawing has come beside
 * each step. Wording lives in the language file under
 * `bastionland.realmDrawing`. Pure, so it can be tested without Foundry.
 */
import { HOLDING_COUNT, LANDMARK_TYPES, LANDMARKS_PER_TYPE, MYTH_COUNT, barrierCount, realmSeats, seatsInOrder } from "./realm.js";
import { hexKey } from "./realm-geometry.js";

/** The Scene flag that marks a Realm Scene still being drawn by hand. */
export const REALM_DRAWING_FLAG = "drawing";

/** How large the Creating a Realm window opens, in CSS pixels, where the screen has room. */
export const DRAWING_WINDOW = Object.freeze({ width: 620, height: 600 });

/**
 * Where the Creating a Realm window first opens: to the left of as much of the
 * map as the interface leaves in view, level with its middle, where a GM who
 * has just begun drawing can't miss it and it hides as little of the map as it
 * can. Where there's no room beside the map it keeps to the room's left edge,
 * over the map's left side. It never opens outside that room, and it's made
 * smaller where the room is smaller than it. From there the GM moves it.
 * @param {{left: number, top: number, right: number, bottom: number}} room What the interface leaves of the screen.
 * @param {{left: number, top: number, right: number, bottom: number}|null} map Where the map is, or null while the canvas isn't ready.
 * @param {{width: number, height: number, gap?: number}} size The window's size, and how far it keeps from the room's edges.
 * @returns {{left: number, top: number, width: number, height: number}}
 */
export function drawingWindowPlacement(room, map, { width, height, gap = 12 }) {
	const inner = { left: room.left + gap, top: room.top + gap, right: room.right - gap, bottom: room.bottom - gap };
	const wide = Math.max(0, Math.min(width, inner.right - inner.left));
	const tall = Math.max(0, Math.min(height, inner.bottom - inner.top));
	const seen = map && {
		left: Math.max(map.left, inner.left),
		top: Math.max(map.top, inner.top),
		right: Math.min(map.right, inner.right),
		bottom: Math.min(map.bottom, inner.bottom)
	};
	// A map panned wholly out of view has nothing to open beside, so the room is taken.
	const area = seen && seen.right > seen.left && seen.bottom > seen.top ? seen : inner;
	const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high));
	return {
		left: Math.round(clamp(area.left - gap - wide, inner.left, inner.right - wide)),
		top: Math.round(clamp(((area.top + area.bottom) / 2) - (tall / 2), inner.top, inner.bottom - tall)),
		width: Math.round(wide),
		height: Math.round(tall)
	};
}

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
 * heading the rulebook prints over each group, which stays in English, and
 * `icon` the Font Awesome icon its tab on the window's rail wears.
 * @type {readonly {key: string, book: string, icon: string, sections: readonly DrawingSection[]}[]}
 */
export const DRAWING_RULES = Object.freeze([
	{
		key: "wilderness",
		book: "Wilderness",
		icon: "fa-tree",
		sections: [
			{ key: "terrain", brush: "terrain" },
			{ key: "barriers", brush: "barrier" },
			{ key: "river", brush: "river" }
		]
	},
	{ key: "holdings", book: "Holdings", icon: "fa-chess-rook", sections: [{ key: "holdings", brush: "holding" }] },
	{ key: "myths", book: "Myth Hexes", icon: "fa-dragon", sections: [{ key: "myths", tool: "inspect" }] },
	{ key: "landmarks", book: "Landmarks", icon: "fa-monument", sections: [{ key: "landmarks", brush: "landmark", lines: [...LANDMARK_TYPES] }] }
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
 * @property {string} [heading] The book's heading over a section that joined the page before it.
 */

/** @typedef {{key: string, heading: string, icon: string, parts: DrawingPart[]}} DrawingGroup */

/**
 * The icons on the rail for the book's sections that no drawing step takes,
 * keyed by the heading the book prints, lower-cased. A section not named here
 * wears the open book.
 * @type {Readonly<Record<string, string>>}
 */
export const BOOK_SECTION_ICONS = Object.freeze({
	"breaking the rules": "fa-scale-unbalanced",
	"the hex map": "fa-border-all"
});

/** The icon for a book section no step takes. */
const bookSectionIcon = (heading) => BOOK_SECTION_ICONS[heading.trim().toLowerCase()] ?? "fa-book-open";

/**
 * The book's sections too short for a tab of their own, keyed by the heading
 * the book prints, lower-cased, to the heading of the page each goes at the
 * foot of, under its own heading: Breaking the Rules under The Hex Map.
 * @type {Readonly<Record<string, string>>}
 */
export const BOOK_SECTIONS_JOINED = Object.freeze({
	"breaking the rules": "the hex map"
});

/**
 * The book's sections the window leaves out, keyed by the heading the book
 * prints, lower-cased: Adding Details and Distant Realms, which are about what
 * comes after the map is drawn, and stay in the rulebook.
 * @type {ReadonlySet<string>}
 */
export const BOOK_SECTIONS_LEFT_OUT = Object.freeze(new Set(["adding details", "distant realms"]));

/**
 * Creating a Realm as the GM's own rulebook prints it (p14), fitted to the
 * drawing steps. Each of the sheet's groups takes the book's section headed
 * as its `book` says, whatever language the sheet is in, and its steps take that section's paragraphs in order,
 * the last step taking whatever is left, so each step's tally and tool follow
 * the book's words for it. The book's other sections stand between them in
 * the book's order, those in BOOK_SECTIONS_JOINED at the foot of the page
 * named there, or on a page of their own where the book has no such page,
 * and those in BOOK_SECTIONS_LEFT_OUT not at all.
 * @param {{heading: string, blocks: DrawingBlock[]}[]} book From the index, as rulePageFromItems reads p14.
 * @returns {DrawingGroup[]|null} Null unless the book has a section for every group.
 */
export function bookDrawingGroups(book) {
	const sections = book.map(({ heading, blocks }, index) => ({ heading, blocks, index, name: heading.trim().toLowerCase() }))
		.filter((section) => !BOOK_SECTIONS_LEFT_OUT.has(section.name));
	const pages = new Set(sections.map((section) => section.name));
	const joins = (section) => pages.has(BOOK_SECTIONS_JOINED[section.name]);
	const groups = sections.filter((section) => !joins(section)).map(({ heading, blocks, index, name }) => {
		const group = DRAWING_RULES.find((rule) => rule.book.toLowerCase() === name);
		if (!group) return { key: `book-${index}`, heading, icon: bookSectionIcon(heading), parts: [{ key: `book-${index}`, step: null, blocks }] };
		const last = group.sections.length - 1;
		const parts = group.sections.map((step, at) => ({ key: step.key, step, blocks: blocks.slice(at, at === last ? undefined : at + 1) }));
		return { key: group.key, heading, icon: group.icon, parts };
	});
	for (const { heading, blocks, index, name } of sections.filter(joins)) {
		const page = groups.find((group) => group.heading.trim().toLowerCase() === BOOK_SECTIONS_JOINED[name]);
		page.parts.push({ key: `book-${index}`, step: null, blocks, heading });
	}
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
		icon: group.icon,
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
 * @property {boolean} [disputed] For the Seat: more than one Holding claims it, as a disputed Seat may (p202).
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
	const crowned = realmSeats(realm);
	const seats = crowned.length;
	// Two Holdings may both claim the Seat where it's disputed (p202), or where the rules for setup
	// are set aside, but only a Seat marked so is said to be disputed.
	const several = seats > 1 && seatsInOrder(realm);
	const disputed = seats > 1 && crowned.every((holding) => holding.disputed);
	const rivers = realm.rivers.filter((river) => river.length > 1);
	const wet = new Set(rivers.flat().map(hexKey)).size;
	return {
		terrain: [count("terrain", painted, hexes)],
		barriers: [count("barriers", realm.barriers.length, barrierCount(realm))],
		// The book gives rivers no length or number; one running through more than a single hex is drawn.
		river: [{ ...count("river", wet, null, rivers.length > 0), rivers: rivers.length }],
		holdings: [count("holdings", realm.holdings.length, HOLDING_COUNT), { ...count("seat", seats, 1, seats === 1 || several), ...(disputed ? { disputed } : {}) }],
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
 * @param {{left: number, top: number, width: number}|null} [options.beside] Where the Place the Company
 *   button stands, in CSS pixels, its scale included. While it's over the map the Finish button stands
 *   to its right instead, level with it, so the Referee finds the two together.
 * @returns {{left: number, top: number}}
 */
export function finishPlacement(map, { width, height, floor = Infinity, gap = 12, scale = 1, beside = null }) {
	const [wide, tall, space] = [width, height, gap].map((length) => length * scale);
	if (beside) return { left: Math.round(beside.left + beside.width + space), top: Math.round(beside.top) };
	return {
		left: Math.round(((map.left + map.right) / 2) - (wide / 2)),
		top: Math.round(Math.min(map.bottom + space, floor - space - tall))
	};
}
