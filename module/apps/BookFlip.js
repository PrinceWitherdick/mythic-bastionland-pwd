import { flipTheBook, promptsLabel, savePromptsToHex } from "../actions/book-flip.js";
import { isRealmScene } from "../actions/realm.js";
import { t, warn } from "../chat/cards.js";
import { SPREAD_SIDES, chosenPrompts } from "../rules/book-flip.js";
import { pickHex } from "../canvas/hex-pick.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Flip the book to a random spread and take a prompt from its foot (p19,
 * p179). The Referee clicks the prompts that fit, then Save to hex and a hex
 * of the Realm on the map, where they're kept beside its Spark Table rolls.
 */
export class BookFlip extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-book-flip",
		classes: [SYSTEM_ID, "bastionland", "bastionland-book-flip-window"],
		position: { width: 640, height: "auto" },
		window: { title: "bastionland.bookFlip.title", icon: "fa-solid fa-book-open", resizable: true },
		actions: {
			flip: BookFlip.#onFlip,
			choose: BookFlip.#onChoose,
			saveToHex: BookFlip.#onSaveToHex
		}
	};

	static PARTS = {
		flip: { template: templatePath("apps/book-flip.hbs") }
	};

	/** @type {import("../actions/book-flip.js").FlippedSpread|null} The spread flipped to last. */
	spread = null;

	/** @type {Set<string>} The keys of the prompts chosen from it. */
	#chosen = new Set();

	/** The dice are out, or a hex is being chosen, so the buttons wait. */
	#busy = false;

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const spread = this.spread;
		const count = this.#chosen.size;
		return Object.assign(context, {
			busy: this.#busy,
			spread: spread && {
				roll: t("bookFlip.rolled", { roll: spread.roll }),
				pages: SPREAD_SIDES.map((side) => ({
					side,
					name: spread[side].name,
					reference: t("bookFlip.page", { page: spread[side].page }),
					prompts: spread[side].prompts.map((prompt) => ({ ...prompt, chosen: this.#chosen.has(prompt.key) }))
				}))
			},
			anyPrompts: Boolean(spread && SPREAD_SIDES.some((side) => spread[side].prompts.length)),
			chosenLabel: count ? t(count === 1 ? "bookFlip.chosenOne" : "bookFlip.chosenMany", { count }) : t("bookFlip.chooseHint"),
			noneChosen: !count
		});
	}

	/** Throw the dice for a spread and show it, forgetting what was chosen from the last. */
	async flip() {
		if (this.#busy) return;
		this.#busy = true;
		try {
			const spread = await flipTheBook();
			if (spread) {
				this.spread = spread;
				this.#chosen.clear();
			}
		} finally {
			this.#busy = false;
		}
		return this.render();
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {BookFlip} */
	static #onFlip() {
		return this.flip();
	}

	/** @this {BookFlip} */
	static #onChoose(_event, target) {
		const { key } = target.dataset;
		if (!key || this.#busy) return;
		if (this.#chosen.has(key)) this.#chosen.delete(key);
		else this.#chosen.add(key);
		return this.render();
	}

	/**
	 * Ask for a hex on the map and keep the chosen prompts there. The window
	 * folds out of the way while the GM chooses, and comes back after.
	 * @this {BookFlip}
	 */
	static async #onSaveToHex() {
		if (this.#busy || !this.spread) return;
		const prompts = chosenPrompts(this.spread, this.#chosen);
		if (!prompts.length) return warn("bookFlip.chooseFirst");
		const scene = canvas?.ready ? canvas.scene : null;
		if (!isRealmScene(scene)) return warn("bookFlip.noRealm");

		this.#busy = true;
		await this.minimize();
		try {
			const hex = await pickHex(scene, {
				message: t("bookFlip.pick", { what: promptsLabel(prompts) }),
				label: (at) => t("bookFlip.pickHere", { hex: t("realm.hex", at) })
			});
			if (hex && await savePromptsToHex({ scene, hex, spread: this.spread, prompts })) this.#chosen.clear();
		} finally {
			this.#busy = false;
			if (this.rendered) await this.maximize();
		}
		return this.render();
	}
}

/** @type {BookFlip|null} */
let window_ = null;

/**
 * Open the window, flipping the book the first time: opening it is reaching
 * for a random page. GMs only.
 * @returns {Promise<BookFlip|null>}
 */
export async function openBookFlip() {
	if (!game.user.isGM) return null;
	window_ ??= new BookFlip();
	await window_.render({ force: true });
	if (!window_.spread) await window_.flip();
	return window_;
}
