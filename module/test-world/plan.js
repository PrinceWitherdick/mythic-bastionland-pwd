/**
 * A fake game of Mythic Bastionland, five Seasons in, for seeing what the
 * sheets, the GM Toolkit and a Realm look like once a campaign has been going
 * a while. This is the pure half: which places the Company goes to and by
 * what road, what a Knight's Property turns into, and their arms. The
 * "(TEST ONLY) Populate World" macro runs populate.js, which plays it out in
 * the world. Pure, so it can be tested without Foundry.
 */
import { CHARGE_SCALE, tintCharge } from "../rules/heraldry-charges.js";
import { FESS_POINT, SHIELD_HEIGHT, SHIELD_PATH, SHIELD_WIDTH, divisionOf, tinctureColor } from "../rules/heraldry.js";
import { LAKE, terrainAt } from "../rules/realm.js";
import { edgeKey, hexDistance, hexKey, neighbours, sameHex } from "../rules/realm-geometry.js";

export { armourKind, companionActorData, isSteed, propertyItems } from "../rules/property.js";

/* -------------------------------------------- */
/*  Heraldry                                    */
/* -------------------------------------------- */

/**
 * @typedef {object} Arms
 * @property {string|null} division One of DIVISIONS' keys, or null for a plain field.
 * @property {string[]} field The tincture of each of the division's groups, in group order.
 * @property {{svg: string, tincture: string}|null} [charge] A charge's file as shipped, and its tincture.
 */

/**
 * A Knight's arms as the heraldry painter would paint them: the field, its
 * division, and a charge at the fess point, all inside the shield.
 * @param {Arms} arms
 * @param {{width: number, height: number}} size In pixels, the size of the painter's painting.
 * @returns {string} An SVG document.
 */
