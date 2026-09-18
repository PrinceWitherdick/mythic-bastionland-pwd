import { CALENDAR_HOOK } from "../actions/calendar.js";
import { awardGlory } from "../actions/glory.js";
import { rollRefereeTable } from "../actions/referee-rolls.js";
import { advancePhase, journeyToDistantRealm, sufferHardship, turnAge, turnSeason } from "../actions/time.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { setCalendarByHand, timeContext } from "./time-controls.js";
import { singletonOpener } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The world's calendar (Time, p17). GMs move it on a Phase, a Season or an Age
 * at a time, which carries out what the book says happens between them, or set
 * it by hand. The same window tallies hardship on the road.
 */
export class TimePanel extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		tag: "form",
		classes: [SYSTEM_ID, "bastionland", "bastionland-time-window"],
		position: { width: 480, height: "auto" },
		window: { title: "bastionland.time.title", icon: "fa-solid fa-hourglass-half" },
		form: { handler: TimePanel.#onSubmit, submitOnChange: true, closeOnSubmit: false },
		actions: {
			setSeason: TimePanel.#onSetSeason,
			setPhase: TimePanel.#onSetPhase,
			nextPhase: advancePhase,
			turnSeason,
			turnAge,
			journey: journeyToDistantRealm,
			refereeRoll: TimePanel.#onRefereeRoll,
			hardship: TimePanel.#onHardship,
			awardGlory: TimePanel.#onAwardGlory
		}
	};

	static PARTS = {
		panel: { template: templatePath("apps/time-panel.hbs") }
	};

	/** @type {number|null} */
	#hook = null;

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const isGM = game.user.isGM;
		return Object.assign(context, timeContext(), { isGM, locked: !isGM });
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		// Every client hears the calendar change, so an open window keeps up.
		this.#hook = Hooks.on(CALENDAR_HOOK, () => this.render());
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		if (this.#hook !== null) Hooks.off(CALENDAR_HOOK, this.#hook);
		this.#hook = null;
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {TimePanel} */
	static #onSubmit(_event, _form, formData) {
		return setCalendarByHand({ age: formData.object.age, day: formData.object.day });
	}

	/** @this {TimePanel} */
	static #onSetSeason(_event, target) {
		return setCalendarByHand({ season: target.dataset.season });
	}

	/** @this {TimePanel} */
	static #onSetPhase(_event, target) {
		return setCalendarByHand({ phase: target.dataset.phase });
	}

	/** @this {TimePanel} */
	static #onRefereeRoll(_event, target) {
		return rollRefereeTable(target.dataset.table);
	}

	/** @this {TimePanel} */
	static #onHardship(_event, target) {
		return sufferHardship(target.dataset.hardship);
	}

	/** @this {TimePanel} */
	static #onAwardGlory(_event, target) {
		return awardGlory(target.dataset.award);
	}
}

/** Open the calendar, bringing the window forward if it's already open. */
export const openTimePanel = singletonOpener(TimePanel);
