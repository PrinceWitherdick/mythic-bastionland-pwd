/**
 * What comes with the end of a Phase of the day (Travel, p18): where and how
 * the Company spent it, the Wilderness Roll that follows in the Wilderness,
 * and, as the Night ends and Morning comes, what the Night cost each of them.
 * Pure, so it can be tested without Foundry.
 */

/**
 * How the Company spent a Phase: on the move (travelling or exploring),
 * sleeping outdoors, or indoors as guests. Wording lives under
 * `bastionland.phaseEnd.modes`.
 */
export const PHASE_END_MODES = Object.freeze(["travel", "camp", "indoors"]);

/**
 * How a Company most likely spent a Phase that is ending: travelling by day,
 * asleep outdoors through the Night unless it was seen on the move, indoors in
 * a Holding, and on the move wherever a Barrier turned it back.
 * @param {object} options
 * @param {string} options.phase The Phase ending, one of PHASES in rules/time.js.
 * @param {boolean} [options.holding] Whether the Company stands in a Holding.
 * @param {boolean} [options.atBarrier] Whether the Phase was wasted trying to cross a Barrier.
 * @param {boolean} [options.movedTonight] Whether the Company moved to a new Hex this Night.
 * @returns {"travel"|"camp"|"indoors"}
 */
export function likelyPhaseMode({ phase, holding = false, atBarrier = false, movedTonight = false }) {
	if (atBarrier) return "travel";
	if (holding) return "indoors";
	if (phase === "night") return movedTonight ? "travel" : "camp";
	return "travel";
}

/**
 * Whether the Wilderness Roll, or a Myth's Omen in its own hex, comes as the
 * Phase ends (p18). Sleeping indoors makes no roll, and a Holding isn't
 * Wilderness, but a Phase wasted at a Barrier was spent out at it.
 * @param {object} options
 * @param {"none"|"omen"|"roll"|null} options.calls From phaseEndCalls, or null where no Realm shows the Company.
 * @param {string} options.mode One of PHASE_END_MODES.
 * @param {boolean} [options.atBarrier]
 * @returns {boolean}
 */
export function wildernessDue({ calls, mode, atBarrier = false }) {
	if (!calls) return false;
	if (atBarrier) return true;
	return mode !== "indoors" && calls !== "none";
}

/**
 * What one of the Company loses as Morning comes, by the HARDSHIPS of rules/time.js
 * (p18): d6 SPI for travelling or exploring through the Night, d6 VIG for
 * a Winter night camped out or on the road, d6 CLA without proper sleep, and
 * d6 VIG where essential needs were deprived. Travelling through the Night
 * leaves no time for sleep, and dire weather lets nobody outdoors sleep properly.
 * @param {object} night
 * @param {string} night.mode How the Company spent the Night, one of PHASE_END_MODES.
 * @param {boolean} [night.winter]
 * @param {boolean} [night.dire] Whether the Night's weather was dire.
 * @param {object} [member]
 * @param {boolean} [member.noSleep] Kept from proper sleep otherwise, as by a hostile Omen.
 * @param {boolean} [member.deprived] Deprived of essential needs.
 * @returns {string[]} HARDSHIPS keys, each a d6 to roll.
 */
export function morningHardships({ mode, winter = false, dire = false }, { noSleep = false, deprived = false } = {}) {
	const outdoors = mode !== "indoors";
	const kinds = [];
	if (mode === "travel") kinds.push("night");
	if (winter && outdoors) kinds.push("winter");
	if (noSleep || mode === "travel" || (dire && outdoors)) kinds.push("sleep");
	if (deprived) kinds.push("supplies");
	return kinds;
}
