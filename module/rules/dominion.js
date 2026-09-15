/**
 * Dominion (p20) and Authority (p21): ruling a Holding as a Domain, with a
 * Council, Crises that last until resolved, and misrule when too many pile up.
 * The Crisis Roll, Increased Collections and Drama in Court read 1 as the
 * worst, 2-3 as middling and 4-6 as the best, like the Referee's other tables.
 * Wording lives in the language file under `bastionland.domain`. Pure, so it
 * can be tested without Foundry.
 */
import { d6Band } from "./referee-rolls.js";

/** Seats on a Domain's Council. */
export const COUNCIL_SEATS = Object.freeze(["steward", "marshal", "sheriff", "envoy", "circle"]);

/** The Crises, in the order a d6 rolls them. */
export const CRISES = Object.freeze(["chaos", "debt", "famine", "misery", "panic", "doubt"]);

export const CRISIS_RESULTS = Object.freeze(["calamity", "dilemma", "prosperity"]);
export const COLLECTION_RESULTS = Object.freeze(["misrule", "crisis", "willing"]);
export const DRAMA_RESULTS = Object.freeze(["personal", "association", "uninvolved"]);

/** A Season ending with this many unresolved Crises sends the Domain into misrule. */
const MISRULE_CRISES = 3;

/** Warbands a Seat of Power musters, and any other Holding. */
const MUSTER =Object.freeze({ seat: 3, holding: 2 });

/** @param {number} d6 */
export const crisisResult = (d6) => CRISIS_RESULTS[d6Band(d6)];

/** @param {number} d6 */
export const collectionsResult = (d6) => COLLECTION_RESULTS[d6Band(d6)];

/** @param {number} d6 */
export const dramaResult = (d6) => DRAMA_RESULTS[d6Band(d6)];

/**
 * @param {string} result One of CRISIS_RESULTS.
 * @returns {number} Crises drawn: a Calamity brings 2, a Dilemma offers 2 to choose between.
 */
export const crisesDrawn = (result) => (result === "prosperity" ? 0 : 2);

/**
 * The Crisis a d6 names. One the Domain already faces, or that was just drawn,
 * passes to the next down the list, so a roll brings a new Crisis while any are left.
 * @param {number} d6
 * @param {string[]} [taken]
 * @returns {string|null} Null when every Crisis is taken.
 */
export function crisisFor(d6, taken = []) {
	for (let step = 0; step < CRISES.length; step++) {
		const key = CRISES[(d6 - 1 + step) % CRISES.length];
		if (!taken.includes(key)) return key;
	}
	return null;
}

/**
 * @param {string[]} crises Those a Domain faces.
 * @returns {boolean} Whether ending the Season now sends it into misrule.
 */
export const isMisruleDue = (crises) => crises.length >= MISRULE_CRISES;

/**
 * @param {boolean} seat Whether the Holding is the Seat of Power.
 * @returns {number} Warbands it can muster.
 */
export const musterFor = (seat) => (seat ? MUSTER.seat : MUSTER.holding);
