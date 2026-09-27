import { isSameName } from "./dominion.js";
import { seasonKey } from "./time.js";

/**
 * The Scar table (Harm & Scars, p9). Re-roll the die that caused the Scar and
 * read the matching entry. Wording lives in the language file under
 * `bastionland.scars.<key>`; this table holds only what the code acts on.
 *
 * - `loss`: Virtue Loss taken at once.
 * - `detail`: a follow-up d6 naming where the Scar landed.
 * - `guardAtMost`: if max GD is this or less, it rises by d6 at once.
 * - `laterGuardAtMost`: the same, but only once a condition in the text is met,
 *   so it is recorded on the Scar rather than applied.
 * - `bySeason`: that condition is the next Season, so turning the Season settles it.
 * - `byTending`: that condition is being stitched or patched up, so tending the wounds settles it.
 * - `byRevenge`: that condition is revenge, so the foe who dealt it being brought down offers to settle it.
 */
export const SCARS = Object.freeze([
	{ roll: 1, key: "distress", loss: { virtue: "spi", formula: "1d6" } },
	{ roll: 2, key: "disfigurement", detail: true, guardAtMost: 2 },
	{ roll: 3, key: "smash", loss: { virtue: "vig", formula: "1d6" } },
	{ roll: 4, key: "stun", loss: { virtue: "cla", formula: "1d6" }, guardAtMost: 4 },
	{ roll: 5, key: "rupture", loss: { virtue: "vig", formula: "2d6" } },
	{ roll: 6, key: "gouge", laterGuardAtMost: 6, byTending: true },
	{ roll: 7, key: "concussion", loss: { virtue: "cla", formula: "2d6" } },
	{ roll: 8, key: "tear", detail: true, laterGuardAtMost: 8, byTending: true },
	{ roll: 9, key: "agony", loss: { virtue: "spi", formula: "2d6" } },
	{ roll: 10, key: "mutilation", detail: true, laterGuardAtMost: 10, bySeason: true },
	{ roll: 11, key: "doom" },
	{ roll: 12, key: "humiliation", laterGuardAtMost: 12, byRevenge: true }
].map((scar) => Object.freeze(scar)));

/**
 * @param {number} roll
 * @returns {object|null} The Scar for that roll, or null outside 1-12.
 */
export function scarForRoll(roll) {
	return SCARS.find((scar) => scar.roll === roll) ?? null;
}

/**
 * Whether a Scar raises max GD right now.
 * @param {object} scar     An entry from SCARS.
 * @param {number} maxGuard The Knight's max GD before the Scar.
 * @returns {boolean}
 */
export function scarRaisesGuardNow(scar, maxGuard) {
	return scar.guardAtMost !== undefined && maxGuard <= scar.guardAtMost;
}

/**
 * @typedef {object} RecordedScar A Scar item's data.
 * @property {number|null} roll
 * @property {boolean} [resolved] Its delayed GD increase has been settled.
 * @property {string} [season]    When it was taken, from seasonKey.
 * @property {string} [foe]       A Humiliation's dealer, by actor UUID.
 * @property {string} [foeName]   Their name, which can be typed in by hand.
 */

/**
 * Whether a recorded Scar still waits to settle a GD increase.
 * @param {RecordedScar} scar
 * @returns {boolean}
 */
export function isScarPending(scar) {
	return !scar?.resolved && scarForRoll(scar?.roll)?.laterGuardAtMost !== undefined;
}

/**
 * Whether a recorded Scar waits on its bearer being stitched or patched up: a
 * Gouge or a Tear not yet settled.
 * @param {RecordedScar} scar
 * @returns {boolean}
 */
export const settlesByTending = (scar) => isScarPending(scar) && Boolean(scarForRoll(scar.roll)?.byTending);

/**
 * Whether bringing somebody down may be the revenge a recorded Scar waits on: a
 * Humiliation not yet settled that names them, by UUID or, typed in by hand, by name.
 * @param {RecordedScar} scar
 * @param {{uuid: string, name: string}} foe Whoever was just brought down.
 * @returns {boolean}
 */
export function awaitsRevengeOn(scar, foe) {
	if (!isScarPending(scar) || !scarForRoll(scar.roll)?.byRevenge) return false;
	if (scar.foe && scar.foe === foe?.uuid) return true;
	return isSameName(scar.foeName, foe?.name);
}

/**
 * Whether settling a recorded Scar raises max GD: only while it's at or under the entry's limit.
 * @param {RecordedScar} scar
 * @param {number} maxGuard
 * @returns {boolean}
 */
export function scarRaisesGuardLater(scar, maxGuard) {
	const limit = scarForRoll(scar?.roll)?.laterGuardAtMost;
	return limit !== undefined && maxGuard <= limit;
}

/**
 * Whether Doom haunts a character: a Doom Scar taken this Season means a
 * Mortal Wound Slays them instead.
 * @param {RecordedScar[]} scars
 * @param {import("./time.js").Calendar} calendar
 * @returns {boolean}
 */
export function isDoomed(scars, calendar) {
	const now = seasonKey(calendar);
	return scars.some((scar) => scarForRoll(scar?.roll)?.key === "doom" && scar.season === now);
}
