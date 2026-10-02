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
import { noFogSceneData, paperSceneData } from "../compat.js";
import { SYSTEM_ID } from "../system-id.js";
import { HOLDING_STYLES, LAKE, LANDMARK_TYPES, MYTH_COUNT, REALM_FLAG, REALM_VERSION, RIVER_SHAPES, TERRAIN, emptyRealm } from "./realm.js";
import { PICTURE_NAME, normaliseRealmLook, realmSetDir, sceneColours, skinFeatures } from "./realm-skins.js";
import { SHORE_SHAPES, lakeWorks, riverCourses, riverNetworkPieces } from "./realm-rivers.js";
import { MAP_ROLES, hidesTerrain, normaliseRealmPicture, realmPictures, withMapPlaces } from "./realm-map.js";
import { normaliseRealmSetup } from "./realm-setup.js";
import {
	BOOK_LAYOUT,
	allHexes,
	edgeSegment,
	hexAt,
	hexCentre,
	hexIndex,
	hexKey,
	inRealm,
	parseEdgeKey,
	parseHexKey
} from "./realm-geometry.js";

/**
 * Draw order among the Realm's Tiles. Barrier lines are Drawings, which Foundry always draws above Tiles.
 * A picture of a Realm drawn on paper lies under everything, since it is the map itself.
 */
export const REALM_SORT = Object.freeze({ map: -100, terrain: 0, shore: 50, river: 100, feature: 200, seat: 300 });

/** How much of a hex each icon fills: its height, and for terrain its width as well. */
export const ICON_SCALE = Object.freeze({ terrain: 0.8, holding: 0.8, landmark: 0.85, myth: 0.5, seat: 0.3 });

/** The Level every Realm Scene is built on, on Foundry v14. v13 has no Levels, and keeps the paper on the Scene. */
export const LEVEL_ID = "defaultLevel0000";

const BARRIER_WIDTH = 10;

export const GRID_ALPHA = 0.6;

/** Where the Seat of Power badge sits, from the Holding's centre, in hex heights. It stays inside the hex. */
const SEAT_OFFSET = Object.freeze({ x: 0, y: -0.33 });

/** Positions are compared to the hundredth of a pixel, so a rebuilt Realm doesn't rewrite itself. */
const round = (value) => Math.round(value * 100) / 100;

/**
 * The system's own ground, river and shore pictures are drawn for flat-topped
 * hexes. A Realm laid out with pointed tops turns each a twelfth of a turn back,
 * which fits it to the hex exactly and keeps a river's ends on the edges it
 * crosses, since direction k runs out through the same edge either way.
 * @param {object} g
 * @param {number} [rotation] The picture's own turn, in degrees clockwise.
 * @returns {number} Its turn on this Realm, from 0 up to 360 as Foundry keeps it, so a sync doesn't write it again.
 */
const pieceRotation = (g, rotation = 0) => (((rotation + (g.columns === false ? -30 : 0)) % 360) + 360) % 360;

/**
 * @param {object} g
 * @returns {{width: number, height: number}} A hex-shaped picture's size before it's turned: flat top to flat bottom,
 *   point to point across.
 */
const pieceSize = (g) => ({ width: 2 * g.radius, height: g.size });

/**
 * The picture for each part of the map, and the colours of the Scene itself.
 * Each picture is the GM's own where they've given one, otherwise the look's
 * skin in its colour set.
 * @param {import("./realm-skins.js").RealmLook|null} [look] The world's Realm look. Omit for the default.
 * @returns {{terrain: Record<number, {src: string, icon: boolean, givesWay: boolean}>, holding: Record<string, {src: string}>,
 *   landmark: Record<string, {src: string}>, myth: Record<number, {src: string}>, seat: {src: string},
 *   river: Record<string, {src: string}>, colours: {paper: string, grid: string, barrier: string},
 *   lake: {water: {src: string}, shore: Record<string, {src: string}>, mouth: {src: string}}|null}} A terrain picture
 *   is an `icon` when it's drawn inside its hex rather than filling the hex, and `givesWay` when a Holding in its hex
 *   takes its place, as on the Blank Realm sheet. `lake` is there when the skin joins its lakes up; a GM's own Lake
 *   picture is left as it is.
 */
