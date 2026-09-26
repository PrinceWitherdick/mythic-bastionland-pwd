import { getCalendar } from "../actions/calendar.js";
import { crisisRoll, worldDomains } from "../actions/dominion.js";
import { awardGlory } from "../actions/glory.js";
import { rollRefereeTable } from "../actions/referee-rolls.js";
import { endTheSession, getSessionEnd } from "../actions/session-end.js";
import { t } from "../chat/cards.js";
import { GLORY_BUTTONS } from "../rules/glory.js";
import { crisisRollsDue } from "../rules/season-log.js";
import { calendarTurn, offeredStep, passageStep, TIME_STEPS, timeStep, turnsSeasonOrAge } from "../rules/session-end.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** One window at a time, so ending the session twice at once isn't possible. */
const WINDOW_ID = "bastionland-session-end";

/**
 * Ending a Session (Refereeing p16), as one window walking the book's
 * procedure: how much time passes (with the Passage of Time die for a group
 * that can't decide), what became of anything left unresolved, the Glory the
 * session was worth, any Crisis Roll still owed, what the players plan next,
 * and a line for the Season's notes. The rolls it makes are the Referee's own
 * (rules/referee-rolls.js), so they post the same cards they always did; the
 * window only puts them in the order the book does. Only GMs may open it.
 */
