/**
 * A Realm as the documents of its Scene, and back again. The Scene's own Tiles
 * and Drawings are the Realm: each carries a flag saying what it is, and the
 * hex it stands in comes from where it stands, so a GM who drags an icon with
 * Foundry's own tools has moved it. River pieces, the Seat of Power badge and
 * each Barrier's line are drawn from the rest.
 *
 * Every write goes through planRealmSync, which compares the Realm with the
 * documents already there and changes only what differs. Pure, so all of it
 * can be tested without Foundry.
 */
import { SYSTEM_ID } from "../system-id.js";
import { HOLDING_STYLES, LAKE, LANDMARK_TYPES, MYTH_COUNT, REALM_FLAG, REALM_VERSION, RIVER_SHAPES, TERRAIN, emptyRealm } from "./realm.js";
import { HOLDINGS_REPLACE_TERRAIN, PICTURE_NAME, normaliseRealmLook, realmSetDir, sceneColours } from "./realm-skins.js";
import {
	DIRECTIONS,
	GRID_HEXEVENQ,
	allHexes,
	edgeDirection,
	edgeSegment,
	hexAt,
	hexCentre,
	hexIndex,
	hexKey,
	inRealm,
	neighbour,
	parseEdgeKey,
	parseHexKey,
	turnBetween
} from "./realm-geometry.js";

/** Draw order among the Realm's Tiles. Barrier lines are Drawings, which Foundry always draws above Tiles. */
export const REALM_SORT = Object.freeze({ terrain: 0, river: 100, feature: 200, seat: 300 });

/** How much of a hex each icon fills: its height, and for terrain its width as well. */
export const ICON_SCALE = Object.freeze({ terrain: 0.8, holding: 0.8, landmark: 0.85, myth: 0.5, seat: 0.3 });

/** The Level every Realm Scene is built on. */
export const LEVEL_ID = "defaultLevel0000";

const BARRIER_WIDTH = 10;

export const GRID_ALPHA = 0.6;

/** Where the Seat of Power badge sits, from the Holding's centre, in hex heights. It stays inside the hex. */
const SEAT_OFFSET = Object.freeze({ x: 0, y: -0.33 });

/** Positions are compared to the hundredth of a pixel, so a rebuilt Realm doesn't rewrite itself. */
const round = (value) => Math.round(value * 100) / 100;

/**
 * The picture for each part of the map, and the colours of the Scene itself.
 * Each picture is the GM's own where they've given one, otherwise the look's
 * skin in its colour set.
 * @param {import("./realm-skins.js").RealmLook|null} [look] The world's Realm look. Omit for the default.
 * @returns {{terrain: Record<number, {src: string, icon: boolean, givesWay: boolean}>, holding: Record<string, {src: string}>,
 *   landmark: Record<string, {src: string}>, myth: Record<number, {src: string}>, seat: {src: string},
 *   river: Record<string, {src: string}>, colours: {paper: string, grid: string, barrier: string}}} A terrain
 *   picture is an `icon` when it's drawn inside its hex rather than filling the hex, and `givesWay` when a
 *   Holding in its hex takes its place, as on the Blank Realm sheet.
 */
export function realmTextures(look = null) {
	const { skin, palette, custom } = normaliseRealmLook(look);
	const dir = realmSetDir(skin, palette);
	const picture = (name) => ({ src: custom.files[name] ?? `${dir}/${name}.svg` });

	return {
		terrain: Object.fromEntries(TERRAIN.map((key, index) => {
			const name = PICTURE_NAME.terrain(index + 1);
			const own = custom.files[name];
			if (!own) return [index + 1, { src: `${dir}/${name}.svg`, icon: false, givesWay: HOLDINGS_REPLACE_TERRAIN.includes(skin) }];
			const icon = custom.terrainFit === "icon";
			return [index + 1, { src: own, icon, givesWay: icon }];
		})),
		holding: Object.fromEntries(HOLDING_STYLES.map((style) => [style, picture(PICTURE_NAME.holding(style))])),
		landmark: Object.fromEntries(LANDMARK_TYPES.map((type) => [type, picture(PICTURE_NAME.landmark(type))])),
		myth: Object.fromEntries(Array.from({ length: MYTH_COUNT }, (_, index) => [index + 1, picture(PICTURE_NAME.myth(index + 1))])),
		seat: picture(PICTURE_NAME.seat),
		river: Object.fromEntries(RIVER_SHAPES.map((shape) => [shape, picture(PICTURE_NAME.river(shape))])),
		colours: sceneColours(palette)
	};
}

