import { CALENDAR_HOOK, getCalendar } from "../actions/calendar.js";
import { takeExplorationAct } from "../actions/exploration.js";
import { isDrawingRealm, isRealmScene } from "../actions/realm.js";
import { rollRefereeTable } from "../actions/referee-rolls.js";
import { gallop } from "../actions/steeds.js";
import { sufferHardship } from "../actions/time.js";
import { wildernessRoll } from "../actions/wilderness.js";
import { BOOK_TEXT_HOOK, bookTextRead } from "../book-art/book-text.js";
import { t } from "../chat/cards.js";
import { read } from "../client-settings.js";
import { RULEBOOK_HOOK } from "../rulebook/store.js";
import { D6_BANDS, TRAVEL_SIDES, groupsOnSide, normaliseTravelRulesScroll, normaliseTravelRulesView, pressingSections } from "../rules/travel-rules.js";
import { HARDSHIPS } from "../rules/time.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { MapSidePanel } from "./MapSidePanel.js";

/** Which sides of the map this browser has folded away, and which groups it has closed. */
const VIEW_SETTING = "travelRules";

/** Whether this browser shows the rules at all. Everyone else at the table keeps their own choice. */
const SHOWN_SETTING = "travelRulesShown";

/** How far down each side this browser has scrolled, so the rules open where they were left. */
const SCROLL_SETTING = "travelRulesScroll";

/** Register where each browser left the rules, and whether it shows them. Called during init. */
export function registerTravelRulesSetting() {
	game.settings.register(SYSTEM_ID, VIEW_SETTING, {
		scope: "client",
		config: false,
		type: Object,
		default: { folded: [], closed: [] }
	});
	game.settings.register(SYSTEM_ID, SCROLL_SETTING, {
		scope: "client",
		config: false,
		type: Object,
		default: {}
	});
	game.settings.register(SYSTEM_ID, SHOWN_SETTING, {
		name: "bastionland.settings.travelRulesShown.name",
		hint: "bastionland.settings.travelRulesShown.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		// A Realm still being drawn by hand shows Creating a Realm there instead, and keeps it.
		onChange: (shown) => (shown && !isDrawingRealm(canvas?.scene) ? showTravelRules() : closeTravelRules())
	});
}

/** @returns {boolean} Whether this browser shows the rules beside a Realm's map. */
export const travelRulesShown = () => read(SHOWN_SETTING, true) !== false;

/** @returns {ReturnType<typeof normaliseTravelRulesView>} */
const getView = () => normaliseTravelRulesView(game.settings.get(SYSTEM_ID, VIEW_SETTING));

/**
 * @param {Partial<ReturnType<typeof normaliseTravelRulesView>>} changes
 * @returns {Promise<unknown>}
 */
const setView = (changes) => game.settings.set(SYSTEM_ID, VIEW_SETTING, normaliseTravelRulesView({ ...getView(), ...changes }));

/** @returns {ReturnType<typeof normaliseTravelRulesScroll>} */
const getScroll = () => normaliseTravelRulesScroll(read(SCROLL_SETTING, {}));

/**
 * A hardship's button, naming what it costs.
 * @param {string} key One of HARDSHIPS.
 * @returns {{key: string, label: string, hint: string}}
 */
function hardshipButton(key) {
	const { virtue } = HARDSHIPS.find((hardship) => hardship.key === key);
	return {
		key,
		label: t("travelRules.hardship", { virtue: t(`virtues.${virtue}.abbr`) }),
		hint: t(`time.hardship.kinds.${key}.hint`)
	};
}

/**
 * One side's share of Travel and Exploration (p18-19), against that edge of a
 * Realm Scene's map, as the Blank Realm sheet prints Travel beside its map, for
 * GMs and players alike. Travel stands on the left and Rest and Exploration on
 * the right, as `TRAVEL_RULES` lays them out. Pressing rules stand out as the
 * calendar turns, and GMs get the rolls beside their tables and each hardship's
 * Virtue Loss beside the rule that deals it.
 */
export class TravelRules extends MapSidePanel {
	static DEFAULT_OPTIONS = {
		id: "bastionland-travel-rules-{id}",
		actions: {
			fold: TravelRules.#onFold,
			roll: TravelRules.#onRoll,
			act: TravelRules.#onAct,
			hardship: TravelRules.#onHardship
		}
	};

	static PARTS = {
		rules: { template: templatePath("apps/travel-rules.hbs"), scrollable: [".bastionland-travel-rules__body"] }
	};

