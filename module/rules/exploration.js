/**
 * Exploration (p19): what the people of a Realm know, and what a Company sees
 * when it stops and looks about.
 *
 * Gathering Folklore: what someone knows of the Myths depends on who they are.
 * A Vassal knows the Myth nearest them and which way it lies, exactly where if
 * it borders their home, and the Landmarks in and around their home Hex.
 * Knights and Vagabonds, having travelled, know one Myth of the Realm picked at
 * random and roughly where it lies, and the nearest Landmark. Any of those has
 * heard warnings of danger, but nothing of how to escape or undo it. A Seer
 * knows every Myth, its secrets, weaknesses and location, and every Landmark
 * in the Realm.
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
import { featureAt, hexSummary, landmarkVariantOf, OWN_LANDMARK, terrainAt, TERRAIN } from "./realm.js";
import { landmarkSeen, landmarkToldOf } from "./landmarks.js";
import { barrierEdges, edgeDirection, edgeKey, hexDistance, hexLine, neighbours, sameHex } from "./realm-geometry.js";

/** Who the Company can ask, in the order the book lists them. */
export const FOLK_SOURCES = Object.freeze(["vassal", "roamer", "seer"]);

/** What a whole Phase of searching is spent on (p19). */
export const SEARCH_AIMS = Object.freeze(["sweep", "known", "vantage"]);

/** The Virtue a searching Save is rolled in is the Company's to choose (p19). */
export const SEARCH_SAVE_AIM = "known";

/** A Vassal knows precisely where a Myth lies when it's this close to home (p19). */
const ADJACENT = 1;

/**
 * @param {{distance: number}} place Where a Myth lies from a Vassal's home, as placeFrom gives it.
 * @returns {boolean} Whether the Vassal knows just where it is, not only which way it lies (p19).
 */
export const vassalKnowsExactly = (place) => place.distance <= ADJACENT;

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
 * The Landmarks the people of a Realm tell of (p19): not the Referee's own
 * markers, nor a Willow out of its Season.
 * @param {import("./realm.js").Realm} realm
 * @param {string|null} season Now.
 * @returns {object[]}
 */
const toldOf = (realm, season) => realm.landmarks.filter((landmark) => landmarkToldOf(landmark, season));

/**
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @param {object} [options]
 * @param {string|null} [options.season] Now, which a Willow stands in or doesn't.
 * @returns {object[]} Every Landmark told of at the shortest distance, in the order they're held.
 */
export function nearestLandmarks(realm, g, hex, { season = null } = {}) {
	const landmarks = toldOf(realm, season);
	if (!landmarks.length) return [];
	const closest = Math.min(...landmarks.map((landmark) => hexDistance(g, landmark.hex, hex)));
	return landmarks.filter((landmark) => hexDistance(g, landmark.hex, hex) === closest);
}

/**
 * The Landmarks of a hex and the ones around it, which is what a Vassal knows
 * of their home.
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @param {object} [options]
 * @param {string|null} [options.season] Now.
 * @returns {object[]}
 */
export function landmarksAbout(realm, g, hex, { season = null } = {}) {
	const about = [hex, ...neighbours(g, hex).map((step) => step.hex)];
	return toldOf(realm, season).filter((landmark) => about.some((candidate) => sameHex(candidate, landmark.hex)));
}

/**
 * Where a hex lies from the one somebody stands in.
 * @param {object} g
 * @param {{col: number, row: number}} home Where they're speaking from.
 * @param {{col: number, row: number}} hex
 * @returns {{distance: number, direction: number|null, here: boolean}}
 */
export function placeFrom(g, home, hex) {
	const distance = hexDistance(g, hex, home);
	return { distance, direction: directionFrom(g, home, hex), here: distance === 0 };
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
	return { number: myth.number, hex: myth.hex, ...placeFrom(g, home, myth.hex), precise };
}

/**
 * One Landmark as somebody describes it. Anybody who knows of a Landmark knows
 * where it stands, since the book has them know it by its place.
 * @param {object} g
 * @param {{col: number, row: number}} home
 * @param {object} landmark
 */