export function heraldrySvg({ division = null, field, charge = null }, { width, height }) {
	const scale = ([x, y]) => `${x * SHIELD_WIDTH},${y * SHIELD_HEIGHT}`;
	const parts = divisionOf(division)?.parts ?? null;
	const ground = parts
		? parts.map(({ group, points }) => `<polygon points="${points.map(scale).join(" ")}" fill="${tinctureColor(field[group] ?? field[0])}"/>`).join("")
		: `<rect width="${SHIELD_WIDTH}" height="${SHIELD_HEIGHT}" fill="${tinctureColor(field[0])}"/>`;
	let bearing = "";
	if (charge?.svg) {
		// The charge fills its box as the painter fits one, centred on the fess point.
		const tinted = tintCharge(charge.svg, tinctureColor(charge.tincture))
			.replace(/^<svg\b[^>]*>/, (root) => root.replace(/\swidth="[^"]*"/, ' width="100%"').replace(/\sheight="[^"]*"/, ' height="100%"'));
		const boxWidth = SHIELD_WIDTH * CHARGE_SCALE;
		const boxHeight = SHIELD_HEIGHT * CHARGE_SCALE;
		const x = SHIELD_WIDTH / 2 - boxWidth / 2;
		const y = SHIELD_HEIGHT * FESS_POINT - boxHeight / 2;
		bearing = `<svg x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}">${tinted}</svg>`;
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${SHIELD_WIDTH} ${SHIELD_HEIGHT}" preserveAspectRatio="none">`
		+ `<defs><clipPath id="shield"><path d="${SHIELD_PATH}"/></clipPath></defs>`
		+ `<g clip-path="url(#shield)">${ground}${bearing}</g></svg>`;
}

/* -------------------------------------------- */
/*  The Company's road                          */
/* -------------------------------------------- */

/** How many hexes the Company covers in a day of travel: one in the Morning, one in the Afternoon. */
export const HEXES_PER_DAY = 2;

/** @returns {number} Top to bottom, then left to right. */
const byPlace = (a, b) => a.row - b.row || a.col - b.col;

/**
 * @template {{hex: {col: number, row: number}}} T
 * @param {object} g
 * @param {T[]} list
 * @param {{col: number, row: number}} to
 * @returns {T[]} Nearest first, ties broken by place.
 */
const nearestTo = (g, list, to) => [...list].sort((a, b) => hexDistance(g, a.hex, to) - hexDistance(g, b.hex, to) || byPlace(a.hex, b.hex));

/**
 * The places the Company's story goes through. Each is picked from the Realm
 * so that the whole road can be walked, and is null where the Realm has none.
 * @param {import("../rules/realm.js").Realm} realm
 * @param {object} g
 * @returns {{seat: object|null, sanctum: object|null, ruin: object|null, dwelling: object|null, monument: object|null,
 *   tourney: object|null, domain: object|null, myths: object[]}} `myths` in the order the Company meets them.
 */
export function pickPlaces(realm, g) {
	const seat = realm.holdings.find((holding) => holding.seat) ?? realm.holdings[0] ?? null;
	const home = seat?.hex ?? { col: 1, row: 1 };
	const landmarks = (type) => realm.landmarks.filter((landmark) => landmark.type === type);
	const sanctum = nearestTo(g, landmarks("sanctum").filter((landmark) => landmark.seer), home)[0] ?? nearestTo(g, landmarks("sanctum"), home)[0] ?? null;
	const ruin = nearestTo(g, landmarks("ruin"), sanctum?.hex ?? home)[0] ?? null;
	const dwelling = nearestTo(g, landmarks("dwelling"), home)[0] ?? null;
	const monument = nearestTo(g, landmarks("monument"), ruin?.hex ?? home)[0] ?? null;

	const others = nearestTo(g, realm.holdings.filter((holding) => holding !== seat), ruin?.hex ?? home);
	const tourney = others.find((holding) => ["town", "castle"].includes(holding.style)) ?? others[0] ?? null;
	const domain = others.find((holding) => holding !== tourney) ?? null;

	const first = nearestTo(g, realm.myths, tourney?.hex ?? home)[0] ?? null;
	const rest = realm.myths.filter((myth) => myth !== first);
	const second = nearestTo(g, rest, domain?.hex ?? home)[0] ?? null;
	const third = nearestTo(g, rest.filter((myth) => myth !== second), second?.hex ?? home)[0] ?? null;
	return { seat, sanctum, ruin, dwelling, monument, tourney, domain, myths: [first, second, third].filter(Boolean) };
}

/**
 * The shortest road between two hexes that crosses no Barrier (p18), keeping
 * out of lakes where it can.
 * @param {import("../rules/realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}} from
 * @param {{col: number, row: number}} to
 * @returns {{col: number, row: number}[]} The hexes after `from`, up to and including `to`. Empty when they're the same.
 */
export function realmRoad(realm, g, from, to) {
	if (sameHex(from, to)) return [];
	const barriers = new Set(realm.barriers.map((barrier) => barrier.edge));
	const search = (dry) => {
		const cameFrom = new Map([[hexKey(from), null]]);
		const queue = [from];
		while (queue.length) {
			const hex = queue.shift();
			if (sameHex(hex, to)) break;
			for (const { hex: next } of neighbours(g, hex)) {
				const key = hexKey(next);
				if (cameFrom.has(key) || barriers.has(edgeKey(hex, next))) continue;
				if (dry && !sameHex(next, to) && terrainAt(realm, g, next) === LAKE) continue;
				cameFrom.set(key, hex);
				queue.push(next);
			}
		}
		if (!cameFrom.has(hexKey(to))) return null;
		const road = [];
		for (let hex = to; hex && !sameHex(hex, from); hex = cameFrom.get(hexKey(hex))) road.unshift(hex);
		return road;
	};
	return search(true) ?? search(false) ?? [];
}

/**
 * @typedef {object} RoadStep
 * @property {{col: number, row: number}} hex
 * @property {string|null} arrive The stop reached there, or null on the way.
 */

/**
 * A Season's travel, a day at a time: the road to each of its stops in turn,
 * two hexes a day.
 * @param {import("../rules/realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}} from Where the Company is as the Season begins.
 * @param {{name: string, hex: {col: number, row: number}}[]} stops
 * @param {object} [options]
 * @param {boolean} [options.stopShort] End a hex before the last stop, still on the road to it.
 * @returns {{days: RoadStep[][], end: {col: number, row: number}}}
 */
export function seasonRoad(realm, g, from, stops, { stopShort = false } = {}) {
	const steps = [];
	let here = from;
	for (const [index, stop] of stops.entries()) {
		const road = realmRoad(realm, g, here, stop.hex);
		const last = index === stops.length - 1;
		const walked = last && stopShort ? road.slice(0, -1) : road;
		walked.forEach((hex, step) => steps.push({ hex, arrive: step === road.length - 1 ? stop.name : null }));
		if (walked.length) here = walked.at(-1);
	}
	const days = [];
	for (let index = 0; index < steps.length; index += HEXES_PER_DAY) days.push(steps.slice(index, index + HEXES_PER_DAY));
	return { days, end: here };
}

/**
 * Barriers beside the road the Company has walked, which it would have found
 * barring its way. Those already revealed are left out.
 * @param {import("../rules/realm.js").Realm} realm
 * @param {{col: number, row: number}[]} walked
 * @returns {string[]} Their edge keys, in the order the road reaches them.
 */
export function barriersBeside(realm, walked) {
	const found = [];
	for (const hex of walked) {
		const key = hexKey(hex);
		for (const barrier of realm.barriers) {
			if (barrier.revealed || found.includes(barrier.edge)) continue;
			if (barrier.edge.split("|").includes(key)) found.push(barrier.edge);
		}
	}
	return found;
}