	/** Night, Winter, the page links and the book's words follow the calendar and the rulebook, on every client. */
	get redrawHooks() {
		return [CALENDAR_HOOK, RULEBOOK_HOOK, BOOK_TEXT_HOOK];
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const view = getView();
		const folded = view.folded.includes(this.side);
		const pressing = pressingSections(getCalendar());
		const isGM = game.user.isGM;
		const text = (key, data) => t(`travelRules.${key}`, data);
		// The rules are the book's own words, so until Import PDF has read them there are only headings and buttons.
		const fromBook = bookTextRead("travelRules.");

		return Object.assign(context, {
			isGM,
			title: text(`titles.${this.side}`),
			folded,
			foldLabel: text(folded ? "unfold" : "fold"),
			groups: groupsOnSide(this.side).map((group) => ({
				key: group.key,
				heading: text(`groups.${group.key}`),
				open: !view.closed.includes(group.key),
				...MapSidePanel.pageContext(group.page),
				sections: group.sections.map((section) => {
					const key = `sections.${section.key}`;
					return {
						key: section.key,
						heading: section.intro ? null : text(`${key}.heading`),
						text: text(`${key}.text`),
						lead: section.lead ? text(`${key}.lead`) : null,
						pressing: pressing.has(section.key),
						lines: section.lines?.map((line) => ({ label: text(`${key}.lines.${line}.label`), text: text(`${key}.lines.${line}.text`) })) ?? null,
						rows: fromBook ? section.rows?.map((row, index) => ({ band: D6_BANDS[index], text: text(`${key}.rows.${row}`) })) ?? null : null,
						note: section.note ? text(`${key}.note`) : null,
						roll: isGM && section.roll ? { key: section.roll, label: text(`${key}.roll`) } : null,
						act: isGM && section.act ? { key: section.act, label: text(`${key}.act`) } : null,
						hardship: isGM && section.hardship ? hardshipButton(section.hardship) : null
					};
				})
			})),
			unread: fromBook ? null : text("unread"),
			credit: fromBook ? text(`credits.${this.side}`) : null
		});
	}

	/** @type {number|null} How far down this side is scrolled, kept while it's folded or taken down. */
	#scrollTop = null;

	/** Save this side's scroll once it has come to rest. */
	#saveScroll = foundry.utils.debounce(() => {
		game.settings.set(SYSTEM_ID, SCROLL_SETTING, { ...getScroll(), [this.side]: this.#scrollTop });
	}, 300);

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		// Opening or closing a group isn't a click, and a toggle event doesn't bubble.
		for (const details of this.element.querySelectorAll("details[data-group]")) {
			details.addEventListener("toggle", () => this.#rememberGroups());
		}
		// Foundry keeps the scroll when the rules are drawn again in place, but not
		// once they've been folded, taken down for another Scene or reloaded, so
		// the side opens where it was left. Placed first, so it's as tall as it'll be.
		const body = this.element.querySelector(".bastionland-travel-rules__body");
		if (!body) return;
		this.#scrollTop ??= getScroll()[this.side];
		body.scrollTop = this.#scrollTop;
		body.addEventListener("scroll", () => {
			this.#scrollTop = Math.round(body.scrollTop);
			this.#saveScroll();
		}, { passive: true });
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

	/**
	 * What the Company does when it stops and looks about (p19).
	 * @this {TravelRules}
	 */
	static #onAct(_event, target) {
		return takeExplorationAct(target.dataset.act, { scene: canvas.scene });
	}

	/**
	 * Take a hardship's d6 from everybody ticked (p18).
	 * @this {TravelRules}
	 */
	static #onHardship(_event, target) {
		return sufferHardship(target.dataset.hardship);
	}

	/** @this {TravelRules} */
	static #onRoll(_event, target) {
		if (!game.user.isGM) return null;
		const { roll } = target.dataset;
		if (roll === "gallop") return gallop();
		return roll === "wilderness" ? wildernessRoll({ scene: canvas.scene }) : rollRefereeTable(roll);
	}
}

/** @type {Map<string, TravelRules>} Each side's rules. */
const panels = new Map();

/**
 * Show the rules on both sides of the map while a Realm Scene is on the canvas,
 * unless this browser has turned them off. Called as the canvas becomes ready.
 * @returns {Promise<unknown>}
 */
export function showTravelRules() {
	if (!isRealmScene(canvas?.scene) || !travelRulesShown()) return closeTravelRules();
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
