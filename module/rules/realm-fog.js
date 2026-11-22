import { allHexes, hexCentre, hexKey, hexRecords, hexVertices } from "./realm-geometry.js";

/**
 * A Realm's Fog of War, which the Referee may turn on for each Realm Scene: a
 * hex the Company hasn't reached, and the Referee hasn't lifted the fog from,
 * shows the players nothing but its edges. It's the house's own way to play,
 * off on every Realm until the Referee turns it on, since the book has the
 * players know the land from the start.
 *
 * What's kept, under the Scene flag `realmFog`:
 *   {version, on, holdings, hexes: {"c,r": {lifted: {by, at}} | {veiled: {after}}}}
 * A hex the Company has reached needs no record: its visits clear it. One the
 * Referee fogged again after a visit keeps the order of the last arrival it
 * was fogged over, so the next arrival clears it once more.
 */

export const FOG_VERSION = 1;

/** What lifted the fog from a hex: a vantage point marked, the Referee's hand, a Tile marked, a telling. */
const FOG_LIFTERS = Object.freeze(["vantage", "hand", "marked", "told"]);

/** Where the fog lies among what Foundry draws of a Scene: over its Tiles (500), under its Drawings (600). */
export const FOG_SORT_LAYER = 550;

/** How thick the fog lies for a Referee not playing alone, who sees through it what the players can't. */
export const GM_VEIL_ALPHA = 0.45;

/** And while they paint it with the brush, so the shape they've painted reads. */
export const BRUSH_VEIL_ALPHA = 0.7;

/** How far each hex's fog reaches past its edge, in pixels, so neighbouring hexes' fog leaves no seam between them. */
export const FOG_OVERLAP = 1;

/**
 * @param {unknown} value
 * @returns {object|null} One hex's record as it's kept, or null for one not worth keeping.
 */
function fogRecord(value) {
	if (!value || typeof value !== "object") return null;
	const { lifted, veiled } = value;
	// A hex is lifted or fogged again, never both.
	if (lifted && veiled) return null;
	if (lifted && typeof lifted === "object" && FOG_LIFTERS.includes(lifted.by)) {
		return { lifted: { by: lifted.by, at: Number.isFinite(lifted.at) ? lifted.at : 0 } };
	}
	if (veiled && typeof veiled === "object" && Number.isFinite(veiled.after) && veiled.after >= 0) {
		return { veiled: { after: veiled.after } };
	}
	return null;
}

/**
 * A Realm's fog from whatever the flag holds, however old or bad.
 * @param {unknown} raw
 * @returns {{on: boolean, holdings: boolean, hexes: Record<string, object>}} Off, with no hexes, for none.
 */
export function normaliseFog(raw) {
	const kept = raw && typeof raw === "object" ? raw : {};
	return { on: kept.on === true, holdings: kept.holdings === true, hexes: hexRecords(kept, fogRecord) };
}

/**
 * @param {import("./journey.js").HexVisits|null|undefined} visits As normaliseVisits gives them, newest last.
 * @returns {number} The order of the Company's last arrival in a hex; 0 where it has none.
 */
export const lastOrder = (visits) => visits?.last?.order ?? 0;

/**
 * @param {{hexes: Record<string, object>}} fog From normaliseFog.
 * @param {string} key The hex's.
 * @param {import("./journey.js").HexVisits|null|undefined} visits The Company's there.
 * @returns {boolean} Whether the fog has gone from the hex: lifted, or the Company has arrived since it last came back.
 */
export function hexCleared(fog, key, visits) {
	const record = fog?.hexes?.[key];
	if (record?.lifted) return true;
	if (record?.veiled) return lastOrder(visits) > record.veiled.after;
	return (visits?.count ?? 0) > 0;
}

/**
 * @param {object} g From realmGeometry.
 * @param {{on: boolean, hexes: Record<string, object>}} fog
 * @param {Record<string, object>} journeyHexes The Company's visits, by hex key.
 * @returns {Set<string>} The keys of every hex still in the fog; none while the fog is off.
 */
export function foggedKeys(g, fog, journeyHexes) {
	const fogged = new Set();
	if (!fog?.on || !g) return fogged;
	for (const hex of allHexes(g)) {
		const key = hexKey(hex);
		if (!hexCleared(fog, key, journeyHexes?.[key])) fogged.add(key);
	}
	return fogged;
}

/**
 * @param {object} fog
 * @param {Record<string, object|undefined>} changes A new record for each hex that changes, or undefined to take one out.
 * @returns {object} `fog` itself when nothing changes, as hexFlagEditor needs it.
 */
function withRecords(fog, changes) {
	const keys = Object.keys(changes);
	if (!keys.length) return fog;
	const hexes = { ...fog.hexes };
	for (const key of keys) {
		if (changes[key]) hexes[key] = changes[key];
		else delete hexes[key];
	}
	return { ...fog, hexes };
}

/**
 * Lift the fog from some hexes.
 * @param {object} fog From normaliseFog.
 * @param {string[]} keys
 * @param {string} by One of FOG_LIFTERS.
 * @param {number} at When, as Date.now() gives it.
 * @param {Record<string, object>} journeyHexes
 * @returns {object} `fog` itself when every hex was clear already, with no fog kept to come back over it.
 */
