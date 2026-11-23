/**
 * Making a Realm's map bigger once play is under way: columns and rows of hexes
 * added on any side, with nothing play has built up lost or left in the wrong hex.
 *
 * What is stored always counts from 1 at the top-left hex, as everything else
 * in the system expects, so hexes added to the north or west move every old
 * hex along: `(c, r)` becomes `(c + west, r + north)`. Each store kept for a
 * hex is re-keyed by the same shift. In a layout with every other column (or
 * row) set off, an odd shift would move alternate columns by different amounts,
 * so the layout flips between its even and odd forms; with that, every old hex
 * moves by one pixel offset and keeps its six neighbours.
 *
 * What is shown is another matter: the Referee may keep every hex's number,
 * counting down through 0 into negatives to the north and west, or number the
 * map again from 1. Only the display changes, through shownHex.
 *
 * Pure, so it can be tested without Foundry.
 */
import { OWN_SIZE_LIMITS } from "./realm-setup.js";
import { entrySort } from "./hex-journal.js";
import { movedHexRowKey, readHexRowKey } from "./timeline.js";
import { emptyVariants } from "./realm-pictures.js";
import { fullMapRect, hexPath, normaliseRealmPicture, round, tenth } from "./realm-map.js";
import { allHexes, edgeKey, hexCentre, hexIndex, hexKey, inRealm, parseHexKey, realmGeometry } from "./realm-geometry.js";

/** The four sides a map can grow on, in the order the window asks. */
export const GROWTH_SIDES = Object.freeze(["north", "south", "west", "east"]);

/** The Scene flag keeping a Realm's growth: every expansion logged, and how its hexes are numbered for show. */
export const REALM_GROWTH_FLAG = "realmGrowth";

/** The Scene flag set while an expansion is being written, holding the whole plan so a cut-short one can be finished. */
export const EXPANDING_FLAG = "expanding";

/** The Scene flag naming the backup kept before the last expansion: its path and when it was taken. */
export const REALM_BACKUP_FLAG = "realmBackup";

/**
 * @typedef {{north: number, south: number, west: number, east: number}} Growth
 * @typedef {{cols: number, rows: number}} Offset How far every hex moves: columns right, rows down. Negative to go back.
 * @typedef {{when: number, west: number, north: number, east: number, south: number}} GrowthLogEntry
 * @typedef {{log: GrowthLogEntry[], origin: Offset}} RealmGrowth `origin` is taken from a stored hex to give the one shown.
 */

const count = (value) => {
	const number = Number(value);
	return Number.isInteger(number) && number > 0 ? number : 0;
};

/**
 * @param {unknown} raw
 * @returns {Growth} Each side a whole number from 0 up.
 */
export const normaliseGrowth = (raw) => Object.fromEntries(GROWTH_SIDES.map((side) => [side, count(raw?.[side])]));

/**
 * @param {Growth} growth
 * @returns {boolean} Whether it adds any hexes at all.
 */
export const growsAtAll = (growth) => GROWTH_SIDES.some((side) => growth[side] > 0);

/**
 * @param {{cols: number, rows: number}} g The map as it is.
 * @param {Growth} growth
 * @returns {{cols: number, rows: number, hexes: number}} The map's size once grown.
 */
export const grownSize = (g, growth) => {
	const cols = g.cols + growth.west + growth.east;
	const rows = g.rows + growth.north + growth.south;
	return { cols, rows, hexes: cols * rows };
};

/**
 * Why a growth can't be made, if it can't: nothing added, a side past
 * OWN_SIZE_LIMITS, or too many hexes in all. Names live under
 * `bastionland.realm.expand.problems`.
 * @param {{cols: number, rows: number}} g
 * @param {unknown} raw
 * @returns {"nothing"|"cols"|"rows"|"hexes"|null}
 */
export function growthProblem(g, raw) {
	const growth = normaliseGrowth(raw);
	if (!growsAtAll(growth)) return "nothing";
	const { cols, rows, hexes } = grownSize(g, growth);
	if (cols > OWN_SIZE_LIMITS.cols.max) return "cols";
	if (rows > OWN_SIZE_LIMITS.rows.max) return "rows";
	if (hexes > OWN_SIZE_LIMITS.hexes) return "hexes";
	return null;
}

