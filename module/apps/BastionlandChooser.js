import { loadArtIndex } from "../book-art/art-index.js";
import { SYSTEM_ID } from "../system-id.js";
import { ArtPreviewMixin } from "./art-preview.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const D6_RESULTS = Object.freeze([1, 2, 3, 4, 5, 6]);

/**
 * What the Knight and NPC choosers share: the book's d6-then-d12 table, read
 * from the art index and shown one d6 result at a time, with one roll picked
 * and a larger copy of each picture on hover. A chooser fills in the actor it
 * was opened for, or creates new ones.
 */
export class BastionlandChooser extends ArtPreviewMixin(HandlebarsApplicationMixin(ApplicationV2)) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-chooser-window"],
		window: { resizable: true },
		actions: {
			showGroup: BastionlandChooser.#onShowGroup,
			pick: BastionlandChooser.#onPick
		}
	};

	/** Art that shows a larger copy on hover: the pictures in the grid not already shown large. */
	static PREVIEWED_ART = ".bastionland-chooser__card:not(.is-selected) img.bastionland-chooser__thumb";

	/** @type {Actor|null} */
	#actor;

	/** Whether the actor was only just made with Create Actor, so there's nothing on it to replace. */
	#fresh;

	/** @type {object|null|undefined} The art index: undefined until loaded, null if never imported. */
	index;

	/** The d6 result whose entries are on show. */
	group = 1;

	/** @type {string|null} The chosen roll, such as "3-07". */
	roll = null;

	/**
	 * @param {object} [options]
	 * @param {Actor|null} [options.actor] The actor to fill in. Omit to create one.
	 * @param {boolean} [options.fresh]    The actor was only just made, so fill it in without asking.
	 */
	constructor({ actor = null, fresh = false, ...options } = {}) {
		super(options);
		this.#actor = actor;
		this.#fresh = Boolean(actor && fresh);
	}

	/** @returns {Actor|null} The actor being filled in, or null to create one. */
	get actor() {
		return this.#actor;
	}

	/** @returns {boolean} Whether the actor being filled in was only just made. */
	get fresh() {
		return this.#fresh;
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		if (this.index === undefined) this.index = await loadArtIndex();
		return Object.assign(context, {
			groups: D6_RESULTS.map((d6) => ({ d6, active: d6 === this.group }))
		});
	}

	/** @this {BastionlandChooser} */
	static #onShowGroup(_event, target) {
		this.group = Number(target.dataset.d6);
		return this.render();
	}

	/** @this {BastionlandChooser} */
	static #onPick(_event, target) {
		this.roll = target.dataset.roll;
		return this.render();
	}
}
