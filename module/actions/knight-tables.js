import { loadArtIndex } from "../book-art/art-index.js";
import { tableForEntry, verseForEntry } from "../book-art/myth-tables.js";
import { postCard, t } from "../chat/cards.js";
import { seerAutoFill } from "../rules/creation.js";
import { rollMythTable } from "./referee-rolls.js";
import { KNIGHT_TABLE_VERSION, KNIGHT_VERSE_VERSION } from "../rules/book-art.js";
import { asPattern, withSentences } from "../rules/knight-table-sentences.js";
import { hasTable, knightEntryByType, knightRenewal, knightTableFill, knightVerseFill, clauseMidSentence, renewalDue, withRolls } from "../rules/knight-tables.js";
import { SYSTEM_ID } from "../system-id.js";
import { CALENDAR_HOOK, getCalendar } from "./calendar.js";
import { causedBy } from "./ledger.js";
import { applyTableStats } from "./table-stats.js";
import { worldKnights } from "./knights.js";


/** The flag keeping the calendar when a Knight last rolled on their table, so a table that comes round again knows it's due. */
const ROLLED_AT = "tableRolledAt";

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
 * The verse under the Knight's name on their page, as knightVerseFill allows.
 * An index from before Import PDF read Knights' verses has it read from the rulebook.
 * @param {Actor} knight
 * @param {object|null} index
 * @returns {Promise<object>} The update, empty when there's nothing to fill.
 */
async function knightVerseUpdate(knight, index) {
	const { knightType, bookVerse } = knight.system;
	if (bookVerse.knight === knightType.trim()) return {};
	const entry = knightEntryByType(index, knightType);
	if (!entry) return {};
	return knightVerseFill(await verseForEntry(index, entry, { versionFloor: KNIGHT_VERSE_VERSION }), knight.system);
}

/**
 * Quietly fill in what a Knight takes from their page in the book: their
 * Seer, as seerAutoFill allows, their page's table and the verse under their
 * name. One read of the index and one update for all. Does nothing before Import PDF.
 * @param {Actor} knight
 * @param {{seer?: boolean, table?: boolean, verse?: boolean}} [parts] Which to look at.
 * @returns {Promise<boolean>} Whether anything was filled in.
 */
export async function fillKnightFromBook(knight, { seer = true, table = true, verse = true } = {}) {
	if (!knight?.isOwner || knight.system.isSquire || !(seer || table || verse)) return false;
	const index = await loadArtIndex();
	const [tableUpdate, verseUpdate] = await Promise.all([
		table ? knightTableUpdate(knight, index) : {},
		verse ? knightVerseUpdate(knight, index) : {}
	]);
	const update = {
		...(seer ? seerAutoFill(index, knight.system) : {}),
		...tableUpdate,
		...verseUpdate
	};
	if (foundry.utils.isEmpty(update)) return false;
	await knight.update(update, causedBy("book"));
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
		results: withTableSentences(stored, results)
	}, { rolls: [roll] });
	return { results, card, save: () => setKnightTableRows(knight, asked, results.map((result) => result.roll)) };
}

/**
 * Each result with the sentence it reads as, where its table has one; see rules/knight-table-sentences.js.
 * @template {{index: number, entry: string|null}} R
 * @param {{page: number}} stored
 * @param {R[]} results
 * @returns {(R & {sentence: object|null})[]}
 */
export function withTableSentences(stored, results) {
	return withSentences(stored, results, (roll, column) => {
		const key = `bastionland.knightTable.sentences.${roll}.${column}`;
		// Read straight from the translations, in the language's own before English, since
		// `localize` hands back only strings and a joining column is written as { line, join }.
		const at = (source) => foundry.utils.getProperty(source ?? {}, key);
		return asPattern(at(game.i18n.translations) ?? at(game.i18n._fallback));
	});
}

/**
 * Choose rows by hand, or clear them with 0. What each row says of the Knight's
 * Property, such as the form their crossbow takes, is put on it.
 * @param {Actor} knight
 * @param {number[]} columns By index.
 * @param {number[]} rows    A row from 1 for each.
 * @returns {Promise<Actor|null>}
 */
export async function setKnightTableRows(knight, columns, rows) {
	const stored = knight?.system.bookTable;
	if (!knight?.isOwner || !hasTable(stored)) return null;
	const update = { "system.bookTable.rolls": withRolls(stored, columns, rows) };
	// A row taken, not cleared, counts as the table rolled now.
	if (rows.some((row) => row > 0)) update[`flags.${SYSTEM_ID}.${ROLLED_AT}`] = getCalendar();
	const updated = await knight.update(update);
	for (const line of await applyTableStats(knight, columns)) ui.notifications.info(line);
	return updated;
}

/**
 * When a Knight's table comes round again, and whether it has since they last rolled.
 * @param {Actor} knight
 * @param {object} [now] The calendar.
 * @param {import("../rules/knight-tables.js").Renewal|null} [renewal] The Knight's renewal, where it's been read already.
 * @returns {(import("../rules/knight-tables.js").Renewal & {due: boolean})|null}
 */
export function knightTableRenewal(knight, now = getCalendar(), renewal = knightRenewal(knight)) {
	return renewal && { ...renewal, due: renewalDue(renewal.cadence, knight.getFlag(SYSTEM_ID, ROLLED_AT), now) };
}

/**
 * A line for the Season or Phase card for each Knight whose table comes round
 * with it, such as the Dust Knight's fish, restocked each new Season.
 * @param {string[]} cadences Some of RENEWAL_CADENCES.
 * @returns {string[]}
 */
export function tableRenewalNotices(cadences) {
	return worldKnights().flatMap((knight) => {
		const renewal = knightRenewal(knight);
		if (!renewal || !cadences.includes(renewal.cadence)) return [];
		return [renewalNotice(knight, renewal)];
	});
}

/**
 * @param {Actor} knight
 * @param {import("../rules/knight-tables.js").Renewal} renewal
 * @returns {string} Such as "The Dust Knight's fish comes round again, restocked each new Season."
 */
const renewalNotice = (knight, renewal) => t("knightTable.renewal.notice", { name: knight.name, table: knight.system.bookTable.name, when: clauseMidSentence(renewal.clause) });

/**
 * When the calendar moves on, a player is told of their own Knights' tables
 * that have come round; the GM has it from the Season and Phase cards. Each
 * Knight sheet redraws its own table as it comes round. Called once the world
 * is ready.
 */
export function watchTableRenewals() {
	Hooks.on(CALENDAR_HOOK, (after, before, turned) => {
		for (const knight of game.actors) {
			const parsed = knight.type === "knight" && knightRenewal(knight);
			if (!parsed) continue;
			// A table rolled before its roll was dated counts as rolled just before the calendar moved.
			const undated = !knight.getFlag(SYSTEM_ID, ROLLED_AT) && knight.system.bookTable.rolls.some((roll) => roll > 0);
			if (undated && game.user === game.users.activeGM) knight.setFlag(SYSTEM_ID, ROLLED_AT, before);
			if (game.user.isGM || !knight.isOwner || !turned.includes(parsed.cadence)) continue;
			if (undated || knightTableRenewal(knight, after, parsed).due) ui.notifications.info(renewalNotice(knight, parsed));
		}
	});
}