/** Each layout and the one an odd shift turns it into. */
const FLIPPED = Object.freeze({ evenColumns: "oddColumns", oddColumns: "evenColumns", evenRows: "oddRows", oddRows: "evenRows" });

/**
 * The layout a map takes once grown: flipped between its even and odd forms
 * when the columns (flat tops) or rows (pointed tops) set off move by an odd
 * number, so every hex keeps its place beside its neighbours.
 * @param {object} g
 * @param {Growth} growth
 * @returns {string}
 */
export function grownLayout(g, growth) {
	const moved = g.columns ? growth.west : growth.north;
	return moved % 2 ? FLIPPED[g.layout] : g.layout;
}

/**
 * @param {object} g From realmGeometry.
 * @param {Growth} growth
 * @returns {object} The geometry of the map once grown.
 */
export function grownGeometry(g, growth) {
	const { cols, rows } = grownSize(g, growth);
	return realmGeometry({ size: g.size, cols, rows, layout: grownLayout(g, growth) });
}

/**
 * @param {Growth} growth
 * @returns {Offset} How far an old hex moves.
 */
export const growthOffset = (growth) => ({ cols: growth.west, rows: growth.north });

/**
 * @param {Offset} offset
 * @returns {Offset} The way back.
 */
export const reverseOffset = ({ cols, rows }) => ({ cols: -cols, rows: -rows });

/**
 * @param {{col: number, row: number}} hex
 * @param {Offset} offset
 * @param {object} [g] The geometry it must land in: a hex shifted off it is lost.
 * @returns {{col: number, row: number}|null}
 */
export function shiftHex(hex, offset, g = null) {
	if (!hex || !Number.isInteger(hex.col) || !Number.isInteger(hex.row)) return null;
	const moved = { col: hex.col + offset.cols, row: hex.row + offset.rows };
	if (moved.col < 1 || moved.row < 1) return null;
	return !g || inRealm(g, moved) ? moved : null;
}

/**
 * @param {string} key A hex key.
 * @param {Offset} offset
 * @param {object} [g]
 * @returns {string|null} Its key once shifted, or null for no hex, or one that falls off the map.
 */
export function shiftHexKey(key, offset, g = null) {
	const moved = shiftHex(parseHexKey(key), offset, g);
	return moved ? hexKey(moved) : null;
}

/**
 * @param {string} key An edge key.
 * @param {Offset} offset
 * @param {object} [g]
 * @returns {string|null}
 */
export function shiftEdgeKey(key, offset, g = null) {
	const parts = String(key ?? "").split("|");
	if (parts.length !== 2) return null;
	const hexes = parts.map((part) => shiftHex(parseHexKey(part), offset, g));
	return hexes.every(Boolean) ? edgeKey(hexes[0], hexes[1]) : null;
}

/**
 * How far every old hex's centre moves on the page, in Scene pixels. One
 * offset for the whole map, since the layout flips with an odd shift.
 * @param {object} from The geometry before.
 * @param {Growth} growth
 * @returns {{dx: number, dy: number}} Not whole pixels: a column is 1.5 radii across.
 */
export function pixelShift(from, growth) {
	const to = grownGeometry(from, growth);
	const was = hexCentre(from, { col: 1, row: 1 });
	const now = hexCentre(to, shiftHex({ col: 1, row: 1 }, growthOffset(growth)));
	return { dx: now.x - was.x, dy: now.y - was.y };
}

/**
 * @param {object} from
 * @param {Growth} growth
 * @returns {Set<string>} The keys, in the grown map, of the hexes the map had before.
 */
function oldLandKeys(from, growth) {
	const offset = growthOffset(growth);
	return new Set(allHexes(from).map((hex) => hexKey(shiftHex(hex, offset))));
}

/**
 * @param {object} from
 * @param {Growth} growth
 * @returns {{col: number, row: number}[]} The hexes of the grown map that are new.
 */
export function newLandHexes(from, growth) {
	const old = oldLandKeys(from, growth);
	return allHexes(grownGeometry(from, growth)).filter((hex) => !old.has(hexKey(hex)));
}

/**
 * A picture's place shifted with the hexes. One never lined up lies over the
 * whole map it was laid on: given that map, it's measured as lying there first,
 * so it stays over its old hexes rather than stretching over the land added.
 * Without it, one with no place yet is left as it is.
 * @param {object|null|undefined} picture
 * @param {{dx: number, dy: number}} shift
 * @param {object|null} [from] The geometry of the map it was laid on.
 * @returns {object|null}
 */
