import { postCard, t } from "../chat/cards.js";
import { appendRecap, normalizeSessionEnd, sessionRecap, timeStep, turnsSeasonOrAge } from "../rules/session-end.js";
import { seasonKey } from "../rules/time.js";
import { SYSTEM_ID } from "../system-id.js";
import { calendarLabel, getCalendar } from "./calendar.js";
import { seasonRecord, writeSeasonNotes } from "./season-log.js";
import { timelineSession } from "./timeline-events.js";
import { turnAge, turnSeason, weeksPass } from "./time.js";

/**
 * Carrying out the end of a session (Refereeing p16): the time the group
 * settled on passes, the Season just played keeps the Referee's recap, a turn a
 * roll promised for next time is remembered, and one card tells the table what
 * came of it all. The window that asks the
 * questions is module/apps/SessionEnd.js; the rules behind them are in
 * module/rules/session-end.js.
 */

/** World setting: what the last session's end left for the next one. */
const SESSION_END_SETTING = "sessionEnd";

/** The card's mark: the book a Chronicle is written in. */
const SESSION_ICON = "fa-solid fa-book-open";

/** Register the memory. Called during init. */
export function registerSessionEndSetting() {
	game.settings.register(SYSTEM_ID, SESSION_END_SETTING, {
		scope: "world",
		config: false,
		type: Object,
		default: { promised: null }
	});
}

/** @returns {import("../rules/session-end.js").SessionEndMemory} */
export const getSessionEnd = () => normalizeSessionEnd(game.settings.get(SYSTEM_ID, SESSION_END_SETTING));

/**
 * Remember a turn a Passage of Time roll put at the end of the next session, or
 * forget the one being taken up now. GMs only.
 * @param {"season"|"age"|null} promised
 * @returns {Promise<unknown>}
 */
async function rememberPromise(promised) {
	if (!game.user.isGM || getSessionEnd().promised === (promised ?? null)) return null;
	return game.settings.set(SYSTEM_ID, SESSION_END_SETTING, { promised: promised ?? null });
}

/**
 * Let the time the group settled on pass. Each step is the one the Time page's
 * own button makes, so a session's end turns a Season exactly as turning it by
 * hand does, pursuits and all.
 * @param {string} key One of TIME_STEPS.
 * @returns {Promise<boolean>} Whether it passed. False where the Referee closed
 *   the window it opened, or where the Weeks step had no event left to reach.
 */
async function letTimePass(key) {
	const step = timeStep(key);
	if (!step?.turn) return true;
	if (step.turn === "weeks") return Boolean(await weeksPass());
	return Boolean(await (step.turn === "age" ? turnAge() : turnSeason()));
}

/**
 * Write the Referee's recap, and the players' plans for next session, into the
 * notes of the Season just played, on the Toolkit's Time page, under a heading
 * naming the session. A world with no
 * toolkit yet has nowhere to keep it, and the session still ends.
 * @param {string} key The Season that was played.
 * @param {string} heading
 * @param {string} recap
 */
async function keepRecap(key, heading, recap) {
	if (!recap.trim()) return;
	try {
		await writeSeasonNotes(key, appendRecap(seasonRecord(key).notes, heading, recap));
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't write the session's recap into the Season's notes`, error);
	}
}

/**
 * How the window and the card both name a situation: by its number, since it's named out loud at the table.
 * @param {number} number
 * @returns {string}
 */
export const situationLabel = (number) => t("sessionEnd.situations.numbered", { number });

/**
 * What became of the situations left unresolved, as the card lists them.
 * @param {{number: number, d6: number, result: string}[]} situations
 * @returns {object|null} An entry for a report card, or null where none was rolled for.
 */
function situationsEntry(situations = []) {
	const rolled = situations.filter((situation) => situation.result);
	if (!rolled.length) return null;
	return {
		name: t("sessionEnd.card.unresolved"),
		lines: rolled.map((situation) => t("sessionEnd.card.situation", {
			situation: situationLabel(situation.number),
			d6: situation.d6,
			result: t(`refereeRolls.tables.unresolved.results.${situation.result}`)
		}))
	};
}

/**
 * The lines the card lists under each heading, left out where there's nothing
 * to say. Kept apart from the posting so it can be read on its own.
 * @param {object} session As endTheSession takes it.
 * @param {string} passed What the time that passed reads as.
 * @param {object|null} unresolved The situations' entry, where the table is shown it.
 * @returns {object[]} Entries for a report card.
 */
function sessionEntries({ glory = [], plans = "" }, passed, unresolved) {
	const entries = [{ name: t("sessionEnd.card.time"), lines: [passed] }];
	if (unresolved) entries.push(unresolved);
	if (glory.length) entries.push({ name: t("sessionEnd.card.glory"), lines: glory });
	if (plans.trim()) entries.push({ name: t("sessionEnd.card.plans"), lines: [plans.trim()] });
	return entries;
}

/**
 * End the session: let the time pass, keep the recap, remember what a roll
 * promised, count the session, and tell the table. A step the Referee turned
 * away from leaves the session unended, so it can be ended again once they're
 * ready. GMs only.
 * @param {object} session What the window gathered.
 * @param {string} session.step One of TIME_STEPS.
 * @param {string} [session.passed] How the step reads, for the card.
 * @param {{number: number, d6: number, result: string}[]} [session.situations] Unresolved situations
 *   rolled (p17), each `result` a key of that table.
 * @param {boolean} [session.shareSituations] Whether the table's card shows them; otherwise they're told the Referee alone.
 * @param {string[]} [session.glory] Lines naming the Glory awarded this session.
 * @param {string} [session.plans] What the players plan for next session (p16).
 * @param {string} [session.recap] What the Referee wrote about the session.
 * @param {boolean} [session.shareRecap] Whether it goes on the Timeline, which everyone reads, too.
 * @param {"season"|"age"|null} [session.promised] A turn a roll put at the end of the next session.
 * @returns {Promise<boolean>} Whether the session ended.
 */
export async function endTheSession(session) {
	if (!game.user.isGM) return false;
	const { step, passed = "", recap = "", plans = "", promised = null, shareRecap = false, shareSituations = false } = session;
	if (!timeStep(step)) return false;

	const before = getCalendar();
	const played = seasonKey(before);
	if (!(await letTimePass(step))) return false;

	// The recap and plans belong to the Season that was played, read before the turn moved on. They're
	// kept only once the time has passed, so a turn the Referee closed doesn't keep them twice.
	await keepRecap(played, t("sessionEnd.recapHeading", { when: calendarLabel(before) }), sessionRecap(recap, plans, t("sessionEnd.card.plans")));
	await rememberPromise(promised);
	await timelineSession(played, { recap: shareRecap ? recap : "", plans, passed });
	// The situations are the Referee's own, so the table hears what came of them only when the Referee says so.
	// They change only as a Season or Age turns (p17): rolls left from a step turned away from say nothing.
	const unresolved = turnsSeasonOrAge(step) ? situationsEntry(session.situations) : null;
	const card = { icon: SESSION_ICON, title: t("sessionEnd.title"), tagline: calendarLabel(getCalendar()) };
	await postCard(null, "report", { ...card, entries: sessionEntries(session, passed, shareSituations ? unresolved : null), hint: t("sessionEnd.card.hint") });
	if (unresolved && !shareSituations) await postCard(null, "report", { ...card, entries: [unresolved], hint: t("sessionEnd.card.refereeOnly") }, { mode: "gm" });
	return true;
}
