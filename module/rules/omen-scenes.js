/**
 * The Scenes a Referee links to a Myth's Omens, to activate when the Omen
 * comes: one list of world Scene ids for each of the six. Kept with the Myth's
 * notes for a Myth of the book, and on its own entry for one the Referee
 * wrote. Pure, so it can be tested without Foundry.
 */
import { OMEN_COUNT } from "./realm.js";

/** @typedef {string[][]} OmenScenes OMEN_COUNT lists of Scene ids, in Omen order. */

/** @returns {OmenScenes} Six empty lists. */
export const emptyOmenScenes = () => Array.from({ length: OMEN_COUNT }, () => []);

/**
 * @param {unknown} raw A list of ids.
 * @returns {string[]} The ids in it, each once.
 */
function idsOf(raw) {
	const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
	return [...new Set(list.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))];
}

/**
 * Lists from whatever was kept, however old or bad: an array of six, or an
 * object keyed by Omen number from 1, as the Myth notes keep them.
 * @param {unknown} raw
 * @returns {OmenScenes}
 */
export function normaliseOmenScenes(raw) {
	const listAt = Array.isArray(raw) ? (index) => raw[index] : (index) => raw?.[String(index + 1)];
	return Array.from({ length: OMEN_COUNT }, (_, index) => idsOf(listAt(index)));
}

/**
 * @param {OmenScenes} lists
 * @returns {boolean} Whether any Omen has a Scene.
 */
export const anyOmenScene = (lists) => lists.some((list) => list.length > 0);

/**
 * @param {OmenScenes} lists
 * @returns {Record<string, string[]>} Only the Omens with Scenes, keyed by number from 1, as the Myth notes keep them.
 */
export function omenScenesByNumber(lists) {
	const kept = {};
	lists.forEach((list, index) => {
		if (list.length) kept[String(index + 1)] = [...list];
	});
	return kept;
}

/**
 * @param {number} omen
 * @returns {boolean} Whether it names one of the six.
 */
const isOmen = (omen) => Number.isInteger(omen) && omen >= 1 && omen <= OMEN_COUNT;

/**
 * @param {OmenScenes} lists
 * @param {number} omen From 1.
 * @param {string} id
 * @returns {OmenScenes} With the Scene linked to that Omen, or the same lists if it already was.
 */
export function withOmenScene(lists, omen, id) {
	if (!isOmen(omen) || typeof id !== "string" || !id || lists[omen - 1].includes(id)) return lists;
	return lists.map((list, index) => (index === omen - 1 ? [...list, id] : list));
}

/**
 * @param {OmenScenes} lists
 * @param {number} omen From 1.
 * @param {string} id
 * @returns {OmenScenes} Without the Scene on that Omen, or the same lists if it wasn't there.
 */
export function withoutOmenScene(lists, omen, id) {
	if (!isOmen(omen) || !lists[omen - 1].includes(id)) return lists;
	return lists.map((list, index) => (index === omen - 1 ? list.filter((kept) => kept !== id) : list));
}

/**
 * @param {OmenScenes} lists
 * @param {(id: string) => boolean} exists
 * @returns {OmenScenes} Without any Scene the world no longer has, or the same lists if none is gone.
 */
export function withoutMissingScenes(lists, exists) {
	if (lists.every((list) => list.every(exists))) return lists;
	return lists.map((list) => list.filter(exists));
}
