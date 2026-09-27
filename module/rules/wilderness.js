/**
 * The Wilderness Roll (Travel, p18). When the Company ends a Phase in the
 * Wilderness the Referee rolls a d6: on a 1 the next Omen of a random Myth,
 * on 2-3 the next Omen of the nearest Myth, on 4-6 the hex's Landmark, or all
 * clear. Ending a Phase in a Myth's own hex reveals its next Omen with no roll,
 * camping ignores Landmarks, and a Holding isn't Wilderness. Pure, so it can be
 * tested without Foundry.
 */
import { OMEN_COUNT, featureAt } from "./realm.js";
import { hexDistance, hexKey } from "./realm-geometry.js";

/** Why the Company is out: ending a travelling Phase, or sleeping outdoors. */
export const WILDERNESS_MODES = Object.freeze(["travel", "camp"]);

/** What a Wilderness Roll comes to. Wording lives under `bastionland.realm.wilderness.results`. */
export const WILDERNESS_RESULTS = Object.freeze(["holding", "mythHex", "randomOmen", "nearestOmen", "landmark", "allClear", "noMyths"]);

/**
 * What's in and around a hex that a Wilderness Roll cares about.
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @returns {{hex: object, holding: object|null, myth: object|null, landmark: object|null, nearest: object[]}}
 *   `nearest` is every Myth at the shortest distance, by number.
 */
export function wildernessSituation(realm, g, hex) {
	const { holding, myth, landmark } = featureAt(realm, hex);
	const closest = Math.min(...realm.myths.map((candidate) => hexDistance(g, candidate.hex, hex)));
	const nearest = realm.myths
		.filter((candidate) => hexDistance(g, candidate.hex, hex) === closest)
		.sort((a, b) => a.number - b.number);
	return { hex, holding, myth, landmark, nearest };
}

/**
 * @param {ReturnType<typeof wildernessSituation>} situation
 * @returns {boolean} Whether the d6 is rolled at all.
 */
export const needsWildernessRoll = (situation) => !situation.holding && !situation.myth;

/**
 * What ending a Phase where the Company stands calls for (p18): nothing in a
 * Holding, which isn't Wilderness; a Myth's next Omen in its own hex, with no
 * roll; the Wilderness Roll anywhere else.
 * @param {ReturnType<typeof wildernessSituation>} situation
 * @returns {"none"|"omen"|"roll"}
 */
export function phaseEndCalls(situation) {
	if (situation.holding) return "none";
	return situation.myth ? "omen" : "roll";
}


/**
 * @param {number} d6
 * @param {object} [options]
 * @param {"travel"|"camp"} [options.mode]
 * @param {boolean} [options.hasLandmark]
 * @param {boolean} [options.hasMyths]
 * @returns {"randomOmen"|"nearestOmen"|"landmark"|"allClear"|"noMyths"}
 */
export function wildernessResult(d6, { mode = "travel", hasLandmark = false, hasMyths = true } = {}) {
	if (d6 <= 3) {
		if (!hasMyths) return "noMyths";
		return d6 === 1 ? "randomOmen" : "nearestOmen";
	}
	return mode === "travel" && hasLandmark ? "landmark" : "allClear";
}

/**
 * The Omen a Myth shows next. Each Myth's Omens come in order, the first
 * encounter always Omen 1.
 * @param {{omen: number}} myth How many of its Omens have been seen.
 * @returns {{omen: number, complete: boolean}} `complete` when all its Omens have already been seen.
 */
export function nextOmen(myth) {
	const seen = Math.max(0, Number(myth.omen) || 0);
	return seen >= OMEN_COUNT ? { omen: OMEN_COUNT, complete: true } : { omen: seen + 1, complete: false };
}

/**
 * Everything a Wilderness Roll turned up.
 * @param {import("./realm.js").Realm} realm
 * @param {ReturnType<typeof wildernessSituation>} situation
 * @param {object} rolled
 * @param {"travel"|"camp"} [rolled.mode]
 * @param {number|null} [rolled.d6] Null where no roll was needed.
 * @param {number} [rolled.pick] Which Myth, counted from 0, a random Omen or a tie for nearest falls to.
 * @returns {{result: string, d6: number|null, myth?: object, omen?: number, complete?: boolean, tied?: object[], landmark?: object}}
 */
export function wildernessOutcome(realm, situation, { mode = "travel", d6 = null, pick = 0 } = {}) {
	if (situation.holding) return { result: "holding", d6: null };
	if (situation.myth) return { result: "mythHex", d6: null, myth: situation.myth, ...nextOmen(situation.myth) };

	const result = wildernessResult(d6, { mode, hasLandmark: Boolean(situation.landmark), hasMyths: realm.myths.length > 0 });
	if (result === "randomOmen") {
		const myths = [...realm.myths].sort((a, b) => a.number - b.number);
		const myth = myths[pick % myths.length];
		return { result, d6, myth, ...nextOmen(myth) };
	}
	if (result === "nearestOmen") {
		const myth = situation.nearest[pick % situation.nearest.length];
		const tied = situation.nearest.length > 1 ? situation.nearest : null;
		return { result, d6, myth, tied, ...nextOmen(myth) };
	}
	if (result === "landmark") return { result, d6, landmark: situation.landmark };
	return { result, d6 };
}

/**
 * How many Myths a random Omen or a tie chooses between, so the roll that picks one can be made.
 * @param {import("./realm.js").Realm} realm
 * @param {ReturnType<typeof wildernessSituation>} situation
 * @param {string} result From wildernessResult.
 * @returns {number} 1 when there's no choice to make.
 */
export function mythChoices(realm, situation, result) {
	if (result === "randomOmen") return Math.max(1, realm.myths.length);
	if (result === "nearestOmen") return Math.max(1, situation.nearest.length);
	return 1;
}

/**
 * Where the Company is, from the hexes its Tokens stand in.
 * @param {({col: number, row: number}|null)[]} hexes
 * @returns {{hex: {col: number, row: number}|null, split: boolean}} The hex most of them share, and
 *   whether they're spread over more than one.
 */
export function companyHex(hexes) {
	const counts = new Map();
	for (const hex of hexes) {
		if (!hex) continue;
		const key = hexKey(hex);
		counts.set(key, { hex, count: (counts.get(key)?.count ?? 0) + 1 });
	}
	let best = null;
	for (const entry of counts.values()) {
		if (!best || entry.count > best.count) best = entry;
	}
	return { hex: best?.hex ?? null, split: counts.size > 1 };
}
