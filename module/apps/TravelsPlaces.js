import { renameHex } from "../actions/hex-names.js";
import { TRAVELS_CHANGED_HOOK, writePartyNote } from "../actions/hex-shared.js";
import { showHexOnMap, travelsHexDetail, travelsListContext } from "../actions/travels.js";
import { t } from "../chat/cards.js";
import { read } from "../client-settings.js";
import { ringHoveredHex } from "../canvas/shown-hex.js";
import { hexKey, parseHexKey } from "../rules/realm-geometry.js";
import { TRAVELS_SORTS, TRAVELS_VIEWS } from "../rules/travels.js";
import { chartScrollBy, haloPoints } from "../rules/travels-chart.js";
import { searchable } from "../rules/text.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { wireHexRename } from "./hex-rename.js";
import { renderWhenIdle } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Client setting: which page of the players' record this browser opens on. */
export const TRAVELS_VIEW_SETTING = "travelsView";

/** Register the page kept between openings. Called during init. */
export function registerTravelsViewSetting() {
	game.settings.register(SYSTEM_ID, TRAVELS_VIEW_SETTING, {
		scope: "client",
		config: false,
		type: String,
		default: TRAVELS_VIEWS[0]
	});
}

/** @returns {string} The page this browser last chose, or the first. */
function storedView() {
	const view = read(TRAVELS_VIEW_SETTING, TRAVELS_VIEWS[0]);
	return TRAVELS_VIEWS.includes(view) ? view : TRAVELS_VIEWS[0];
}

/**
 * How a list of the Company's places is being looked at, kept while the page
 * is drawn again: the Realm it shows, what was typed in its search, the page
 * shown, the tag it's narrowed to, its order, the hex chosen, whether the
 * chart draws the way the Company went, and whether the chart has been shown yet.
 * @typedef {object} TravelsListState
 * @property {string|null} realm
 * @property {string} search
 * @property {string} view
 * @property {string} filter
 * @property {string} sort
 * @property {string|null} selected
 * @property {boolean} route
 * @property {boolean} charted
 */

/** @returns {TravelsListState} A list's state as it first opens. */
export const travelsState = () => ({ realm: null, search: "", view: storedView(), filter: "", sort: TRAVELS_SORTS[0], selected: null, route: false, charted: false });

/**
 * @param {HTMLElement|SVGElement} target Anything standing for a hex.
 * @returns {{scene: Scene, hex: {col: number, row: number}}|null}
 */
function rowOf(target) {
	const scene = game.scenes.get(target.closest("[data-scene-id]")?.dataset.sceneId);
	const hex = parseHexKey(target.dataset.hex ?? "");
	return scene && hex ? { scene, hex } : null;
}

/**
 * Open the hex a row, a hex of the chart or a line of the journey stands
 * for, in the Places window.
 * @param {Event} _event
 * @param {HTMLElement} target
 */