export class SessionEnd extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: WINDOW_ID,
		classes: [SYSTEM_ID, "bastionland", "bastionland-dialog", "bastionland-session-end-window"],
		position: { width: 520, height: 720 },
		window: { title: "bastionland.sessionEnd.title", icon: "fa-solid fa-book-open", resizable: true },
		actions: {
			pickStep: SessionEnd.#onPickStep,
			rollPassage: SessionEnd.#onRollPassage,
			addSituation: SessionEnd.#onAddSituation,
			rollSituation: SessionEnd.#onRollSituation,
			dropSituation: SessionEnd.#onDropSituation,
			award: SessionEnd.#onAward,
			crisisRoll: SessionEnd.#onCrisisRoll,
			finish: SessionEnd.#onFinish
		}
	};

	static PARTS = {
		session: { template: templatePath("apps/session-end.hbs"), scrollable: [".bastionland-session-end__body"] }
	};

	/** How much time passes, one of TIME_STEPS, or null until it's settled. */
	#step = null;

	/** @type {{d6: number, result: string}|null} The Passage of Time roll made here, while there is one. */
	#passage = null;

	/** @type {"season"|"age"|null} A turn this session's roll puts at the end of the next one. */
	#promised = null;

	/** @type {{id: number, name: string, d6: number|null, result: string|null}[]} Situations left unresolved (p17). */
	#situations = [];

	/** Names the next situation, since a row is found by its own id rather than where it sits. */
	#nextId = 1;

	/** @type {{key: string, names: string}[]} The Glory awarded from this window, and to whom. */
	#glory = [];

	/** What the players plan for next session (p16), and the Referee's line for the Season's notes. */
	#plans = "";
	#recap = "";

	/** Why a step is offered before one is picked: "promised", or null. */
	#offered = null;

	/** Whether the offer has been made, so the window only makes it as it opens. */
	#considered = false;

	/**
	 * Offer the step last session's roll already calls for, once, before the
	 * Referee has touched the row. The book has the group discuss it, so nothing
	 * is offered when nothing points at a turn.
	 */
	#offer() {
		if (this.#considered) return;
		this.#considered = true;
		const { step, reason } = offeredStep({ promised: getSessionEnd().promised });
		this.#step = step;
		this.#offered = reason;
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		this.#offer();

		return Object.assign(context, {
			notice: this.#offered ? t(`sessionEnd.notices.${this.#offered}`) : null,
			steps: TIME_STEPS.map(({ key }) => ({
				key,
				label: t(`sessionEnd.time.steps.${key}.label`),
				hint: t(`sessionEnd.time.steps.${key}.hint`),
				active: key === this.#step
			})),
			passage: this.#passage
				? t("sessionEnd.time.rolled", {
					d6: this.#passage.d6,
					result: t(`refereeRolls.tables.passage.results.${this.#passage.result}`)
				})
				: null,
			// Only a Season or an Age turning leaves a situation to change.
			turning: turnsSeasonOrAge(this.#step),
			situations: this.#situations.map((situation) => ({
				...situation,
				text: situation.result ? t(`refereeRolls.tables.unresolved.results.${situation.result}`) : null
			})),
			awards: GLORY_BUTTONS.map((key) => ({
				key,
				label: t(`glory.awards.${key}.label`),
				hint: t(`glory.awards.${key}.hint`),
				awarded: this.#glory.filter((award) => award.key === key).map((award) => award.names)
			})),
			crises: crisisRollsDue(worldDomains(), getCalendar()).map((domain) => ({ id: domain.id, name: domain.name })),
			plans: this.#plans,
			recap: this.#recap,
			ready: Boolean(timeStep(this.#step))
		});
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		const root = this.element;
		// Kept as they're typed, so a roll or an award redrawing the window doesn't take the words away.
		root.querySelector("[name=plans]")?.addEventListener("input", (event) => { this.#plans = event.target.value; });
		root.querySelector("[name=recap]")?.addEventListener("input", (event) => { this.#recap = event.target.value; });
		root.querySelector(".bastionland-session-end__situations")?.addEventListener("input", (event) => {
			if (!event.target.matches("[name=situation]")) return;
			const row = this.#row(event.target);
			if (row) row.name = event.target.value;
		});
	}

	/**
	 * @param {HTMLElement} node Anything inside a situation's row.
	 * @returns {object|undefined} That situation.
	 */
	#row(node) {
		const id = Number(node.closest("[data-situation-id]")?.dataset.situationId);
		return this.#situations.find((situation) => situation.id === id);
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {SessionEnd} */
	static #onPickStep(_event, target) {
		const { step } = target.dataset;
		if (!timeStep(step)) return;
		// A step picked over the one a Passage of Time roll chose overrides that roll, so
		// the turn it promised for next session isn't owed any more.
		if (step !== this.#step) this.#promised = null;
		this.#step = step;
		// Once the Referee has chosen, the line saying what was offered has had its say.
		this.#offered = null;
		return this.render();
	}

	/**
	 * Roll Passage of Time (p17) for a group that can't decide, and let the die
	 * choose the step. A 2-3 leaves the turn to the end of the next session, which
	 * the window remembers for next time rather than acting on now.
	 * @this {SessionEnd}
	 */
	static async #onRollPassage() {
		const rolled = await rollRefereeTable("passage");
		if (!rolled) return;
		const { step, promised } = passageStep(rolled.result, calendarTurn(getCalendar().season));
		this.#passage = { d6: rolled.d6, result: rolled.result };
		this.#step = step;
		this.#promised = promised;
		this.#offered = null;
		return this.render();
	}

	/** @this {SessionEnd} */
	static #onAddSituation() {
		this.#situations.push({ id: this.#nextId++, name: "", d6: null, result: null });
		return this.render();
	}

	/** @this {SessionEnd} */
	static async #onRollSituation(_event, target) {
		const situation = this.#row(target);
		if (!situation) return;
		const rolled = await rollRefereeTable("unresolved");
		if (!rolled) return;
		situation.d6 = rolled.d6;
		situation.result = rolled.result;
		return this.render();
	}

	/** @this {SessionEnd} */
	static #onDropSituation(_event, target) {
		const situation = this.#row(target);
		if (!situation) return;
		this.#situations = this.#situations.filter((entry) => entry !== situation);
		return this.render();
	}

	/** @this {SessionEnd} */
	static async #onAward(_event, target) {
		const { award } = target.dataset;
		if (!GLORY_BUTTONS.includes(award)) return;
		const entries = await awardGlory(award);
		if (!entries?.length) return;
		this.#glory.push({ key: award, names: entries.map((entry) => entry.name).join(", ") });
		return this.render();
	}

	/** @this {SessionEnd} */
	static async #onCrisisRoll(_event, target) {
		const domain = game.actors.get(target.closest("[data-actor-id]")?.dataset.actorId);
		if (domain?.type !== "domain") return;
		await crisisRoll(domain);
		return this.render();
	}

	/**
	 * End the session, and close the window once it has: what it gathered is
	 * spent, and a new session ends in a window of its own. A step the Referee
	 * turned away from leaves the window standing, with everything still in it.
	 * @this {SessionEnd}
	 */
	static async #onFinish(_event, target) {
		if (!timeStep(this.#step)) {
			ui.notifications.warn(t("sessionEnd.needStep"));
			return;
		}
		target.disabled = true;
		try {
			const ended = await endTheSession({
				step: this.#step,
				passed: t(`sessionEnd.time.steps.${this.#step}.card`),
				situations: this.#situations.filter((situation) => situation.result),
				glory: this.#glory.map(({ key, names }) => t("sessionEnd.glory.awarded", { award: t(`glory.awards.${key}.label`), names })),
				plans: this.#plans,
				recap: this.#recap,
				promised: this.#promised
			});
			if (ended) return this.close();
		} finally {
			if (this.rendered) target.disabled = false;
		}
	}
}

/**
 * Walk the end of a session. GMs only; one window, brought forward if it's
 * already open, so a session is only ended once.
 * @returns {SessionEnd|null}
 */
export function openSessionEnd() {
	if (!game.user.isGM) return null;
	const app = foundry.applications.instances.get(WINDOW_ID) ?? new SessionEnd();
	app.render({ force: true });
	return app;
}
