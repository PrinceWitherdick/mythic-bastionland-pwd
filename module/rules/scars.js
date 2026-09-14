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
 */
export const SCARS = Object.freeze([
	{ roll: 1, key: "distress", loss: { virtue: "spi", formula: "1d6" } },
	{ roll: 2, key: "disfigurement", detail: true, guardAtMost: 2 },
	{ roll: 3, key: "smash", loss: { virtue: "vig", formula: "1d6" } },
	{ roll: 4, key: "stun", loss: { virtue: "cla", formula: "1d6" }, guardAtMost: 4 },
	{ roll: 5, key: "rupture", loss: { virtue: "vig", formula: "2d6" } },
	{ roll: 6, key: "gouge", laterGuardAtMost: 6 },
	{ roll: 7, key: "concussion", loss: { virtue: "cla", formula: "2d6" } },
	{ roll: 8, key: "tear", detail: true, laterGuardAtMost: 8 },
	{ roll: 9, key: "agony", loss: { virtue: "spi", formula: "2d6" } },
	{ roll: 10, key: "mutilation", detail: true, laterGuardAtMost: 10 },
	{ roll: 11, key: "doom" },
	{ roll: 12, key: "humiliation", laterGuardAtMost: 12 }
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