function landmarkKnown(g, home, landmark) {
	return {
		type: landmark.type,
		...landmarkVariantOf(landmark),
		name: landmark.name ?? "",
		hex: landmark.hex,
		...placeFrom(g, home, landmark.hex),
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
 * @property {number} landmarkChoices   How many Landmarks lie equally near a roamer, so a roll can pick the one they know.
 */

/**
 * What one person can tell the Company (p19).
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {object} options
 * @param {string} options.source  One of FOLK_SOURCES.
 * @param {{col: number, row: number}} options.home Where they're asked.
 * @param {number} [options.pick]  Which of the Myths they might have named this one is, from 0.
 * @param {number} [options.landmarkPick] Which of the equally near Landmarks a roamer knows, from 0.
 * @param {string|null} [options.season] Now, which a Willow stands in or doesn't.
 * @returns {Folklore|null} Null for somebody the Realm doesn't hold.
 */
export function folkloreFrom(realm, g, { source, home, pick = 0, landmarkPick = 0, season = null }) {
	if (!FOLK_SOURCES.includes(source)) return null;

	if (source === "seer") {
		// A Seer knows every Myth's rules, secrets and whereabouts, and every Landmark in the Realm.
		return {
			source,
			home,
			myths: [...realm.myths]
				.sort((a, b) => hexDistance(g, a.hex, home) - hexDistance(g, b.hex, home) || a.number - b.number)
				.map((myth) => mythKnown(g, home, myth, true)),
			// Every Landmark of the land, a Willow out of its Season too, though not the Referee's own markers.
			landmarks: realm.landmarks.filter((landmark) => landmark.type !== OWN_LANDMARK).map((landmark) => landmarkKnown(g, home, landmark)),
			rumours: false,
			secrets: true,
			mythChoices: 0,
			landmarkChoices: 0
		};
	}

	// A Vassal speaks of the Myth nearest their home; a roamer of any Myth of the Realm.
	const candidates = source === "vassal" ? nearestMyths(realm, g, home) : [...realm.myths].sort((a, b) => a.number - b.number);
	const myth = pickFrom(candidates, pick);
	// Where the Myth borders their home, they know exactly where it is.
	const precise = Boolean(myth) && source === "vassal" && vassalKnowsExactly(placeFrom(g, home, myth.hex));

	// A roamer knows the one nearest Landmark; several as near are settled by a die, as Myths are.
	const nearest = source === "vassal" ? [] : nearestLandmarks(realm, g, home, { season });
	const landmarks = source === "vassal" ? landmarksAbout(realm, g, home, { season }) : [pickFrom(nearest, landmarkPick)].filter(Boolean);
	return {
		source,
		home,
		myths: myth ? [mythKnown(g, home, myth, precise)] : [],
		landmarks: landmarks.map((landmark) => landmarkKnown(g, home, landmark)),
		rumours: true,
		secrets: false,
		mythChoices: candidates.length,
		landmarkChoices: nearest.length
	};
}

/**
 * @template T
 * @param {T[]} list
 * @param {number} pick From 0, held to the list.
 * @returns {T|null} Null for an empty list.
 */
const pickFrom = (list, pick) => list[Math.min(Math.max(0, pick), list.length - 1)] ?? null;

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
 * not what hides in those Hexes. Either finds the Hex's Landmark, but not one
 * that isn't found by looking: of the blog's, a Pond, a Grotto, or a Willow
 * out of its Season.
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @param {object} [options]
 * @param {boolean} [options.vantage]
 * @param {string|null} [options.season] Now.
 * @returns {Survey}
 */
export function surveyFrom(realm, g, hex, { vantage = false, season = null } = {}) {
	const barriers = barrierEdges(realm);
	const here = hexSummary(realm, g, hex, { showHidden: true });
	return {
		here: here.landmark && !landmarkSeen(here.landmark, season) ? { ...here, landmark: null } : here,
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