export function openTravelsRow(_event, target) {
	const row = rowOf(target);
	if (row) openPlaces({ sceneId: row.scene.id, hex: row.hex });
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
 * Hide what the search and the tag chosen leave out: rows of the list and
 * lines of the journey go, and hexes of the chart fade.
 * @param {HTMLElement} list
 * @param {TravelsListState} state
 */
function applyTravelsFilter(list, state) {
	const words = searchable(state.search.trim());
	const tag = state.filter;
	const kept = (element) => (!words || element.dataset.search.includes(words))
		&& (!tag || (element.dataset.tags ?? "").split(" ").includes(tag));
	const shown = new Set();
	for (const element of list.querySelectorAll("[data-search]")) {
		element.hidden = !kept(element);
		const hex = element.querySelector("[data-hex]")?.dataset.hex;
		if (!element.hidden && hex && element.matches(".bastionland-travels__row")) shown.add(hex);
	}
	for (const section of list.querySelectorAll("[data-search-section]")) {
		section.hidden = !section.querySelector("[data-search]:not([hidden])");
	}
	// The list holds every hex the chart draws, so the chart follows it.
	for (const place of list.querySelectorAll(".bastionland-travels-chart__place")) {
		place.classList.toggle("is-dimmed", !shown.has(place.dataset.hex));
	}
	// A Holding never reached has no row, so it answers to the tag and its own name.
	for (const mark of list.querySelectorAll(".bastionland-travels-chart__afar")) {
		const name = searchable(mark.querySelector("title")?.textContent ?? "");
		mark.classList.toggle("is-dimmed", Boolean(tag && tag !== "holding") || Boolean(words && !name.includes(words)));
	}
	const page = list.querySelector(`[data-view="${state.view}"]`);
	const found = state.view === "chart" ? shown.size : page?.querySelectorAll("[data-search]:not([hidden])").length ?? 0;
	const none = list.querySelector(".bastionland-travels__no-match");
	if (none) none.hidden = !(words || tag) || found > 0;
}

/**
 * @param {Element} element
 * @returns {HTMLElement|null} The nearest box round it that scrolls.
 */
function scrollerOf(element) {
	for (let box = element.parentElement; box && box !== document.body; box = box.parentElement) {
		const { overflowY } = getComputedStyle(box);
		if ((overflowY === "auto" || overflowY === "scroll") && box.scrollHeight > box.clientHeight) return box;
	}
	return null;
}

/**
 * Scroll the chart so a hex of it is in view, once it's laid out: the one
 * asked for, else where the Company stands, else the hex chosen.
 * @param {HTMLElement} list
 * @param {string|null} [key]
 */
export function showChartPlace(list, key = null) {
	const places = ".bastionland-travels-chart__place";
	const place = (key && list.querySelector(`${places}[data-hex="${key}"]`))
		?? list.querySelector(`${places}.is-here`) ?? list.querySelector(`${places}.is-selected`);
	if (!place) return;
	requestAnimationFrame(() => {
		const scroller = place.isConnected && scrollerOf(place);
		if (scroller) scroller.scrollTop += chartScrollBy(place.getBoundingClientRect(), scroller.getBoundingClientRect());
	});
}

/**
 * Mark another hex chosen on a page as drawn: its row, and its hex of the chart
 * with the ring moved round it, so a pick needn't draw every page again.
 * @param {HTMLElement} list
 * @param {string} key
 * @returns {boolean} False where there was no ring to move, and the page must be drawn again.
 */
function markChosen(list, key) {
	const place = list.querySelector(`.bastionland-travels-chart__place[data-hex="${key}"]`);
	const halo = list.querySelector(".bastionland-travels-chart__halo");
	const outline = place?.querySelector(".bastionland-travels-chart__hex")?.getAttribute("points");
	if (place && (!halo || !outline)) return false;
	if (place) {
		halo.setAttribute("points", haloPoints(outline));
		place.append(halo);
	}
	for (const each of list.querySelectorAll(".bastionland-travels__row, .bastionland-travels-chart__place")) {
		const button = each.matches("[data-hex]") ? each : each.querySelector("[data-hex]");
		const chosen = button?.dataset.hex === key;
		each.classList.toggle("is-selected", chosen);
		if (chosen) button.setAttribute("aria-current", "true");
		else button?.removeAttribute("aria-current");
	}
	return true;
}

/**
 * Hang the list's search, pages, filters, order and Realm choice on a freshly
 * drawn page.
 * @param {HTMLElement|null|undefined} root
 * @param {TravelsListState} state
 * @param {() => void} redraw Draws the page again, as for another Realm or order.
 */
export function wireTravelsList(root, state, redraw) {
	const list = root?.querySelector(".bastionland-travels");
	if (!list) return;
	const apply = () => applyTravelsFilter(list, state);
	const search = list.querySelector(".bastionland-travels__search");
	if (search) {
		search.value = state.search;
		search.addEventListener("input", (event) => {
			state.search = event.target.value;
			apply();
		});
	}
	apply();
	// The chart opens on where the Company stands, the first time it's shown; drawn again, it stays where it was.
	if (state.view === "chart" && !state.charted) {
		state.charted = true;
		showChartPlace(list);
	}

	list.addEventListener("click", (event) => {
		const tab = event.target.closest?.("[data-travels-view]");
		if (tab) {
			state.view = tab.dataset.travelsView;
			for (const each of list.querySelectorAll("[data-travels-view]")) each.setAttribute("aria-pressed", String(each === tab));
			for (const page of list.querySelectorAll("[data-view]")) page.hidden = page.dataset.view !== state.view;
			game.settings.set(SYSTEM_ID, TRAVELS_VIEW_SETTING, state.view).catch(() => null);
			apply();
			if (state.view === "chart") {
				state.charted = true;
				showChartPlace(list);
			}
			return;
		}
		const filter = event.target.closest?.("[data-travels-filter]");
		if (filter) {
			state.filter = filter.dataset.travelsFilter;
			for (const each of list.querySelectorAll("[data-travels-filter]")) each.setAttribute("aria-pressed", String(each === filter));
			apply();
		}
	});

	// A hex of the chart is a button to the keyboard as well.
	list.addEventListener("keydown", (event) => {
		const place = event.target.closest?.(".bastionland-travels-chart__place[data-action]");
		if (!place || (event.key !== "Enter" && event.key !== " ")) return;
		event.preventDefault();
		place.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
	});

	// Whatever stands for a hex rings it on the map while the pointer is over it, as "Show on the map" does.
	list.addEventListener("pointerover", (event) => {
		const holder = event.target.closest?.(".bastionland-travels__row, .bastionland-travels-chart__place, .bastionland-travels-journey__entry");
		const button = holder?.matches("[data-hex]") ? holder : holder?.querySelector("[data-hex]");
		const row = button && rowOf(button);
		if (row) ringHoveredHex(row.scene, row.hex, holder);
	});

	list.querySelector(".bastionland-travels__realm")?.addEventListener("change", (event) => {
		state.realm = event.target.value;
		state.selected = null;
		redraw();
	});
	list.querySelector("[data-travels-sort]")?.addEventListener("change", (event) => {
		state.sort = event.target.value;
		redraw();
	});
	list.querySelector("[data-travels-route]")?.addEventListener("change", (event) => {
		state.route = event.target.checked;
		redraw();
	});
	// On a sheet, the page sits inside the Actor's form, which none of these are for.
	list.addEventListener("change", (event) => event.stopPropagation());
}

/**
 * The places the Company has been to, and those it has only heard of, on one
 * Realm, as a list, a chart and a journey, with the hex chosen among them
 * beside: what stands there that they've found, when they were there, what
 * the Referee told them of it, and their own note.
 */
export class TravelsPlaces extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-travels",
		classes: [SYSTEM_ID, "bastionland", "bastionland-travels-window"],
		position: { width: 800, height: 640 },
		window: { icon: "fa-solid fa-map-location-dot", resizable: true },
		actions: {
			pickTravelsHex: TravelsPlaces.#onPick,
			showTravelsHex: showTravelsRow
		}
	};

	static PARTS = {
		body: { template: templatePath("apps/travels-places.hbs"), scrollable: [".bastionland-travels-places__main", ".bastionland-travels-detail"] }
	};

	/** @type {TravelsListState} */
	state = travelsState();

	/** Whether the chosen row is brought into view on the next draw, after a hex was opened from elsewhere. */
	reveal = false;

	/** @type {[string, number][]} The hooks this window draws again on. */
	#hooks = [];

	/** @override */
	get title() {
		return t("travels.title");
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const list = travelsListContext(this.state.realm, { ...this.state, detail: true });
		if (list.sceneId) this.state.realm = list.sceneId;
		if (list.selected !== undefined) this.state.selected = list.selected;
		return Object.assign(context, list);
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		wireTravelsList(this.element, this.state, () => this.render());
		this.#wireDetail();
		if (this.reveal) {
			this.reveal = false;
			this.element.querySelector(".bastionland-travels__row.is-selected")?.scrollIntoView({ block: "nearest" });
			// Opened on a hex, the chart shows that hex rather than the Company.
			const list = this.element.querySelector(".bastionland-travels");
			if (list && this.state.view === "chart") showChartPlace(list, this.state.selected);
		}
	}

	/** Write the Company's note when its box is left, not at every key. */
	#wireDetail() {
		this.element.querySelector(".bastionland-travels-detail textarea[name='party']")?.addEventListener("change", (event) => {
			const scene = game.scenes.get(this.state.realm);
			const hex = parseHexKey(event.target.dataset.hex ?? "");
			if (scene && hex) writePartyNote(scene, hex, event.target.value);
		});
		// A GM names the chosen hex by clicking its heading.
		const scene = game.scenes.get(this.state.realm);
		const hex = parseHexKey(this.state.selected ?? "");
		if (scene && hex) wireHexRename(this.element.querySelector(".bastionland-travels-detail"), (name) => renameHex(scene, hex, name));
	}

	/**
	 * Draw again when anything the Company knows of the Realm changes, or a GM
	 * comes or goes, which decides whether the note can be written.
	 * @override
	 */
	_onFirstRender(context, options) {
		super._onFirstRender(context, options);
		const redraw = (sceneId) => {
			if (!sceneId || sceneId === this.state.realm) renderWhenIdle(this);
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
	 * Choose the hex a row, a hex of the chart or a line of the journey stands for.
	 * @this {TravelsPlaces}
	 * @param {Event} _event
	 * @param {HTMLElement} target
	 */
	static async #onPick(_event, target) {
		const hex = parseHexKey(target.dataset.hex ?? "");
		if (!hex) return;
		const key = hexKey(hex);
		this.state.selected = key;
		// Only the chosen hex changes, so only its detail is drawn again, and the pages are marked where they stand.
		const list = this.element?.querySelector(".bastionland-travels");
		const shown = this.element?.querySelector(".bastionland-travels-detail");
		const detail = list && shown && markChosen(list, key) ? travelsHexDetail(this.state.realm, key) : null;
		if (!detail) return this.render();
		const html = await foundry.applications.handlebars.renderTemplate(templatePath("apps/parts/travels-hex-detail.hbs"), { ...detail, partId: `${this.id}-body` });
		const drawn = document.createElement("template");
		drawn.innerHTML = html;
		const fresh = drawn.content.querySelector(".bastionland-travels-detail");
		if (!fresh || !shown.isConnected) return this.render();
		shown.replaceWith(fresh);
		this.#wireDetail();
	}
}

/**
 * Open the Company's places, bringing the window forward if it's already open.
 * @param {object} [options]
 * @param {string} [options.sceneId] The Realm to show.
 * @param {{col: number, row: number}} [options.hex] The hex to choose in it.
 * @returns {TravelsPlaces}
 */
export function openPlaces({ sceneId, hex } = {}) {
	const app = foundry.applications.instances.get(TravelsPlaces.DEFAULT_OPTIONS.id) ?? new TravelsPlaces();
	if (sceneId && sceneId !== app.state.realm) {
		app.state.realm = sceneId;
		app.state.selected = null;
	}
	if (hex) {
		app.state.selected = hexKey(hex);
		app.reveal = true;
	}
	app.render({ force: true });
	return app;
}