export function shiftPicture(picture, { dx, dy }, from = null) {
	const pictures = normaliseRealmPicture(picture);
	if (!pictures) return null;
	return Object.fromEntries(Object.entries(pictures).map(([role, map]) => {
		const placed = map && !(map.width > 0) && from
			? { ...map, ...Object.fromEntries(Object.entries(fullMapRect(from)).map(([key, value]) => [key, round(value)])) }
			: map;
		return [role, placed && Number.isFinite(placed.x) && Number.isFinite(placed.y)
			? { ...placed, x: round(placed.x + dx), y: round(placed.y + dy) }
			: placed];
	}));
}

/**
 * A Realm moved onto the grown map, every hex holding what it held, the new
 * land left blank (terrain 0) for rolling or painting.
 * @param {import("./realm.js").Realm} realm
 * @param {object} from Its geometry.
 * @param {Growth} growth
 * @returns {import("./realm.js").Realm}
 */
export function growRealm(realm, from, growth) {
	const to = grownGeometry(from, growth);
	const offset = growthOffset(growth);
	const move = (hex) => shiftHex(hex, offset);
	const terrain = new Array(to.cols * to.rows).fill(0);
	const variants = realm.variants ? emptyVariants(terrain) : null;
	for (const hex of allHexes(from)) {
		const at = hexIndex(to, move(hex));
		terrain[at] = realm.terrain[hexIndex(from, hex)] ?? 0;
		if (variants) variants[at] = realm.variants[hexIndex(from, hex)] ?? 0;
	}
	const grown = {
		...realm,
		cols: to.cols,
		rows: to.rows,
		terrain,
		rivers: realm.rivers.map((course) => course.map(move)),
		holdings: realm.holdings.map((holding) => ({ ...holding, hex: move(holding.hex) })),
		myths: realm.myths.map((myth) => ({ ...myth, hex: move(myth.hex) })),
		landmarks: realm.landmarks.map((landmark) => ({ ...landmark, hex: move(landmark.hex) })),
		barriers: realm.barriers.map((barrier) => ({ ...barrier, edge: shiftEdgeKey(barrier.edge, offset) }))
	};
	if (variants) grown.variants = variants;
	else delete grown.variants;
	if (realm.setup) grown.setup = { ...realm.setup, cols: to.cols, rows: to.rows };
	const picture = shiftPicture(realm.picture, pixelShift(from, growth), from);
	if (picture) grown.picture = picture;
	return grown;
}

// Placeables on the Scene.

/** The Scene's own document types that stand somewhere on it, as each Foundry version may hold them, and the Scene's collection of each. */
export const PLACEABLE_COLLECTIONS = Object.freeze({
	Tile: "tiles",
	Drawing: "drawings",
	Token: "tokens",
	Note: "notes",
	AmbientLight: "lights",
	AmbientSound: "sounds",
	Wall: "walls",
	Region: "regions",
	MeasuredTemplate: "templates"
});

/** The types, in the order they are written. */
export const PLACEABLE_TYPES = Object.freeze(Object.keys(PLACEABLE_COLLECTIONS));

const whole = (value) => Math.round(value);

/**
 * A point list `[x0, y0, x1, y1, ...]` moved.
 * @param {unknown} points
 * @param {{dx: number, dy: number}} shift
 * @returns {number[]|null}
 */
const shiftedPoints = (points, { dx, dy }) => (Array.isArray(points) && points.every(Number.isFinite)
	? points.map((value, index) => whole(value + (index % 2 ? dy : dx)))
	: null);

/**
 * One shape of a Region moved. Every shape is placed by an `x` and `y`, by
 * `points`, or both; a shape of a kind not known here is moved by whichever of
 * those it has.
 * @param {object} shape
 * @param {{dx: number, dy: number}} shift
 * @returns {object}
 */
function shiftRegionShape(shape, shift) {
	if (!shape || typeof shape !== "object") return shape;
	const moved = { ...shape };
	if (Number.isFinite(shape.x)) moved.x = whole(shape.x + shift.dx);
	if (Number.isFinite(shape.y)) moved.y = whole(shape.y + shift.dy);
	const points = shiftedPoints(shape.points, shift);
	if (points) moved.points = points;
	// Holes and the like, which some shapes carry as shapes of their own.
	if (Array.isArray(shape.shapes)) moved.shapes = shape.shapes.map((inner) => shiftRegionShape(inner, shift));
	return moved;
}

