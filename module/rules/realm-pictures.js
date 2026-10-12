/**
 * Which of its skin's pictures of a terrain each hex shows. The pictures were
 * traced from the Realm Sheets' example map, and those that stood side by side
 * there are laid side by side again where they can be: a hex beside others of
 * its terrain shows the picture that stood on the same side of theirs. Some
 * groups of hexes there are drawn as one picture across the edges they share;
 * their pictures run on into each other's, so a group is only ever laid whole,
 * and a group something has broken is picked again. Pure, so it can be tested
 * without Foundry.
 */
import { PICTURE_ROLL, TERRAIN, rollPicture } from "./realm.js";
import { allHexes, edgeDirection, hexIndex, neighbour, neighbours, parseHexKey, realmGeometry } from "./realm-geometry.js";
import { PAIRED_SKIN, skinFeatures } from "./realm-skins.js";

/** The example map, laid out as the book's sheet is. */
const EXAMPLE_MAP = realmGeometry();

const PAIRED_FEATURES = skinFeatures(PAIRED_SKIN);

/**
 * @typedef {object} TerrainPictures A terrain's pictures in the skin with more than one.
 * @property {number} single How many a hex can show on its own, the skin's own first: those a roll up to PICTURE_ROLL
 *   picks among. The pictures of groups follow them, numbered on.
 * @property {(string|null)[]} places Where on the example map each picture stood, as "col,row"; none for the skin's own.
 * @property {{direction: number, picture: number}[][]} partners Each picture's neighbours on the example map, and the
 *   direction from the one to the other.
 * @property {number[][]} groups The pictures of each group drawn as one.
 * @property {Map<number, {picture: number, steps: number[]}[]>} reach From each picture in a group, the way to each of the
 *   group's pictures, itself included, as directions from hex to hex.
 */

/** @type {readonly TerrainPictures[]} By terrain in d12 order. */
const PICTURES = TERRAIN.map((key) => {
	const singles = PAIRED_FEATURES.terrainPlaces[key] ?? [];
	const grouped = PAIRED_FEATURES.terrainGroups[key] ?? [];
	const single = 1 + singles.length;
	const places = [null, ...singles, ...grouped.flat()];
	const partners = places.map((place) => places.flatMap((other, picture) => {
		const direction = place && other ? edgeDirection(EXAMPLE_MAP, parseHexKey(place), parseHexKey(other)) : null;
		return direction === null ? [] : [{ direction, picture }];
	}));
	let next = single;
	const groups = grouped.map((group) => group.map(() => next++));
	const reach = new Map(groups.flatMap((group) => group.map((from) => [from, ways(group, from, partners)])));
	return { single, places, partners, groups, reach };
});

/**
 * The way from one picture of a group to each of the others, across the
 * group's own hexes.
 * @param {number[]} group
 * @param {number} from
 * @param {{direction: number, picture: number}[][]} partners
 * @returns {{picture: number, steps: number[]}[]}
 */
function ways(group, from, partners) {
	const found = new Map([[from, []]]);
	const queue = [from];
	while (queue.length) {
		const at = queue.shift();
		for (const { direction, picture } of partners[at]) {
			if (!group.includes(picture) || found.has(picture)) continue;
			found.set(picture, [...found.get(at), direction]);
			queue.push(picture);
		}
	}
	return [...found].map(([picture, steps]) => ({ picture, steps }));
}

const NO_PICTURES = Object.freeze({ single: 1, places: [null], partners: [[]], groups: [], reach: new Map() });

/** @returns {TerrainPictures} */
const picturesOf = (terrain) => PICTURES[terrain - 1] ?? NO_PICTURES;

/**
 * @param {number} terrain 1-12.
 * @returns {number} How many pictures of that terrain a hex can show on its own, the skin's own with them.
 */
export const pictureCount = (terrain) => picturesOf(terrain).single;

/**
 * @param {number} terrain 1-12.
 * @param {number} roll A hex's picture roll, 0 for the skin's own.
 * @returns {number} Which picture it shows, 0 for the skin's own. Those of groups follow the rest.
 */
export function pictureOf(terrain, roll) {
	const { single, places } = picturesOf(terrain);
	if (!(roll > PICTURE_ROLL)) return (roll || 0) % single;
	const picture = single - 1 + roll - PICTURE_ROLL;
	return picture < places.length ? picture : 0;
}

/**
 * @param {number} terrain 1-12.
 * @param {number} picture
 * @returns {number} A roll that shows that picture: up to PICTURE_ROLL for one shown on its own, on past it for one of a group's.
 */
export function rollFor(terrain, picture) {
	const { single } = picturesOf(terrain);
	return picture < single ? picture || single : PICTURE_ROLL + picture - single + 1;
}

