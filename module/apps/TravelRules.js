import { CALENDAR_HOOK, getCalendar } from "../actions/calendar.js";
import { isRealmScene } from "../actions/realm.js";
import { rollRefereeTable } from "../actions/referee-rolls.js";
import { wildernessRoll } from "../actions/wilderness.js";
import { t } from "../chat/cards.js";
import { openRulebook } from "../rulebook/BookReader.js";
import { RULEBOOK_HOOK, canReadRulebook, hasRulebook } from "../rulebook/store.js";
import { D6_BANDS, TRAVEL_SIDES, groupsOnSide, normaliseTravelRulesView, pressingSections, travelRulesPlacement } from "../rules/travel-rules.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Which sides of the map this browser has folded away, and which groups it has closed. */
const VIEW_SETTING = "travelRules";

/** Register where each browser left the rules. Called during init. */
export function registerTravelRulesSetting() {
	game.settings.register(SYSTEM_ID, VIEW_SETTING, {
		scope: "client",
		config: false,
		type: Object,
		default: { folded: [], closed: [] }
	});
}

/** @returns {ReturnType<typeof normaliseTravelRulesView>} */
const getView = () => normaliseTravelRulesView(game.settings.get(SYSTEM_ID, VIEW_SETTING));

/**
 * @param {Partial<ReturnType<typeof normaliseTravelRulesView>>} changes
 * @returns {Promise<unknown>}
 */
const setView = (changes) => game.settings.set(SYSTEM_ID, VIEW_SETTING, normaliseTravelRulesView({ ...getView(), ...changes }));

/**
 * One side's share of Travel and Exploration (p18-19), against that edge of a
 * Realm Scene's map, as the Blank Realm sheet prints Travel beside its map, for
 * GMs and players alike. Travel stands on the left and Rest and Exploration on
 * the right, as `TRAVEL_RULES` lays them out. Pressing rules stand out as the
 * calendar turns, and GMs get the rolls beside their tables.
 */