/**
 * The update that moves one placeable by the Realm's shift, in whole pixels.
 * @param {string} type One of PLACEABLE_TYPES.
 * @param {object} source The document's source data, with its `_id`.
 * @param {{dx: number, dy: number}} shift
 * @returns {object|null} Null for a document with nothing to move.
 */
export function shiftPlaceable(type, source, shift) {
	if (!source?._id) return null;
	if (type === "Wall") {
		const c = shiftedPoints(source.c, shift);
		return c ? { _id: source._id, c } : null;
	}
	if (type === "Region") {
		if (!Array.isArray(source.shapes)) return null;
		return { _id: source._id, shapes: source.shapes.map((shape) => shiftRegionShape(shape, shift)) };
	}
	if (!Number.isFinite(source.x) || !Number.isFinite(source.y)) return null;
	return { _id: source._id, x: whole(source.x + shift.dx), y: whole(source.y + shift.dy) };
}

/**
 * Every placeable on a Scene moved with the hexes: each by the one pixel shift,
 * and each Barrier's line keeping its edge's new name, so the sync after finds
 * it and keeps its id rather than laying it again.
 * @param {Partial<Record<string, object[]>>} documents Source data by type (PLACEABLE_TYPES), each with its `_id`.
 * @param {object} from The geometry before.
 * @param {Growth} growth
 * @param {object} [options]
 * @param {string} [options.systemId] The scope of the system's flags.
 * @param {string} [options.realmFlag] The key of the Realm's flag on a document.
 * @returns {Record<string, object[]>} The updates for each type that has any.
 */
export function placeableShifts(documents, from, growth, { systemId = "", realmFlag = "realm" } = {}) {
	const shift = pixelShift(from, growth);
	const offset = growthOffset(growth);
	const plan = {};
	for (const type of PLACEABLE_TYPES) {
		const updates = (documents[type] ?? []).flatMap((source) => {
			const update = shiftPlaceable(type, source, shift);
			if (!update) return [];
			const flag = source.flags?.[systemId]?.[realmFlag];
			if (type === "Drawing" && flag?.kind === "barrier") {
				const edge = shiftEdgeKey(flag.edge, offset);
				if (edge) update[`flags.${systemId}.${realmFlag}.edge`] = edge;
			}
			return [update];
		});
		if (updates.length) plan[type] = updates;
	}
	return plan;
}

// Stores kept for each hex.

/**
 * @param {object|null|undefined} records `{[hexKey]: record}`.
 * @param {Offset} offset
 * @param {object} [g]
 * @param {(record: any) => any} [inner] Changes a record's own contents, such as edge keys within it.
 * @returns {object} The records under their shifted keys; any shifted off the map dropped.
 */
export function shiftKeyed(records, offset, g = null, inner = (record) => record) {
	if (!records || typeof records !== "object" || Array.isArray(records)) return {};
	const shifted = {};
	for (const [key, record] of Object.entries(records)) {
		const moved = shiftHexKey(key, offset, g);
		if (moved) shifted[moved] = inner(record);
	}
	return shifted;
}

/**
 * A store kept as `{hexes: {[hexKey]: record}, ...}`, as hexNames, hexLore,
 * trackedHexes and journey are; what's kept beside `hexes` stays.
 * @param {unknown} flag
 * @param {Offset} offset
 * @param {object} [g]
 * @param {(record: any) => any} [inner]
 * @returns {unknown} The flag, re-keyed, or as it was when it holds no hexes.
 */
export function shiftHexStore(flag, offset, g = null, inner = undefined) {
	if (!flag || typeof flag !== "object" || !flag.hexes || typeof flag.hexes !== "object") return flag;
	return { ...flag, hexes: shiftKeyed(flag.hexes, offset, g, inner) };
}

/**
 * hexShared, whose records each keep the edges of Barriers met.
 * @param {unknown} flag
 * @param {Offset} offset
 * @param {object} [g]
 */
export function shiftShared(flag, offset, g = null) {
	return shiftHexStore(flag, offset, g, (record) => {
		if (!record || typeof record !== "object" || !Array.isArray(record.met)) return record;
		const met = record.met.flatMap((entry) => {
			const edge = shiftEdgeKey(entry?.edge, offset, g);
			return edge ? [{ ...entry, edge }] : [];
		});
		return { ...record, met };
	});
}

