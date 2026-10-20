import { OWN_MYTH_FLAG, isUntouchedOwnMyth, readOwnMyth } from "../actions/own-myths.js";
import { getRealm, isRealmScene } from "../actions/realm.js";
import { filePicker } from "../book-art/files.js";
import { t } from "../chat/cards.js";
import { VERSE_LINES, mythWithOwn, normaliseOwnMyth, ownMythChanged, tableWritten } from "../rules/own-myths.js";
import { serialWrites } from "../rules/queue.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * @param {string} id A written Myth's entry.
 * @returns {boolean} Whether any Realm of the world holds it among its six.
 */
const heldByARealm = (id) => game.scenes.some((scene) => isRealmScene(scene) && Boolean(mythWithOwn(getRealm(scene)?.realm.myths ?? [], id)));

/** The path every part of a written Myth is kept under on its entry. */
const FLAG_PATH = `flags.${SYSTEM_ID}.${OWN_MYTH_FLAG}`;

/**
 * A Myth the Referee writes for themselves, as its Journal entry opens: what
 * a Myth's page in the book has, to be filled in. It stands among a Realm's
 * six once it's chosen in The Realm's Myths, and the GM Toolkit, the Omen
 * cards and the picture's window read it there as they read the book's.
 */
export class OwnMythSheet extends HandlebarsApplicationMixin(DocumentSheetV2) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-own-myth-window"],
		position: { width: 620, height: 760 },
		window: { icon: "fa-solid fa-dragon", resizable: true },
		sheetConfig: false,
		form: { handler: OwnMythSheet.#onSubmit, submitOnChange: true, closeOnSubmit: false },
		actions: {
			pickPicture: OwnMythSheet.#onPickPicture,
			clearPicture: OwnMythSheet.#onClearPicture
		}
	};

	static PARTS = {
		myth: { template: templatePath("apps/own-myth.hbs"), scrollable: [""] }
	};

	/** Set by New Myth: close this with nothing written and the entry is deleted. */
	discardIfBlank = false;

	/** Each change waits for the one before, so it works from the Myth as that one left it. */
	#writing = serialWrites();

	/** @override */
	get title() {
		return this.document.name;
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const myth = readOwnMyth(this.document);
		const field = (name, index) => `${name}.${index}`;
		return Object.assign(context, {
			rootId: this.id,
			editable: this.isEditable,
			name: this.document.name,
			img: myth.img || null,
			verse: myth.verse.map((line, index) => ({
				name: field("verse", index),
				value: line,
				label: t("ownMyth.verseLine", { number: index + 1, count: VERSE_LINES })
			})),
			omens: myth.omens.map((omen, index) => ({
				number: index + 1,
				name: field("omens", index),
				value: omen,
				label: t("myths.omenNumber", { number: index + 1 })
			})),
			table: {
				// Folded away until there's something in it, as most Myths can do without one.
				open: tableWritten(myth),
				name: myth.table.name,
				columns: myth.table.columns.map((heading, index) => ({
					name: `table.columns.${index}`,
					value: heading,
					label: t("ownMyth.column", { number: index + 1 })
				})),
				rows: myth.table.rows.map((row, index) => ({
					number: index + 1,
					entries: row.map((entry, column) => ({
						name: `table.rows.${index}.${column}`,
						value: entry,
						label: t("ownMyth.cell", { row: index + 1, column: myth.table.columns[column] || t("ownMyth.column", { number: column + 1 }) })
					}))
				}))
			},
			castNote: myth.castNote
		});
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		const entry = this.document;
		const discard = this.discardIfBlank && game.user.isGM;
		this.discardIfBlank = false;
		// A Myth made with New Myth and closed untouched leaves no empty entry behind,
		// unless a Realm took it in the meantime.
		if (discard) {
			this.#writing.settled().then(() => {
				if (game.journal.has(entry.id) && isUntouchedOwnMyth(entry) && !heldByARealm(entry.id)) return entry.delete();
			}).catch((error) => console.error(`${SYSTEM_ID} | Couldn't discard the empty Myth ${entry.name}`, error));
		}
	}

	/**
	 * Write the Myth as it is now changed, and its name, where either changed.
	 * @param {(myth: import("../rules/own-myths.js").OwnMyth) => object} change Gives the Myth as it should be.
	 * @param {object} [update] Anything else to write with it, such as the entry's name.
	 * @returns {Promise<void>}
	 */
	#write(change, update = {}) {
		return this.#writing(async () => {
			const before = readOwnMyth(this.document);
			const after = normaliseOwnMyth(change(before));
			const changes = { ...update, ...(ownMythChanged(before, after) ? { [FLAG_PATH]: after } : {}) };
			if (Object.keys(changes).length) await this.document.update(changes);
		}).catch((error) => console.error(`${SYSTEM_ID} | Couldn't write the Myth ${this.document.name}`, error));
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/**
	 * Name, verse, Omens, table and the word on the Cast, as typed. The picture is chosen apart from the form.
	 * @this {OwnMythSheet}
	 */
	static #onSubmit(_event, _form, formData) {
		if (!this.isEditable) return;
		const data = foundry.utils.expandObject(formData.object);
		const name = String(data.name ?? "").trim();
		const update = name && name !== this.document.name ? { name } : {};
		return this.#write((myth) => ({ ...data, img: myth.img }), update);
	}

	/**
	 * Choose the Myth's picture, starting where the one it has now is kept.
	 * @this {OwnMythSheet}
	 */
	static #onPickPicture() {
		if (!this.isEditable) return;
		const picker = new (filePicker())({
			type: "image",
			current: readOwnMyth(this.document).img,
			callback: (path) => this.#write((myth) => ({ ...myth, img: path }))
		});
		return picker.render({ force: true });
	}

	/** @this {OwnMythSheet} */
	static #onClearPicture() {
		if (!this.isEditable) return;
		return this.#write((myth) => ({ ...myth, img: "" }));
	}
}
