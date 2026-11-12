/**
 * Knights the Referee writes for themselves, each with the Seer who knighted
 * them, to be chosen as any Knight of the book is. One is kept on a Journal
 * entry of its own, so it can be used in any Company, and lent from world to
 * world. It has what a Knight's page has: a verse under their name, a picture,
 * their Property, an Ability and a Passion, a d6 table, and their Seer with a
 * picture, scores and traits.
 *
 * The rest of the system reads one as it reads a Knight of the book, from an
 * entry shaped as Import PDF shapes theirs, with the Journal entry's id as
 * `own` and no roll or page. Pure, so it can be tested without Foundry.
 */
import { kitForPage } from "./ability-kits.js";
import { knightTypeKey, seerKey } from "./creation.js";
import { listOf, TABLE_COLUMNS, TABLE_ROWS, textOf } from "./own-myths.js";
import { propertyItems } from "./property.js";
import { actorFromStatBlock } from "./stat-blocks.js";
import { VIRTUES } from "./virtues.js";

export const OWN_KNIGHT_VERSION = 1;

/** The scores a Seer is written with: their Virtues and GD. */
export const SEER_SCORES = Object.freeze([...VIRTUES, "guard"]);

/**
 * @typedef {object} OwnPart An Ability or a Passion.
 * @property {string} name
 * @property {string} text
 * @property {string[]} list The choices its words end on, if any.
 *
 * @typedef {object} OwnKnight
 * @property {number} version
 * @property {object} knight
 * @property {string[]} knight.verse      The lines under their name.
 * @property {string} knight.img          Their portrait's path, or "".
 * @property {string} knight.token        Their token's path, or "" to use the portrait.
 * @property {string[]} knight.property   A line each, written as the book writes them, such as "Old sword (d8 hefty), mail (A1)".
 * @property {OwnPart} knight.ability
 * @property {OwnPart} knight.passion
 * @property {number|null} knight.worksLike The page of the book Knight whose Ability theirs works like, or null.
 * @property {{name: string, columns: string[], rows: string[][], sentences: string[], joins: string[]}} knight.table
 *   Always TABLE_ROWS rows of TABLE_COLUMNS entries, and a sentence for each column, any of them blank.
 *   `joins` are how a column's sentence reads joined onto the one before, copied from a book Knight's
 *   table; none is written by hand, and each goes once its sentence is changed (withJoinsKept).
 * @property {object} seer
 * @property {string} seer.name
 * @property {string} seer.img
 * @property {{vig: number|null, cla: number|null, spi: number|null, guard: number|null}} seer.stats
 * @property {string[]} seer.lines        A trait each, written as the book writes a stat block's.
 */

/**
 * Lines from an array, or from a form's text box, one a line, without the blank ones.
 * @param {unknown} value
 * @returns {string[]}
 */
export function linesOf(value) {
	const source = Array.isArray(value) ? value : (typeof value === "string" ? value.split(/\r?\n/) : []);
	return source.map(textOf).filter(Boolean);
}

/**
 * @param {unknown} value A score, as kept or as a form gives it.
 * @returns {number|null} A whole number of none or more, or null where none is written.
 */
export function scoreOf(value) {
	if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
	const number = Number(value);
	return Number.isInteger(number) && number >= 0 ? number : null;
}

/**
 * @param {unknown} raw
 * @returns {OwnPart}
 */
function partOf(raw) {
	const part = raw && typeof raw === "object" ? raw : {};
	return { name: textOf(part.name), text: textOf(part.text), list: linesOf(part.list) };
}

/** @returns {OwnKnight} A Knight with nothing written yet. */
export const emptyOwnKnight = () => normaliseOwnKnight(null);

/**
 * A written Knight from whatever an entry's flag or a form holds, however old or bad.
 * @param {unknown} raw
 * @returns {OwnKnight}
 */