/** @returns {boolean} Whether that picture is one of a group's, drawn on into the others'. */
const joined = (terrain, picture) => picture >= picturesOf(terrain).single;

/** @returns {{col: number, row: number}|null} The hex those steps lead to, or null past the Realm's edge. */
const walk = (g, hex, steps) => steps.reduce((at, direction) => at && neighbour(g, at, direction), hex);

/**
 * Where each of a group's pictures would go with one of them at a hex.
 * @returns {{hex: {col: number, row: number}|null, picture: number}[]} A null hex past the Realm's edge.
 */
const layGroup = (g, hex, terrain, picture) => picturesOf(terrain).reach.get(picture).map(({ picture: member, steps }) => ({ hex: walk(g, hex, steps), picture: member }));

/**
 * The hexes a group would cover with one of its pictures at a hex.
 * @returns {{hex: {col: number, row: number}, picture: number}[]|null} Null where it runs off the Realm.
 */
function groupFrom(g, hex, terrain, picture) {
	const laid = layGroup(g, hex, terrain, picture);
	return laid.every((member) => member.hex) ? laid : null;
}

/**
 * The other hexes of the group a hex's picture belongs to that still show
 * their part of it, and whether all of them do.
 * @param {object} g
 * @param {{terrain: number[], variants?: number[]}} realm
 * @param {{col: number, row: number}} hex
 * @returns {{hexes: number[], whole: boolean}|null} By hexIndex. Null for a picture that isn't one of a group's.
 */
function groupAt(g, realm, hex) {
	const index = hexIndex(g, hex);
	const terrain = realm.terrain[index];
	const picture = pictureOf(terrain, realm.variants?.[index]);
	if (!joined(terrain, picture)) return null;
	const laid = layGroup(g, hex, terrain, picture);
	const hexes = laid.flatMap(({ hex: at, picture: member }) => {
		if (!at) return [];
		const there = hexIndex(g, at);
		return realm.terrain[there] === terrain && pictureOf(terrain, realm.variants?.[there]) === member ? [there] : [];
	});
	return { hexes, whole: hexes.length === laid.length };
}

/**
 * @param {number[]} terrain A Realm's terrain, in `hexIndex` order.
 * @returns {number[]} A picture roll for each hex, all 0: none rolled yet, so each shows the skin's own.
 */
export const emptyVariants = (terrain) => new Array(terrain.length).fill(0);

/**
 * Hexes no group drawn as one may cover: a river or a Holding would cut through it.
 * @param {object} g
 * @param {{rivers?: {col: number, row: number}[][], holdings?: {hex: {col: number, row: number}}[]}} realm
 * @returns {Set<number>} By hexIndex.
 */
export const keptHexes = (g, realm) => new Set([...(realm.rivers ?? []).flat(), ...(realm.holdings ?? []).map((holding) => holding.hex)].map((hex) => hexIndex(g, hex)));

/**
 * @param {{hexes: number[], whole: boolean}} group From groupAt.
 * @param {number} index The hex it was found from.
 * @param {Set<number>} kept From keptHexes.
 * @returns {boolean} Whether it isn't all there, or a river or a Holding cuts through it.
 */
const comeApart = (group, index, kept) => !group.whole || kept.has(index) || group.hexes.some((there) => kept.has(there));

/**
 * @param {object} g
 * @param {{terrain: number[], variants?: number[], rivers?: object[][], holdings?: object[]}} realm
 * @returns {number[]} Hexes, by hexIndex, showing their part of a group that isn't all there, or that a river or a
 *   Holding cuts through.
 */
export function brokenPictures(g, realm) {
	const kept = keptHexes(g, realm);
	return allHexes(g).flatMap((hex) => {
		const group = groupAt(g, realm, hex);
		return group && comeApart(group, hexIndex(g, hex), kept) ? [hexIndex(g, hex)] : [];
	});
}

/**
 * How many of a hex's neighbours of the same terrain each picture would sit
 * beside as it did on the example map.
 * @param {object} g
 * @param {{terrain: number[], variants?: number[]}} realm
 * @param {{col: number, row: number}} hex
 * @param {number} terrain 1-12, what the hex is or is being painted.
 * @returns {number[]} By picture.
 */
function fits(g, realm, hex, terrain) {
	const { partners } = picturesOf(terrain);
	const counts = partners.map(() => 0);
	for (const { direction, hex: next } of neighbours(g, hex)) {
		const index = hexIndex(g, next);
		if (realm.terrain[index] !== terrain || !realm.variants?.[index]) continue;
		const theirs = pictureOf(terrain, realm.variants[index]);
		partners.forEach((list, picture) => {
			if (list.some((partner) => partner.direction === direction && partner.picture === theirs)) counts[picture] += 1;
		});
	}
	return counts;
}

