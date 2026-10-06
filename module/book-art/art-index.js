import { t } from "../chat/cards.js";
import { ART_ROOT, INDEX_FILE, isTableRoll } from "../rules/book-art.js";
import { mythReference, seerReference } from "../rules/realm.js";
import { SYSTEM_ID } from "../system-id.js";

/** Called on every client once a new index has been written, for windows holding on to the one they read. */
export const ART_INDEX_HOOK = `${SYSTEM_ID}.artIndexChanged`;

/**
 * When the index was last written, kept in the world, so the windows open on
 * every client read the new one.
 */
const ART_INDEX_STAMP_SETTING = "artIndexStamp";

/** @type {{tag: string, index: object}|null} The index as this client last read it, with the file's ETag. */
let kept = null;

/** @type {Promise<object|null>|null} A read under way, which every caller meanwhile shares. */
let reading = null;

/** Register the index's stamp. Called during init. */
export function registerArtIndexStamp() {
	game.settings.register(SYSTEM_ID, ART_INDEX_STAMP_SETTING, {
		scope: "world",
		config: false,
		type: Number,
		default: 0,
		onChange: () => {
			kept = reading = null;
			Hooks.callAll(ART_INDEX_HOOK);
		}
	});
}

/**
 * Say a new index has been written: every client reads it afresh. Only a GM
 * can stamp the world, so for anybody else only this client's windows hear of
 * it, and the others find it on their next read.
 * @returns {Promise<unknown>}
 */
export async function artIndexWritten() {
	kept = reading = null;
	if (game.user.isGM) return game.settings.set(SYSTEM_ID, ART_INDEX_STAMP_SETTING, Date.now());
	Hooks.callAll(ART_INDEX_HOOK);
}

/**
 * Fetch a JSON file Import PDF wrote. The browser asks the server each
 * time, so a new import shows up without reloading, but downloads the file
 * again only when it has changed.
 * @param {string} path Under Foundry's Data path.
 * @returns {Promise<object|null>} Null when it isn't there or can't be read.
 */
export async function loadJson(path) {
	try {
		const response = await fetch(foundry.utils.getRoute(path), { cache: "no-cache" });
		return response.ok ? await response.json() : null;
	} catch {
		return null;
	}
}

/**
 * The index Import PDF writes, or null if it hasn't been run. The server is
 * asked each time, as the art folder is shared by every world and any client
 * may write it, but the file is read afresh only when its ETag has changed.
 * Shared by every caller, so never changed in place.
 * @returns {Promise<object|null>}
 */
export function loadArtIndex() {
	reading ??= readArtIndex().finally(() => {
		reading = null;
	});
	return reading;
}

/** @returns {Promise<object|null>} */
async function readArtIndex() {
	try {
		const response = await fetch(foundry.utils.getRoute(`${ART_ROOT}/${INDEX_FILE}`), { cache: "no-cache" });
		if (!response.ok) {
			kept = null;
			return null;
		}
		const tag = response.headers.get("etag") ?? response.headers.get("last-modified");
		if (tag && kept?.tag === tag) return kept.index;
		const index = await response.json();
		kept = tag ? { tag, index } : null;
		return index;
	} catch {
		return null;
	}
}

/**
 * @param {object[]|undefined} list One of the art index's lists, such as `myths`.
 * @param {string} roll Such as "3-07".
 * @returns {object|null} That roll's entry.
 */
export const findByRoll = (list, roll) => list?.find((entry) => entry.roll === roll) ?? null;

/**
 * @param {object|null} index
 * @param {string} key One of SPARK_PAGES' keys.
 * @returns {object|null} That page of Spark Tables, if Import PDF read it.
 */
export const sparkPageOf = (index, key) => index?.spark?.find((page) => page.key === key) ?? null;

/**
 * @param {object|null} index
 * @param {string} key One of SPARK_PAGES' keys.
 * @returns {object|null} That page, if Import PDF read any tables on it.
 */
export function sparkTablesOf(index, key) {
	const page = sparkPageOf(index, key);
	return page?.tables?.length ? page : null;
}

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
 * A Myth's entry in the art index, or its number alone for a Myth whose dice
 * don't read as a roll on the Myths table.
 * @param {object|null} index
 * @param {{number: number, d6: number, d12: number}} myth
 * @returns {{name: string, page: number|null, entry: object|null}}
 */
export function mythLookup(index, myth) {
	if (!isTableRoll(myth)) return { name: t("gmToolkit.myths.unrolled", { number: myth.number }), page: null, entry: null };
	return mythEntry(index, myth);
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
