import { knightIndex } from "../actions/knight-index.js";
import { sentencePatternFor } from "../actions/knight-tables.js";
import {
	OWN_KNIGHT_FLAG,
	isReadyForPlayers,
	isUntouchedOwnKnight,
	ownKnightType,
	ownKnightWrites,
	readOwnKnight,
	setReadyForPlayers
} from "../actions/own-knights.js";
import { findByRoll, loadArtIndex } from "../book-art/art-index.js";
import { knightWithLists, tableForEntry, verseForEntry } from "../book-art/myth-tables.js";
import { t } from "../chat/cards.js";
import { kitForPage } from "../rules/ability-kits.js";
import { KNIGHT_TABLE_VERSION, KNIGHT_VERSE_VERSION } from "../rules/book-art.js";
import { knightTypeFromName } from "../rules/creation.js";
import {
	SEER_SCORES,
	bookToOwnKnight,
	isBlankOwnKnight,
	knightNameClash,
	normaliseOwnKnight,
	ownKnightChanged,
	propertyPreview,
	seerNameClash,
	seerPreview,
	withJoinsKept
} from "../rules/own-knights.js";
import { TABLE_COLUMNS } from "../rules/own-myths.js";
import { escapeHTML } from "../rules/text.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { chooseOne } from "./actor-pick.js";
import { OwnEntrySheet } from "./OwnEntrySheet.js";
import { confirmDialog } from "./ui.js";

/**
 * @param {"img"|"token"} which One of the Knight's pictures.
 * @returns {{get: Function, set: Function}}
 */
const knightPicture = (which) => ({
	get: (data) => data.knight[which],
	set: (data, path) => ({ ...data, knight: { ...data.knight, [which]: path } })
});

/**
 * @param {import("../rules/own-knights.js").PreviewRow} row
 * @returns {{kind: string, name: string, detail: string}} As the preview shows it.
 */
function previewRow(row) {
	const detail = [
		row.damage ?? "",
		Number.isInteger(row.armour) ? t("ownKnight.preview.armourValue", { armour: row.armour }) : "",
		...(row.qualities ?? []).map((key) => t(`ownKnight.quality.${key}`))
	].filter(Boolean).join(", ");
	return { kind: t(`ownKnight.preview.${row.kind}`), name: row.name, detail };
}

/**
 * A Knight the Referee writes for themselves, with the Seer who knighted
 * them, as their Journal entry opens: what a Knight's page in the book has, to
 * be filled in. Players choose them in Choose a Knight once the Referee lets
 * them, and see this sheet then, to read it.
 */
export class OwnKnightSheet extends OwnEntrySheet {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-own-knight-window"],
		position: { width: 720, height: 820 },
		window: { icon: "fa-solid fa-chess-knight", resizable: true },
		form: { handler: OwnKnightSheet.#onSubmit },
		actions: {
			startFromBook: OwnKnightSheet.#onStartFromBook,
			toggleReady: OwnKnightSheet.#onToggleReady
		}
	};

	static PARTS = {
		knight: { template: templatePath("apps/own-knight.hbs"), scrollable: [""] }
	};

