import { getCalendar, setCalendar } from "../actions/calendar.js";
import { waitDialog } from "./ui.js";
import { awardGlory } from "../actions/glory.js";
import { clearOffCourse, offCourseNow, rollTravellingBlind } from "../actions/landmarks.js";
import { eventLabel, markSeasonEvent, seasonEventsNow, stageLabel } from "../actions/season-events.js";
import { advancePhase, announcePhase, journeyToDistantRealm, turnAge, turnSeason, weeksPass } from "../actions/time.js";
import { t } from "../chat/cards.js";
import { GLORY_BUTTONS } from "../rules/glory.js";
import { PHASES, SEASONS } from "../rules/time.js";
import { openSessionEnd } from "./SessionEnd.js";

/**
 * The world's calendar and what moves it (Time, p17), as the GM Toolkit shows it: a
 * Phase, a Season or an Age at a time, carrying out what the book says happens between
 * them, or set by hand.
 */

/**
 * What the buttons beside a calendar do, on the GM Toolkit's header and Time
 * page. Each reads only what its own button says, since Foundry also hands a
 * handler the click.
 */
export const TIME_ACTIONS = Object.freeze({
	nextPhase: () => advancePhase(),
	weeksPass: () => weeksPass(),
	markSeasonEvent: (_event, target) => markSeasonEvent(target.dataset.event),
	travellingBlind: () => rollTravellingBlind(),
	holdCourse: () => clearOffCourse(),
	turnSeason: () => turnSeason(),
	turnAge: () => turnAge(),
	journey: () => journeyToDistantRealm(),
	pickAge: () => pickAge(),
	endSession: () => openSessionEnd(),
	awardGlory: (_event, target) => awardGlory(target.dataset.award)
});

/**
 * One of a Season's events as any page draws it (p17): the book's name for it,
 * where in the Season it falls, and whether it has come to pass. Shared by the
 * Season now and the Seasons already logged, so both read the same.
 * @param {object} event From seasonEventsView.
 * @param {string} season One of SEASONS, since a stage is named for its Season.
 * @returns {object}
 */
export function seasonEventLine(event, season) {
	return {
		key: event.key,
		label: eventLabel(event.key),
		text: t(`time.events.kinds.${event.key}.text`),
		stage: stageLabel(event.stage, season),
		icon: event.icon,
		passed: event.passed,
		next: event.next,
		collection: event.collection
	};
}

/**
 * The events that mark the Season the world is in (p17), as a page or panel
 * lists them: in order, each with the book's words, each saying whether it has
 * come to pass, and a line naming where the Weeks step carries the group.
 * @param {import("../rules/time.js").Calendar} calendar
 * @returns {{byname: string, events: object[], nextLine: string}}
 */
function seasonEventsContext(calendar) {
	const { events, next } = seasonEventsNow(calendar);
	const season = t(`time.seasons.${calendar.season}`);
	return {
		byname: t(`time.seasonBynames.${calendar.season}`),
		events: events.map((event) => seasonEventLine(event, calendar.season)),
		nextLine: next
			? t(next.collection ? "time.events.nextIsEnd" : "time.events.nextIs", { event: eventLabel(next.key) })
			: t("time.events.nothingLeft", { season })
	};
}

/**
 * What a page about the calendar shows. The Season's events and a Curse's
 * blight are the Referee's own, and every page that draws them keeps them
 * behind that guard, so they're only worked out for whoever will see them.
 * @param {object} [options]
 * @param {boolean} [options.referee] Whether the Referee's blocks are wanted.
 * @returns {object}
 */
export function timeContext({ referee = game.user?.isGM === true } = {}) {
	const calendar = getCalendar();
	return {
		age: calendar.age,
		seasons: SEASONS.map((key) => ({ key, label: t(`time.seasons.${key}`), active: key === calendar.season })),
		phases: PHASES.map((key) => ({ key, label: t(`time.phases.${key}`), active: key === calendar.phase })),
		seasonEvents: referee ? seasonEventsContext(calendar) : null,
		// A Curse's blight, while the Company still carries it (p14).
		offCourse: referee ? offCourseNow(calendar) : null,
		gloryAwards: GLORY_BUTTONS.map((key) => ({ key, label: t(`glory.awards.${key}.label`), hint: t(`glory.awards.${key}.hint`) }))
	};
}

/**
 * Set the calendar by hand, without anything that comes between Seasons or Ages. A new
 * Phase is still announced to the table, with any Council task now due. The Day tally
 * isn't set by hand, since the book never numbers the Days. GMs only.
 * @param {{season?: string, phase?: string, age?: unknown}} changes
 * @returns {Promise<unknown>|undefined}
 */
export async function setCalendarByHand({ season, phase, age }) {
	if (!game.user.isGM) return undefined;
	const calendar = getCalendar();
	const count = (value, fallback) => (Number.isInteger(Number(value)) && Number(value) >= 1 ? Number(value) : fallback);
	const changed = {
		...calendar,
		season: SEASONS.includes(season) ? season : calendar.season,
		phase: PHASES.includes(phase) ? phase : calendar.phase,
		age: age === undefined ? calendar.age : count(age, calendar.age)
	};
	const result = await setCalendar(changed);
	if (changed.phase !== calendar.phase) await announcePhase(changed);
	return result;
}

/**
 * Ask whether to turn the Age (Between Ages, p17) or only put its number right. Turning it
 * is what the Time page's button does; setting it by hand carries out nothing between Ages.
 * GMs only.
 * @returns {Promise<unknown>}
 */
export async function pickAge() {
	if (!game.user.isGM) return null;
	const { age } = getCalendar();
	const choice = await waitDialog({
		window: { title: t("time.agePick.title"), icon: "fa-solid fa-hourglass-half" },
		content: `<p>${t("time.agePick.turn", { next: age + 1 })}</p>
			<div class="form-group">
				<label for="bastionland-age-pick">${t("time.age")}</label>
				<div class="form-fields"><input id="bastionland-age-pick" class="bastionland-box" type="number" name="age" value="${age}" min="1" step="1"></div>
			</div>
			<p class="hint">${t("time.agePick.setHint")}</p>`,
		buttons: [
			{ action: "turn", label: t("time.turnAge"), icon: "fa-solid fa-hourglass-end" },
			{ action: "set", label: t("time.agePick.set"), icon: "fa-solid fa-pen", default: true, callback: (_event, button) => ({ age: button.form.elements.age.value }) }
		]
	});
	if (choice === "turn") return turnAge();
	if (choice?.age === undefined) return null;
	return setCalendarByHand({ age: choice.age });
}
