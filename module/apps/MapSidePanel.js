import { t } from "../chat/cards.js";
import { openRulebook } from "../rulebook/BookReader.js";
import { RULEBOOK_HOOK, canReadRulebook, hasRulebook } from "../rulebook/store.js";
import { followMap, mapOnScreen, placeBesideMap } from "./map-screen.js";
import { SYSTEM_ID } from "../system-id.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * A sheet of rules held against one edge of a Realm Scene's map, as the Blank
 * Realm sheet prints them beside its map, from its top to its foot. It follows
 * the map as the Realm is panned and zoomed, growing taller or shorter with it
 * but never wider.
 * It draws itself again as the rulebook comes and goes, for the link to its
 * page.
 */
export class MapSidePanel extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		side: "right",
		tag: "aside",
		classes: [SYSTEM_ID, "bastionland", "bastionland-travel-rules"],
		window: { frame: false, positioned: false },
		actions: {
			openPage: MapSidePanel.openPage
		}
	};

	/** @type {[string, number][]} Hooks to take down on close. */
	#hooks = [];

	/** @type {number|null} The panel's layout width, which doesn't change once it's laid out, so a placing doesn't measure it again. */
	#width = null;

	/** @type {(() => void)|null} Stops the panel following the map. */
	#unfollow = null;

	/** @returns {"left"|"right"} The side of the map the panel stands on. */
	get side() {
		return this.options.side;
	}

	/** @returns {string[]} Hooks after which the panel is drawn again. */
	get redrawHooks() {
		return [RULEBOOK_HOOK];
	}

	/**
	 * @param {number} page
	 * @returns {{page: string, pageNumber: number, pageLink: string|null}} What the template needs for a page, and its link.
	 */
	static pageContext(page) {
		return {
			page: t("travelRules.page", { page }),
			pageNumber: page,
			pageLink: hasRulebook() && canReadRulebook() ? t("rulebook.openPage", { page }) : null
		};
	}

	/** @override */
	_insertElement(element) {
		const existing = document.getElementById(element.id);
		if (existing) existing.replaceWith(element);
		// With the rest of the interface, so the sidebar and windows stay above it.
		else (document.getElementById("interface") ?? document.body).append(element);
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		const redraw = () => this.render();
		this.#hooks = this.redrawHooks.map((name) => [name, Hooks.on(name, redraw)]);
		this.#unfollow = followMap(() => {
			if (this.rendered) this.place();
		});
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		// Drawn again from scratch, so its width is measured afresh: Text Size and the
		// interface scale are one transform on it, but the wording it holds is not.
		this.#width = null;
		this.place();
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		for (const [name, id] of this.#hooks) Hooks.off(name, id);
		this.#hooks = [];
		this.#unfollow?.();
		this.#unfollow = null;
		this.#width = null;
	}

	/**
	 * Move the panel against its edge of the map, as tall as it. It keeps its
	 * width wherever the map is zoomed to, so the rules stay readable.
	 * @param {ReturnType<typeof mapOnScreen>} [map] Where the map is.
	 */
	place(map = mapOnScreen()) {
		const element = this.element;
		if (!element) return;
		// Measured again on the next placing if it hasn't been laid out yet, but placed either way.
		this.#width ||= element.offsetWidth || null;
		placeBesideMap(element, this.side, this.#width ?? 0, map);
	}

	/**
	 * Open the rulebook at a page link's page. Shared with the other windows
	 * that print the same page links, such as Creating a Realm.
	 * @param {PointerEvent} event
	 * @param {HTMLElement} target
	 */
	static openPage(event, target) {
		// A link in a group's summary would otherwise open or close the group too.
		event.preventDefault();
		return openRulebook({ page: Number(target.dataset.page) });
	}
}