/**
 * sighted, kept by hex key with nothing round it.
 * @param {unknown} flag
 * @param {Offset} offset
 * @param {object} [g]
 */
export const shiftSighted = (flag, offset, g = null) => (flag && typeof flag === "object" ? shiftKeyed(flag, offset, g) : flag);

/**
 * heldBack: `{move, hexes: [hexKey]}`, or a bare list of hex keys in older worlds.
 * @param {unknown} flag
 * @param {Offset} offset
 * @param {object} [g]
 */
export function shiftHeldBack(flag, offset, g = null) {
	const keys = (list) => list.map((key) => shiftHexKey(key, offset, g)).filter(Boolean);
	if (Array.isArray(flag)) return keys(flag);
	if (flag && typeof flag === "object" && Array.isArray(flag.hexes)) return { ...flag, hexes: keys(flag.hexes) };
	return flag;
}

/**
 * A `{col, row}` moved, such as where the Company last stood.
 * @param {unknown} flag
 * @param {Offset} offset
 * @param {object} [g]
 * @returns {{col: number, row: number}|null|unknown} Null for one moved off the map.
 */
export function shiftHexValue(flag, offset, g = null) {
	if (!flag || typeof flag !== "object" || !Number.isInteger(flag.col) || !Number.isInteger(flag.row)) return flag;
	const moved = shiftHex(flag, offset, g);
	return moved ? { ...flag, ...moved } : null;
}

/**
 * How each of the per-hex Scene flags (hexStoreFlags in actions/scene-changes.js)
 * is re-keyed. `null` clears it; a flag not named here holds no hex.
 * @type {Readonly<Record<string, ((flag: unknown, offset: Offset, g?: object|null) => unknown)|null>>}
 */
const HEX_FLAG_SHIFTS = Object.freeze({
	hexNames: shiftHexStore,
	hexLore: shiftHexStore,
	trackedHexes: shiftHexStore,
	journey: shiftHexStore,
	// The Fog of War keeps its on, and whether Holdings show through, beside its hexes.
	realmFog: shiftHexStore,
	hexShared: shiftShared,
	sighted: shiftSighted,
	heldBack: shiftHeldBack,
	companyLastHex: shiftHexValue,
	// Undo memory for the Company's moves, which would put it back where hexes no longer are.
	companyMoves: null
});

/**
 * The Scene flags kept for each hex, re-keyed.
 * @param {Record<string, unknown>} flags The system's flags on the Scene.
 * @param {Offset} offset
 * @param {object} [g]
 * @returns {Record<string, unknown>} The new value of each flag the Scene has that moves; null to clear it.
 */
export function shiftedHexFlags(flags, offset, g = null) {
	const changes = {};
	for (const [flag, shift] of Object.entries(HEX_FLAG_SHIFTS)) {
		if (flags?.[flag] === undefined || flags[flag] === null) continue;
		changes[flag] = shift ? shift(flags[flag], offset, g) : null;
	}
	return changes;
}

// Documents outside the Scene.

/**
 * A hex Journal entry's flag and sort moved with its hex.
 * @param {{scene: string, hex: string}} flag
 * @param {string} sceneId
 * @param {Offset} offset
 * @param {object} [g]
 * @returns {{flag: object, sort: number}|{flag: null}|null} Null for an entry of another Realm or none;
 *   `flag: null` for one whose hex is gone.
 */
export function shiftJournalFlag(flag, sceneId, offset, g = null) {
	const hex = flag?.scene === sceneId ? parseHexKey(flag.hex) : null;
	if (!hex) return null;
	const moved = shiftHex(hex, offset, g);
	return moved ? { flag: { ...flag, hex: hexKey(moved) }, sort: entrySort(moved) } : { flag: null };
}

/**
 * The GM Toolkit's threads tied to a hex of this Realm.
 * @param {Record<string, {scene?: string, hex?: string}>} threads
 * @param {string} sceneId
 * @param {Offset} offset
 * @param {object} [g]
 * @returns {Record<string, string>} The new hex key of each thread that changes, by id; "" for one whose hex is gone.
 */
export function shiftThreads(threads, sceneId, offset, g = null) {
	const changes = {};
	for (const [id, thread] of Object.entries(threads ?? {})) {
		if (thread?.scene !== sceneId || !parseHexKey(thread.hex)) continue;
		changes[id] = shiftHexKey(thread.hex, offset, g) ?? "";
	}
	return changes;
}

