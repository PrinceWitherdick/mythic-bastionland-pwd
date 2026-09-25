/**
 * Exploration (p19): what the people of a Realm know, and what a Company sees
 * when it stops and looks about.
 *
 * Gathering Folklore: "Everybody knows something about Myths. How much depends
 * on who they are." A Vassal knows their nearest Myth and its general
 * direction, precisely where it lies if it is adjacent to their home, and the
 * Landmarks in their home and neighbouring Hexes. Knights and Vagabonds have
 * roamed enough to know a random Myth of the Realm and its rough direction,
 * and the nearest Landmark. All of those know rumours that warn of dangers,
 * but not how to avoid or undo them. A Seer knows every Myth, its secrets,
 * weaknesses and location, and every Landmark in the Realm.
 *
 * Searching and Vision: a whole Phase sweeps a Hex, searches it for something
 * known to be there, or reaches a vantage point, from which the Hex can be
 * taken in and a general sense had of what lies in the neighbouring ones. The
 * neighbours give up their land and the Barriers between, since those are the
 * shape of the country, but not the Myths and Landmarks hidden in them, which
 * are "specific details" the book keeps for the Wilderness Roll.
 *
 * Pure, so it can be tested without Foundry; the language file puts words to it.
 */
import { featureAt, hexSummary, terrainAt, TERRAIN } from "./realm.js";
import { edgeDirection, edgeKey, hexDistance, hexLine, neighbours, sameHex } from "./realm-geometry.js";

/** Who the Company can ask, in the order the book lists them. */
export const FOLK_SOURCES = Object.freeze(["vassal", "roamer", "seer"]);

/** What a whole Phase of searching is spent on (p19). */
export const SEARCH_AIMS = Object.freeze(["sweep", "known", "vantage"]);

/** The Virtue a searching Save is rolled in is the Company's to choose (p19). */
export const SEARCH_SAVE_AIM = "known";

/** A Vassal knows precisely where a Myth lies when it's this close to home. */
const ADJACENT = 1;

/**
 * Which way a distant hex lies: the first step of the straight line to it,
 * which is the "general direction" a Vassal or a roamer can give.
 * @param {object} g
 * @param {{col: number, row: number}} from
 * @param {{col: number, row: number}} to
 * @returns {number|null} An index into DIRECTIONS, or null for the hex you stand in.
 */
export function directionFrom(g, from, to) {
	if (sameHex(from, to)) return null;
	const [step] = hexLine(g, from, to);
	return step ? edgeDirection(g, from, step) : null;
}

/**
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @returns {object[]} Every Myth at the shortest distance from the hex, by number.
 */
export function nearestMyths(realm, g, hex) {
	if (!realm.myths.length) return [];
	const closest = Math.min(...realm.myths.map((myth) => hexDistance(g, myth.hex, hex)));
	return realm.myths.filter((myth) => hexDistance(g, myth.hex, hex) === closest).sort((a, b) => a.number - b.number);
}

/**
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @returns {object[]} Every Landmark at the shortest distance, in the order they're held.
 */
export function nearestLandmarks(realm, g, hex) {
	if (!realm.landmarks.length) return [];
	const closest = Math.min(...realm.landmarks.map((landmark) => hexDistance(g, landmark.hex, hex)));
	return realm.landmarks.filter((landmark) => hexDistance(g, landmark.hex, hex) === closest);
}

/**
 * The Landmarks of a hex and the ones around it, which is what a Vassal knows
 * of their home.
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @returns {object[]}
 */
export function landmarksAbout(realm, g, hex) {
	const about = [hex, ...neighbours(g, hex).map((step) => step.hex)];
	return realm.landmarks.filter((landmark) => about.some((candidate) => sameHex(candidate, landmark.hex)));
}

/**
 * One Myth as somebody describes it: where it lies if they know that, and
 * which way it lies if they only know the direction.
 * @param {object} g
 * @param {{col: number, row: number}} home Where they're speaking from.
 * @param {object} myth
 * @param {boolean} precise Whether they know its precise location.
 * @returns {{number: number, hex: object, distance: number, direction: number|null, precise: boolean, here: boolean}}
 */
function mythKnown(g, home, myth, precise) {
	const distance = hexDistance(g, myth.hex, home);
	return {
		number: myth.number,
		hex: myth.hex,
		distance,
		direction: directionFrom(g, home, myth.hex),
		precise,
		here: distance === 0
	};
}

/**
 * One Landmark as somebody describes it. Anybody who knows of a Landmark knows
 * where it stands, since the book has them know it by its place.
 * @param {object} g
 * @param {{col: number, row: number}} home
 * @param {object} landmark
 */
function landmarkKnown(g, home, landmark) {
	const distance = hexDistance(g, landmark.hex, home);
	return {
		type: landmark.type,
		name: landmark.name ?? "",
		hex: landmark.hex,
		distance,
		direction: directionFrom(g, home, landmark.hex),
		here: distance === 0,
		revealed: Boolean(landmark.revealed)
	};
}

