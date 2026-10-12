/**
 * A Journal entry for each hex something has been rolled or written for, so
 * the Realm's hexes can be read in Foundry's own Journal: what the Company
 * knows of it, which players read once they could open the hex in their
 * Places, and a page for the GM alone copying what they wrote in the hex's
 * What's here, so there is one place to write it. What was rolled there the GM
 * reads in the hex's Lay of the Land in Places. Everything here is worded
 * before it comes in, so this is pure and can be tested without Foundry.
 */
import { SYSTEM_ID } from "../system-id.js";

/** The flag that marks an entry as a hex's, `{scene, hex}`. */
export const HEX_JOURNAL_FLAG = "hexJournal";

/** The flag that marks a Realm's folder of hex entries, holding the Scene's id. */
export const HEX_JOURNALS_FOLDER_FLAG = "hexJournalsFolder";

/** Each page's part, kept in the page's own flag so it's found whatever it's renamed to. */
export const PAGE_ROLES = Object.freeze(["known", "notes"]);

/**
 * The page flag a hex's notes page carries once it copies the GM's note. A
 * notes page without it is an older one the GM wrote in by hand.
 */
export const MIRROR_FLAG = "mirror";

/** Flags each new page carries beside its part. */
const PAGE_FLAGS = Object.freeze({ notes: Object.freeze({ [MIRROR_FLAG]: true }) });

/** CONST.DOCUMENT_OWNERSHIP_LEVELS, which the tests can't reach. */
export const OWNERSHIP = Object.freeze({ INHERIT: -1, NONE: 0, LIMITED: 1, OBSERVER: 2 });

/** CONST.JOURNAL_ENTRY_PAGE_FORMATS.MARKDOWN. Foundry's server makes the page's HTML from it. */
export const MARKDOWN_FORMAT = 2;

/**
 * Who sees each page, as it's made. The entry decides whether players see the
 * entry at all; Limited on it shows them only the pages they may observe.
 */
const PAGE_OWNERSHIP = Object.freeze({ known: OWNERSHIP.OBSERVER, notes: OWNERSHIP.NONE });

/**
 * Text from a person or the book, made safe to set in markdown: the marks
 * markdown reads are escaped, and so is the start of a tag.
 * @param {unknown} text
 * @returns {string}
 */