/**
 * @param {string} key A Timeline row's key.
 * @param {string} sceneId
 * @param {Offset} offset
 * @param {object} [g]
 * @returns {string|null} The key once its hex moves; null for a key not of this Realm's hexes, unchanged.
 *   A row whose hex is gone keeps a key naming no hex, so it neither lands on another nor is lost.
 */
export function shiftTimelineKey(key, sceneId, offset, g = null) {
	const row = readHexRowKey(key);
	if (!row || row.sceneId !== sceneId) return null;
	return movedHexRowKey(row, shiftHexKey(row.hex, offset, g));
}

/**
 * The Omen whose card is waiting, kept with the hex it was entered in.
 * @param {{scene?: string, hex?: {col: number, row: number}}|null} value
 * @param {string} sceneId
 * @param {Offset} offset
 * @param {object} [g]
 * @returns {object|null|undefined} The value moved; undefined where it's of another Realm or none.
 */
export function shiftOmenEntered(value, sceneId, offset, g = null) {
	if (!value || value.scene !== sceneId || !value.hex) return undefined;
	const hex = shiftHex(value.hex, offset, g);
	return hex ? { ...value, hex } : null;
}

/**
 * Whether two waiting Omens are the same entry, entered in the same hex.
 * @param {{scene?: string, hex?: {col: number, row: number}, when?: object, omen?: unknown}|null} a
 * @param {{scene?: string, hex?: {col: number, row: number}, when?: object, omen?: unknown}|null} b
 * @returns {boolean}
 */
export function sameOmenEntered(a, b) {
	if (!a || !b) return a === b;
	return a.scene === b.scene
		&& a.hex?.col === b.hex?.col && a.hex?.row === b.hex?.row
		&& a.omen === b.omen
		&& JSON.stringify(a.when ?? null) === JSON.stringify(b.when ?? null);
}

// The growth log, old chat cards and the numbers shown.

/**
 * @param {unknown} raw The Scene flag.
 * @returns {RealmGrowth}
 */
export function normaliseRealmGrowth(raw) {
	// An entry may be negative: a Realm put back from its backup logs the growth undone.
	const side = (value) => (Number.isInteger(value) ? value : 0);
	const log = (Array.isArray(raw?.log) ? raw.log : [])
		.filter((entry) => entry && Number.isFinite(entry.when))
		.map((entry) => ({ when: entry.when, ...Object.fromEntries(GROWTH_SIDES.map((key) => [key, side(entry[key])])) }));
	return { log, origin: growthOrigin(raw) };
}

/**
 * @param {unknown} raw
 * @returns {{cols: number, rows: number}} How far the hexes' numbers have moved, read without the log,
 *   as every hex's number shown asks it.
 */
const growthOrigin = (raw) => ({
	cols: Number.isInteger(raw?.origin?.cols) ? raw.origin.cols : 0,
	rows: Number.isInteger(raw?.origin?.rows) ? raw.origin.rows : 0
});

/**
 * The growth record once a map is grown.
 * @param {unknown} raw
 * @param {Growth} growth
 * @param {object} options
 * @param {number} options.when The time on the server.
 * @param {boolean} options.keepNumbers Whether every hex keeps the number it showed.
 * @returns {RealmGrowth}
 */
export function loggedGrowth(raw, growth, { when, keepNumbers }) {
	const { log, origin } = normaliseRealmGrowth(raw);
	return {
		log: [...log, { when, ...normaliseGrowth(growth) }],
		origin: keepNumbers ? { cols: origin.cols + growth.west, rows: origin.rows + growth.north } : { cols: 0, rows: 0 }
	};
}

/**
 * Every growth logged since a backup was taken: the entries the Realm's log
 * has past those the backup's held, added up. A put-back undoes them all, as
 * the Scene goes back to the backup whatever was grown since.
 * @param {unknown} raw The Scene's growth flag now.
 * @param {unknown} backupRaw The growth flag the backup holds.
 * @returns {Growth} Each side's total, which may be 0 for every side.
 */
export function growthSince(raw, backupRaw) {
	const since = normaliseRealmGrowth(raw).log.slice(normaliseRealmGrowth(backupRaw).log.length);
	return Object.fromEntries(GROWTH_SIDES.map((side) => [side, since.reduce((sum, entry) => sum + entry[side], 0)]));
}

