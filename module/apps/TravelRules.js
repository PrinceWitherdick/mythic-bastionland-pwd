import { CALENDAR_HOOK, getCalendar } from "../actions/calendar.js";
import { isRealmScene } from "../actions/realm.js";
import { rollRefereeTable } from "../actions/referee-rolls.js";
import { gallop } from "../actions/steeds.js";
import { wildernessRoll } from "../actions/wilderness.js";
import { t } from "../chat/cards.js";
import { RULEBOOK_HOOK } from "../rulebook/store.js";
import { D6_BANDS, TRAVEL_SIDES, groupsOnSide, normaliseTravelRulesView, pressingSections } from "../rules/travel-rules.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { MapSidePanel } from "./MapSidePanel.js";

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
export class TravelRules extends MapSidePanel {
	static DEFAULT_OPTIONS = {
		id: "bastionland-travel-rules-{id}",
		actions: {
			fold: TravelRules.#onFold,
			roll: TravelRules.#onRoll
		}
	};

	static PARTS = {
		rules: { template: templatePath("apps/travel-rules.hbs"), scrollable: [".bastionland-travel-rules__body"] }
	};

	/** Night, Winter and the page links follow the calendar and the rulebook, on every client. */
	get redrawHooks() {
		return [CALENDAR_HOOK, RULEBOOK_HOOK];
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const view = getView();
		const folded = view.folded.includes(this.side);
		const pressing = pressingSections(getCalendar());
		const isGM = game.user.isGM;
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
	async _onRender(context, options) {
		await super._onRender(context, options);
		// Opening or closing a group isn't a click, and a toggle event doesn't bubble.
		for (const details of this.element.querySelectorAll("details[data-group]")) {
			details.addEventListener("toggle", () => this.#rememberGroups());
		}
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