export function normaliseOwnKnight(raw) {
	const data = raw && typeof raw === "object" ? raw : {};
	const knight = data.knight && typeof data.knight === "object" ? data.knight : {};
	const table = knight.table && typeof knight.table === "object" ? knight.table : {};
	const seer = data.seer && typeof data.seer === "object" ? data.seer : {};
	const stats = seer.stats && typeof seer.stats === "object" ? seer.stats : {};
	return {
		version: OWN_KNIGHT_VERSION,
		knight: {
			verse: linesOf(knight.verse),
			img: textOf(knight.img),
			token: textOf(knight.token),
			property: linesOf(knight.property),
			ability: partOf(knight.ability),
			passion: partOf(knight.passion),
			worksLike: scoreOf(knight.worksLike) || null,
			table: {
				name: textOf(table.name),
				columns: listOf(table.columns, TABLE_COLUMNS, textOf),
				rows: listOf(table.rows, TABLE_ROWS, (row) => listOf(row, TABLE_COLUMNS, textOf)),
				sentences: listOf(table.sentences, TABLE_COLUMNS, textOf),
				joins: listOf(table.joins, TABLE_COLUMNS, textOf)
			}
		},
		seer: {
			name: textOf(seer.name),
			img: textOf(seer.img),
			stats: Object.fromEntries(SEER_SCORES.map((key) => [key, scoreOf(stats[key])])),
			lines: linesOf(seer.lines)
		}
	};
}

/**
 * @param {OwnKnight} data
 * @returns {boolean} Whether anything of their table is written.
 */
export function ownTableWritten({ knight: { table } }) {
	return Boolean(table.name || table.columns.some(Boolean) || table.rows.some((row) => row.some(Boolean)));
}

/**
 * @param {OwnKnight} before
 * @param {OwnKnight} after
 * @returns {boolean} Whether the two differ in anything kept.
 */
export const ownKnightChanged = (before, after) => JSON.stringify(before) !== JSON.stringify(after);

/**
 * @param {OwnKnight} data
 * @returns {boolean} Whether nothing at all is written or chosen, so an entry
 *   made for it and closed untouched can go again.
 */
export const isBlankOwnKnight = (data) => !ownKnightChanged(emptyOwnKnight(), normaliseOwnKnight(data));

/**
 * @param {OwnPart} part
 * @returns {{name: string, text: string, list?: string[]}|null} As the index has an Ability or Passion: null while unnamed.
 */
function entryPart(part) {
	if (!part.name) return null;
	return { name: part.name, text: part.text, ...(part.list.length ? { list: [...part.list] } : {}) };
}

/**
 * A written Knight as the rest of the system reads one, shaped as Import PDF
 * shapes a Knight of the book, so choosing, their sheet and their items treat
 * the two alike. They have no roll or page, but may borrow the kit of the book
 * Knight whose Ability theirs works like, as `kitPage`.
 * @param {string} id The Journal entry's.
 * @param {string} name The entry's name, such as "The Lantern Knight".
 * @param {OwnKnight} data
 * @param {object} fallbacks What to call what the Referee left unnamed.
 * @param {string} fallbacks.table The table, unnamed.
 * @param {(number: number) => string} fallbacks.column A column without a heading, by its number from 1.
 * @returns {object} As an index entry, with `own`.
 */
export function ownKnightEntry(id, name, data, { table: tableName, column }) {
	const { knight } = data;
	const { sentences, joins } = knight.table;
	return {
		own: id,
		roll: null,
		d6: null,
		d12: null,
		page: null,
		kitPage: knight.worksLike,
		name,
		path: knight.img || null,
		// No square cut is made of a written Knight's portrait, so it is their token too.
		token: knight.token || knight.img || null,
		verse: knight.verse.length ? [...knight.verse] : null,
		property: [...knight.property],
		ability: entryPart(knight.ability),
		passion: entryPart(knight.passion),
		table: ownTableWritten(data)
			? {
				name: knight.table.name || tableName,
				columns: knight.table.columns.map((heading, index) => heading || column(index + 1)),
				rows: knight.table.rows.map((row) => [...row]),
				...(sentences.some(Boolean) ? { sentences: [...sentences], ...(joins.some(Boolean) ? { joins: [...joins] } : {}) } : {})
			}
			: null
	};
}

/**
 * A written Knight's Seer as the rest of the system reads one, shaped as Import
 * PDF shapes a Seer of the book.
 * @param {string} id The Journal entry's, which their Knight shares.
 * @param {OwnKnight} data
 * @returns {object|null} As an index entry, with `own`, or null while the Seer is unnamed.
 */
export function ownSeerEntry(id, { seer }) {
	if (!seer.name) return null;
	const written = SEER_SCORES.some((key) => seer.stats[key] !== null);
	return {
		own: id,
		roll: null,
		d6: null,
		d12: null,
		page: null,
		name: seer.name,
		path: seer.img || null,
		stats: written ? { ...seer.stats } : null,
		lines: [...seer.lines],
		prompts: null
	};
}