/**
 * The roll for a hex to show on its own, newly given a terrain: one of the
 * pictures that sits as it did on the example map beside the most of its
 * neighbours. If none does, any picture its neighbours of that terrain don't
 * show, nor one traced from the same hex, so the same picture isn't drawn
 * twice side by side; where `open` names neighbours still to be rolled, one
 * with a partner on their side first, so a patch can grow from it.
 * @param {object} g
 * @param {{terrain: number[], variants?: number[]}} realm Holding the terrain the hex is getting.
 * @param {{col: number, row: number}} hex
 * @param {number} terrain 1-12.
 * @param {() => number} random From 0 up to 1.
 * @param {(hex: {col: number, row: number}) => boolean} [open]
 * @returns {number} From 1 to PICTURE_ROLL.
 */
export function pickPicture(g, realm, hex, terrain, random, open = () => false) {
	const { single, places, partners } = picturesOf(terrain);
	const counts = fits(g, realm, hex, terrain).slice(0, single);
	const kin = neighbours(g, hex).filter(({ hex: next }) => realm.terrain[hexIndex(g, next)] === terrain);
	const shown = kin.flatMap(({ hex: next }) => {
		const roll = realm.variants?.[hexIndex(g, next)];
		return roll ? [pictureOf(terrain, roll)] : [];
	});
	const alike = (picture) => shown.some((other) => other === picture || (places[other] !== null && places[other] === places[picture]));
	const unshown = counts.flatMap((_, picture) => (alike(picture) ? [] : [picture]));
	const pick = (choices) => rollFor(terrain, choices[Math.floor(random() * choices.length)]);

	const best = Math.max(...counts);
	if (best > 0) {
		const fitting = counts.flatMap((count, picture) => (count === best ? [picture] : []));
		const fresh = fitting.filter((picture) => !alike(picture));
		return pick(fresh.length ? fresh : fitting);
	}
	const sides = kin.filter(({ hex: next }) => open(next)).map(({ direction }) => direction);
	const growing = unshown.filter((picture) => partners[picture].some((partner) => sides.includes(partner.direction)));
	if (growing.length) return pick(growing);
	return shown.length && unshown.length ? pick(unshown) : rollPicture(random);
}

/**
 * The roll for a hex painted again with the terrain it has: the next picture
 * it can show on its own, those that sit as they did on the example map beside
 * the most of its neighbours first, so painting it over and over goes through
 * every one.
 * @param {object} g
 * @param {{terrain: number[], variants?: number[]}} realm
 * @param {{col: number, row: number}} hex
 * @param {number} [roll] The roll it had, if not the one it has now.
 * @returns {number} From 1 to PICTURE_ROLL.
 */
function nextPicture(g, realm, hex, roll = realm.variants?.[hexIndex(g, hex)]) {
	const terrain = realm.terrain[hexIndex(g, hex)];
	const counts = fits(g, realm, hex, terrain).slice(0, pictureCount(terrain));
	const order = counts.map((_, picture) => picture).sort((a, b) => counts[b] - counts[a] || a - b);
	const at = order.indexOf(pictureOf(terrain, roll));
	return rollFor(terrain, order[(at + 1) % order.length]);
}

/**
 * Give a hex its picture: a group laid whole with one of its pictures there,
 * where one fits on hexes `free` lets it have, or else one shown on its own.
 * @param {object} g
 * @param {{terrain: number[], variants: number[]}} realm Changed in place.
 * @param {{col: number, row: number}} hex
 * @param {() => number} random
 * @param {object} options
 * @param {(index: number) => boolean} options.free Whether a group may take the hex with that hexIndex.
 * @param {Map<number, Set<number>>} [options.laid] The groups already laid in the Realm, by terrain, none of which may be
 *   laid again; added to as one is. None where any group may be laid again.
 * @param {(hex: {col: number, row: number}) => boolean} [options.open] See pickPicture.
 */
function layHex(g, realm, hex, random, { free, laid, open }) {
	const index = hexIndex(g, hex);
	const terrain = realm.terrain[index];
	const { groups } = picturesOf(terrain);
	const laidAlready = laid?.get(terrain);
	const fitting = groups.flatMap((group, number) => (laidAlready?.has(number) ? [] : group)).flatMap((picture) => {
		const laid = groupFrom(g, hex, terrain, picture);
		const fits = laid?.every(({ hex: at }) => {
			const there = hexIndex(g, at);
			return realm.terrain[there] === terrain && (there === index || free(there));
		});
		return fits ? [laid] : [];
	});
	if (fitting.length) {
		const chosen = fitting[Math.floor(random() * fitting.length)];
		for (const { hex: at, picture } of chosen) realm.variants[hexIndex(g, at)] = rollFor(terrain, picture);
		if (!laid) return;
		if (!laid.has(terrain)) laid.set(terrain, new Set());
		laid.get(terrain).add(groups.findIndex((group) => group.includes(chosen[0].picture)));
		return;
	}
	realm.variants[index] = pickPicture(g, realm, hex, terrain, random, open);
}