/**
 * @param {object|null|undefined} data A Scene, Tile or Drawing, or its data.
 * @returns {object|null} Our flag on it.
 */
export const realmFlag = (data) => data?.flags?.[SYSTEM_ID]?.[REALM_FLAG] ?? null;

const flagged = (flag) => ({ [SYSTEM_ID]: { [REALM_FLAG]: flag } });

/**
 * @returns {object} Tile data with everything this module decides about a Tile.
 */
function tileData({ centre, width, height, texture, sort, locked, hidden = false, alpha = 1, rotation = 0, name = "", flag }) {
	return {
		name,
		x: Math.round(centre.x),
		y: Math.round(centre.y),
		width: Math.max(1, Math.round(width)),
		height: Math.max(1, Math.round(height)),
		rotation,
		alpha,
		elevation: 0,
		sort,
		hidden,
		locked,
		texture: { src: texture.src, anchorX: texture.anchorX ?? 0.5, anchorY: texture.anchorY ?? 0.5, fit: texture.fit ?? "fill" },
		flags: flagged(flag)
	};
}

/**
 * Which way a river leaves a hex at the edge of the map, as near as possible to
 * straight on from where it came in.
 * @returns {number|null} A direction, or null when the hex isn't at the edge.
 */
function outwardDirection(g, hex, from) {
	const outward = DIRECTIONS.map((_, direction) => direction).filter((direction) => !neighbour(g, hex, direction));
	if (!outward.length) return null;
	const straightness = (direction) => (from === null ? 0 : turnBetween(direction, from));
	return outward.reduce((best, direction) => (straightness(direction) > straightness(best) ? direction : best));
}

/**
 * The river as pieces laid on each hex it passes through. Lakes carry the
 * water themselves, so they get no piece.
 * @param {object} g
 * @param {{col: number, row: number}[]} river Source to mouth.
 * @param {number[]} terrain
 * @returns {{index: number, hex: object, shape: string, rotation: number}[]} Rotation in degrees, clockwise,
 *   of a piece drawn from the hex's south edge.
 */
export function riverPieces(g, river, terrain) {
	const valid = river.filter((hex) => inRealm(g, hex));
	return valid.flatMap((hex, index) => {
		if (terrain[hexIndex(g, hex)] === LAKE) return [];
		const previous = index > 0 ? edgeDirection(hex, valid[index - 1]) : null;
		const next = index < valid.length - 1 ? edgeDirection(hex, valid[index + 1]) : null;
		const a = previous ?? outwardDirection(g, hex, next);
		const b = next ?? outwardDirection(g, hex, previous);

		const rotationFrom = (direction) => (60 * (direction - 1) + 360) % 360;
		if (a === null || b === null) {
			const only = a ?? b ?? 1;
			return [{ index, hex, shape: "end", rotation: rotationFrom(only) }];
		}

		// Pieces are drawn turning one way, so a turn the other way is the same piece laid from its far end.
		const turn = (b - a + 6) % 6;
		const [from, sweep] = turn > 3 ? [b, 6 - turn] : [a, turn];
		const shape = { 1: "sharp", 2: "bend", 3: "straight" }[sweep] ?? "straight";
		return [{ index, hex, shape, rotation: rotationFrom(from) }];
	});
}

/**
 * The Scene flag a Realm Scene carries.
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 */
export const realmSceneFlag = (realm, g) => ({
	version: REALM_VERSION,
	seed: realm.seed ?? null,
	size: g.size,
	cols: g.cols,
	rows: g.rows,
	river: realm.river.map(hexKey)
});

/**
 * @param {string} edge
 * @returns {object|null} Drawing data for a Barrier's line along its edge.
 */
function barrierDrawing(g, { edge, revealed }, colour) {
	const segment = edgeSegment(g, edge);
	if (!segment) return null;
	const from = { x: round(segment.from.x), y: round(segment.from.y) };
	const to = { x: round(segment.to.x), y: round(segment.to.y) };
	const x = Math.min(from.x, to.x);
	const y = Math.min(from.y, to.y);
	return {
		x,
		y,
		elevation: 0,
		rotation: 0,
		bezierFactor: 0,
		// Foundry keeps a shape's size in whole pixels; given any other way, every Tidy would write it again.
		shape: { type: "p", width: Math.round(Math.abs(to.x - from.x)), height: Math.round(Math.abs(to.y - from.y)), points: [round(from.x - x), round(from.y - y), round(to.x - x), round(to.y - y)] },
		strokeWidth: BARRIER_WIDTH,
		strokeColor: colour,
		strokeAlpha: 1,
		fillType: 0,
		fillAlpha: 0,
		hidden: !revealed,
		locked: true,
		flags: flagged({ kind: "barrier", edge })
	};
}