	/**
	 * Their portrait, their token, and their Seer's picture are each chosen apart from the form.
	 * @type {import("./OwnEntrySheet.js").OwnEntryKind}
	 */
	static KIND = {
		noun: "Knight",
		flag: OWN_KNIGHT_FLAG,
		read: readOwnKnight,
		normalise: normaliseOwnKnight,
		changed: ownKnightChanged,
		writes: ownKnightWrites,
		discardable: isUntouchedOwnKnight,
		pictures: {
			img: knightPicture("img"),
			token: knightPicture("token"),
			seer: { get: (data) => data.seer.img, set: (data, path) => ({ ...data, seer: { ...data.seer, img: path } }) }
		}
	};

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const entry = this.document;
		const data = readOwnKnight(entry);
		const { knight, seer } = data;
		const book = await loadArtIndex();
		const all = await knightIndex(book);
		const type = ownKnightType(entry);
		const knightClash = type ? knightNameClash(type, all.knights, entry.id) : null;
		const seerClash = seer.name ? seerNameClash(seer.name, all.seers, entry.id) : null;
		const part = (key) => ({ ...knight[key], list: knight[key].list.join("\n"), prefix: `knight.${key}` });
		const columnName = (index) => knight.table.columns[index] || t("ownMyth.column", { number: index + 1 });
		return Object.assign(context, {
			rootId: this.id,
			editable: this.isEditable,
			isGM: game.user.isGM,
			type,
			knightClash: knightClash?.name ?? null,
			seerClash: seerClash?.name ?? null,
			ready: isReadyForPlayers(entry),
			canReady: Boolean(type) && !knightClash && !seerClash,
			hasBook: Boolean(book?.knights?.length),
			knight: {
				img: knight.img || null,
				token: knight.token || null,
				verse: knight.verse.join("\n"),
				property: knight.property.join("\n"),
				preview: propertyPreview(knight.property).map(previewRow),
				ability: part("ability"),
				passion: part("passion"),
				worksLike: [
					{ value: "", label: t("ownKnight.worksLikeNone"), selected: !knight.worksLike },
					...(book?.knights ?? [])
						.filter((each) => each.name && kitForPage(each.page))
						.map((each) => ({ value: String(each.page), label: each.name, selected: knight.worksLike === each.page }))
				],
				// A page no longer among the book's, as after an import without it, is still shown, so it isn't lost on the next save.
				worksLikeUnknown: knight.worksLike && !(book?.knights ?? []).some((each) => each.page === knight.worksLike) ? knight.worksLike : null
			},
			table: {
				open: Boolean(knight.table.name || knight.table.rows.some((row) => row.some(Boolean))),
				name: knight.table.name,
				columns: knight.table.columns.map((heading, index) => ({
					name: `knight.table.columns.${index}`,
					value: heading,
					label: t("ownMyth.column", { number: index + 1 })
				})),
				rows: knight.table.rows.map((row, index) => ({
					number: index + 1,
					entries: row.map((value, column) => ({
						name: `knight.table.rows.${index}.${column}`,
						value,
						label: t("ownMyth.cell", { row: index + 1, column: columnName(column) })
					}))
				})),
				sentences: Array.from({ length: TABLE_COLUMNS }, (_, index) => ({
					name: `knight.table.sentences.${index}`,
					value: knight.table.sentences[index],
					label: t("ownKnight.sentence", { column: columnName(index) })
				}))
			},
			seer: {
				name: seer.name,
				img: seer.img || null,
				stats: SEER_SCORES.map((key) => ({
					key,
					name: `seer.stats.${key}`,
					value: seer.stats[key] ?? "",
					label: t(`ownKnight.score.${key}`)
				})),
				lines: seer.lines.join("\n"),
				preview: seer.name || seer.lines.length ? this.#seerPreview(seer) : null
			}
		});
	}

	/**
	 * @param {import("../rules/own-knights.js").OwnKnight["seer"]} seer
	 * @returns {{armour: string, attacks: object[], traits: string, structure: boolean}}
	 */
	#seerPreview(seer) {
		const preview = seerPreview(seer, t("ownKnight.preview.attack"));
		return {
			armour: preview.armourNote
				? t("ownKnight.preview.armourNote", { armour: preview.armour, note: preview.armourNote })
				: t("ownKnight.preview.armourValue", { armour: preview.armour }),
			attacks: preview.attacks.map(previewRow),
			traits: t("ownKnight.preview.traits", { count: preview.traits }),
			structure: preview.structure
		};
	}

	/**
	 * @param {string} type What's typed for "The ___ Knight".
	 * @returns {object} The entry's new name, where it changes.
	 */
	#renamed(type) {
		const typed = knightTypeFromName(type);
		if (!typed || typed === ownKnightType(this.document)) return {};
		return { name: t("ownKnight.fullName", { type: typed }) };
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/**
	 * Everything as typed. The pictures are chosen apart from the form. The
	 * characters going by a name changed here follow it (own-knight-renames.js).
	 * @this {OwnKnightSheet}
	 */
	static #onSubmit(_event, _form, formData) {
		if (!this.isEditable) return;
		const data = foundry.utils.expandObject(formData.object);
		return this._writeOwn((before) => withJoinsKept(before, normaliseOwnKnight({
			...before,
			knight: { ...before.knight, ...(data.knight ?? {}) },
			seer: { ...before.seer, ...(data.seer ?? {}) }
		})), this.#renamed(String(data.type ?? "")));
	}

	/**
	 * Let players choose the Knight, or take them back. A Knight sharing a
	 * name with another can't be offered, as the two would be one on a sheet.
	 * @this {OwnKnightSheet}
	 */
	static async #onToggleReady(event) {
		if (!game.user.isGM) return;
		const ready = !isReadyForPlayers(this.document);
		if (ready) {
			const all = await knightIndex();
			const type = ownKnightType(this.document);
			const seer = readOwnKnight(this.document).seer.name;
			if (!type || knightNameClash(type, all.knights, this.document.id) || (seer && seerNameClash(seer, all.seers, this.document.id))) {
				if (event?.target) event.target.checked = false;
				ui.notifications.warn(t("ownKnight.cantReady"));
				return;
			}
		}
		return setReadyForPlayers(this.document, ready);
	}

	/**
	 * Copy a Knight of the book, and their Seer, in to start from: everything
	 * their page has, and their Ability working as theirs does.
	 * @this {OwnKnightSheet}
	 */
	static async #onStartFromBook() {
		if (!this.isEditable) return;
		const index = await loadArtIndex();
		const knights = (index?.knights ?? []).filter((entry) => entry.name);
		if (!knights.length) {
			ui.notifications.warn(t("ownKnight.noBook"));
			return;
		}
		const seers = new Map((index.seers ?? []).map((seer) => [seer.roll, seer]));
		const picked = await chooseOne(knights.map((entry) => ({
			entry,
			name: entry.name,
			detail: seers.get(entry.roll)?.name ? t("ownKnight.knightedBy", { seer: seers.get(entry.roll).name }) : ""
		})), {
			title: t("ownKnight.startFromBook"),
			message: t("ownKnight.startFromBookLegend"),
			intro: t("ownKnight.startFromBookIntro"),
			icon: "fa-solid fa-book-open",
			unchosen: true
		});
		if (!picked) return;
		if (!isBlankOwnKnight(readOwnKnight(this.document))) {
			const replace = await confirmDialog({
				title: t("ownKnight.startFromBook"),
				icon: "fa-solid fa-book-open",
				message: escapeHTML(t("ownKnight.replaceDraft", { name: picked.entry.name }))
			});
			if (!replace) return;
		}
		const withLists = await knightWithLists(index, picked.entry);
		const [table, verse] = await Promise.all([
			tableForEntry(index, withLists, { versionFloor: KNIGHT_TABLE_VERSION }),
			verseForEntry(index, withLists, { versionFloor: KNIGHT_VERSE_VERSION })
		]);
		const seer = findByRoll(index.seers, picked.entry.roll);
		const { name, data } = bookToOwnKnight({ ...withLists, table, verse }, seer, (column) => sentencePatternFor(picked.entry.roll, column));
		return this._writeOwn(() => data, name && name !== this.document.name ? { name } : {});
	}
}
