/**
 * A Knight's Ledger: every change made to their sheet, who made it and when,
 * after the Stonetop character ledger. An update is read into short lines such
 * as "VIG changed from 12 to 9", which are kept newest first in a flag on the
 * actor. Pure, so it can be tested without Foundry: the words come from `t`,
 * and the names of linked actors from `nameOf`.
 */
import { LINKED_ACTORS, MARKED_CONDITIONS } from "../config.js";
import { VIRTUES } from "./virtues.js";
import { RANKS, rankForGlory } from "./glory.js";

/** The flag the Ledger is kept in. */
export const LEDGER_FLAG = "ledger";

/** The Ledger is a flag, so it can't grow forever; the oldest lines go first. */
export const LEDGER_MAX_ENTRIES = 300;

/** Changes to one thing by one person this close together are one line: HP clicked down 6, 5, 4 reads 6 to 4. */
export const MERGE_WINDOW_MS = 60_000;

/** How many names one "added" line gathers before the next starts a line of its own. */
const LIST_MAX_ITEMS = 24;

/** The longest a value may run inside a line before it's cut short. */
const VALUE_MAX_CHARS = 72;

/** The Ledger window's filter groups, in the order it lists them. */
export const LEDGER_CATEGORIES = Object.freeze(["knight", "virtues", "conditions", "glory", "company", "property", "abilities", "notes", "other"]);

/** Which filter group each item type's lines fall in. */
const ITEM_CATEGORIES = Object.freeze({
	weapon: "property",
	armour: "property",
	gear: "property",
	ability: "abilities",
	passion: "abilities",
	scar: "abilities"
});

/**
 * @typedef {object} LedgerContext
 * @property {(key: string, data?: object) => string} t  Words under `bastionland.`
 * @property {(uuid: string) => string} [nameOf]        The name of a linked actor.
 * @property {(type: string) => string} [typeLabel]     An item type's name, such as "Weapon".
 */

/**
 * @typedef {object} LedgerEntry
 * @property {string} subject   What changed, such as "VIG" or "Weapon", for the filter.
 * @property {string} action    The line as read, such as "VIG changed from 12 to 9".
 * @property {string} category  One of LEDGER_CATEGORIES.
 * @property {string} [cause]   What made the change, when it wasn't done by hand, such as "Rest".
 * @property {object} [merge]   How a following change to the same thing folds into this line.
 */

const isBlank = (value) => value === undefined || value === null || value === "";

/**
 * @param {*} value
 * @returns {string} The value on one line, cut short at a word near the limit.
 */
export function shortValue(value) {
	if (isBlank(value)) return "";
	const text = Array.isArray(value) ? value.join(", ") : stripHTML(String(value));
	if (text.length <= VALUE_MAX_CHARS) return text;
	const slice = text.slice(0, VALUE_MAX_CHARS);
	const space = slice.lastIndexOf(" ");
	return `${(space > VALUE_MAX_CHARS * 0.6 ? slice.slice(0, space) : slice).trimEnd()}…`;
}

/**
 * @param {string} html
 * @returns {string} Its text alone, on one line.
 */
