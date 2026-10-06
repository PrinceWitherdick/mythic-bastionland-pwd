import { loadArtIndex } from "../book-art/art-index.js";
import { searchable } from "../rules/text.js";
import { SYSTEM_ID } from "../system-id.js";
import { ArtPreviewMixin } from "./art-preview.js";
import { markActive } from "./ui.js";

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

	/** The list of cards a search box, where the chooser has one, shows and hides. */
	static SEARCHED = ".bastionland-chooser__grid";

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

	/** What the table is searched for. While there's any, the table shows every d6 result's matches. */
	search = "";

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

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		const root = this.element;
		const box = root.querySelector("[name=search]");
		if (!box) return;
		box.addEventListener("input", (event) => {
			this.search = event.target.value;
			this._applySearch();
		});
		this._applySearch();
	}

	/**
	 * What every card carries for its d6 result and the search box. Every card
	 * is drawn, so a search finds one in any d6 result; the rest are hidden.
	 * @param {{d6: number, d12: number, roll: string}} roll
	 * @param {string} name What the card is called.
	 * @returns {{d6: number, inGroup: boolean, searchText: string}}
	 */
	_cardFields({ d6, d12, roll }, name) {
		return { d6, inGroup: d6 === this.group, searchText: searchable(`${name} ${d6}-${d12} ${roll}`) };
	}

	/**
	 * Whether a roll may be picked. A chooser that says no says why.
	 * @param {string} _roll
	 * @returns {boolean}
	 */
	_canPick(_roll) {
		return true;
	}

	/**
	 * Show the cards the search finds, from every d6 result, or with no search
	 * the d6 result on show. No d6 result is pressed while a search is.
	 */
	_applySearch() {
		const root = this.element;
		const list = this.constructor.SEARCHED;
		const term = searchable(this.search.trim());
		let shown = 0;
		for (const card of root.querySelectorAll(`${list} > li`)) {
			const visible = term ? card.dataset.search.includes(term) : Number(card.dataset.d6) === this.group;
			card.hidden = !visible;
			if (visible) shown++;
		}
		for (const group of root.querySelectorAll(".bastionland-chooser__group")) markActive(group, !term && Number(group.dataset.d6) === this.group);
		root.querySelector(list)?.classList.toggle("is-searching", Boolean(term));
		const none = root.querySelector(".bastionland-myth-chooser__none");
		if (none) none.hidden = shown > 0;
	}

	/**
	 * Show one d6 result. Choosing one means looking at all of it, so the search is let go.
	 * Every card is drawn already, so nothing is drawn again.
	 * @this {BastionlandChooser}
	 */
	static #onShowGroup(_event, target) {
		this.group = Number(target.dataset.d6);
		this.search = "";
		const box = this.element.querySelector("[name=search]");
		if (box) box.value = "";
		this._applySearch();
	}

	/**
	 * Pick a roll. One found by a search is among its own d6 result once the search is let go.
	 * @this {BastionlandChooser}
	 */
	static #onPick(_event, target) {
		const roll = target.dataset.roll;
		if (!this._canPick(roll)) return;
		this.roll = roll;
		this.group = Number(target.closest("[data-d6]")?.dataset.d6) || this.group;
		return this.render();
	}
}
