import { keyChoices, plural, postCard, t } from "../chat/cards.js";
import {
	DEFAULT_SCOPE,
	PLANNED_SCOPE,
	PLAN_FIELDS,
	SCOPES,
	endedSession,
	normalizeScope,
	plannedTurn,
	sessionsLeft,
	sessionsSpent,
	turnDue
} from "../rules/scope.js";
import { SYSTEM_ID } from "../system-id.js";
import { getCalendar } from "./calendar.js";
import { makeFreshKnight } from "./new-knight.js";

/**
 * The Scope the group settled on before they began (p6), and the plan a
 * Chronicle keeps: how many sessions it runs for, which one is being played,
 * and how often a turn falls at a session's end. The Referee sets it on the GM
 * Toolkit's Time page, since what it plans is the turning of Seasons and Ages.
 */

/** World setting: the Scope and the Chronicle's plan. */
const SCOPE_SETTING = "scope";

/** Called on every client with the new Scope whenever it changes. */
export const SCOPE_HOOK = `${SYSTEM_ID}.scopeChanged`;

/** Each Scope's icon, on the card that tells the table which one the game is. */
const SCOPE_ICONS = Object.freeze({
	adventure: "fa-solid fa-scroll",
	chronicle: "fa-solid fa-book-open",
	saga: "fa-solid fa-infinity"
});

/** Register the Scope. Called during init. */
export function registerScopeSetting() {
	game.settings.register(SYSTEM_ID, SCOPE_SETTING, {
		scope: "world",
		config: false,
		type: Object,
		default: { ...DEFAULT_SCOPE },
		onChange: (value) => Hooks.callAll(SCOPE_HOOK, normalizeScope(value))
	});
}

/** @returns {import("../rules/scope.js").Scope} */
export const getScope = () => normalizeScope(game.settings.get(SYSTEM_ID, SCOPE_SETTING));

/**
 * Save part of the Scope over what is stored. Only GMs can.
 * @param {object} changes
 * @returns {Promise<import("../rules/scope.js").Scope|null>}
 */
async function writeScope(changes) {
	if (!game.user.isGM) return null;
	const plan = normalizeScope({ ...getScope(), ...changes });
	await game.settings.set(SYSTEM_ID, SCOPE_SETTING, plan);
	return plan;
}

/** @returns {string[]} The Chronicle's plan, a sentence for each part of it. */
const planLines = (plan) => [plural("scope.sessionsPlanned", plan.sessions), plural("scope.turnEveryLine", plan.turnEvery)];

/**
 * Settle the game's Scope and tell the table what they're in for. GMs only.
 * @param {string} scope One of SCOPES.
 * @returns {Promise<import("../rules/scope.js").Scope|null>}
 */
export async function setScope(scope) {
	if (!SCOPES.includes(scope) || scope === getScope().scope) return null;
	const plan = await writeScope({ scope });
	if (!plan) return null;
	const lines = [t("scope.chosen", { scope: t(`scope.kinds.${scope}.label`) }), t(`scope.kinds.${scope}.text`)];
	if (scope === PLANNED_SCOPE) lines.push(...planLines(plan));
	await postCard(null, "note", { icon: SCOPE_ICONS[scope], text: lines.join(" ") });
	return plan;
}

/**
 * Change the Chronicle's plan: how many sessions it runs for, which one is
 * being played, or how often a turn falls. GMs only.
 * @param {{sessions?: unknown, session?: unknown, turnEvery?: unknown}} changes
 * @returns {Promise<import("../rules/scope.js").Scope|null>}
 */
export function setScopePlan(changes) {
	const wanted = PLAN_FIELDS.filter((key) => changes[key] !== undefined);
	return wanted.length ? writeScope(Object.fromEntries(wanted.map((key) => [key, changes[key]]))) : Promise.resolve(null);
}

/**
 * Count the session being played as played, so the next one begins. Only a
 * Chronicle counts its sessions; an Adventure is one and a Saga doesn't count
 * them. What falls at a session's end is the Ending a Session window's to carry
 * out (module/apps/SessionEnd.js), so this only keeps the tally. GMs only.
 * @returns {Promise<import("../rules/scope.js").Scope|null>} Null for any other Scope.
 */
export async function countSession() {
	if (!game.user.isGM) return null;
	const plan = getScope();
	if (plan.scope !== PLANNED_SCOPE) return null;
	return writeScope(endedSession(plan));
}

/**
 * An Adventure's advice (p6): "it can save time to generate a few Knights
 * ahead of the game and let the players choose one each". Makes an empty
 * Knight and opens the chooser on them, to be handed to a player later.
 * GMs only.
 * @returns {Promise<Actor|null>}
 */
export async function makeKnightAhead() {
	if (!game.user.isGM) return null;
	return makeFreshKnight({ name: t("scope.knightName") });
}

/**
 * The Scope as the Toolkit's Time page shows it: the three to choose between,
 * what the chosen one means, and for a Chronicle the plan and what falls at
 * the end of the session being played.
 * @returns {object}
 */
export function scopeView() {
	const plan = getScope();
	const chronicle = plan.scope === PLANNED_SCOPE;
	const due = chronicle && turnDue(plan) ? plannedTurn(getCalendar().season) : null;
	const left = sessionsLeft(plan);
	return {
		...plan,
		chronicle,
		adventure: plan.scope === "adventure",
		choices: keyChoices(SCOPES, "scope.kinds", { mark: "active", chosen: plan.scope }),
		text: plan.scope ? t(`scope.kinds.${plan.scope}.text`) : null,
		standing: t("scope.standing", { session: plan.session, sessions: plan.sessions }),
		left: sessionsSpent(plan) ? t("scope.spent") : (left ? plural("scope.sessionsLeft", left) : t("scope.lastSession")),
		due: t(due ? `scope.due.${due}` : "scope.due.none")
	};
}