export function stripHTML(html) {
	return String(html ?? "")
		.replace(/<[^>]*>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, "\"")
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * "Set to", "changed from … to" or "cleared", as the values call for.
 * @param {LedgerContext["t"]} t
 * @param {string} subject
 * @param {string} from Shown as it reads; blank for nothing.
 * @param {string} to
 */
export function changePhrase(t, subject, from, to) {
	if (isBlank(from)) return t("ledger.phrases.set", { subject, value: to });
	if (isBlank(to)) return t("ledger.phrases.cleared", { subject });
	return t("ledger.phrases.changed", { subject, from, to });
}

/**
 * A line for a value that changed. `merges` lets a run of changes fold into one line.
 * @returns {LedgerEntry|null} Null when it reads the same either way.
 */
function valueEntry(t, { subject, category, key, from, to, merges = false }) {
	const shownFrom = shortValue(from);
	const shownTo = shortValue(to);
	if (shownFrom === shownTo) return null;
	const entry = { subject, category, action: changePhrase(t, subject, shownFrom, shownTo) };
	if (merges) entry.merge = { kind: "value", key, subject, from: shownFrom, to: shownTo };
	return entry;
}

/** Rich text: whether it was written, rewritten or cleared, never the text itself. */
function proseEntry(t, { subject, category, from, to }) {
	const had = stripHTML(from);
	const has = stripHTML(to);
	if (had === has) return null;
	const phrase = !had ? "written" : !has ? "cleared" : "rewritten";
	return { subject, category, action: t(`ledger.phrases.${phrase}`, { subject }) };
}

/** A picture: that it changed, never the file or the painted data it holds. */
function pictureEntry(t, { subject, category, from, to }) {
	if ((from ?? "") === (to ?? "")) return null;
	if (!to) return { subject, category, action: t("ledger.phrases.cleared", { subject }) };
	return { subject, category, action: t("ledger.phrases.replaced", { subject }) };
}

/** A box ticked or unticked. */
function markEntry(t, { subject, category, from, to }) {
	if (Boolean(from) === Boolean(to)) return null;
	return { subject, category, action: t(to ? "ledger.phrases.marked" : "ledger.phrases.unmarked", { subject }) };
}

/**
 * @param {object} object
 * @param {string} path Dotted, such as "system.virtues.vig.value".
 */
const getPath = (object, path) => path.split(".").reduce((node, part) => node?.[part], object);

/**
 * What each watched field of a Knight is called, where it's filed, and how its
 * change reads. Built per call so the words follow the language.
 * @param {LedgerContext} context
 */
function knightFields({ t, nameOf = (uuid) => uuid }) {
	const link = (value) => (value ? nameOf(value) : "");
	return [
		{ path: "name", subject: t("ledger.subjects.name"), category: "knight", kind: "value" },
		{ path: "img", subject: t("ledger.subjects.portrait"), category: "knight", kind: "picture" },
		{ path: "system.knightType", subject: t("ledger.subjects.knightType"), category: "knight", kind: "value" },
		{ path: "system.seer", subject: t("ledger.subjects.seer"), category: "knight", kind: "value" },
		{ path: "system.seerImg", subject: t("ledger.subjects.seerImg"), category: "knight", kind: "picture" },
		{ path: "system.seerNotes", subject: t("ledger.subjects.seerNotes"), category: "notes", kind: "prose" },
		{ path: "system.fate", subject: t("ledger.subjects.fate"), category: "knight", kind: "value" },
		{ path: "system.heraldry", subject: t("ledger.subjects.heraldry"), category: "knight", kind: "picture" },
		{ path: "system.age", subject: t("age.label"), category: "knight", kind: "value", show: (age) => (age ? t(`age.${age}`) : "") },
		...LINKED_ACTORS.map(({ key, label }) => (
			{ path: `system.${key}`, subject: t(label), category: "company", kind: "value", show: link }
		)),
		{ path: "system.glory", subject: t("glory.label"), category: "glory", kind: "value", merges: true },
		...VIRTUES.flatMap((key) => {
			const abbr = t(`virtues.${key}.abbr`);
			return [
				{ path: `system.virtues.${key}.value`, subject: abbr, category: "virtues", kind: "value", merges: true },
				{ path: `system.virtues.${key}.max`, subject: t("ledger.subjects.max", { subject: abbr }), category: "virtues", kind: "value", merges: true }
			];
		}),
		{ path: "system.guard.value", subject: t("guard.abbr"), category: "virtues", kind: "value", merges: true },
		{ path: "system.guard.max", subject: t("ledger.subjects.max", { subject: t("guard.abbr") }), category: "virtues", kind: "value", merges: true },
		...MARKED_CONDITIONS.map((key) => (
			{ path: `system.${key}`, subject: t(`conditions.${key}.label`), category: "conditions", kind: "mark" }
		)),
		{ path: "system.notes", subject: t("ledger.subjects.notes"), category: "notes", kind: "prose" }
	];
}

/**
 * The lines an update to a Knight makes, in the order the sheet reads.
 * @param {object} knight The actor as it was before the update.
 * @param {Record<string, *>} flat The update, flattened to dotted paths.
 * @param {LedgerContext} context
 * @returns {LedgerEntry[]}
 */
export function knightChanges(knight, flat, context) {
	const { t } = context;
	const has = (path) => Object.hasOwn(flat, path);
	const entries = [];
	for (const field of knightFields(context)) {
		if (!has(field.path)) continue;
		const from = getPath(knight, field.path);
		const to = flat[field.path];
		const { subject, category } = field;
		let entry;
		if (field.kind === "prose") entry = proseEntry(t, { subject, category, from, to });
		else if (field.kind === "picture") entry = pictureEntry(t, { subject, category, from, to });
		else if (field.kind === "mark") entry = markEntry(t, { subject, category, from, to });
		else {
			const show = field.show ?? ((value) => value);
			entry = valueEntry(t, { subject, category, key: field.path, from: show(from), to: show(to), merges: field.merges });
		}
		if (entry) entries.push(entry);
	}

	// Rank follows Glory, so the line that matters is the rank reached.
	if (has("system.glory")) {
		const from = rankForGlory(getPath(knight, "system.glory"));
		const to = rankForGlory(flat["system.glory"]);
		if (from !== to && RANKS.some((rank) => rank.key === to)) {
			entries.push(valueEntry(t, { subject: t("rank.label"), category: "glory", key: "rank", from: t(`rank.${from}`), to: t(`rank.${to}`), merges: true }));
		}
	}

	if (has("system.isSquire") && Boolean(flat["system.isSquire"]) !== Boolean(getPath(knight, "system.isSquire"))) {
		entries.push({
			subject: t("squire.label"),
			category: "glory",
			action: t(flat["system.isSquire"] ? "ledger.phrases.madeSquire" : "ledger.phrases.knighted")
		});
	}

	// The table on their page: only what they rolled, not the book filling it in or swapping it for another Knight's.
	const table = getPath(knight, "system.bookTable") ?? {};
	const swapped = ["knight", "name"].some((part) => has(`system.bookTable.${part}`) && flat[`system.bookTable.${part}`] !== table[part]);
	if (has("system.bookTable.rolls") && !swapped) {
		const shown = (rolls) => (rolls ?? []).some(Boolean) ? rolls.map((roll) => roll || "–").join(", ") : "";
		const entry = valueEntry(t, {
			subject: table.name || t("ledger.subjects.table"),
			category: "knight",
			from: shown(table.rolls),
			to: shown(flat["system.bookTable.rolls"])
		});
		if (entry) entries.push(entry);
	}
	return entries;
}

/**
 * @param {object} item
 * @param {LedgerContext} context
 */
function itemSubject(item, { typeLabel = (type) => type }) {
	return { subject: typeLabel(item.type), category: ITEM_CATEGORIES[item.type] ?? "other" };
}

/**
 * Items given to or taken from a Knight. Several at once, such as a Start's
 * kit, fold into one line per type.
 * @param {object} item
 * @param {"added"|"removed"} phrase
 * @param {LedgerContext} context
 * @returns {LedgerEntry|null}
 */
export function itemListEntry(item, phrase, context) {
	if (!ITEM_CATEGORIES[item?.type]) return null;
	const { subject, category } = itemSubject(item, context);
	const merge = { kind: "list", key: `${phrase}.${item.type}`, phrase, subject, items: [item.name] };
	return { subject, category, action: listPhrase(context.t, merge), merge };
}

/**
 * The lines an update to one of a Knight's items makes.
 * @param {object} item The item as it was before the update.
 * @param {Record<string, *>} flat The update, flattened to dotted paths.
 * @param {LedgerContext} context
 * @returns {LedgerEntry[]}
 */
export function itemChanges(item, flat, context) {
	if (!ITEM_CATEGORIES[item?.type]) return [];
	const { t } = context;
	const { category } = itemSubject(item, context);
	const subject = item.name;
	const has = (path) => Object.hasOwn(flat, path);
	const field = (name) => t("ledger.subjects.itemField", { item: subject, field: name });
	const entries = [];
	if (has("name") && flat.name && flat.name !== item.name) {
		entries.push({ subject, category, action: t("ledger.phrases.renamed", { subject, name: flat.name }) });
	}
	if (has("system.equipped") && Boolean(flat["system.equipped"]) !== Boolean(item.system?.equipped)) {
		entries.push({ subject, category, action: t(flat["system.equipped"] ? "ledger.phrases.equipped" : "ledger.phrases.unequipped", { subject }) });
	}
	if (has("system.damage")) {
		const entry = valueEntry(t, { subject: field(t("ledger.subjects.damage")), category, from: item.system?.damage, to: flat["system.damage"] });
		if (entry) entries.push(entry);
	}
	if (item.type === "armour" && has("system.armour")) {
		const entry = valueEntry(t, { subject: field(t("ledger.subjects.armour")), category, key: `${item._id ?? item.id}.armour`, from: item.system?.armour, to: flat["system.armour"], merges: true });
		if (entry) entries.push(entry);
	}
	if (item.type === "scar" && has("system.resolved") && Boolean(flat["system.resolved"]) !== Boolean(item.system?.resolved)) {
		entries.push({ subject, category, action: t(flat["system.resolved"] ? "ledger.phrases.settled" : "ledger.phrases.unsettled", { subject }) });
	}
	if (has("system.description")) {
		const entry = proseEntry(t, { subject: field(t("ledger.subjects.description")), category, from: item.system?.description, to: flat["system.description"] });
		if (entry) entries.push(entry);
	}
	// Filed under the item's name, so its lines can be found together.
	return entries.map((entry) => ({ ...entry, subject }));
}

/** @returns {string} A list run's line, such as "Weapon added: Longsword, Dagger". */
function listPhrase(t, merge) {
	return t(`ledger.phrases.${merge.phrase}`, { subject: merge.subject, names: shortValue(merge.items) });
}

/** Marks a pair of changes that undo each other, such as VIG 9 to 10 and back to 9. */
const DROP_PAIR = Symbol("drop-pair");

/**
 * Fold `entry` into the line before it when both belong to one run.
 * @returns {LedgerEntry|typeof DROP_PAIR|null} The folded line, DROP_PAIR, or null when they don't fold.
 */
function mergeInto(previous, entry, t) {
	const a = previous?.merge;
	const b = entry?.merge;
	if (!a || !b || a.kind !== b.kind || a.key !== b.key) return null;
	if ((previous.cause ?? null) !== (entry.cause ?? null)) return null;
	if ((previous.userId ?? null) !== (entry.userId ?? null)) return null;
	if (Math.abs((entry.timestamp ?? 0) - (previous.timestamp ?? 0)) > MERGE_WINDOW_MS) return null;

	if (a.kind === "value") {
		// Only a run that picks up where the last left off: 5 to 6 then 6 to 7, not 5 to 6 then 9 to 10.
		if (a.to !== b.from) return null;
		if (a.from === b.to) return DROP_PAIR;
		const merge = { ...a, to: b.to };
		return { ...previous, timestamp: entry.timestamp, merge, action: changePhrase(t, a.subject, merge.from, merge.to) };
	}
	if (a.kind === "list") {
		if (a.items.length >= LIST_MAX_ITEMS) return null;
		const items = [...a.items];
		for (const name of b.items) if (!items.includes(name)) items.push(name);
		const merge = { ...a, items };
		return { ...previous, timestamp: entry.timestamp, merge, action: listPhrase(t, merge) };
	}
	return null;
}

/**
 * Fold runs across entries kept newest first.
 * @param {object[]} newestFirst
 * @param {LedgerContext["t"]} t
 * @returns {object[]}
 */
export function mergeRuns(newestFirst, t) {
	const out = [];
	// Oldest to newest, so each line folds into the run built before it.
	for (const entry of [...newestFirst].reverse()) {
		const previous = out.at(-1);
		const merged = previous ? mergeInto(previous, entry, t) : null;
		if (!merged) out.push(entry);
		else if (merged === DROP_PAIR) out.pop();
		else out[out.length - 1] = merged;
	}
	return out.reverse();
}

/**
 * The Ledger with new lines written in. Only the newest line kept is offered
 * to fold into, so older history is never rewritten.
 * @param {object[]} stored   The Ledger as kept, newest first.
 * @param {object[]} stamped  New lines, stamped, in the order they happened.
 * @param {LedgerContext["t"]} t
 * @returns {object[]}
 */
export function writeIntoLedger(stored, stamped, t) {
	const kept = Array.isArray(stored) ? stored : [];
	const head = mergeRuns([...stamped].reverse().concat(kept.slice(0, 1)), t);
	return head.concat(kept.slice(1)).slice(0, LEDGER_MAX_ENTRIES);
}

/**
 * The filter's groups, each with the subjects filed in it, in LEDGER_CATEGORIES order.
 * @param {object[]} entries
 * @returns {{id: string, count: number, subjects: string[]}[]}
 */
export function ledgerGroups(entries) {
	const groups = new Map();
	for (const entry of entries ?? []) {
		const id = LEDGER_CATEGORIES.includes(entry?.category) ? entry.category : "other";
		if (!groups.has(id)) groups.set(id, { id, count: 0, subjects: new Set() });
		const group = groups.get(id);
		group.count += 1;
		if (entry.subject) group.subjects.add(entry.subject);
	}
	return [...groups.values()]
		.sort((a, b) => LEDGER_CATEGORIES.indexOf(a.id) - LEDGER_CATEGORIES.indexOf(b.id))
		.map((group) => ({ ...group, subjects: [...group.subjects].sort((a, b) => a.localeCompare(b)) }));
}

/**
 * @param {number} timestamp
 * @returns {string} The local day it falls on, such as "2026-09-19", or "" when unknown.
 */
export function ledgerDay(timestamp) {
	const date = timestamp ? new Date(timestamp) : null;
	if (!date || Number.isNaN(date.getTime())) return "";
	return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
