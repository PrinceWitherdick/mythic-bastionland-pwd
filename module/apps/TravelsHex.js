import { TRAVELS_CHANGED_HOOK, writePartyNote } from "../actions/hex-shared.js";
import { showHexOnMap, travelsHexContext } from "../actions/travels.js";
import { t } from "../chat/cards.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { renderWhenIdle } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * One hex as the Company knows it: what stands there that they've found,
 * when they were there, what the Referee told them of it, and their own note.
 * Anyone can open it on a hex they've been to; the GM sees it as the players do.
 */
export class TravelsHex extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-travels-hex",
		classes: [SYSTEM_ID, "bastionland", "bastionland-travels-hex-window"],
		tag: "form",
		position: { width: 400, height: "auto" },
		window: { icon: "fa-solid fa-map-location-dot", resizable: true },
		form: { handler: TravelsHex.#onChangeForm, submitOnChange: true, closeOnSubmit: false },
		actions: {
			showOnMap: TravelsHex.#onShowOnMap
		}
	};

	static PARTS = {
		body: { template: templatePath("apps/travels-hex.hbs"), scrollable: [".bastionland-travels-hex__told"] }
	};

	/** @type {string|null} */
	sceneId = null;

	/** @type {{col: number, row: number}|null} */
	hex = null;

	/** @type {number[]} The hooks this window draws again on. */
	#hooks = [];

	/** @override */
	get title() {
		return this.hex ? t("travels.hexTitle", { hex: t("realm.hex", this.hex) }) : t("travels.title");
	}

	/** @returns {Scene|null} */
	get scene() {
		return game.scenes.get(this.sceneId) ?? null;
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const scene = this.scene;
		if (!scene || !this.hex) return Object.assign(context, { missing: true });
		return Object.assign(context, travelsHexContext(scene, this.hex));
	}

	/**
	 * Draw again when anything the Company knows of the Realm changes, or a GM
	 * comes or goes, which decides whether the note can be written.
	 * @override
	 */
	_onFirstRender(context, options) {
		super._onFirstRender(context, options);
		const redraw = (sceneId) => {
			if (!sceneId || sceneId === this.sceneId) renderWhenIdle(this);
		};
		this.#hooks = [
			["userConnected", Hooks.on("userConnected", () => redraw(null))],
			[TRAVELS_CHANGED_HOOK, Hooks.on(TRAVELS_CHANGED_HOOK, redraw)]
		];
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		for (const [name, id] of this.#hooks) Hooks.off(name, id);
		this.#hooks = [];
	}

	/**
	 * The Company's note is written when the box is left, not at every key.
	 * @this {TravelsHex}
	 */
	static async #onChangeForm(_event, _form, formData) {
		const scene = this.scene;
		const text = formData.object.party;
		if (!scene || !this.hex || typeof text !== "string") return;
		await writePartyNote(scene, this.hex, text);
	}

	/** @this {TravelsHex} */
	static #onShowOnMap() {
		return showHexOnMap(this.scene, this.hex);
	}
}

/** @type {TravelsHex|null} The one window, following whichever hex was last opened. */
let window_ = null;

/**
 * Show what the Company knows of a hex.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}} options.hex
 * @returns {TravelsHex|null}
 */
export function openTravelsHex({ scene, hex }) {
	if (!scene || !hex) return null;
	window_ ??= new TravelsHex();
	window_.sceneId = scene.id;
	window_.hex = { col: hex.col, row: hex.row };
	window_.render({ force: true });
	return window_;
}
