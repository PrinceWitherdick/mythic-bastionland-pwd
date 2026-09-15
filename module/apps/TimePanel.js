import { CALENDAR_HOOK, calendarLabel, getCalendar, setCalendar } from "../actions/calendar.js";
import { awardGlory } from "../actions/glory.js";
import { GLORY_AWARDS } from "../rules/glory.js";
import { rollRefereeTable } from "../actions/referee-rolls.js";
import { advancePhase, sufferHardship, turnAge, turnSeason } from "../actions/time.js";
import { t } from "../chat/cards.js";
import { HARDSHIPS, PHASES, SEASONS } from "../rules/time.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { singletonOpener } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Referee Rolls offered beside the calendar. */
const TIME_ROLLS = Object.freeze(["passage", "unresolved"]);

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
		const calendar = getCalendar();
		const isGM = game.user.isGM;

		return Object.assign(context, {
			isGM,
			locked: !isGM,
			now: calendarLabel(calendar),
			age: calendar.age,
			day: calendar.day,
			seasons: SEASONS.map((key) => ({ key, label: t(`time.seasons.${key}`), active: key === calendar.season })),
			phases: PHASES.map((key) => ({ key, label: t(`time.phases.${key}`), active: key === calendar.phase })),
			phaseHint: t(`time.phaseHints.${calendar.phase}`),
			winter: calendar.season === "winter",
			rolls: TIME_ROLLS.map((key) => ({ key, label: t(`refereeRolls.tables.${key}.name`) })),
			hardships: HARDSHIPS.map(({ key }) => ({
				key,
				label: t(`time.hardship.kinds.${key}.label`),
				hint: t(`time.hardship.kinds.${key}.hint`)
			})),
			gloryAwards: GLORY_AWARDS.map((key) => ({ key, label: t(`glory.awards.${key}.label`), hint: t(`glory.awards.${key}.hint`) }))
		});
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

	/**
	 * Set the calendar by hand, without anything that comes between Seasons or Ages.
	 * @param {object} changes
	 */
	static #set(changes) {
		if (!game.user.isGM) return;
		return setCalendar({ ...getCalendar(), ...changes });
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {TimePanel} */
	static #onSubmit(_event, _form, formData) {
		const count = (value, fallback) => (Number.isInteger(Number(value)) && Number(value) >= 1 ? Number(value) : fallback);
		const calendar = getCalendar();
		return TimePanel.#set({ age: count(formData.object.age, calendar.age), day: count(formData.object.day, calendar.day) });
	}

	/** @this {TimePanel} */
	static #onSetSeason(_event, target) {
		if (SEASONS.includes(target.dataset.season)) return TimePanel.#set({ season: target.dataset.season });
	}

	/** @this {TimePanel} */
	static #onSetPhase(_event, target) {
		if (PHASES.includes(target.dataset.phase)) return TimePanel.#set({ phase: target.dataset.phase });
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
