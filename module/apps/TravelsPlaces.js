import { renameHex } from "../actions/hex-names.js";
import { TRAVELS_CHANGED_HOOK, forgetHexBarrierMet, forgetHexPartyNote, forgetHexTold, writePartyNote } from "../actions/hex-shared.js";
import { forgetHexVisit } from "../actions/journey.js";
import { showHexOnMap, travelsHexDetail, travelsListContext } from "../actions/travels.js";
import { loadArtIndex } from "../book-art/art-index.js";
import { t } from "../chat/cards.js";
import { read } from "../client-settings.js";
import { ringHoveredHex } from "../canvas/shown-hex.js";
import { hexKey, parseHexKey } from "../rules/realm-geometry.js";
import { TRAVELS_SORTS, TRAVELS_VIEWS } from "../rules/travels.js";
import { chartScrollBy, haloPoints } from "../rules/travels-chart.js";
import { searchable } from "../rules/text.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { holdChartPlace, wireChartZoom } from "./chart-zoom.js";
import { HEX_GM_ACTIONS, hexGmContext, hexGmHeaderButtons, hexGmState, wireHexGmPart } from "./hex-gm-part.js";
import { wireHexRename } from "./hex-rename.js";
import { refreshBookFlip } from "./BookFlip.js";
import { PLACES_ID } from "./places-hex.js";
import { refreshSparkKeep } from "./SparkTables.js";
import { hangHeaderButtons, renderWhenIdle } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Tell the windows that keep things in the hex chosen here that it's moved, or Places has closed. */
function chosenHexMoved() {
	refreshSparkKeep();
	refreshBookFlip();
}

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
 * chart draws the way the Company went, whether the chart has been shown yet,
 * and how close it was brought.
 * @typedef {object} TravelsListState
 * @property {string|null} realm
 * @property {string} search
 * @property {string} view
 * @property {string} filter
 * @property {string} sort
 * @property {string|null} selected
 * @property {boolean} route
 * @property {boolean} charted
 * @property {{realm: string|null, box: object}|null} zoom The part of a zoomed chart shown, and its Realm.
 */

/** @returns {TravelsListState} A list's state as it first opens. */
export const travelsState = () => ({ realm: null, search: "", view: storedView(), filter: "", sort: TRAVELS_SORTS[0], selected: null, route: false, charted: false, zoom: null });

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
 * What a line of the journey stands for, forgotten by its × in the Places
 * window, each handed its Scene, hex and the ref the line carries.
 * @type {Record<string, (scene: Scene, hex: {col: number, row: number}, ref: string) => Promise<boolean>|undefined>}
 */
const FORGET_JOURNEY = Object.freeze({
	arrived(scene, hex, ref) {
		const order = Number(ref);
		if (ref !== "" && Number.isInteger(order)) return forgetHexVisit(scene, hex, order);
	},
	told: (scene, hex, ref) => (ref ? forgetHexTold(scene, hex, ref) : undefined),
	met: (scene, hex, ref) => (ref ? forgetHexBarrierMet(scene, hex, ref) : undefined),
	noted: (scene, hex) => forgetHexPartyNote(scene, hex)
});

/**
 * Forget a line of the journey: a visit, a telling, a Barrier met or the
 * Company's note. GMs only.
 * @param {Event} _event
 * @param {HTMLElement} target
 */
