import { TRAVELS_CHANGED_HOOK } from "../actions/hex-shared.js";
import { showHexOnMap, travelsListContext } from "../actions/travels.js";
import { t } from "../chat/cards.js";
import { ringHoveredHex } from "../canvas/shown-hex.js";
import { parseHexKey } from "../rules/realm-geometry.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { openTravelsHex } from "./TravelsHex.js";
import { filterBySearch, renderWhenIdle } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Where a list of the Company's places was opened from: the Realm it shows,
 * and what was typed in its search, kept while the page is drawn again.
 * @typedef {object} TravelsListState
 * @property {string|null} realm
 * @property {string} search
 */

/**
 * @param {HTMLElement} target A row's button.
 * @returns {{scene: Scene, hex: {col: number, row: number}}|null}
 */
function rowOf(target) {
	const scene = game.scenes.get(target.closest("[data-scene-id]")?.dataset.sceneId);
	const hex = parseHexKey(target.dataset.hex ?? "");
	return scene && hex ? { scene, hex } : null;
}

/**
 * Open the hex a row stands for.
 * @param {Event} _event
 * @param {HTMLElement} target
 */
export function openTravelsRow(_event, target) {
	const row = rowOf(target);
	if (row) openTravelsHex(row);
}

/**
 * Show the hex a row stands for on the map.
 * @param {Event} _event
 * @param {HTMLElement} target
 */
export function showTravelsRow(_event, target) {
	const row = rowOf(target);
	if (row) return showHexOnMap(row.scene, row.hex);
}

/**
 * Hang the list's search and Realm choice on a freshly drawn page.
 * @param {HTMLElement|null|undefined} root
 * @param {TravelsListState} state
 * @param {() => void} redraw Draws the page again for another Realm.
 */
export function wireTravelsList(root, state, redraw) {
	const list = root?.querySelector(".bastionland-travels");
	if (!list) return;
	const search = list.querySelector(".bastionland-travels__search");
	const apply = () => filterBySearch(list, state.search, ".bastionland-travels__no-match");
	if (search) {
		search.value = state.search;
		search.addEventListener("input", (event) => {
			state.search = event.target.value;
			apply();
		});
		// On a sheet, the page sits inside the Actor's form, which isn't the search's to write to.
		search.addEventListener("change", (event) => event.stopPropagation());
	}
	apply();
	// The row under the pointer rings its hex on the map, as "Show on the map" does.
	list.addEventListener("pointerover", (event) => {
		const button = event.target.closest?.(".bastionland-travels__row")?.querySelector("[data-hex]");
		const row = button && rowOf(button);
		if (row) ringHoveredHex(row.scene, row.hex, button.closest(".bastionland-travels__row"));
	});
	list.querySelector(".bastionland-travels__realm")?.addEventListener("change", (event) => {
		event.stopPropagation();
		state.realm = event.target.value;
		redraw();
	});
}

/**
 * The places the Company has been to, and those it has only heard of, on one
 * Realm. Each opens what the Company knows of it.
 */
export class TravelsPlaces extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-travels",
		classes: [SYSTEM_ID, "bastionland", "bastionland-travels-window"],
		position: { width: 440, height: 560 },
		window: { icon: "fa-solid fa-map-location-dot", resizable: true },
		actions: {
			openTravelsHex: openTravelsRow,
			showTravelsHex: showTravelsRow
		}
	};

	static PARTS = {
		body: { template: templatePath("apps/travels-places.hbs"), scrollable: [""] }
	};

	/** @type {TravelsListState} */
	state = { realm: null, search: "" };

	/** @type {number|null} */
	#hook = null;

	/** @override */
	get title() {
		return t("travels.title");
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const list = travelsListContext(this.state.realm);
		if (list.sceneId) this.state.realm = list.sceneId;
		return Object.assign(context, list);
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		wireTravelsList(this.element, this.state, () => this.render());
	}

	/** @override */
	_onFirstRender(context, options) {
		super._onFirstRender(context, options);
		this.#hook = Hooks.on(TRAVELS_CHANGED_HOOK, (sceneId) => {
			if (sceneId === this.state.realm) renderWhenIdle(this);
		});
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		if (this.#hook !== null) Hooks.off(TRAVELS_CHANGED_HOOK, this.#hook);
		this.#hook = null;
	}
}

/**
 * Open the Company's places, bringing the window forward if it's already open.
 * @param {object} [options]
 * @param {string} [options.sceneId] The Realm to show.
 * @returns {TravelsPlaces}
 */
export function openPlaces({ sceneId } = {}) {
	const app = foundry.applications.instances.get(TravelsPlaces.DEFAULT_OPTIONS.id) ?? new TravelsPlaces();
	if (sceneId) app.state.realm = sceneId;
	app.render({ force: true });
	return app;
}