/**
 * The documents a Realm should have, each with a `match` key saying which
 * existing document it replaces: a hex, a river index, a document id or an edge.
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {ReturnType<typeof realmTextures>} textures
 * @returns {{tiles: {match: string, data: object}[], drawings: {match: string, data: object}[]}}
 */
export function realmDocuments(realm, g, textures) {
	const tiles = [];

	// A terrain picture of the GM's own may sit inside its hex. Some give way to a Holding there, as on the Blank Realm sheet.
	const holdingHexes = new Set(realm.holdings.map((holding) => hexKey(holding.hex)));
	for (const hex of allHexes(g)) {
		const terrain = realm.terrain[hexIndex(g, hex)];
		if (!terrain) continue;
		const picture = textures.terrain[terrain];
		const scale = picture.icon ? ICON_SCALE.terrain : 1;
		tiles.push({
			match: `terrain:${hexKey(hex)}`,
			data: tileData({
				centre: hexCentre(g, hex),
				width: g.hexWidth * scale,
				height: g.size * scale,
				texture: { src: picture.src, fit: picture.icon ? "contain" : "fill" },
				alpha: picture.givesWay && holdingHexes.has(hexKey(hex)) ? 0 : 1,
				sort: REALM_SORT.terrain,
				locked: true,
				flag: { kind: "terrain", terrain }
			})
		});
	}

	for (const piece of riverPieces(g, realm.river, realm.terrain)) {
		tiles.push({
			match: `river:${piece.index}`,
			data: tileData({
				centre: hexCentre(g, piece.hex),
				width: g.hexWidth,
				height: g.size,
				texture: textures.river[piece.shape],
				sort: REALM_SORT.river,
				locked: true,
				rotation: piece.rotation,
				flag: { kind: "river", index: piece.index }
			})
		});
	}

	const icon = (kind, texture, hex, extra) => tileData({
		centre: hexCentre(g, hex),
		width: g.size * ICON_SCALE[kind],
		height: g.size * ICON_SCALE[kind],
		texture: { ...texture, fit: "contain" },
		sort: REALM_SORT.feature,
		locked: false,
		...extra
	});

	for (const holding of realm.holdings) {
		tiles.push({
			match: holding.id ? `id:${holding.id}` : `new:holding:${hexKey(holding.hex)}`,
			data: icon("holding", textures.holding[holding.style] ?? textures.holding.castle, holding.hex, {
				name: holding.name ?? "",
				flag: { kind: "holding", style: holding.style, seat: Boolean(holding.seat), name: holding.name ?? "" }
			})
		});
		if (!holding.seat) continue;
		const centre = hexCentre(g, holding.hex);
		tiles.push({
			match: "seat",
			data: tileData({
				centre: { x: centre.x + SEAT_OFFSET.x * g.size, y: centre.y + SEAT_OFFSET.y * g.size },
				width: g.size * ICON_SCALE.seat,
				height: g.size * ICON_SCALE.seat,
				texture: { ...textures.seat, fit: "contain" },
				sort: REALM_SORT.seat,
				locked: true,
				flag: { kind: "seat" }
			})
		});
	}

	for (const myth of realm.myths) {
		tiles.push({
			match: myth.id ? `id:${myth.id}` : `new:myth:${myth.number}`,
			data: icon("myth", textures.myth[myth.number] ?? textures.myth[1], myth.hex, {
				hidden: !myth.revealed,
				flag: { kind: "myth", number: myth.number, d6: myth.d6, d12: myth.d12, omen: myth.omen ?? 0 }
			})
		});
	}

	for (const landmark of realm.landmarks) {
		tiles.push({
			match: landmark.id ? `id:${landmark.id}` : `new:landmark:${hexKey(landmark.hex)}`,
			data: icon("landmark", textures.landmark[landmark.type] ?? textures.landmark.dwelling, landmark.hex, {
				name: landmark.name ?? "",
				hidden: !landmark.revealed,
				flag: { kind: "landmark", type: landmark.type, name: landmark.name ?? "", seer: landmark.seer ?? null }
			})
		});
	}

	const drawings = realm.barriers.flatMap((barrier) => {
		const data = barrierDrawing(g, barrier, textures.colours.barrier);
		return data ? [{ match: `edge:${barrier.edge}`, data }] : [];
	});

	return { tiles, drawings };
}