export class TravelRules extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-travel-rules-{id}",
		side: "right",
		tag: "aside",
		classes: [SYSTEM_ID, "bastionland", "bastionland-travel-rules"],
		window: { frame: false, positioned: false },
		actions: {
			fold: TravelRules.#onFold,
			openPage: TravelRules.#onOpenPage,
			roll: TravelRules.#onRoll
		}
	};

	static PARTS = {
		rules: { template: templatePath("apps/travel-rules.hbs"), scrollable: [".bastionland-travel-rules__body"] }
	};

	/** @type {[string, number][]} Hooks to take down on close. */
	#hooks = [];

	/** @returns {"left"|"right"} The side of the map these rules stand on. */
	get side() {
		return this.options.side;
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const view = getView();
		const folded = view.folded.includes(this.side);
		const pressing = pressingSections(getCalendar());
		const isGM = game.user.isGM;
		const pageLinks = hasRulebook() && canReadRulebook();
		const text = (key, data) => t(`travelRules.${key}`, data);

		return Object.assign(context, {
			isGM,
			title: text(`titles.${this.side}`),
			folded,
			foldLabel: text(folded ? "unfold" : "fold"),
			groups: groupsOnSide(this.side).map((group) => ({
				key: group.key,
				heading: text(`groups.${group.key}`),
				open: !view.closed.includes(group.key),
				page: text("page", { page: group.page }),
				pageNumber: group.page,
				pageLink: pageLinks ? text("openPage", { page: group.page }) : null,
				sections: group.sections.map((section) => {
					const key = `sections.${section.key}`;
					return {
						key: section.key,
						heading: section.intro ? null : text(`${key}.heading`),
						text: text(`${key}.text`),
						lead: section.lead ? text(`${key}.lead`) : null,
						pressing: pressing.has(section.key),
						lines: section.lines?.map((line) => ({ label: text(`${key}.lines.${line}.label`), text: text(`${key}.lines.${line}.text`) })) ?? null,
						rows: section.rows?.map((row, index) => ({ band: D6_BANDS[index], text: text(`${key}.rows.${row}`) })) ?? null,
						note: section.note ? text(`${key}.note`) : null,
						roll: isGM && section.roll ? { key: section.roll, label: text(`${key}.roll`) } : null
					};
				})
			})),
			credit: text(`credits.${this.side}`)
		});
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
		// Night, Winter and the page links follow the calendar and the rulebook, on every client.
		const redraw = () => this.render();
		// Every pan, zoom and resize of the canvas comes through canvasPan.
		const place = () => this.place();
		this.#hooks = [[CALENDAR_HOOK, redraw], [RULEBOOK_HOOK, redraw], ["canvasPan", place]].map(([name, fn]) => [name, Hooks.on(name, fn)]);
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		this.place();
		// Opening or closing a group isn't a click, and a toggle event doesn't bubble.
		for (const details of this.element.querySelectorAll("details[data-group]")) {
			details.addEventListener("toggle", () => this.#rememberGroups());
		}
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		for (const [name, id] of this.#hooks) Hooks.off(name, id);
		this.#hooks = [];
	}

	/**
	 * Move the rules against their edge of the Realm's map, wherever the canvas
	 * has panned and zoomed it to. They stay as tall as the map but keep their
	 * width, so they stay readable however far out the map is zoomed.
	 */
	place() {
		const rect = canvas?.ready ? canvas.dimensions?.sceneRect : null;
		if (!this.element || !rect) return;
		// As Foundry lines its HUD up with the canvas.
		const origin = canvas.primary.getGlobalPosition();
		const zoom = canvas.stage.scale.x;
		const map = {
			left: origin.x + (rect.x * zoom),
			top: origin.y + (rect.y * zoom),
			right: origin.x + ((rect.x + rect.width) * zoom),
			bottom: origin.y + ((rect.y + rect.height) * zoom)
		};
		// Foundry sets the interface scale on the body itself, which is cheaper to read on every pan than computed style.
		const scale = Number.parseFloat(document.body.style.getPropertyValue("--ui-scale")) || 1;
		// Layout width, which the interface scale's transform doesn't change.
		const width = this.element.offsetWidth;
		const { left, top, maxHeight } = travelRulesPlacement(map, { side: this.side, width, scale });

		const { style } = this.element;
		style.left = `${left}px`;
		style.top = `${top}px`;
		// The interface scale is a transform, so the height it may grow to is set before scaling.
		style.setProperty("--travel-rules-max-height", `${maxHeight / scale}px`);
	}

	/** Remember which groups this browser has closed, without drawing the rules again. */
	#rememberGroups() {
		const details = [...this.element.querySelectorAll("details[data-group]")];
		const here = details.map((group) => group.dataset.group);
		const view = getView();
		// The other side's closed groups are kept as they are.
		const closed = [...view.closed.filter((key) => !here.includes(key)), ...details.filter((group) => !group.open).map((group) => group.dataset.group)];
		if (normaliseTravelRulesView({ closed }).closed.join() !== view.closed.join()) setView({ closed });
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {TravelRules} */
	static async #onFold() {
		const { folded } = getView();
		await setView({ folded: folded.includes(this.side) ? folded.filter((side) => side !== this.side) : [...folded, this.side] });
		return this.render();
	}

	/** @this {TravelRules} */
	static #onOpenPage(event, target) {
		// The link sits in the group's summary, which would otherwise open or close the group too.
		event.preventDefault();
		return openRulebook({ page: Number(target.dataset.page) });
	}

	/** @this {TravelRules} */
	static #onRoll(_event, target) {
		if (!game.user.isGM) return null;
		const { roll } = target.dataset;
		return roll === "wilderness" ? wildernessRoll({ scene: canvas.scene }) : rollRefereeTable(roll);
	}
}

/** @type {Map<string, TravelRules>} Each side's rules. */
const panels = new Map();

/**
 * Show the rules on both sides of the map while a Realm Scene is on the canvas.
 * Called as the canvas becomes ready.
 * @returns {Promise<unknown>}
 */
export function showTravelRules() {
	if (!isRealmScene(canvas?.scene)) return closeTravelRules();
	return Promise.all(TRAVEL_SIDES.map((side) => {
		if (!panels.has(side)) panels.set(side, new TravelRules({ id: `bastionland-travel-rules-${side}`, side, classes: [`bastionland-travel-rules--${side}`] }));
		return panels.get(side).render({ force: true });
	}));
}

/**
 * Take the rules down, as the canvas leaves Realm Scenes behind.
 * @returns {Promise<unknown>}
 */
export function closeTravelRules() {
	return Promise.all([...panels.values()].map((panel) => panel.close({ animate: false })));
}