export function liftFog(fog, keys, by, at, journeyHexes) {
	const changes = {};
	for (const key of new Set(keys)) {
		const record = fog.hexes[key];
		if (record?.lifted) continue;
		if (!record && hexCleared(fog, key, journeyHexes?.[key])) continue;
		changes[key] = { lifted: { by, at } };
	}
	return withRecords(fog, changes);
}

/**
 * Bring the fog back over some hexes. One the Company has reached keeps the
 * order of its last arrival, so the next arrival clears it again; one it
 * hasn't loses its record, since the fog lies there anyway.
 * @param {object} fog
 * @param {string[]} keys
 * @param {Record<string, object>} journeyHexes
 * @returns {object} `fog` itself when every hex was in the fog already.
 */
export function veilFog(fog, keys, journeyHexes) {
	const changes = {};
	for (const key of new Set(keys)) {
		const record = fog.hexes[key];
		const visits = journeyHexes?.[key];
		if ((visits?.count ?? 0) > 0) {
			const after = lastOrder(visits);
			if (record?.veiled?.after === after) continue;
			changes[key] = { veiled: { after } };
		} else if (record) changes[key] = undefined;
	}
	return withRecords(fog, changes);
}

/**
 * One hex's fog the other way: brought back where it's clear, lifted by hand where it isn't.
 * @param {object} fog
 * @param {string} key
 * @param {number} at
 * @param {Record<string, object>} journeyHexes
 * @returns {object}
 */
export function toggleFogAt(fog, key, at, journeyHexes) {
	return hexCleared(fog, key, journeyHexes?.[key]) ? veilFog(fog, [key], journeyHexes) : liftFog(fog, [key], "hand", at, journeyHexes);
}

/**
 * How the fog is drawn for someone.
 * @param {object} options
 * @param {boolean} options.on Whether the Realm's fog is on.
 * @param {boolean} options.gm
 * @param {boolean} options.solo Whether they're a Referee kept from the Realm's secrets, as playing alone.
 * @returns {"none"|"veil"|"full"} None while it's off; a veil for a Referee who sees through it; full for the rest.
 */
export function fogLook({ on, gm, solo }) {
	if (!on) return "none";
	return gm && !solo ? "veil" : "full";
}

/**
 * @param {"none"|"veil"|"full"} look
 * @param {object} [options]
 * @param {boolean} [options.brush] Whether the fog brush is in hand.
 * @returns {number} How thick the fog lies.
 */
export function fogAlpha(look, { brush = false } = {}) {
	if (look === "full") return 1;
	if (look === "veil") return brush ? BRUSH_VEIL_ALPHA : GM_VEIL_ALPHA;
	return 0;
}

/**
 * Whether a Token is kept off someone's map by the fog over its hex. They
 * still see the Company, and any Token of their own, wherever it stands.
 * @param {object} options
 * @param {boolean} options.fogged Whether the fog lies over the Token's hex for them.
 * @param {boolean} options.company Whether it's the Company's Token.
 * @param {boolean} options.owner Whether they own it.
 * @returns {boolean}
 */
export const tokenFogged = ({ fogged, company, owner }) => Boolean(fogged) && !company && !owner;

/**
 * @param {object} options
 * @param {number} options.alpha How thick the fog lies, from fogAlpha: 0 where it's off.
 * @param {number} options.paper The paper's colour, as a number.
 * @param {object|null} options.g
 * @param {Set<string>|string[]} options.fogged
 * @returns {string} What the fog over the map was drawn from, which changes whenever it would be drawn
 *   differently; empty where there's nothing to draw.
 */
export function fogCoverKey({ alpha, paper, g, fogged }) {
	const keys = [...(fogged ?? [])];
	if (!alpha || !g || !keys.length) return "";
	return JSON.stringify([alpha, paper, g, keys.sort()]);
}

/**
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @param {number} grow How far past its edge, in pixels.
 * @returns {number[]} The hex's corners pushed out from its middle, as flat x, y pairs PIXI draws a polygon from.
 */
export function fogPolygon(g, hex, grow) {
	const centre = hexCentre(g, hex);
	const scale = g.radius > 0 ? (g.radius + grow) / g.radius : 1;
	return hexVertices(g, hex).flatMap(({ x, y }) => [centre.x + (x - centre.x) * scale, centre.y + (y - centre.y) * scale]);
}

/**
 * @param {{on: boolean, holdings: boolean}} fog
 * @returns {boolean} Whether the Realm's Holdings and Seats show through the fog.
 */
export const holdingsShowThrough = (fog) => Boolean(fog?.on && fog.holdings);

/**
 * What the Fog of War window shows of a Realm's fog.
 * @param {{on: boolean, holdings: boolean}} fog
 * @returns {{on: boolean, holdings: boolean, locked: boolean}} Whether Holdings show through, and the
 *   buttons that lift, bring back or brush it, are locked: they can only be changed while the fog is on.
 */
export const realmFogContext = ({ on, holdings }) => ({ on, holdings, locked: !on });
