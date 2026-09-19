import { loadArtIndex } from "../book-art/art-index.js";
import { tableForEntry } from "../book-art/myth-tables.js";
import { postCard, statLabels, t } from "../chat/cards.js";
import { seerAutoFill } from "../rules/creation.js";
import { rollMythTable } from "./referee-rolls.js";
import { KNIGHT_TABLE_VERSION } from "../rules/book-art.js";
import { hasTable, knightEntryByType, knightTableFill, withRolls } from "../rules/knight-tables.js";

/**
 * The table on a Knight's page, as knightTableFill allows. An index from
 * before Import PDF read Knights' tables has it read from the rulebook the
 * world keeps for its reader.
 * @param {Actor} knight
 * @param {object|null} index
 * @returns {Promise<object>} The update, empty when there's nothing to fill.
 */
async function knightTableUpdate(knight, index) {
	const { knightType, bookTable } = knight.system;
	if (hasTable(bookTable) && bookTable.knight === knightType.trim()) return {};
	const entry = knightEntryByType(index, knightType);
	if (!entry) return {};
	// The same reader finds the table on a Knight's page as on a Myth's.
	const table = await tableForEntry(index, entry, { versionFloor: KNIGHT_TABLE_VERSION });
	return knightTableFill(table, knight.system, entry.page);
}

/**
 * Quietly fill in what a Knight takes from their page in the book: their
 * Seer, as seerAutoFill allows, and their page's table. One read of the
 * index and one update for both. Does nothing before Import PDF.
 * @param {Actor} knight
 * @param {{seer?: boolean, table?: boolean}} [parts] Which to look at.
 * @returns {Promise<boolean>} Whether anything was filled in.
 */
export async function fillKnightFromBook(knight, { seer = true, table = true } = {}) {
	if (!knight?.isOwner || knight.system.isSquire || !(seer || table)) return false;
	const index = await loadArtIndex();
	const update = {
		...(seer ? seerAutoFill(index, knight.system, statLabels()) : {}),
		...(table ? await knightTableUpdate(knight, index) : {})
	};
	if (foundry.utils.isEmpty(update)) return false;
	await knight.update(update);
	return true;
}

/**
 * Roll a d6 for each column asked for and post what they gave. The card is
 * handed back still going out, and the rolls are kept only once `save` is
 * called, so a window can run its highlight meanwhile.
 * @param {Actor} knight
 * @param {number[]} [columns] By index: every column unless one is named.
 * @returns {Promise<{results: {roll: number}[], card: Promise<ChatMessage>, save: () => Promise<Actor>}|null>}
 */
export async function rollKnightTable(knight, columns) {
	const stored = knight?.system.bookTable;
	if (!knight?.isOwner || !hasTable(stored)) return null;
	const asked = columns ?? stored.columns.map((_, index) => index);

	const { roll, results, prompt } = await rollMythTable(stored, asked);
	const card = postCard(knight, "spark", {
		name: stored.name,
		tagline: t("knightTable.tagline", { name: knight.name, page: stored.page }),
		prompt,
		results
	}, { rolls: [roll] });
	return { results, card, save: () => setKnightTableRows(knight, asked, results.map((result) => result.roll)) };
}

/**
 * Choose rows by hand, or clear them with 0.
 * @param {Actor} knight
 * @param {number[]} columns By index.
 * @param {number[]} rows    A row from 1 for each.
 * @returns {Promise<Actor>|null}
 */
export function setKnightTableRows(knight, columns, rows) {
	const stored = knight?.system.bookTable;
	if (!knight?.isOwner || !hasTable(stored)) return null;
	return knight.update({ "system.bookTable.rolls": withRolls(stored, columns, rows) });
}