/**
 * @param {object[]} knights Written Knights, from ownKnightEntry.
 * @param {object[]} book The book's Knights.
 * @returns {object[]} Those sharing no book Knight's name: the two would be one
 *   on a sheet, so one that does can't be chosen until it's renamed.
 */
export const clearOfTheBook = (knights, book) => (book.length ? knights.filter((knight) => !knightNameClash(knight.name, book)) : knights);

/**
 * The art index with the Referee's Knights and Seers after the book's, so a
 * lookup by name finds the book's first. Without an import there are only theirs.
 * A written Knight sharing a book Knight's name is left out (clearOfTheBook).
 * @param {object|null} index The art index.
 * @param {{knights: object[], seers: object[]}} own From ownKnightEntry and ownSeerEntry.
 * @returns {object}
 */
export function withOwnKnights(index, { knights = [], seers = [] } = {}) {
	const book = index?.knights ?? [];
	return {
		...(index ?? {}),
		knights: [...book, ...clearOfTheBook(knights, book)],
		seers: [...(index?.seers ?? []), ...seers]
	};
}

/**
 * @param {string} name A Knight's name, such as "The Lantern Knight" or "Lantern".
 * @param {object[]} knights Knights of the book and written alike.
 * @param {string|null} [exceptId] The written Knight being named, who can't clash with themself.
 * @returns {object|null} Another Knight of that name.
 */
export function knightNameClash(name, knights, exceptId = null) {
	const key = knightTypeKey(name);
	if (!key) return null;
	return knights.find((entry) => entry.name && entry.own !== exceptId && knightTypeKey(entry.name) === key) ?? null;
}

/**
 * @param {string} name A Seer's name.
 * @param {object[]} seers Seers of the book and written alike.
 * @param {string|null} [exceptId] The written Knight whose Seer is being named.
 * @returns {object|null} Another Seer of that name.
 */
export function seerNameClash(name, seers, exceptId = null) {
	const key = seerKey(name);
	if (!key) return null;
	return seers.find((entry) => entry.name && entry.own !== exceptId && seerKey(entry.name) === key) ?? null;
}

/**
 * @param {string|{line?: string}|null|undefined} pattern A column's sentence, as its table's patterns give it.
 * @returns {string} Its line alone.
 */
const lineOf = (pattern) => (typeof pattern === "string" ? pattern : textOf(pattern?.line));

/**
 * @param {string|{join?: string}|null|undefined} pattern
 * @returns {string} How it reads joined onto the column before, or "" where it never is.
 */
const joinOf = (pattern) => (typeof pattern === "string" ? "" : textOf(pattern?.join));

/**
 * A written Knight as the form changed them, keeping each join copied from
 * the book only while its column's sentence is still the one it was copied
 * with: a sentence the Referee rewrote reads on its own.
 * @param {OwnKnight} before
 * @param {OwnKnight} after
 * @returns {OwnKnight}
 */
export function withJoinsKept(before, after) {
	const joins = before.knight.table.joins.map((join, index) => (join && after.knight.table.sentences[index] === before.knight.table.sentences[index] ? join : ""));
	return { ...after, knight: { ...after.knight, table: { ...after.knight.table, joins } } };
}

/**
 * A Knight and Seer of the book as a written Knight, for the Referee to start
 * from. Their Ability works like theirs where the book's has a kit.
 * @param {object} knight From the art index, with their lists, table and verse.
 * @param {object|null} seer From the art index.
 * @param {(column: number) => string|{line: string, join?: string}|null} [sentenceFor] Their table's sentence for each column, by its number from 1.
 * @returns {{name: string, data: OwnKnight}}
 */
export function bookToOwnKnight(knight, seer, sentenceFor = () => null) {
	const table = knight.table ?? null;
	const part = (value) => ({ name: value?.name ?? "", text: value?.text ?? "", list: value?.list ?? [] });
	return {
		name: knight.name ?? "",
		data: normaliseOwnKnight({
			knight: {
				verse: knight.verse ?? [],
				img: knight.path ?? "",
				token: knight.token && knight.token !== knight.path ? knight.token : "",
				property: knight.property ?? [],
				ability: part(knight.ability),
				passion: part(knight.passion),
				worksLike: kitForPage(knight.page) ? knight.page : null,
				table: table
					? {
						name: table.name,
						columns: table.columns,
						rows: table.rows,
						sentences: [1, 2].map((column) => lineOf(sentenceFor(column))),
						joins: [1, 2].map((column) => joinOf(sentenceFor(column)))
					}
					: null
			},
			seer: seer
				? { name: seer.name ?? "", img: seer.path ?? "", stats: seer.stats ?? {}, lines: seer.lines ?? [] }
				: null
		})
	};
}

