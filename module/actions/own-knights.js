/**
 * Knights the Referee writes, each with their Seer, kept on a Journal entry
 * apiece in a folder of their own. Players see one, to choose it, once the
 * Referee lets them: the entry is then theirs to observe. Never imports the
 * art index, which reads Seers through here; knight-index.js joins the two.
 */
import { addDirectoryButton } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { knightTypeFromName } from "../rules/creation.js";
import { isOwnRecord } from "../rules/knight-refs.js";
import { isBlankOwnKnight, normaliseOwnKnight, ownKnightEntry, ownSeerEntry } from "../rules/own-knights.js";
import { keyedSerialWrites } from "../rules/queue.js";
import { SYSTEM_ID } from "../system-id.js";
import { JOURNAL_FOLDER_COLOR, findFlaggedFolder, flaggedFolder } from "./folders.js";
import { newOwnEntry } from "./own-entries.js";

/** The flag a written Knight's Journal entry keeps the Knight and their Seer under. */
export const OWN_KNIGHT_FLAG = "ownKnight";

/**
 * The sheet a written Knight's Journal entry opens with, named the way Foundry
 * names a registered sheet. The boot test holds it and the class's name together.
 */
export const OWN_KNIGHT_SHEET_CLASS = `${SYSTEM_ID}.OwnKnightSheet`;

/** Marks the Journal folder written Knights are filed in, so it's found again whatever it's renamed to. */
const FOLDER_FLAG = "ownKnightsFolder";

/**
 * @param {JournalEntry} entry
 * @returns {boolean} Whether the entry holds a Knight the Referee wrote.
 */
export const isOwnKnightEntry = (entry) => Boolean(entry?.flags?.[SYSTEM_ID]?.[OWN_KNIGHT_FLAG]);

/**
 * @param {JournalEntry} entry
 * @returns {import("../rules/own-knights.js").OwnKnight}
 */
export const readOwnKnight = (entry) => normaliseOwnKnight(entry?.flags?.[SYSTEM_ID]?.[OWN_KNIGHT_FLAG]);

/** Each write to a written Knight waits for the one before. Called with the Knight's entry id. */
export const ownKnightWrites = keyedSerialWrites();

/**
 * @param {string|null|undefined} id
 * @returns {JournalEntry|null} The written Knight's entry, while the world has it.
 */
export function ownKnightById(id) {
	const entry = id ? game.journal?.get(id) : null;
	return isOwnKnightEntry(entry) ? entry : null;
}

/**
 * @param {JournalEntry} entry
 * @returns {boolean} Whether players may see the Knight, to choose them.
 */