export function realmTextures(look = null) {
	const { skin, palette, custom } = normaliseRealmLook(look);
	const dir = realmSetDir(skin, palette);
	const picture = (name) => ({ src: custom.files[name] ?? `${dir}/${name}.svg` });
	const skinPicture = (name) => ({ src: `${dir}/${name}.svg` });
	const features = skinFeatures(skin);
	const joinsLakes = features.joinsLakes && !custom.files[PICTURE_NAME.terrain(LAKE)];

	return {
		terrain: Object.fromEntries(TERRAIN.map((key, index) => {
			const name = PICTURE_NAME.terrain(index + 1);
			const own = custom.files[name];
			if (!own) return [index + 1, { src: `${dir}/${name}.svg`, icon: false, givesWay: features.holdingsGiveWay }];
			const icon = custom.terrainFit === "icon";
			return [index + 1, { src: own, icon, givesWay: icon }];
		})),
		holding: Object.fromEntries(HOLDING_STYLES.map((style) => [style, picture(PICTURE_NAME.holding(style))])),
		landmark: Object.fromEntries(LANDMARK_TYPES.map((type) => [type, picture(PICTURE_NAME.landmark(type))])),
		myth: Object.fromEntries(Array.from({ length: MYTH_COUNT }, (_, index) => [index + 1, picture(PICTURE_NAME.myth(index + 1))])),
		seat: picture(PICTURE_NAME.seat),
		river: Object.fromEntries(RIVER_SHAPES.map((shape) => [shape, picture(PICTURE_NAME.river(shape))])),
		lake: joinsLakes ? {
			water: skinPicture(PICTURE_NAME.water),
			shore: Object.fromEntries(SHORE_SHAPES.map((shape) => [shape, skinPicture(PICTURE_NAME.shore(shape))])),
			mouth: skinPicture(PICTURE_NAME.mouth)
		} : null,
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
 * The Scene flag a Realm Scene carries. A Realm set up other than the book's
 * way keeps its setup, so a reroll sets it up the same way, and one traced over
 * a picture keeps which pictures they are and where they lie.
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 */
export const realmSceneFlag = (realm, g) => ({
	version: REALM_VERSION,
	seed: realm.seed ?? null,
	size: g.size,
	cols: g.cols,
	rows: g.rows,
	// Only a Realm laid out other than the book's way says so, so Realms made before there was a choice read the same.
	...(g.layout && g.layout !== BOOK_LAYOUT ? { layout: g.layout } : {}),
	rivers: realm.rivers.map((course) => course.map(hexKey)),
	...(realm.setup ? { setup: realm.setup } : {}),
	...(realm.picture ? { picture: realm.picture } : {})
});

/** Where older Scenes kept their rivers, before every river was kept alike. */
const OLD_RIVER_FIELDS = Object.freeze(["river", "branches"]);

/** JSON with every object's keys in order, so data saved with its keys in another order still reads as the same. */
const canonical = (value) => JSON.stringify(value ?? null, (_key, inner) => (inner && typeof inner === "object" && !Array.isArray(inner)
	? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
	: inner));

/**
 * What a Realm Scene's flag needs to hold a Realm: its rivers, seed, setup and
 * pictures, which no document carries. Scenes still keeping their rivers the
 * old way lose those fields, since `rivers` now holds them all.
 * @param {object|null} current The Scene's flag as it is.
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @returns {{set: object, drop: string[]}|null} Fields to write and fields to remove, or null when the flag already fits.
 */
export function realmFlagChanges(current, realm, g) {
	const wanted = realmSceneFlag(realm, g);
	const set = Object.fromEntries(Object.entries(wanted).filter(([key, value]) => canonical(current?.[key]) !== canonical(value)));
	const gone = ["setup", "picture", "layout"].filter((key) => !wanted[key]);
	const drop = [...OLD_RIVER_FIELDS, ...gone].filter((key) => current && key in current);
	return Object.keys(set).length || drop.length ? { set, drop } : null;
}

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
		// Foundry keeps a shape's size in whole pixels; given any other way, every sync would write it again.
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
	const courses = riverCourses(realm, g);
	const pieces = riverNetworkPieces(g, courses, realm.terrain);
	// Where the skin joins lakes up, a lake that meets another or takes in a river is open water inside shores.
	const works = textures.lake ? lakeWorks(g, courses, realm.terrain) : null;
	const openWater = new Set((works?.water ?? []).map(hexKey));

	// A Realm traced over a picture is drawn by the picture: the system's own
	// ground and water are still there, still saying what each hex holds, but
	// drawn at nothing so the drawing underneath shows through. The Holdings,
	// Landmarks and Myths are drawn over it as on any Realm.
	const traced = hidesTerrain(realm);
	const showing = (hidden) => (hidden ? 0 : 1);

	// The picture lies under the whole map. It isn't locked, so a GM can drag it
	// into place with Foundry's own tools; its size is kept (keepMapPictureSize).
	for (const { role, src, x, y, width, height } of realmPictures(realm, g)) {
		tiles.push({
			match: `map:${role}`,
			data: tileData({
				centre: { x, y },
				width,
				height,
				texture: { src, fit: "fill" },
				sort: REALM_SORT.map + MAP_ROLES.indexOf(role),
				locked: false,
				flag: { kind: "map", role }
			})
		});
	}

	// A terrain picture of the GM's own may sit inside its hex. Some give way to a Holding there, as on the Blank Realm sheet.
	const holdingHexes = new Set(realm.holdings.map((holding) => hexKey(holding.hex)));
	for (const hex of allHexes(g)) {
		const terrain = realm.terrain[hexIndex(g, hex)];
		if (!terrain) continue;
		const key = hexKey(hex);
		const picture = textures.terrain[terrain];
		const src = openWater.has(key) ? textures.lake.water.src : picture.src;
		// An icon of the GM's own stands upright inside the hex's box; a picture of the whole hex is turned to fit it.
		const shape = picture.icon
			? { width: g.hexWidth * ICON_SCALE.terrain, height: g.hexHeight * ICON_SCALE.terrain, rotation: 0 }
			: { ...pieceSize(g), rotation: pieceRotation(g) };
		tiles.push({
			match: `terrain:${key}`,
			data: tileData({
				centre: hexCentre(g, hex),
				...shape,
				texture: { src, fit: picture.icon ? "contain" : "fill" },
				alpha: showing(traced || (picture.givesWay && holdingHexes.has(key))),
				sort: REALM_SORT.terrain,
				locked: true,
				flag: { kind: "terrain", terrain }
			})
		});
	}

	const hexPiece = (hex, texture, { sort, rotation, flag }) => tileData({
		centre: hexCentre(g, hex), ...pieceSize(g), texture, sort, locked: true, rotation: pieceRotation(g, rotation), flag, alpha: showing(traced)
	});
	for (const piece of pieces) {
		tiles.push({
			match: `river:${piece.index}`,
			data: hexPiece(piece.hex, textures.river[piece.shape], { sort: REALM_SORT.river, rotation: piece.rotation, flag: { kind: "river", index: piece.index } })
		});
	}
	for (const { hex, edge, shape, rotation } of works?.shores ?? []) {
		tiles.push({
			match: `shore:${hexKey(hex)}:${edge}`,
			data: hexPiece(hex, textures.lake.shore[shape], { sort: REALM_SORT.shore, rotation, flag: { kind: "shore", edge } })
		});
	}
	for (const { hex, edge, rotation } of works?.mouths ?? []) {
		tiles.push({
			match: `mouth:${hexKey(hex)}:${edge}`,
			data: hexPiece(hex, textures.lake.mouth, { sort: REALM_SORT.river, rotation, flag: { kind: "mouth", edge } })
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
				flag: {
					kind: "holding",
					style: holding.style,
					seat: Boolean(holding.seat),
					name: holding.name ?? "",
					...(holding.seat && holding.disputed ? { disputed: true } : {})
				}
			})
		});
		if (!holding.seat) continue;
		const centre = hexCentre(g, holding.hex);
		tiles.push({
			// One crown to each Seat, since a disputed Seat has two (p202).
			match: `seat:${hexKey(holding.hex)}`,
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
				flag: { kind: "landmark", type: landmark.type, name: landmark.name ?? "", seer: landmark.seer ?? null, ...(landmark.echo ? { echo: landmark.echo } : {}) }
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
 * About how much of the map shows on a usual screen beside the sidebar and
 * under the controls, in screen pixels: room for a typical Realm's whole
 * height at half its size, which is the zoom a Realm opens at.
 */
const OPENING_ROOM = Object.freeze({ width: 1600, height: 1000 });

/**
 * The zoom a Realm opens at: half size, or further out for a Realm too long
 * or too tall to be seen whole at that, such as one laid over a very wide map.
 * @param {object} g
 * @returns {number}
 */
export const openingScale = (g) => Math.min(0.5, OPENING_ROOM.width / g.width, OPENING_ROOM.height / g.height);

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
		...noFogSceneData(),
		grid: { type: g.gridType, size: g.size, style: "solidLines", thickness: 2, color: textures.colours.grid, alpha: GRID_ALPHA, distance: 1, units },
		...paperSceneData(LEVEL_ID, name, textures.colours.paper),
		initial: { x: Math.round(g.width / 2), y: Math.round(g.height / 2), scale: openingScale(g) },
		tiles: tiles.map((tile) => tile.data),
		drawings: drawings.map((drawing) => drawing.data),
		flags: flagged(realmSceneFlag(realm, g))
	};
}

/**
 * What the GM has hidden of a hex by hand, by hiding its terrain, Holding or
 * Seat Tile on the Scene. The Realm doesn't record these, since only Myths,
 * Landmarks and Barriers are hidden by the rules, but a sync keeps them hidden
 * (KEPT_ON_UPDATE), so what players are told should keep quiet about them too.
 * @param {object[]} tiles Tile source data.
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @returns {{terrain: boolean, holding: boolean, seat: boolean}}
 */
export function hiddenByHand(tiles, g, hex) {
	const hidden = { terrain: false, holding: false, seat: false };
	const key = hexKey(hex);
	for (const tile of tiles) {
		if (!tile.hidden) continue;
		const kind = realmFlag(tile)?.kind;
		if (!Object.hasOwn(hidden, kind)) continue;
		const at = hexAt(g, tile);
		if (at && hexKey(at) === key) hidden[kind] = true;
	}
	return hidden;
}

/**
 * @param {object[]} tiles Tile documents or source data.
 * @param {object} g
 * @param {string[]} kinds Realm Tile kinds, such as "myth".
 * @param {{col: number, row: number}[]} hexes
 * @returns {object[]} The hidden Tiles of those kinds standing in those hexes.
 */
export function hiddenTilesIn(tiles, g, kinds, hexes) {
	const keys = new Set(hexes.map(hexKey));
	return tiles.filter((tile) => {
		if (!tile.hidden || !kinds.includes(realmFlag(tile)?.kind)) return false;
		const at = hexAt(g, tile);
		return Boolean(at) && keys.has(hexKey(at));
	});
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
	if (sceneFlag.setup) realm.setup = { ...normaliseRealmSetup(sceneFlag.setup), cols: g.cols, rows: g.rows };
	// Scenes made before every river was kept alike have a `river`, and perhaps `branches` after it.
	const rivers = sceneFlag.rivers ?? [sceneFlag.river ?? [], ...(sceneFlag.branches ?? [])];
	realm.rivers = rivers.map((course) => course.map(parseHexKey).filter((hex) => inRealm(g, hex))).filter((course) => course.length);
	const problems = [];
	/** Where each picture's Tile stands, which is where that picture lies. */
	const places = {};

	for (const tile of tiles) {
		const flag = realmFlag(tile);
		if (!flag) continue;
		const hex = hexAt(g, tile);
		const where = hex ? hexKey(hex) : `${tile.x},${tile.y}`;

		switch (flag.kind) {
			case "map":
				if (MAP_ROLES.includes(flag.role)) places[flag.role] = { x: tile.x, y: tile.y, width: tile.width, height: tile.height };
				break;
			case "terrain": {
				if (!hex) break;
				const index = hexIndex(g, hex);
				if (realm.terrain[index]) problems.push({ kind: "terrain", reason: "duplicate", key: where });
				else realm.terrain[index] = Number(flag.terrain) || 0;
				break;
			}
			case "holding":
				if (!hex) problems.push({ kind: "holding", reason: "offMap", key: where });
				else {
					realm.holdings.push({
						id: tile._id ?? null,
						hex,
						style: flag.style,
						seat: Boolean(flag.seat),
						name: flag.name ?? "",
						...(flag.seat && flag.disputed ? { disputed: true } : {})
					});
				}
				break;
			case "myth":
				if (!hex) problems.push({ kind: "myth", reason: "offMap", key: where });
				else realm.myths.push({ id: tile._id ?? null, hex, number: flag.number, d6: flag.d6, d12: flag.d12, omen: flag.omen ?? 0, revealed: !tile.hidden });
				break;
			case "landmark":
				if (!hex) problems.push({ kind: "landmark", reason: "offMap", key: where });
				else realm.landmarks.push({ id: tile._id ?? null, hex, type: flag.type, name: flag.name ?? "", seer: flag.seer ?? null, revealed: !tile.hidden, ...(flag.echo ? { echo: flag.echo } : {}) });
				break;
			default:
				break;
		}
	}
	realm.myths.sort((a, b) => a.number - b.number);
	const picture = normaliseRealmPicture(withMapPlaces(sceneFlag.picture, places));
	if (picture) realm.picture = picture;

	const edges = new Set();
	for (const drawing of drawings) {
		const flag = realmFlag(drawing);
		if (flag?.kind !== "barrier") continue;
		if (!parseEdgeKey(g, flag.edge)) problems.push({ kind: "barrier", reason: "edge", key: String(flag.edge) });
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
		// Claimed whatever role it says it plays, so a picture the Realm no longer
		// carries is cleared away rather than left lying under the map for ever.
		case "map": return `map:${flag.role}`;
		case "terrain": {
			const hex = hexAt(g, data);
			return hex ? `terrain:${hexKey(hex)}` : null;
		}
		case "river": return `river:${flag.index}`;
		case "shore":
		case "mouth": {
			const hex = hexAt(g, data);
			return hex ? `${flag.kind}:${hexKey(hex)}:${flag.edge}` : null;
		}
		// Each crown answers to the hex it hangs over. One off the map belongs to no Seat, and goes.
		case "seat": {
			const hex = hexAt(g, data);
			return hex ? `seat:${hexKey(hex)}` : `seat:off:${data._id}`;
		}
		// An icon dragged off the map isn't in the Realm, so it's left for the GM rather than deleted with its Omens.
		case "holding":
		case "myth":
		case "landmark": return replacing || hexAt(g, data) ? `id:${data._id}` : null;
		default: return null;
	}
}

/** Fields planRealmSync keeps as they are on a document that already exists. */
const KEPT_ON_UPDATE = Object.freeze({ terrain: ["hidden"], river: ["hidden"], shore: ["hidden"], mouth: ["hidden"], seat: ["hidden"], holding: ["hidden"] });

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