/**
 * What renaming a written Knight or their Seer asks of the characters who are
 * that Knight, or were knighted by that Seer, so they go on being found by
 * the names their sheets carry: their table and verse stay theirs, rolls and all.
 * @param {{id: string, name: string, system: {knightType?: string, seer?: string, bookTable?: {knight?: string}, bookVerse?: {knight?: string}}}[]} knights
 * @param {object} names
 * @param {string} [names.fromType] Such as "Ferry", as the Knight was known.
 * @param {string} [names.toType]   As they're known now.
 * @param {string} [names.fromSeer] The Seer's name before.
 * @param {string} [names.toSeer]   Their name now.
 * @returns {{id: string, name: string, update: object}[]} An Actor update for each character the renaming reaches.
 */
export function holderRenames(knights, { fromType = "", toType = "", fromSeer = "", toSeer = "" }) {
	const typeFrom = knightTypeKey(fromType);
	const typeTo = textOf(toType);
	const seerFrom = seerKey(fromSeer);
	const seerTo = textOf(toSeer);
	const renames = [];
	for (const { id, name, system } of knights) {
		const update = {};
		const type = String(system.knightType ?? "").trim();
		if (typeFrom && typeTo && knightTypeKey(type) === typeFrom && type !== typeTo) {
			update["system.knightType"] = typeTo;
			if (system.bookTable?.knight === type) update["system.bookTable.knight"] = typeTo;
			if (system.bookVerse?.knight === type) update["system.bookVerse.knight"] = typeTo;
		}
		if (seerFrom && seerTo && seerKey(system.seer) === seerFrom && system.seer !== seerTo) update["system.seer"] = seerTo;
		if (Object.keys(update).length) renames.push({ id, name, update });
	}
	return renames;
}

/** The qualities a weapon's preview names, in the order it names them. */
export const PREVIEW_QUALITIES = Object.freeze(["hefty", "long", "slow", "ranged", "blast", "ignoresArmour", "trample", "heftyMounted"]);

/**
 * @typedef {object} PreviewRow What a line of Property, or a Seer's trait, comes to.
 * @property {"weapon"|"armour"|"gear"|"companion"} kind
 * @property {string} name
 * @property {string} [damage]      A weapon's, or a shield's.
 * @property {number} [armour]
 * @property {string[]} [qualities] From PREVIEW_QUALITIES.
 */

/**
 * @param {object} item Item data, as propertyItems and actorFromStatBlock give it.
 * @returns {PreviewRow}
 */
function previewItem({ type, name, system = {} }) {
	if (type === "weapon") return { kind: "weapon", name, damage: system.damage, qualities: PREVIEW_QUALITIES.filter((key) => system[key]) };
	if (type === "armour") return { kind: "armour", name, armour: system.armour, ...(system.damage ? { damage: system.damage } : {}) };
	return { kind: "gear", name };
}

/**
 * What a Knight's Property, as written, will give them, for the Referee to check as they write it.
 * @param {string[]} lines
 * @returns {PreviewRow[]}
 */
export function propertyPreview(lines) {
	const { items, companions } = propertyItems(lines);
	return [...items.map(previewItem), ...companions.map(({ name, text }) => ({ kind: "companion", name: name || text }))];
}

/**
 * What a written Seer's scores and traits make of them as an NPC.
 * @param {{name: string, stats: object, lines: string[]}} seer
 * @param {string} attackName Names an attack written without one.
 * @returns {{armour: number, armourNote: string, structure: boolean, attacks: PreviewRow[], traits: number}}
 */
export function seerPreview(seer, attackName) {
	const { type, system, items } = actorFromStatBlock({ name: seer.name, stats: seer.stats, lines: seer.lines }, { attackName });
	return {
		armour: system.armour ?? 0,
		armourNote: system.armourNote ?? "",
		structure: type !== "npc",
		attacks: (items ?? []).map(previewItem),
		traits: (String(system.notes ?? "").match(/<p>/g) ?? []).length
	};
}