/**
 * Pictures for hexes just painted, in the order they were painted. A hex
 * painted a new terrain gets a group laid with its hexes painted after it
 * where one fits, or else a picture of its own; one painted the terrain it
 * had moves on to its next picture. A group any of them belonged to has come
 * apart, so its other hexes are picked again too, as is any group already
 * broken or cut by a river or a Holding. No group is laid over one.
 * @param {object} g
 * @param {{terrain: number[], variants?: number[]}} was The Realm before it was painted.
 * @param {{terrain: number[], variants: number[], rivers?: object[][], holdings?: object[]}} realm Painted, with the
 *   pictures it had. Changed in place.
 * @param {{hex: {col: number, row: number}, same: boolean}[]} painted `same` where it had that terrain already.
 * @param {() => number} random
 */
export function paintPictures(g, was, realm, painted, random) {
	const before = [...realm.variants];
	const stepping = new Set(painted.flatMap(({ hex, same }) => (same ? [hexIndex(g, hex)] : [])));
	const again = new Set(painted.map(({ hex }) => hexIndex(g, hex)));
	const kept = keptHexes(g, realm);
	for (const { hex } of painted) {
		for (const mate of groupAt(g, was, hex)?.hexes ?? []) again.add(mate);
	}
	for (const hex of allHexes(g)) {
		const group = groupAt(g, realm, hex);
		if (group && comeApart(group, hexIndex(g, hex), kept)) for (const index of [hexIndex(g, hex), ...group.hexes]) again.add(index);
	}

	for (const index of again) realm.variants[index] = 0;
	const free = (index) => again.has(index) && !stepping.has(index) && !realm.variants[index] && !kept.has(index);
	const order = [...painted.map(({ hex }) => hex), ...allHexes(g).filter((hex) => again.has(hexIndex(g, hex)))];
	for (const hex of order) {
		const index = hexIndex(g, hex);
		if (realm.variants[index] || !realm.terrain[index]) continue;
		if (stepping.has(index)) realm.variants[index] = nextPicture(g, realm, hex, before[index]);
		else layHex(g, realm, hex, random, { free: kept.has(index) ? () => false : free });
	}
}

/**
 * Pick again the pictures of any group no longer laid whole, as when a
 * Realm's hexes are laid out another way and different hexes meet.
 * @param {object} g
 * @param {{terrain: number[], variants: number[]}} realm Changed in place.
 * @param {() => number} [random]
 */
export function mendPictures(g, realm, random = Math.random) {
	paintPictures(g, realm, realm, [], random);
}

/**
 * A picture roll for every hex of a Realm's terrain, a patch of one terrain at
 * a time, outward from its first hex, so each hex is matched to the
 * neighbours rolled before it. Each group drawn as one is laid at most once,
 * wherever it fits.
 * @param {object} g
 * @param {number[]} terrain In `hexIndex` order.
 * @param {() => number} random From 0 up to 1.
 * @param {Set<number>} [kept] Hexes, by hexIndex, no group may cover, such as those with a river or a Holding.
 * @returns {number[]} In `hexIndex` order: 0 where there's no terrain.
 */
export function rollPictures(g, terrain, random, kept = new Set()) {
	const realm = { terrain, variants: emptyVariants(terrain) };
	const laid = new Map();
	const queued = new Set();
	const open = (hex) => !realm.variants[hexIndex(g, hex)];
	const free = (index) => !realm.variants[index] && !kept.has(index);
	for (const start of allHexes(g)) {
		if (!terrain[hexIndex(g, start)] || queued.has(hexIndex(g, start))) continue;
		const queue = [start];
		queued.add(hexIndex(g, start));
		while (queue.length) {
			const hex = queue.shift();
			const index = hexIndex(g, hex);
			if (!realm.variants[index]) layHex(g, realm, hex, random, { free: kept.has(index) ? () => false : free, laid, open });
			for (const { hex: next } of neighbours(g, hex)) {
				const at = hexIndex(g, next);
				if (terrain[at] !== terrain[index] || queued.has(at)) continue;
				queued.add(at);
				queue.push(next);
			}
		}
	}
	return realm.variants;
}
