import { t } from "../chat/cards.js";
import { openRulebook } from "../rulebook/BookReader.js";
import { RULEBOOK_HOOK, canReadRulebook, hasRulebook } from "../rulebook/store.js";
import { travelRulesPlacement } from "../rules/travel-rules.js";
import { SYSTEM_ID } from "../system-id.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * A sheet of rules held against one edge of a Realm Scene's map, as the Blank
 * Realm sheet prints them beside its map, wherever the canvas has panned and
 * zoomed it to. It draws itself again as the rulebook comes and goes, for the
 * link to its page.
 */
export class MapSidePanel extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		side: "right",
		tag: "aside",
		classes: [SYSTEM_ID, "bastionland", "bastionland-travel-rules"],
		window: { frame: false, positioned: false },
		actions: {
			openPage: MapSidePanel.#onOpenPage
		}
	};

	/** @type {[string, number][]} Hooks to take down on close. */
	#hooks = [];

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
		// Every pan, zoom and resize of the canvas comes through canvasPan.
		const place = () => this.place();
		this.#hooks = [...this.redrawHooks.map((name) => [name, redraw]), ["canvasPan", place]].map(([name, fn]) => [name, Hooks.on(name, fn)]);
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		this.place();
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		for (const [name, id] of this.#hooks) Hooks.off(name, id);
		this.#hooks = [];
	}

	/**
	 * Move the panel against its edge of the map. It stays as tall as the map
	 * but keeps its width, so it stays readable however far out the map is zoomed.
	 * @param {ReturnType<typeof mapOnScreen>} [map]
	 */
	place(map = mapOnScreen()) {
		placeBesideMap(this.element, this.side, map);
	}

	/** @this {MapSidePanel} */
	static #onOpenPage(event, target) {
		// A link in a group's summary would otherwise open or close the group too.
		event.preventDefault();
		return openRulebook({ page: Number(target.dataset.page) });
	}
}

/**
 * @returns {{left: number, top: number, right: number, bottom: number}|null} Where the Scene's map is on
 *   screen, in CSS pixels, or null while the canvas isn't ready.
 */
export function mapOnScreen() {
	const rect = canvas?.ready ? canvas.dimensions?.sceneRect : null;
	if (!rect) return null;
	// As Foundry lines its HUD up with the canvas.
	const origin = canvas.primary.getGlobalPosition();
	const zoom = canvas.stage.scale.x;
	return {
		left: origin.x + (rect.x * zoom),
		top: origin.y + (rect.y * zoom),
		right: origin.x + ((rect.x + rect.width) * zoom),
		bottom: origin.y + ((rect.y + rect.height) * zoom)
	};
}

/** @returns {number} The interface scale. Foundry sets it on the body itself, which is cheaper to read on every pan than computed style. */
export const interfaceScale = () => Number.parseFloat(document.body.style.getPropertyValue("--ui-scale")) || 1;

/**
 * Hold a panel against one edge of the Realm's map, level with its top and as
 * tall as it.
 * @param {HTMLElement|null|undefined} element
 * @param {"left"|"right"} side
 * @param {ReturnType<typeof mapOnScreen>} [map]
 */
export function placeBesideMap(element, side, map = mapOnScreen()) {
	if (!element || !map) return;
	const scale = interfaceScale();
	// Layout width, which the interface scale's transform doesn't change.
	const width = element.offsetWidth;
	const { left, top, maxHeight } = travelRulesPlacement(map, { side, width, scale });

	const { style } = element;
	style.left = `${left}px`;
	style.top = `${top}px`;
	// The interface scale is a transform, so the height it may grow to is set before scaling.
	style.setProperty("--travel-rules-max-height", `${maxHeight / scale}px`);
}