/**
 * The complete Scene to create for a new Realm.
 * @param {object} options
 * @param {string} options.name
 * @param {import("./realm.js").Realm} options.realm
 * @param {object} options.geometry
 * @param {ReturnType<typeof realmTextures>} options.textures
 * @param {string} [options.units] What the grid's distance is counted in.
 * @returns {object} Data for `Scene.create`.
 */
export function realmSceneData({ name, realm, geometry: g, textures, units = "" }) {
	const { tiles, drawings } = realmDocuments(realm, g, textures);
	return {
		name,
		navigation: true,
		width: g.width,
		height: g.height,
		padding: 0,
		tokenVision: false,
		fog: { mode: 0 },
		grid: { type: GRID_HEXEVENQ, size: g.size, style: "solidLines", thickness: 2, color: textures.colours.grid, alpha: GRID_ALPHA, distance: 1, units },
		levels: [{ _id: LEVEL_ID, name, background: { color: textures.colours.paper } }],
		initialLevel: LEVEL_ID,
		initial: { x: Math.round(g.width / 2), y: Math.round(g.height / 2), scale: 0.5 },
		tiles: tiles.map((tile) => tile.data),
		drawings: drawings.map((drawing) => drawing.data),
		flags: flagged(realmSceneFlag(realm, g))
	};
}

/**
 * Read a Realm back from its Scene.
 * @param {object} snapshot
 * @param {object} [snapshot.flags] The Scene's flags.
 * @param {object[]} [snapshot.tiles] Tile source data, each with `_id`.
 * @param {object[]} [snapshot.drawings] Drawing source data, each with `_id`.
 * @param {object} g
 * @returns {{realm: import("./realm.js").Realm, problems: {kind: string, reason: string, key: string}[]}}
 */
export function realmFromDocuments({ flags = {}, tiles = [], drawings = [] }, g) {
	const sceneFlag = realmFlag({ flags }) ?? {};
	const realm = emptyRealm(g, sceneFlag.seed ?? null);
	realm.river = (sceneFlag.river ?? []).map(parseHexKey).filter((hex) => inRealm(g, hex));
	const problems = [];

	for (const tile of tiles) {
		const flag = realmFlag(tile);
		if (!flag) continue;
		const hex = hexAt(g, tile);
		const where = hex ? hexKey(hex) : `${tile.x},${tile.y}`;

		switch (flag.kind) {
			case "terrain": {
				if (!hex) break;
				const index = hexIndex(g, hex);
				if (realm.terrain[index]) problems.push({ kind: "terrain", reason: "duplicate", key: where });
				else realm.terrain[index] = Number(flag.terrain) || 0;
				break;
			}
			case "holding":
				if (!hex) problems.push({ kind: "holding", reason: "offMap", key: where });
				else realm.holdings.push({ id: tile._id ?? null, hex, style: flag.style, seat: Boolean(flag.seat), name: flag.name ?? "" });
				break;
			case "myth":
				if (!hex) problems.push({ kind: "myth", reason: "offMap", key: where });
				else realm.myths.push({ id: tile._id ?? null, hex, number: flag.number, d6: flag.d6, d12: flag.d12, omen: flag.omen ?? 0, revealed: !tile.hidden });
				break;
			case "landmark":
				if (!hex) problems.push({ kind: "landmark", reason: "offMap", key: where });
				else realm.landmarks.push({ id: tile._id ?? null, hex, type: flag.type, name: flag.name ?? "", seer: flag.seer ?? null, revealed: !tile.hidden });
				break;
			default:
				break;
		}
	}
	realm.myths.sort((a, b) => a.number - b.number);

	const edges = new Set();
	for (const drawing of drawings) {
		const flag = realmFlag(drawing);
		if (flag?.kind !== "barrier") continue;
		if (!parseEdgeKey(flag.edge)) problems.push({ kind: "barrier", reason: "edge", key: String(flag.edge) });
		else if (edges.has(flag.edge)) problems.push({ kind: "barrier", reason: "duplicate", key: flag.edge });
		else realm.barriers.push({ id: drawing._id ?? null, edge: flag.edge, revealed: !drawing.hidden });
		edges.add(flag.edge);
	}

	return { realm, problems };
}