function forgetJourneyLine(_event, target) {
	if (!game.user.isGM) return;
	const row = rowOf(target);
	const forget = FORGET_JOURNEY[target.dataset.kind];
	if (row && forget) return forget(row.scene, row.hex, target.dataset.ref ?? "");
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
 * Bring a hex of the chart into view once it's laid out, a zoomed chart
 * moving to it and the page scrolling to it: the one asked for, else where
 * the Company stands, else the hex chosen.
 * @param {HTMLElement} list
 * @param {string|null} [key]
 */
export function showChartPlace(list, key = null) {
	const places = ".bastionland-travels-chart__place";
	const place = (key && list.querySelector(`${places}[data-hex="${key}"]`))
		?? list.querySelector(`${places}.is-here`) ?? list.querySelector(`${places}.is-selected`);
	if (!place) return;
	requestAnimationFrame(() => {
		if (!place.isConnected) return;
		holdChartPlace(place);
		const scroller = scrollerOf(place);
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
	wireChartZoom(list, state);
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
 * the Referee told them of it, and their own note. For a GM, the hex beside
 * is the one place it's read and changed: any hex of the Realm can be chosen,
 * and the Lay of the Land under it holds what the GM keeps there.
 */
export class TravelsPlaces extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: PLACES_ID,
		classes: [SYSTEM_ID, "bastionland", "bastionland-travels-window"],
		position: { width: 800, height: 640 },
		window: { icon: "fa-solid fa-map-location-dot", resizable: true },
		actions: {
			pickTravelsHex: TravelsPlaces.#onPick,
			showTravelsHex: showTravelsRow,
			forgetJourney: forgetJourneyLine,
			pingHex: TravelsPlaces.#onPing,
			// The GM's part of the chosen hex: each takes the hex shown.
			...Object.fromEntries(Object.entries(HEX_GM_ACTIONS).map(([action, act]) => [action, function (_event, target) {
				const at = game.user.isGM ? this.gmAt() : null;
				if (at) return act(at, target);
			}]))
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

	/** @type {import("./hex-gm-part.js").HexGmState} How the GM left the Lay of the Land, kept from hex to hex. */
	hexGm = hexGmState();

	/** @type {object|null|undefined} The art index, read once for a GM: it names the Myths and Seers in the GM's part of the chosen hex. */
	#index;

	/** @returns {Promise<object|null>} The art index for a GM, null for a player. */
	async #gmIndex() {
		if (!game.user?.isGM) return null;
		if (this.#index === undefined) this.#index = await loadArtIndex();
		return this.#index;
	}

	/**
	 * Show the hex chosen on the map, ringed till the next click.
	 * @this {TravelsPlaces}
	 */
	static #onPing() {
		const at = this.chosen();
		if (at) return showHexOnMap(at.scene, at.hex);
	}

	/** @override */
	_initializeApplicationOptions(options) {
		const initial = super._initializeApplicationOptions(options);
		// A GM's hex holds the Lay of the Land as well, so the window opens wider for them.
		if (game.user?.isGM) initial.position.width = Math.max(initial.position.width ?? 0, 960);
		return initial;
	}

	/** @override */
	get title() {
		return t("travels.title");
	}

	/** @returns {{scene: Scene, hex: {col: number, row: number}}|null} The hex chosen, and its Realm. */
	chosen() {
		const scene = game.scenes.get(this.state.realm);
		const hex = parseHexKey(this.state.selected ?? "");
		return scene && hex ? { scene, hex } : null;
	}

	/**
	 * The hex chosen, for the GM's part of it.
	 * @returns {{scene: Scene, hex: {col: number, row: number}, state: object, redraw: () => Promise<unknown>}|null}
	 */
	gmAt() {
		const at = this.chosen();
		return at && { ...at, state: this.hexGm, redraw: () => this.#drawDetail() };
	}

	/**
	 * @returns {Promise<((scene: Scene, view: object) => object|null)|null>} What builds the GM's part of a hex, none for a player.
	 */
	async #gmPart() {
		if (!game.user?.isGM) return null;
		const index = await this.#gmIndex();
		return (scene, view) => hexGmContext({ scene, hex: view.hex, view, index, state: this.hexGm });
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const list = travelsListContext(this.state.realm, { ...this.state, detail: true, gmPart: await this.#gmPart() });
		if (list.sceneId) this.state.realm = list.sceneId;
		if (list.selected !== undefined) this.state.selected = list.selected;
		return Object.assign(context, list);
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		wireTravelsList(this.element, this.state, () => this.render());
		this.#wireDetail();
		// Rolls on the Spark Tables, and prompts from Flip the Book, are kept in the hex a GM has chosen here.
		chosenHexMoved();
		if (this.reveal) {
			this.reveal = false;
			this.showChosen();
		}
	}

	/** Bring the chosen hex into view: its row scrolled to, and on the chart, the chart moved to it rather than the Company. */
	showChosen() {
		this.element?.querySelector(".bastionland-travels__row.is-selected")?.scrollIntoView({ block: "nearest" });
		const list = this.element?.querySelector(".bastionland-travels");
		if (list && this.state.view === "chart") showChartPlace(list, this.state.selected);
	}

	/**
	 * Choose a hex of the Realm shown. Only the chosen hex changes, so only its
	 * detail is drawn again, and the pages are marked where they stand.
	 * @param {string} key
	 * @returns {Promise<unknown>}
	 */
	choose(key) {
		this.state.selected = key;
		const list = this.element?.querySelector(".bastionland-travels");
		if (!list || !markChosen(list, key)) return this.render();
		return this.#drawDetail();
	}

	/** Write the Company's note when its box is left, not at every key. */
	#wireDetail() {
		this.element.querySelector(".bastionland-travels-detail textarea[name='party']")?.addEventListener("change", (event) => {
			const scene = game.scenes.get(this.state.realm);
			const hex = parseHexKey(event.target.dataset.hex ?? "");
			if (scene && hex) writePartyNote(scene, hex, event.target.value);
		});
		// A GM's Journal of the hex, then Ping, follow the hex chosen, in the title bar.
		hangHeaderButtons(this.element, "bastionland-places-header", [
			...(game.user.isGM ? hexGmHeaderButtons(this.element) : []),
			...(this.element.querySelector(".bastionland-travels-detail[data-ping]")
				? [{ action: "pingHex", icon: "fa-solid fa-location-crosshairs", label: t("travels.ping"), tooltip: t("travels.pingHint") }]
				: [])
		]);
		// A GM names the chosen hex by clicking its heading.
		const at = this.chosen();
		if (!at) return;
		const { scene, hex } = at;
		const detail = this.element.querySelector(".bastionland-travels-detail");
		wireHexRename(detail, (name) => renameHex(scene, hex, name));
		if (game.user.isGM) wireHexGmPart(detail, { scene, hex, state: this.hexGm });
	}

	/**
	 * Draw the chosen hex again, leaving the rest of the page as drawn.
	 * @returns {Promise<unknown>}
	 */
	async #drawDetail() {
		const shown = this.element?.querySelector(".bastionland-travels-detail");
		const detail = shown && this.state.selected ? travelsHexDetail(this.state.realm, this.state.selected, await this.#gmPart()) : null;
		if (!detail) return this.render();
		const html = await foundry.applications.handlebars.renderTemplate(templatePath("apps/parts/travels-hex-detail.hbs"), { ...detail, partId: `${this.id}-body` });
		const drawn = document.createElement("template");
		drawn.innerHTML = html;
		const fresh = drawn.content.querySelector(".bastionland-travels-detail");
		if (!fresh || !shown.isConnected) return this.render();
		shown.replaceWith(fresh);
		this.#wireDetail();
		chosenHexMoved();
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
		// Rolls on the Spark Tables go back to the Company's hex, and Flip the Book to a hex clicked on the map.
		chosenHexMoved();
	}

	/**
	 * Choose the hex a row, a hex of the chart or a line of the journey stands for.
	 * @this {TravelsPlaces}
	 * @param {Event} _event
	 * @param {HTMLElement} target
	 */
	static async #onPick(_event, target) {
		const hex = parseHexKey(target.dataset.hex ?? "");
		if (hex) return this.choose(hexKey(hex));
	}
}

/**
 * Open the Company's places, bringing the window forward if it's already open.
 * A GM opens any hex of the Realm in it, and its Lay of the Land with it.
 * @param {object} [options]
 * @param {string} [options.sceneId] The Realm to show.
 * @param {{col: number, row: number}} [options.hex] The hex to choose in it.
 * @returns {TravelsPlaces}
 */
export function openPlaces({ sceneId, hex } = {}) {
	const app = reopenablePlaces();
	// Open on this Realm already: only the hex chosen is drawn again.
	if (hex && app.rendered && !app.minimized && (!sceneId || sceneId === app.state.realm)) {
		app.bringToFront();
		app.choose(hexKey(hex)).then(() => app.showChosen());
		return app;
	}
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

/**
 * Open one hex of a Realm in Places: for a GM, any hex, with its Lay of the
 * Land under what the players know of it.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}} options.hex
 * @returns {TravelsPlaces}
 */
export const openHex = ({ scene, hex }) => openPlaces({ sceneId: scene.id, hex });

/**
 * The window to render when it was open as the page last unloaded. It opens
 * on the Realm it shows first, on the page this browser last chose.
 * @returns {TravelsPlaces}
 */
export function reopenablePlaces() {
	return foundry.applications.instances.get(TravelsPlaces.DEFAULT_OPTIONS.id) ?? new TravelsPlaces();
}

/**
 * Draw the Places window again after its Realm changed, once the GM has
 * finished typing: while a Realm is drawn by hand, or its Undo changes,
 * nothing else tells it.
 * @param {string} sceneId
 */
export function refreshPlaces(sceneId) {
	const app = foundry.applications.instances.get(TravelsPlaces.DEFAULT_OPTIONS.id);
	if (app?.rendered && app.state.realm === sceneId) renderWhenIdle(app);
}
