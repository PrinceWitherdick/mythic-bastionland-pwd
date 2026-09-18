import { t } from "../chat/cards.js";
import { ART_ROOT, INDEX_FILE } from "../rules/book-art.js";
import { mythReference, seerReference } from "../rules/realm.js";

/**
 * Fetch a JSON file Import PDF wrote. The browser asks the server each
 * time, so a new import shows up without reloading, but downloads the file
 * again only when it has changed.
 * @param {string} path Under Foundry's Data path.
 * @returns {Promise<object|null>} Null when it isn't there or can't be read.
 */
async function loadJson(path) {
	try {
		const response = await fetch(foundry.utils.getRoute(path), { cache: "no-cache" });
		return response.ok ? await response.json() : null;
	} catch {
		return null;
	}
}

/**
 * The index Import PDF writes, or null if it hasn't been run.
 * @returns {Promise<object|null>}
 */
export const loadArtIndex = () => loadJson(`${ART_ROOT}/${INDEX_FILE}`);

/**
 * @param {object[]|undefined} list One of the art index's lists, such as `myths`.
 * @param {string} roll Such as "3-07".
 * @returns {object|null} That roll's entry.
 */
export const findByRoll = (list, roll) => list?.find((entry) => entry.roll === roll) ?? null;

/**
 * A Myth's entry in the art index, with a name to show whether or not the book has been imported.
 * @param {object|null} index
 * @param {{d6: number, d12: number}} myth
 * @returns {{roll: string, page: number, entry: object|null, name: string}}
 */
export function mythEntry(index, myth) {
	const { roll, page } = mythReference(myth);
	const entry = findByRoll(index?.myths, roll);
	return { roll, page, entry, name: entry?.name ?? t("realm.key.unnamedMyth", { roll }) };
}

/**
 * A Seer's entry in the art index, with a name to show whether or not the book has been imported.
 * @param {object|null} index
 * @param {{d6: number, d12: number}} seer
 * @returns {{roll: string, page: number, entry: object|null, name: string}}
 */
export function seerEntry(index, seer) {
	const { roll, page } = seerReference(seer);
	const entry = findByRoll(index?.seers, roll);
	return { roll, page, entry, name: entry?.name ?? t("realm.key.unnamedSeer", { roll }) };
}
