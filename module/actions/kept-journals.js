import { t, warn } from "../chat/cards.js";
import { HEX_JOURNAL_FLAG, HEX_LAYOUT } from "../rules/hex-journal.js";
import { SITE_JOURNAL_FLAG } from "../rules/site-journal.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * What the hex and Site journals share: reading an entry to plan its writes
 * from, gathering a burst of changes before syncing, and opening an entry
 * that another GM's browser may still be making.
 */

/**
 * What's in the world for an entry the system keeps, to plan its writes from.
 * @param {JournalEntry} entry
 * @param {import("../rules/hex-journal.js").JournalLayout} [layout] Its pages' parts.
 * @param {boolean} [open] Whether the entry was last opened to players.
 * @returns {import("../rules/hex-journal.js").EntrySnapshot}
 */
export function entrySnapshot(entry, layout = HEX_LAYOUT, open = false) {
	const pages = {};
	for (const page of entry.pages ?? []) {
		const role = page.getFlag(SYSTEM_ID, "role");
		if (layout.roles.includes(role) && !pages[role]) pages[role] = { id: page.id, markdown: page.text?.markdown ?? "" };
	}
	return {
		id: entry.id,
		name: entry.name,
		sort: entry.sort,
		ownership: entry.ownership?.default ?? 0,
		open,
		pages
	};
}

/**
 * Markdown as the HTML Foundry shows for it: read by the text page sheet's own
 * converter, and cleaned as the server cleans what it converts, since the
 * players' notes are in it.
 * @param {string} markdown
 * @returns {string}
 */
const markdownHtml = (markdown) => foundry.utils.cleanHTML(foundry.applications.sheets.journal.JournalEntryPageTextSheet._converter.makeHtml(markdown));

/**
 * New pages with their HTML filled in. Foundry's server turns a page's markdown
 * into the HTML it shows only when that page is itself created or updated, not
 * when it comes inside its entry's creation, so a new page brings its own.
 * @param {object[]} pages The data for new pages.
 * @returns {object[]}
 */
export function withHtml(pages) {
	return pages.map((page) => (page.text?.markdown ? { ...page, text: { ...page.text, content: markdownHtml(page.text.markdown) } } : page));
}

/**
 * Write what a plan changes in an entry's pages, side by side.
 * @param {JournalEntry} entry
 * @param {{create: object[], update: object[]}} pages As journalPlan plans them.
 * @returns {Promise<unknown>}
 */
export function writePlannedPages(entry, pages) {
	return Promise.all([
		pages.create.length ? entry.createEmbeddedDocuments("JournalEntryPage", withHtml(pages.create)) : null,
		pages.update.length ? entry.updateEmbeddedDocuments("JournalEntryPage", pages.update) : null
	]);
}

/**
 * Bring the hex and Site entries older versions made up to date, once a world:
 * a hex's Rolled page goes, now that Places shows the GM those rolls; its
 * Notes page still called that is the GM Notes by name too; and a page made
 * inside its entry, which the server left with nothing to show, gets its HTML.
 * A world setup step.
 * @returns {Promise<void>}
 */
export async function tidyKeptJournals() {
	const notesWas = t("hexJournal.pages.notesWas");
	await Promise.all((game.journal ?? []).map((entry) => {
		const flags = entry.flags?.[SYSTEM_ID];
		const hex = Boolean(flags?.[HEX_JOURNAL_FLAG]);
		if (!hex && !flags?.[SITE_JOURNAL_FLAG]) return null;
		const gone = [];
		const updates = [];
		for (const page of entry.pages ?? []) {
			const role = page.getFlag(SYSTEM_ID, "role");
			if (hex && role === "rolled") {
				gone.push(page.id);
				continue;
			}
			const update = {};
			if (hex && role === "notes" && page.name === notesWas) update.name = t("hexJournal.pages.notes");
			if (page.text?.markdown && !page.text?.content) update["text.content"] = markdownHtml(page.text.markdown);
			if (Object.keys(update).length) updates.push({ _id: page.id, ...update });
		}
		return Promise.all([
			gone.length ? entry.deleteEmbeddedDocuments("JournalEntryPage", gone) : null,
			updates.length ? entry.updateEmbeddedDocuments("JournalEntryPage", updates) : null
		]);
	}));
}

/**
 * Gather ids through a burst of writes, then hand them on together once it's
 * over: the map writes a Realm or a Site a little at a time.
 * @param {(ids: string[]) => void} flush
 * @param {() => Promise<unknown>} [settled] What else to wait for before the ids are taken.
 * @returns {(id: string) => void}
 */
export function afterBurst(flush, settled = () => Promise.resolve()) {
	const waiting = new Set();
	let later = null;
	const take = () => {
		const ids = [...waiting];
		waiting.clear();
		flush(ids);
	};
	return (id) => {
		waiting.add(id);
		later ??= foundry.utils.debounce(() => settled().then(take), 400);
		later();
	};
}

/** How long another GM waits for the active GM's browser to make an entry. */
const MADE_ELSEWHERE_MS = 3000;

/**
 * Wait for the active GM's browser to make an entry.
 * @param {() => JournalEntry|null} find
 * @returns {Promise<void>} Once the entry is there, or the wait is over.
 */
function madeElsewhere(find) {
	return new Promise((resolve) => {
		const done = () => {
			Hooks.off("createJournalEntry", made);
			clearTimeout(timer);
			resolve();
		};
		const made = () => find() && done();
		const timer = setTimeout(done, MADE_ELSEWHERE_MS);
		Hooks.on("createJournalEntry", made);
	});
}

/**
 * Open a kept entry, making it first if it's due one and hasn't got it yet.
 * Another GM's browser waits a moment for the active GM's to make it.
 * @param {object} keeper
 * @param {() => JournalEntry|null} keeper.find The entry, if it's there.
 * @param {() => boolean} keeper.on Whether these entries are kept in this world.
 * @param {() => boolean} keeper.keeps Whether this browser is the one that writes them.
 * @param {() => Promise<void>} keeper.make Bring the entry up to date, making it if it's due.
 * @param {string} keeper.none The warning when there's still none.
 * @returns {Promise<JournalEntry|null>}
 */
export async function openKeptJournal({ find, on, keeps, make, none }) {
	if (!find()) {
		if (keeps()) await make();
		else if (game.user?.isGM && game.users?.activeGM && on()) await madeElsewhere(find);
	}
	const entry = find();
	if (!entry) {
		warn(none);
		return null;
	}
	await entry.sheet.render({ force: true });
	return entry;
}
