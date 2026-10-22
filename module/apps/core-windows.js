import { isOwnMythEntry } from "../actions/own-myths.js";
import { isSiteEntry } from "../actions/sites.js";
import { HEX_JOURNAL_FLAG } from "../rules/hex-journal.js";
import { SITE_JOURNAL_FLAG } from "../rules/site-journal.js";
import { TIMELINE_JOURNAL_FLAG } from "../rules/timeline.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * Foundry's own windows that come up in play with the system, dressed in its
 * parchment: Create Actor and Create Item, the confirm before deleting an
 * Actor, an Item or one of the system's Journal entries, User Configuration,
 * where a player picks their Knight, and the hex, Site and Timeline journals,
 * with the Add Page and Delete Page dialogs inside them. Each keeps Foundry's
 * form and works as Foundry's does; only the look is the system's. Every other
 * core window, and other modules', is left as it is.
 */

/** The class every system dialog asks for (styles/chat.css). */
const DIALOG_CLASS = "bastionland-dialog";

/** User Configuration, which is a form rather than a dialog, so it needs its own padding. */
export const USER_CONFIG_CLASS = "bastionland-user-config";

/**
 * A hex or Site journal, and the window a page of one is edited in
 * (styles/core-windows.css). It doesn't start with "bastionland", so
 * isSystemWindow passes it by: the Referee's notes keep their words as written,
 * with no rule-word popups and no dice rolling in place.
 */
export const JOURNAL_CLASS = "mythic-bastionland-journal";

/** The sheets' parchment root, set on a journal's page area so it takes their controls and inks. */
const PAGE_CLASS = "bastionland-page";

/**
 * A caller's dialog options, asking for the system's look as well.
 * @param {object} [options]
 * @returns {object}
 */
export function withDialogSkin(options = {}) {
	const classes = options?.classes ?? [];
	if (classes.includes(DIALOG_CLASS)) return options;
	return { ...options, classes: [...classes, DIALOG_CLASS] };
}

/**
 * Whether a Journal entry opens in Foundry's own journal window and is the
 * system's: a hex's or a Site's journal, or the Timeline. Sites and written
 * Myths have sheets of their own.
 * @param {JournalEntry|null|undefined} entry
 * @returns {boolean}
 */
export function isKeptJournal(entry) {
	const flags = entry?.flags?.[SYSTEM_ID];
	return Boolean(flags?.[HEX_JOURNAL_FLAG] || flags?.[SITE_JOURNAL_FLAG] || flags?.[TIMELINE_JOURNAL_FLAG]);
}

/**
 * Whether a Journal entry is one the system writes or draws: a hex's or a
 * Site's journal, the Timeline, a Site, or a Myth the Referee wrote.
 * @param {JournalEntry|null|undefined} entry
 * @returns {boolean}
 */
export function isSystemJournal(entry) {
	return isKeptJournal(entry) || isSiteEntry(entry) || isOwnMythEntry(entry);
}

/**
 * Dress User Configuration as a system dialog.
 * @param {foundry.applications.api.ApplicationV2} _app
 * @param {HTMLElement} element
 */
export function skinUserConfig(_app, element) {
	element.classList.add(DIALOG_CLASS, USER_CONFIG_CLASS);
}

/**
 * Dress a hex or Site journal: the window takes the journal class, and its
 * page area the sheets' parchment root. The page area is drawn again with each
 * render, so it's marked again each time.
 * @param {foundry.applications.sheets.journal.JournalEntrySheet} app
 * @param {HTMLElement} element
 */
export function skinJournal(app, element) {
	if (!isKeptJournal(app?.document)) return;
	element.classList.add(JOURNAL_CLASS);
	element.querySelector(".journal-entry-content")?.classList.add(PAGE_CLASS);
}

/**
 * Dress the window a page of a hex or Site journal is edited in. A page drawn
 * inside its journal is left alone: Foundry strips its classes as it lays it in,
 * and the journal around it is already dressed.
 * @param {foundry.applications.sheets.journal.JournalEntryPageSheet} app
 * @param {HTMLElement} element
 */
export function skinJournalPage(app, element) {
	if (app?.isView || !isKeptJournal(app?.document?.parent)) return;
	element.classList.add(JOURNAL_CLASS);
	element.querySelector(":scope > .window-content")?.classList.add(PAGE_CLASS);
}

/** Dress Foundry's windows that come up in play with the system. Called during init. */
export function registerCoreWindowSkin() {
	// On the base classes, so a module's subclass of either inherits the same.
	const { JournalEntry, JournalEntryPage } = foundry.documents;
	// A page is the system's when the journal it goes in is: Add Page passes that journal as its parent.
	for (const [cls, ours] of [[Actor, () => true], [Item, () => true], [JournalEntryPage, (createOptions) => isKeptJournal(createOptions?.parent)]]) {
		const createDialog = cls.createDialog;
		cls.createDialog = function (data, createOptions, options, ...rest) {
			return createDialog.call(this, data, createOptions, ours(createOptions) ? withDialogSkin(options) : options, ...rest);
		};
	}
	for (const [cls, ours] of [
		[Actor, () => true],
		[Item, () => true],
		[JournalEntry, isSystemJournal],
		[JournalEntryPage, (page) => isKeptJournal(page.parent)]
	]) {
		const deleteDialog = cls.prototype.deleteDialog;
		cls.prototype.deleteDialog = function (options, ...rest) {
			return deleteDialog.call(this, ours(this) ? withDialogSkin(options) : options, ...rest);
		};
	}
	Hooks.on("renderUserConfig", skinUserConfig);
	Hooks.on("renderJournalEntrySheet", skinJournal);
	Hooks.on("renderJournalEntryPageSheet", skinJournalPage);
}