/**
 * The match key an existing document answers to.
 * @returns {string|null}
 */
function existingMatch(g, kind, data, replacing) {
	const flag = realmFlag(data);
	if (!flag) return null;
	if (kind === "drawing") return flag.kind === "barrier" ? `edge:${flag.edge}` : null;
	switch (flag.kind) {
		case "terrain": {
			const hex = hexAt(g, data);
			return hex ? `terrain:${hexKey(hex)}` : null;
		}
		case "river": return `river:${flag.index}`;
		case "seat": return "seat";
		// An icon dragged off the map isn't in the Realm, so it's left for the GM rather than deleted with its Omens.
		case "holding":
		case "myth":
		case "landmark": return replacing || hexAt(g, data) ? `id:${data._id}` : null;
		default: return null;
	}
}

/** Fields planRealmSync keeps as they are on a document that already exists. */
const KEPT_ON_UPDATE = Object.freeze({ terrain: ["hidden"], river: ["hidden"], seat: ["hidden"], holding: ["hidden"] });

/**
 * @returns {object|null} The changes that bring `existing` in line with `desired`, or null when none are needed.
 */
function changesFor(existing, desired) {
	const kind = realmFlag(desired)?.kind;
	const kept = KEPT_ON_UPDATE[kind] ?? [];
	const changes = {};
	const differs = (a, b) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) > 0.01 : JSON.stringify(a ?? null) !== JSON.stringify(b ?? null));

	for (const [key, value] of Object.entries(desired)) {
		if (kept.includes(key)) continue;
		if (key === "flags") {
			if (differs(realmFlag(existing), realmFlag(desired))) changes.flags = value;
			continue;
		}
		if (value && typeof value === "object" && !Array.isArray(value)) {
			const nested = Object.entries(value).filter(([field, inner]) => differs(existing[key]?.[field], inner));
			if (nested.length) changes[key] = Object.fromEntries(nested);
			continue;
		}
		if (differs(existing[key], value)) changes[key] = value;
	}
	return Object.keys(changes).length ? changes : null;
}

/**
 * The writes that make a Scene's documents match a Realm. Documents that
 * belong to nobody but the Realm are removed when the Realm no longer has them;
 * Tokens and anything else on the Scene are left alone.
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {ReturnType<typeof realmTextures>} textures
 * @param {{tiles?: object[], drawings?: object[]}} existing Source data, each with `_id`.
 * @param {object} [options]
 * @param {boolean} [options.replacing] The Realm replaces the Scene's old one, so icons off the map go too.
 * @returns {{Tile: {create: object[], update: object[], delete: string[]}, Drawing: {create: object[], update: object[], delete: string[]}}}
 */
export function planRealmSync(realm, g, textures, existing, { replacing = false } = {}) {
	const desired = realmDocuments(realm, g, textures);
	const plan = (wanted, current, kind) => {
		const byMatch = new Map();
		const deletions = [];
		for (const data of current) {
			const match = existingMatch(g, kind, data, replacing);
			if (!match) continue;
			if (byMatch.has(match)) deletions.push(data._id);
			else byMatch.set(match, data);
		}

		const create = [];
		const update = [];
		const used = new Set();
		for (const { match, data } of wanted) {
			const found = byMatch.get(match);
			if (!found || used.has(match)) {
				create.push(data);
				continue;
			}
			used.add(match);
			const changes = changesFor(found, data);
			if (changes) update.push({ _id: found._id, ...changes });
		}
		for (const [match, data] of byMatch) {
			if (!used.has(match)) deletions.push(data._id);
		}
		return { create, update, delete: deletions };
	};

	return {
		Tile: plan(desired.tiles, existing.tiles ?? [], "tile"),
		Drawing: plan(desired.drawings, existing.drawings ?? [], "drawing")
	};
}

/**
 * @param {ReturnType<typeof planRealmSync>} plan
 * @returns {boolean} Whether the plan writes anything.
 */
export const planChanges = (plan) => Object.values(plan).some((writes) => writes.create.length || writes.update.length || writes.delete.length);

/**
 * @param {object} data Tile or Drawing source data.
 * @returns {boolean} Whether the document is part of a Realm.
 */
export const isRealmDocument = (data) => Boolean(realmFlag(data));
