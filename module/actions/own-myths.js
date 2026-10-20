import { addDirectoryButton } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { isBlankOwnMyth, isOwnMyth, normaliseOwnMyth, ownMythEntry } from "../rules/own-myths.js";
import { SYSTEM_ID } from "../system-id.js";
import { JOURNAL_FOLDER_COLOR, findFlaggedFolder, flaggedFolder } from "./folders.js";

/** The flag a written Myth's Journal entry keeps the Myth under. */
export const OWN_MYTH_FLAG = "ownMyth";

/**
 * The sheet a written Myth's Journal entry opens with, named the way Foundry
 * names a registered sheet. The boot test holds it and the class's name together.
 */
export const OWN_MYTH_SHEET_CLASS = `${SYSTEM_ID}.OwnMythSheet`;

/** Marks the Journal folder written Myths are filed in, so it's found again whatever it's renamed to. */
const FOLDER_FLAG = "ownMythsFolder";

/**
 * @param {JournalEntry} entry
 * @returns {boolean} Whether the entry holds a Myth the Referee wrote.
 */
export const isOwnMythEntry = (entry) => Boolean(entry?.flags?.[SYSTEM_ID]?.[OWN_MYTH_FLAG]);

/**
 * @param {JournalEntry} entry
 * @returns {import("../rules/own-myths.js").OwnMyth}
 */
export const readOwnMyth = (entry) => normaliseOwnMyth(entry?.flags?.[SYSTEM_ID]?.[OWN_MYTH_FLAG]);

/**
 * @param {string|null|undefined} id
 * @returns {JournalEntry|null} The written Myth's entry, while the world has it.
 */
export function ownMythById(id) {
	const entry = id ? game.journal?.get(id) : null;
	return isOwnMythEntry(entry) ? entry : null;
}

/** @returns {JournalEntry[]} Every Myth the Referee has written, by name. */
export const ownMythEntries = () => (game.journal?.filter(isOwnMythEntry) ?? []).sort((a, b) => a.name.localeCompare(b.name));

/**
 * What the rest of the system reads a written Myth from, shaped as the art
 * index's entry for a Myth of the book.
 * @param {JournalEntry} entry
 * @returns {object}
 */
export const ownMythIndexEntry = (entry) => ownMythEntry(entry.name, readOwnMyth(entry), {
	table: t("gmToolkit.myths.table"),
	column: (number) => t("ownMyth.column", { number })
});

/**
 * A Myth of the Realm that the Referee wrote, as art-index.js's mythEntry
 * looks one of the book's up. One whose entry has been deleted goes by its number.
 * @param {{number: number, own: string}} myth
 * @returns {{roll: null, page: null, entry: object|null, name: string}}
 */
export function ownMythLookup(myth) {
	const entry = isOwnMyth(myth) ? ownMythById(myth.own) : null;
	if (!entry) return { roll: null, page: null, entry: null, name: t("gmToolkit.myths.unrolled", { number: myth.number }) };
	return { roll: null, page: null, entry: ownMythIndexEntry(entry), name: entry.name };
}

/** @returns {Folder|null} The Journal folder written Myths are filed in, if it has been made. */
export const findOwnMythsFolder = () => findFlaggedFolder("JournalEntry", FOLDER_FLAG, true);

/**
 * The Journal folder written Myths are filed in, made the first time it's wanted.
 * @returns {Promise<Folder|null>} Null when it couldn't be made, so the Myth goes at the top level instead.
 */
export const ownMythsFolder = () => flaggedFolder("JournalEntry", FOLDER_FLAG, true, { name: t("ownMyth.folder"), color: JOURNAL_FOLDER_COLOR });

/**
 * Make a Journal entry for a new Myth and open it to be written. GMs only.
 * If it's closed with nothing written, the entry is deleted again.
 * @returns {Promise<JournalEntry|null>}
 */
export async function newOwnMyth() {
	if (!game.user.isGM) return null;
	const folder = await ownMythsFolder();
	const entry = await foundry.utils.getDocumentClass("JournalEntry").create({
		name: t("ownMyth.defaultName"),
		folder: folder?.id ?? null,
		flags: {
			core: { sheetClass: OWN_MYTH_SHEET_CLASS },
			[SYSTEM_ID]: { [OWN_MYTH_FLAG]: normaliseOwnMyth(null) }
		}
	});
	if (!entry) return null;
	entry.sheet.discardIfBlank = true;
	await entry.sheet.render({ force: true });
	return entry;
}

/**
 * @param {JournalEntry} entry
 * @returns {boolean} Whether a Myth made with New Myth is still as it was made:
 *   its name untouched and nothing written.
 */
export const isUntouchedOwnMyth = (entry) => entry.name === t("ownMyth.defaultName") && isBlankOwnMyth(readOwnMyth(entry));

/**
 * Open a written Myth to be read or changed.
 * @param {string} id Its entry.
 * @returns {Promise<unknown>|null} Null when the world no longer has it.
 */
export function openOwnMyth(id) {
	const entry = ownMythById(id);
	return entry ? entry.sheet.render({ force: true }) : null;
}

/**
 * Put New Myth in the Journal directory's header, for GMs.
 * @param {HTMLElement} element The directory.
 */
export function addNewMythButton(element) {
	if (!game.user.isGM) return;
	addDirectoryButton(element, {
		className: "bastionland-new-myth",
		icon: "fa-solid fa-dragon",
		label: t("ownMyth.newMyth"),
		onClick: () => newOwnMyth()
	});
}