/**
 * The growth record once a Realm is put back from its backup: the numbering the
 * backup held, and the log kept, with the growth undone logged after it, so a
 * card posted on the grown map is moved back to the hex it meant.
 * @param {unknown} raw The Scene's growth flag now.
 * @param {unknown} backupRaw The growth flag the backup holds.
 * @param {Growth} undone From growthSince.
 * @param {object} options
 * @param {number} options.when The time on the server.
 * @returns {RealmGrowth}
 */
export function putBackGrowth(raw, backupRaw, undone, { when }) {
	const { log } = normaliseRealmGrowth(raw);
	const { origin } = normaliseRealmGrowth(backupRaw);
	const moved = GROWTH_SIDES.some((side) => undone[side]);
	return { log: moved ? [...log, { when, ...Object.fromEntries(GROWTH_SIDES.map((side) => [side, 0 - undone[side]])) }] : log, origin };
}

/**
 * @param {unknown} raw
 * @returns {boolean} Whether the expansions logged have moved the map's hexes, so the numbering is a choice worth offering.
 */
export const hasShifted = (raw) => {
	const { cols, rows } = cardOffset(null, raw);
	return cols !== 0 || rows !== 0;
};

/**
 * The number a hex is shown by. Every printing of a hex's number goes through
 * here, so none shows a stored number by mistake.
 * @param {{col: number, row: number}} hex As stored.
 * @param {unknown} growth The Scene's growth flag.
 * @returns {{col: number, row: number}}
 */
export function shownHex(hex, growth) {
	const origin = growthOrigin(growth);
	return { col: hex.col - origin.cols, row: hex.row - origin.rows };
}

/**
 * The hex a number typed in names.
 * @param {{col: number, row: number}} shown
 * @param {unknown} growth
 * @returns {{col: number, row: number}} As stored, which may lie off the map.
 */
export function storedHex(shown, growth) {
	const origin = growthOrigin(growth);
	return { col: shown.col + origin.cols, row: shown.row + origin.rows };
}

/**
 * The numbers the hexes of a map are shown by, for a field asking for one.
 * @param {{cols: number, rows: number}} g
 * @param {unknown} growth
 * @returns {{col: {min: number, max: number}, row: {min: number, max: number}}}
 */
export function shownRange(g, growth) {
	const first = shownHex({ col: 1, row: 1 }, growth);
	const last = shownHex({ col: g.cols, row: g.rows }, growth);
	return { col: { min: first.col, max: last.col }, row: { min: first.row, max: last.row } };
}

/**
 * How far the hexes have moved since a card was posted: by every expansion
 * logged after it.
 * @param {number|null|undefined} timestamp When the card was posted.
 * @param {unknown} growth The Scene's growth flag.
 * @returns {Offset}
 */
export function cardOffset(timestamp, growth) {
	const since = normaliseRealmGrowth(growth).log.filter((entry) => !Number.isFinite(timestamp) || entry.when > timestamp);
	return since.reduce((sum, entry) => ({ cols: sum.cols + entry.west, rows: sum.rows + entry.north }), { cols: 0, rows: 0 });
}

// The window's little picture.

/** How big, in the picture's own units, each hex is across its flat sides. */
const PREVIEW_HEX = 12;

/**
 * The map grown, drawn small for the window: the hexes it has now and the new
 * ones around them.
 * @param {{cols: number, rows: number, layout: string}} g
 * @param {unknown} raw The growth asked for.
 * @returns {{viewBox: string, old: string, added: string, width: number, height: number}} SVG path data.
 */
export function growthPreview(g, raw) {
	const from = realmGeometry({ size: PREVIEW_HEX, cols: g.cols, rows: g.rows, layout: g.layout });
	const growth = normaliseGrowth(raw);
	const to = grownGeometry(from, growth);
	const old = oldLandKeys(from, growth);
	const path = (hex) => hexPath(to, hex);
	const hexes = allHexes(to);
	return {
		viewBox: `-1 -1 ${tenth(to.width + 2)} ${tenth(to.height + 2)}`,
		width: to.width,
		height: to.height,
		old: hexes.filter((hex) => old.has(hexKey(hex))).map(path).join(""),
		added: hexes.filter((hex) => !old.has(hexKey(hex))).map(path).join("")
	};
}