/**
 * @typedef {object} Folklore
 * @property {string} source            One of FOLK_SOURCES.
 * @property {{col: number, row: number}} home Where they're asked, and what they know it from.
 * @property {object[]} myths           What they know of the Myths.
 * @property {object[]} landmarks       What they know of the Landmarks.
 * @property {boolean} rumours          Warnings of danger without the means to undo it (Vassals and roamers).
 * @property {boolean} secrets          A Seer's knowledge of rules, secrets, weaknesses and cures.
 * @property {number} mythChoices       How many Myths the teller might have named, so a roll can pick one.
 */

/**
 * What one person can tell the Company (p19).
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {object} options
 * @param {string} options.source  One of FOLK_SOURCES.
 * @param {{col: number, row: number}} options.home Where they're asked.
 * @param {number} [options.pick]  Which of the Myths they might have named this one is, from 0.
 * @returns {Folklore|null} Null for somebody the Realm doesn't hold.
 */
export function folkloreFrom(realm, g, { source, home, pick = 0 }) {
	if (!FOLK_SOURCES.includes(source)) return null;

	if (source === "seer") {
		// "Seers know the rules of all Myths, their secrets, and their locations",
		// and all Landmarks in the Realm.
		return {
			source,
			home,
			myths: [...realm.myths]
				.sort((a, b) => hexDistance(g, a.hex, home) - hexDistance(g, b.hex, home) || a.number - b.number)
				.map((myth) => mythKnown(g, home, myth, true)),
			landmarks: realm.landmarks.map((landmark) => landmarkKnown(g, home, landmark)),
			rumours: false,
			secrets: true,
			mythChoices: 0
		};
	}

	// A Vassal speaks of the Myth nearest their home; a roamer of any Myth of the Realm.
	const candidates = source === "vassal" ? nearestMyths(realm, g, home) : [...realm.myths].sort((a, b) => a.number - b.number);
	const myth = candidates[Math.min(Math.max(0, pick), candidates.length - 1)] ?? null;
	// "If it is adjacent to their home then they know its precise location."
	const precise = Boolean(myth) && source === "vassal" && hexDistance(g, myth.hex, home) <= ADJACENT;

	const landmarks = source === "vassal" ? landmarksAbout(realm, g, home) : nearestLandmarks(realm, g, home).slice(0, 1);
	return {
		source,
		home,
		myths: myth ? [mythKnown(g, home, myth, precise)] : [],
		landmarks: landmarks.map((landmark) => landmarkKnown(g, home, landmark)),
		rumours: true,
		secrets: false,
		mythChoices: candidates.length
	};
}

/**
 * What the Company can be shown of what it was told: a Myth whose place the
 * teller knew, and every Landmark named, since a Landmark is known by its place.
 * @param {Folklore|null} folklore
 * @returns {{myths: object[], landmarks: object[]}} Those that can be marked on the players' map.
 */
export function folkloreToMark(folklore) {
	if (!folklore) return { myths: [], landmarks: [] };
	return {
		myths: folklore.myths.filter((myth) => myth.precise),
		landmarks: folklore.landmarks.filter((landmark) => !landmark.revealed)
	};
}

/**
 * @typedef {object} Survey What a Company sees of the land, from a sweep or a vantage point.
 * @property {object} here            The hex they stand in, from hexSummary.
 * @property {{direction: number, hex: object, terrain: string|null, edge: string,
 *   barrier: boolean, holding: object|null}[]} around  The neighbouring hexes, empty for a sweep of one hex.
 * @property {boolean} vantage        Whether it was seen from a vantage point.
 */

/**
 * A sweep of the hex the Company stands in, or the wider look a vantage point
 * gives (p19). A sweep takes in the whole Hex, so the Referee sees what it
 * holds; a vantage adds the land around and the Barriers hemming it in, but
 * not what hides in those Hexes.
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @param {object} [options]
 * @param {boolean} [options.vantage]
 * @returns {Survey}
 */
export function surveyFrom(realm, g, hex, { vantage = false } = {}) {
	const barriers = new Set(realm.barriers.map((barrier) => barrier.edge));
	return {
		here: hexSummary(realm, g, hex, { showHidden: true }),
		vantage,
		around: vantage
			? neighbours(g, hex).map(({ direction, hex: next }) => {
				const terrain = terrainAt(realm, g, next);
				// The edge is kept on the step, so barriersSeen names it the same way this did.
				const edge = edgeKey(hex, next);
				return {
					direction,
					hex: next,
					terrain: terrain ? TERRAIN[terrain - 1] ?? null : null,
					edge,
					barrier: barriers.has(edge),
					holding: featureAt(realm, next).holding
				};
			})
			: []
	};
}

/**
 * The Barriers a vantage point puts in plain sight, so they can be marked on
 * the players' map: they hem in the hex the Company stands in.
 * @param {Survey} survey
 * @returns {string[]} Edge keys.
 */
export const barriersSeen = (survey) =>
	survey.around.filter((step) => step.barrier).map((step) => step.edge);
