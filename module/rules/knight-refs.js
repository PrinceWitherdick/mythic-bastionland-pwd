/**
 * How a Knight and their Seer are told apart wherever one is picked: a Knight
 * of the book by their roll on the Knights table, such as "3-07", and one the
 * Referee wrote by their Journal entry, as "own:<id>". A Knight and the Seer
 * who knighted them share one, as they share a page in the book. Pure, so it
 * can be tested without Foundry.
 */
import { isOwnRecord, isTableRoll } from "./book-art.js";

export { isOwnRecord };

/** Put before a written Knight's or Myth's entry id, so it is never taken for a roll. */
const OWN_KEY = "own:";

/**
 * @param {string} id A written Knight's or Myth's Journal entry.
 * @returns {string} Their ref.
 */
export const ownRef = (id) => `${OWN_KEY}${id}`;

/**
 * @param {unknown} ref
 * @returns {string|null} The Journal entry a written Knight's ref names, or null for a roll or nothing.
 */
export function ownIdOf(ref) {
	if (typeof ref !== "string" || !ref.startsWith(OWN_KEY)) return null;
	return ref.slice(OWN_KEY.length) || null;
}

/**
 * @param {unknown} seer What a Sanctum records of its Seer.
 * @returns {boolean} Whether it names one: a roll on the Knights table, or a Seer the Referee wrote.
 */
export const isSeerRecord = (seer) => isTableRoll(seer) || isOwnRecord(seer);

/**
 * @param {{own?: string, roll?: string|null}|null|undefined} entry A Knight or Seer, of the book or written.
 * @returns {string|null} Their ref.
 */
export const refOf = (entry) => (isOwnRecord(entry) ? ownRef(entry.own) : (entry?.roll ?? null));

/**
 * @param {object[]|null|undefined} list Knights or Seers, of the book and written alike.
 * @param {string|null|undefined} ref
 * @returns {object|null} The one the ref names.
 */
export function findByRef(list, ref) {
	if (!ref) return null;
	const own = ownIdOf(ref);
	return list?.find((entry) => (own ? entry.own === own : entry.roll === ref)) ?? null;
}