export function inline(text) {
	return String(text ?? "")
		.replace(/[\\`*_[\]#|]/g, "\\$&")
		.replace(/</g, "&lt;")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Lines someone wrote, kept as their lines: each is escaped, and markdown is
 * told to break after it.
 * @param {unknown} text
 * @returns {string}
 */
export function block(text) {
	return String(text ?? "")
		.split(/\r?\n/)
		.map((line) => inline(line))
		.join("  \n")
		.replace(/(?: {2}\n)+$/, "")
		.trim();
}

/** @returns {string} Words joined by a middle dot, those that are empty left out. */
const dotted = (parts) => parts.filter(Boolean).map(inline).join(" · ");

/**
 * @param {string} heading
 * @param {string[]} body Paragraphs or list lines, already markdown.
 * @returns {string} A section, or nothing when there's nothing under the heading.
 */
export function section(heading, body) {
	const lines = body.filter(Boolean);
	return lines.length ? [`### ${inline(heading)}`, "", ...lines].join("\n") : "";
}

/** @returns {string} The Barriers the Company ran into from the hex, as a section. */
const metSection = (words) => section(words.labels.met ?? "", (words.met ?? []).map((line) => `- ${inline(line)}`));

/** @returns {string} When something happened, after a dash, or nothing. */
const whenSuffix = (when) => (when ? ` — *${inline(when)}*` : "");

/** @returns {string} The sections with a blank line between, ending in one newline. */
export const joined = (parts) => `${parts.filter(Boolean).join("\n\n")}\n`;

/**
 * @typedef {object} KnownWords
 * @property {string} terrain
 * @property {string[]} features What the players can see stands there.
 * @property {string} sighted
 * @property {string} visits
 * @property {{note: string, when: string|null}[]} told Newest first.
 * @property {{text: string, by: string}|null} party
 * @property {string[]} [met]   The Barriers the Company found by running into them from here.
 * @property {{told: string, party: string, met?: string}} labels
 */

/**
 * The page players read: the hex as their Places shows it, and nothing more.
 * @param {KnownWords} words
 * @returns {string} Markdown.
 */
export function knownMarkdown(words) {
	const { labels } = words;
	const told = words.told.map(({ note, when }) => `- ${inline(note)}${whenSuffix(when)}`);
	// The writer under the note, a paragraph of its own.
	const party = words.party ? [[block(words.party.text), words.party.by ? `*${inline(words.party.by)}*` : ""].filter(Boolean).join("\n\n")] : [];
	return joined([
		dotted([words.terrain, ...words.features]),
		dotted([words.sighted, words.visits]),
		metSection(words),
		section(labels.told, told),
		section(labels.party, party)
	]);
}

/**
 * The GM's page: what they wrote in the hex's What's here, kept as their lines.
 * @param {string} note
 * @returns {string} Markdown, empty for no note.
 */
export const noteMarkdown = (note) => (String(note ?? "").trim() ? joined([block(note)]) : "");

/**
 * The GM's note with what they wrote on an older entry's own notes page added
 * at its foot, so nothing is lost as that page becomes a copy of the note.
 * @param {string} note What the hex's What's here holds.
 * @param {string} written What the GM wrote on the page.
 * @returns {string|null} The note to keep, or null where the note is the page's words or already ends with them.
 */
export function noteWithPage(note, written) {
	const page = String(written ?? "").trim();
	const kept = String(note ?? "").trim();
	// Only whole: a page saying "Bog" isn't held by a note saying "Bogwater ford".
	if (!page || kept === page || kept.endsWith(`\n\n${page}`)) return null;
	return kept ? `${kept}\n\n${page}` : page;
}

/**
 * Entries run down the folder by column, then row.
 * @param {{col: number, row: number}} hex
 * @returns {number}
 */
export const entrySort = ({ col, row }) => col * 1000 + row;

/**
 * @typedef {object} WantedEntry
 * @property {string} key       The hex's key.
 * @property {{col: number, row: number}} hex
 * @property {string} name      What the players may know it by: never a secret.
 * @property {boolean} open     Whether players could open the hex in their Places.
 * @property {Record<"known"|"notes", {name: string, markdown?: string}>} pages
 */

/**
 * @typedef {object} EntrySnapshot What's in the world for a hex already.
 * @property {string} id
 * @property {string} name
 * @property {number} sort
 * @property {number} ownership The entry's default ownership.
 * @property {boolean} open     Whether the entry was last opened to players.
 * @property {Partial<Record<"known"|"notes", {id: string, markdown: string}>>} pages
 */

/**
 * @typedef {object} JournalLayout The pages a kind of entry has, and how it's filed.
 * @property {readonly string[]} roles   Every page, in order.
 * @property {readonly string[]} written The pages the system writes again on each change; the rest are only made.
 * @property {Readonly<Record<string, number>>} pageOwnership Who sees each page, as it's made.
 * @property {Readonly<Record<string, object>>} [pageFlags] Flags a page carries beside its part, as it's made.
 * @property {((wanted: object) => number)|null} sort Where the entry stands in its folder, or null to leave it.
 */

/** @type {Readonly<JournalLayout>} A hex's entry. */
export const HEX_LAYOUT = Object.freeze({ roles: PAGE_ROLES, written: PAGE_ROLES, pageOwnership: PAGE_OWNERSHIP, pageFlags: PAGE_FLAGS, sort: (wanted) => entrySort(wanted.hex) });

/** @returns {number} Where a page stands in its entry, in the layout's order. */
const pageSort = (layout, role) => (layout.roles.indexOf(role) + 1) * 100000;

/** @returns {object} A text page in markdown. */
const markdownText = (markdown) => ({ format: MARKDOWN_FORMAT, markdown: markdown ?? "" });

/**
 * @param {JournalLayout} layout
 * @param {string} role
 * @param {{name: string, markdown?: string}} page
 * @returns {object} The data for a new page.
 */
const newPage = (layout, role, page) => ({
	name: page.name,
	type: "text",
	sort: pageSort(layout, role),
	text: markdownText(page.markdown),
	ownership: { default: layout.pageOwnership[role] },
	flags: { [SYSTEM_ID]: { role, ...layout.pageFlags?.[role] } }
});

/**
 * What a hex's entry is opened to, given what it was and whether players can
 * now open the hex. Only a change of `open` is acted on, and only as far as
 * the system took it, so a GM who shows an entry to players by hand isn't
 * undone by the next roll.
 * @param {number} current
 * @param {boolean} wasOpen
 * @param {boolean} open
 * @returns {number}
 */
export function entryOwnership(current, wasOpen, open) {
	if (open && !wasOpen) return Math.max(current, OWNERSHIP.LIMITED);
	if (!open && wasOpen && current === OWNERSHIP.LIMITED) return OWNERSHIP.NONE;
	return current;
}

/**
 * The hexes due an entry: those with something kept (a roll or the GM's note),
 * a Barrier met from them, or a name the GM gave them, those that have one
 * already, and any the GM asked for by hand.
 * @param {object} kept
 * @param {Record<string, object>} [kept.lore] The hexes' kept records, by key.
 * @param {Record<string, {met?: object[]}>} [kept.shared] What the Company shares of each hex, by key.
 * @param {Record<string, {name?: string}>} [kept.names] The GM's names for hexes, by key.
 * @param {Iterable<string>} [kept.existing] The keys of hexes with an entry.
 * @param {Iterable<string>} [kept.also] The keys of hexes the GM asked an entry for.
 * @returns {Set<string>}
 */
export function dueHexKeys({ lore = {}, shared = {}, names = {}, existing = [], also = [] }) {
	const met = Object.entries(shared).filter(([, record]) => record?.met?.length).map(([key]) => key);
	const named = Object.entries(names).filter(([, record]) => record?.name?.trim()).map(([key]) => key);
	return new Set([...Object.keys(lore), ...met, ...named, ...existing, ...also]);
}

/**
 * The writes that bring a hex's entry up to date. Nothing that's already right
 * is written, and a page the layout only makes is made once and then left
 * alone, even if the GM deletes it.
 * @param {EntrySnapshot|null} existing
 * @param {WantedEntry} wanted
 * @param {JournalLayout} [layout] What pages the entry has. A hex's, unless said.
 * @returns {{create: object|null, update: object|null, open: boolean|null, pages: {create: object[], update: object[]}}}
 *   `create` is a new entry's data, pages and all, without its folder or flags,
 *   which the caller adds. `update` is a change to the entry. `open` is what to
 *   remember of whether players were let in, or null to leave it. `pages` are
 *   the changes to its pages.
 */
export function journalPlan(existing, wanted, layout = HEX_LAYOUT) {
	const pages = { create: [], update: [] };
	const wantedPages = wanted.pages;
	const sort = layout.sort ? layout.sort(wanted) : null;
	if (!existing) {
		return {
			create: {
				name: wanted.name,
				...(sort === null ? {} : { sort }),
				ownership: { default: wanted.open ? OWNERSHIP.LIMITED : OWNERSHIP.NONE },
				pages: layout.roles.map((role) => newPage(layout, role, wantedPages[role]))
			},
			update: null,
			open: wanted.open,
			pages
		};
	}

	const update = {};
	if (existing.name !== wanted.name) update.name = wanted.name;
	if (sort !== null && existing.sort !== sort) update.sort = sort;
	const opening = existing.open !== wanted.open;
	if (opening) {
		const ownership = entryOwnership(existing.ownership, existing.open, wanted.open);
		if (ownership !== existing.ownership) update["ownership.default"] = ownership;
	}

	layout.written.forEach((role) => {
		const page = existing.pages[role];
		const markdown = wantedPages[role].markdown ?? "";
		if (!page) pages.create.push(newPage(layout, role, wantedPages[role]));
		else if (page.markdown !== markdown) pages.update.push({ _id: page.id, text: markdownText(markdown) });
	});

	return { create: null, update: Object.keys(update).length ? update : null, open: opening ? wanted.open : null, pages };
}
