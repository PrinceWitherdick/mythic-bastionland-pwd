import { hexLabel } from "./hex-names.js";
import { findByRoll, loadArtIndex, mythEntry, seerEntry } from "../book-art/art-index.js";
import { promptsForEntry } from "../book-art/myth-tables.js";
import { t } from "../chat/cards.js";
import { MYTH_PROMPTS_VERSION, SEER_PROMPTS_VERSION, spreadPages } from "../rules/book-art.js";
import { promptSpark, spreadPrompts } from "../rules/book-flip.js";
import { getCalendar } from "./calendar.js";
import { keepHexSparkRecords, throwForGms } from "./hex-lore.js";
import { isRealmScene } from "./realm.js";

/**
 * Flip the book to a random spread and read the prompts along its foot (p19,
 * p179). The rules are in rules/book-flip.js; here the dice are thrown and the
 * pages read from the GM's own import.
 */

/**
 * Throw a d6 and a d12 for a spread where only the GMs see them: the spread is
 * the Referee's to take a prompt from, and nothing is told to the table.
 * @returns {Promise<{d6: number, d12: number}>}
 */
export async function throwSpread() {
	const roll = await throwForGms("1d6 + 1d12");
	const [d6, d12] = roll.dice.map((die) => die.total);
	return { d6, d12 };
}

/**
 * @typedef {object} FlippedSpread
 * @property {number} d6
 * @property {number} d12
 * @property {string} roll Such as "1-02".
 * @property {{name: string, page: number, prompts: import("../rules/book-flip.js").BookPrompt[]}} knight
 * @property {{name: string, page: number, prompts: import("../rules/book-flip.js").BookPrompt[]}} myth
 */

/**
 * Read a spread's two pages: the Knight's, whose prompts the index keeps on
 * their Seer, and the Myth's facing it. An index written before either was
 * read falls back on the rulebook the world keeps for its reader.
 * @param {object|null} index The art index.
 * @param {{d6: number, d12: number}} spread
 * @returns {Promise<FlippedSpread>}
 */
export async function readSpread(index, spread) {
	const pages = spreadPages(spread.d6, spread.d12);
	const seer = seerEntry(index, spread);
	const myth = mythEntry(index, spread);
	const [knightRead, mythRead] = await Promise.all([
		promptsForEntry(index, seer.entry, { page: pages.knight, versionFloor: SEER_PROMPTS_VERSION }),
		promptsForEntry(index, myth.entry, { page: pages.myth, versionFloor: MYTH_PROMPTS_VERSION })
	]);
	const read = spreadPrompts(spread, { knight: knightRead, myth: mythRead });
	const knightName = findByRoll(index?.knights, seer.roll)?.name ?? t("chooser.unnamed", { roll: seer.roll });
	return {
		...spread,
		roll: seer.roll,
		knight: { name: knightName, ...read.knight },
		myth: { name: myth.name, ...read.myth }
	};
}

/**
 * Flip to a random spread. GMs only.
 * @returns {Promise<FlippedSpread|null>}
 */
export async function flipTheBook() {
	if (!game.user.isGM) return null;
	const [spread, index] = await Promise.all([throwSpread(), loadArtIndex()]);
	return readSpread(index, spread);
}

/**
 * @param {import("../rules/book-flip.js").BookPrompt[]} prompts
 * @returns {string} The prompts, as a notice names them.
 */
export const promptsLabel = (prompts) => prompts.length === 1 ? t("bookFlip.savedOne", { prompt: prompts[0].value }) : t("bookFlip.savedMany", { count: prompts.length });

/**
 * Keep prompts taken from a spread in a hex, beside its Spark Table rolls. GMs only.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}} options.hex
 * @param {{d6: number, d12: number}} options.spread
 * @param {import("../rules/book-flip.js").BookPrompt[]} options.prompts
 * @returns {Promise<boolean>} Whether anything was kept.
 */
export async function savePromptsToHex({ scene, hex, spread, prompts }) {
	if (!game.user.isGM || !isRealmScene(scene) || !prompts.length) return false;
	const when = getCalendar();
	const sparks = prompts.map((prompt) => promptSpark(prompt, spread, {
		id: foundry.utils.randomID(),
		table: t("bookFlip.source", { label: prompt.label, page: prompt.page }),
		when
	}));
	const saved = await keepHexSparkRecords(scene, hex, sparks);
	if (saved) ui.notifications.info(t("bookFlip.saved", { what: promptsLabel(prompts), hex: hexLabel(hex, scene) }));
	return saved;
}