export const isReadyForPlayers = (entry) => (entry?.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;

/**
 * @param {JournalEntry} entry
 * @param {User} [user]
 * @returns {boolean} Whether the user may read the Knight: a Referee always, a player once they're ready.
 */
export const canSeeOwnKnight = (entry, user = game.user) => Boolean(user?.isGM || entry?.testUserPermission?.(user, "OBSERVER"));

/**
 * @param {JournalEntry} entry
 * @returns {string} The name they're known by, such as "Ferry", or "" while
 *   the entry still has the name New Knight gave it.
 */
export const ownKnightType = (entry) => (entry?.name === t("ownKnight.defaultName") ? "" : knightTypeFromName(entry?.name ?? ""));

/**
 * @param {User} [user]
 * @returns {JournalEntry[]} The written Knights the user may see, named, by name.
 */
export const ownKnightEntries = (user = game.user) => (game.journal?.filter((entry) => isOwnKnightEntry(entry) && ownKnightType(entry) && canSeeOwnKnight(entry, user)) ?? [])
	.sort((a, b) => a.name.localeCompare(b.name));

/** What a written Knight's unnamed table and columns are called. */
const tableWords = () => ({ table: t("ownKnight.tableFallback"), column: (number) => t("ownMyth.column", { number }) });

/**
 * A written Knight as the rest of the system reads one, shaped as the art
 * index's entry for a Knight of the book.
 * @param {JournalEntry} entry
 * @returns {object}
 */
export const ownKnightIndexEntry = (entry) => ownKnightEntry(entry.id, entry.name, readOwnKnight(entry), tableWords());

/**
 * @param {JournalEntry} entry
 * @returns {object|null} The written Knight's Seer, as the art index has a Seer of the book, or null while unnamed.
 */
export const ownSeerIndexEntry = (entry) => ownSeerEntry(entry.id, readOwnKnight(entry));

/**
 * @param {User} [user]
 * @returns {{knights: object[], seers: object[]}} The written Knights and Seers the user may see, for withOwnKnights.
 */
export function ownKnightIndexEntries(user = game.user) {
	const entries = ownKnightEntries(user);
	return {
		knights: entries.map(ownKnightIndexEntry),
		seers: entries.map(ownSeerIndexEntry).filter(Boolean)
	};
}

/**
 * A Seer the Referee wrote, as a place records one (a Sanctum's), looked up
 * as art-index.js's seerEntry looks one of the book's up. One whose entry has
 * been deleted, or isn't named, goes by a word saying so.
 * @param {{own: string}} seer
 * @returns {{roll: null, page: null, entry: object|null, name: string}}
 */
export function ownSeerLookup(seer) {
	const found = isOwnRecord(seer) ? ownKnightById(seer.own) : null;
	const entry = found ? ownSeerIndexEntry(found) : null;
	return { roll: null, page: null, entry, name: entry?.name ?? t("ownKnight.seerGone") };
}

/**
 * Let players see a written Knight, to choose them, or take them back.
 * Referees only.
 * @param {JournalEntry} entry
 * @param {boolean} ready
 * @returns {Promise<unknown>|null}
 */
export function setReadyForPlayers(entry, ready) {
	if (!game.user.isGM || !isOwnKnightEntry(entry)) return null;
	const { NONE, OBSERVER } = CONST.DOCUMENT_OWNERSHIP_LEVELS;
	return entry.update({ "ownership.default": ready ? OBSERVER : NONE });
}

/** @returns {Folder|null} The Journal folder written Knights are filed in, if it has been made. */
export const findOwnKnightsFolder = () => findFlaggedFolder("JournalEntry", FOLDER_FLAG, true);

/**
 * The Journal folder written Knights are filed in, made the first time it's wanted.
 * @returns {Promise<Folder|null>}
 */
export const ownKnightsFolder = () => flaggedFolder("JournalEntry", FOLDER_FLAG, true, { name: t("ownKnight.folder"), color: JOURNAL_FOLDER_COLOR });

/**
 * Make a Journal entry for a new Knight and open it to be written. Referees only.
 * If it's closed with nothing written, the entry is deleted again.
 * @returns {Promise<JournalEntry|null>}
 */
export async function newOwnKnight() {
	if (!game.user.isGM) return null;
	return newOwnEntry({
		name: t("ownKnight.defaultName"),
		folder: await ownKnightsFolder(),
		sheetClass: OWN_KNIGHT_SHEET_CLASS,
		flag: OWN_KNIGHT_FLAG,
		data: normaliseOwnKnight(null),
		// Kept from players until the Referee makes them ready (setReadyForPlayers).
		ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
	});
}

/**
 * @param {JournalEntry} entry
 * @returns {boolean} Whether a Knight made with New Knight is still as it was made.
 */
export const isUntouchedOwnKnight = (entry) => entry.name === t("ownKnight.defaultName") && isBlankOwnKnight(readOwnKnight(entry));

/**
 * Open a written Knight to be read or changed.
 * @param {string} id Their entry.
 * @returns {Promise<unknown>|null} Null when the world no longer has them.
 */
export function openOwnKnight(id) {
	const entry = ownKnightById(id);
	return entry && canSeeOwnKnight(entry) ? entry.sheet.render({ force: true }) : null;
}

/**
 * Put New Knight in the Journal directory's header, for Referees.
 * @param {HTMLElement} element The directory.
 */
export function addNewKnightButton(element) {
	if (!game.user.isGM) return;
	addDirectoryButton(element, {
		className: "bastionland-new-knight",
		icon: "fa-solid fa-chess-knight",
		label: t("ownKnight.newKnight"),
		onClick: () => newOwnKnight()
	});
}
