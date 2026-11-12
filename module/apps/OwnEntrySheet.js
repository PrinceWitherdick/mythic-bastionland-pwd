import { filePicker } from "../book-art/files.js";
import { SYSTEM_ID } from "../system-id.js";
import { KeepDraftMixin } from "./keep-draft.js";

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * @typedef {object} OwnEntryKind What a sheet for something the Referee writes on a Journal entry of its own needs to know of it.
 * @property {string} noun                        Such as "Myth", for the console.
 * @property {string} flag                        The flag on the entry it's kept under.
 * @property {(entry: JournalEntry) => object} read
 * @property {(raw: unknown) => object} normalise
 * @property {(before: object, after: object) => boolean} changed
 * @property {(id: string) => ReturnType<import("../rules/queue.js").serialWrites>} writes Each entry's queue of writes.
 * @property {(entry: JournalEntry) => boolean} discardable Whether an entry made new, and closed, can go again.
 * @property {Record<string, {get: (data: object) => string, set: (data: object, path: string) => object}>} pictures
 *   By the `data-picture` of its buttons; one without is `img`.
 */

/**
 * What the sheets of a written Myth and a written Knight share: each change
 * saved as it's made, one after another, the pictures chosen apart from the
 * form, and an entry made new and closed untouched taken away again. Each
 * sheet sets its kind as `static KIND`.
 */
// Each change saves the entry and draws the sheet again, so what's typed meanwhile
// in the next field, and the folds as they were left, are kept.
export class OwnEntrySheet extends KeepDraftMixin(HandlebarsApplicationMixin(DocumentSheetV2)) {
	static DEFAULT_OPTIONS = {
		window: { resizable: true },
		sheetConfig: false,
		form: { submitOnChange: true, closeOnSubmit: false },
		actions: {
			pickPicture: OwnEntrySheet.#onPickPicture,
			clearPicture: OwnEntrySheet.#onClearPicture
		}
	};

	/** @type {OwnEntryKind} */
	static KIND;

	/** Set by New Myth or New Knight: close this with nothing written and the entry is deleted. */
	discardIfBlank = false;

	/** @returns {OwnEntryKind} */
	get _kind() {
		return this.constructor.KIND;
	}

	/**
	 * Each change waits for the one before, so it works from the entry as that
	 * one left it, a change made from another window among them.
	 */
	get _writing() {
		return this._kind.writes(this.document.id);
	}

	/** @override */
	get title() {
		return this.document.name;
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		const entry = this.document;
		const discard = this.discardIfBlank && game.user.isGM;
		this.discardIfBlank = false;
		// One made new and closed untouched leaves no empty entry behind.
		if (discard) {
			this._writing.settled().then(() => {
				if (game.journal.has(entry.id) && this._kind.discardable(entry)) return entry.delete();
			}).catch((error) => console.error(`${SYSTEM_ID} | Couldn't discard the empty ${this._kind.noun} ${entry.name}`, error));
		}
	}

	/**
	 * Write the entry's own data as it is now changed, and anything else with
	 * it, such as the entry's name, where either changed.
	 * @param {(data: object) => object} change Gives the data as it should be.
	 * @param {object} [update] Anything else to write with it.
	 * @returns {Promise<void>}
	 */
	_writeOwn(change, update = {}) {
		const { flag, read, normalise, changed, noun } = this._kind;
		return this._writing(async () => {
			const before = read(this.document);
			const after = normalise(change(before));
			const changes = { ...update, ...(changed(before, after) ? { [`flags.${SYSTEM_ID}.${flag}`]: after } : {}) };
			if (Object.keys(changes).length) await this.document.update(changes);
		}).catch((error) => console.error(`${SYSTEM_ID} | Couldn't write the ${noun} ${this.document.name}`, error));
	}

	/**
	 * @param {HTMLElement} target A picture's button.
	 * @returns {{get: Function, set: Function}|null} The picture it's for.
	 */
	#picture(target) {
		const which = target?.dataset?.picture ?? "img";
		return Object.hasOwn(this._kind.pictures, which) ? this._kind.pictures[which] : null;
	}

	/**
	 * Choose a picture, starting where the one there now is kept.
	 * @this {OwnEntrySheet}
	 */
	static #onPickPicture(_event, target) {
		const picture = this.#picture(target);
		if (!this.isEditable || !picture) return;
		const picker = new (filePicker())({
			type: "image",
			current: picture.get(this._kind.read(this.document)),
			callback: (path) => this._writeOwn((data) => picture.set(data, path))
		});
		return picker.render({ force: true });
	}

	/** @this {OwnEntrySheet} */
	static #onClearPicture(_event, target) {
		const picture = this.#picture(target);
		if (!this.isEditable || !picture) return;
		return this._writeOwn((data) => picture.set(data, ""));
	}
}
