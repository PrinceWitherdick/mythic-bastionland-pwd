import { inputDialog } from "../apps/ui.js";
import { keyChoices, postCard, t } from "../chat/cards.js";
import { PHASE_END_MODES, likelyPhaseMode, morningHardships, wildernessDue } from "../rules/phase-end.js";
import { HARDSHIPS, nextPhase } from "../rules/time.js";
import { downBy } from "../rules/virtues.js";
import { phaseEndCalls } from "../rules/wilderness.js";
import { SYSTEM_ID } from "../system-id.js";
import { calendarLabel, getCalendar } from "./calendar.js";
import { announceFallenKnight } from "./fallen.js";
import { causedBy } from "./ledger.js";
import { companyMovedThisNight } from "./night-travel.js";
import { weatherIn } from "./referee-rolls.js";
import { daySkyTables } from "./sky-weather.js";
import { rollVirtueLosses } from "./virtue-loss.js";
import { companySituation } from "./wilderness.js";

/**
 * The end of a Phase of the day (Travel, p18), asked in one window: how the
 * Company spent it, whether the Wilderness Roll follows, and as the Night ends,
 * what the Night cost each of them by Morning.
 */

/** The Knights deprived of essential needs last Morning, by id, so the next asks after them first. */
const DEPRIVED_SETTING = "deprived";

/** Register who went without last Morning. Called during init. */
export function registerPhaseEndSettings() {
	game.settings.register(SYSTEM_ID, DEPRIVED_SETTING, { scope: "world", config: false, type: Array, default: [] });
}

/**
 * @typedef {object} PhaseEnd What the Referee said of the Phase's end.
 * @property {string|null} mode One of PHASE_END_MODES, or null when nothing was asked.
 * @property {Scene|null} scene The Realm the Company stands in.
 * @property {boolean} wilderness Whether the Wilderness Roll follows.
 * @property {boolean} dire Whether the Night's weather was dire.
 * @property {{sky: object, weather: object, page: object}|null} sky The tables the new day's Sky and Weather are rolled on, as the Night ends, or null when they aren't.
 * @property {{actor: Actor, noSleep: boolean, deprived: boolean}[]} members Those Morning comes to, as the Night ends.
 * @property {Actor[]} dying Those left Mortally Wounded and untended, who die of it.
 */

/**
 * Everybody still Mortally Wounded: an hour without care is fatal (p8), and a
 * Phase is longer than that. The world's own, and anybody placed
 * on the Scene in view without an actor of their own.
 * @returns {Actor[]}
 */
function mortallyWounded() {
	const loose = (canvas?.scene?.tokens ?? []).filter((token) => !token.actorLink).map((token) => token.actor);
	// Exhausted at VIG 0 by Virtue Loss, somebody dying is still alive to die of it.
	return [...game.actors, ...loose].filter((actor) => downBy(actor?.system) === "mortalWound" && actor.system.virtues);
}

/**
 * The line saying what ending the Phase in this hex calls for.
 * @param {"none"|"omen"|"roll"} calls
 * @param {boolean} atBarrier
 * @returns {string}
 */
const wildernessLine = (calls, atBarrier) => t(`phaseEnd.wilderness.${atBarrier ? "barrier" : calls}`);

/**
 * The rules the Night's end follows, as the window lists them.
 * @param {object} options
 * @param {boolean} options.winter
 * @param {boolean} options.dire
 * @returns {string[]}
 */
function morningRules({ winter, dire }) {
	return [
		t("phaseEnd.morning.rules.travel"),
		...(winter ? [t("phaseEnd.morning.rules.winter")] : []),
		...(dire ? [t("phaseEnd.morning.rules.dire")] : []),
		t("phaseEnd.morning.rules.each")
	];
}

/**
 * Ask how the Phase ended. Nothing is asked where no Realm shows the Company
 * and no Night is ending, since there is nothing to say.
 * @param {import("../rules/time.js").Calendar} ending The Phase ending.
 * @param {object} [options]
 * @param {Scene|null} [options.scene] The Realm, when it's already known.
 * @param {string|null} [options.mode] How the Company spent it, when that's already known.
 * @param {boolean} [options.atBarrier] The Phase was wasted trying to cross a Barrier.
 * @param {string|null} [options.note] Said first, such as what turned the Company back.
 * @returns {Promise<PhaseEnd|null>} Null when the window was closed.
 */
export async function askPhaseEnd(ending, { scene = null, mode = null, atBarrier = false, note = null } = {}) {
	const standing = companySituation(scene);
	const nightEnds = ending.phase === "night";
	const wounded = mortallyWounded();
	if (!standing && !nightEnds && !note && !wounded.length) return { mode: null, scene: null, wilderness: false, dire: false, sky: null, members: [], dying: [] };

	// A Phase wasted at a Barrier was spent out at it, even setting out from a Holding (p18).
	const holding = Boolean(standing?.situation.holding) && !atBarrier;
	const calls = standing ? (atBarrier ? "roll" : phaseEndCalls(standing.situation)) : null;
	const movedTonight = nightEnds && companyMovedThisNight(ending);
	const likely = PHASE_END_MODES.includes(mode) ? mode : likelyPhaseMode({ phase: ending.phase, holding, atBarrier, movedTonight });
	const dire = nightEnds && weatherIn(ending) === "dire";
	const winter = ending.season === "winter";
	const knights = nightEnds ? game.actors.filter((actor) => actor.type === "knight" && actor.system?.virtues) : [];
	const deprived = new Set(game.settings.get(SYSTEM_ID, DEPRIVED_SETTING) ?? []);
	const phase = t(`time.phases.${ending.phase}`);
	// As the Company breaks camp, the Referee rolls the day's Sky and Weather (p197), where Import PDF has read them.
	const sky = nightEnds ? await daySkyTables() : null;

	const data = await inputDialog({
		title: t("phaseEnd.title", { phase }),
		icon: nightEnds ? "fa-solid fa-moon" : "fa-solid fa-sun",
		template: "phase-end",
		context: {
			note,
			where: standing ? t("phaseEnd.where", { hex: t("realm.hex", standing.situation.hex) }) : t("phaseEnd.nowhere"),
			spent: t("phaseEnd.spent", { phase }),
			modes: keyChoices(PHASE_END_MODES, "phaseEnd.modes", { chosen: likely }),
			wilderness: calls
				? { line: wildernessLine(calls, atBarrier), offered: calls !== "none", checked: wildernessDue({ calls, mode: likely, atBarrier }) }
				: null,
			morning: nightEnds
				? {
					rules: morningRules({ winter, dire }),
					members: knights.map((actor, index) => ({ index, name: actor.name, included: actor.hasPlayerOwner, deprived: deprived.has(actor.id) }))
				}
				: null,
			sky: Boolean(sky),
			// Ticked, since the Phase outlasts the hour; unticked for anybody tended that the sheet doesn't show.
			dying: wounded.map((actor, index) => ({ index, name: actor.name }))
		},
		ok: {
			label: atBarrier ? t("realm.movement.wasted.waste", { phase }) : t("phaseEnd.ok", { next: t(`time.phases.${nextPhase(ending).phase}`) }),
			icon: "fa-solid fa-forward"
		}
	});
	if (!data) return null;

	const chosen = PHASE_END_MODES.includes(data.mode) ? data.mode : likely;
	return {
		mode: chosen,
		scene: standing?.scene ?? null,
		wilderness: Boolean(data.wilderness) && wildernessDue({ calls, mode: chosen, atBarrier }),
		dire,
		sky: data.sky ? sky : null,
		members: knights.flatMap((actor, index) =>
			data[`include-${index}`] ? [{ actor, noSleep: Boolean(data[`nosleep-${index}`]), deprived: Boolean(data[`deprived-${index}`]) }] : []
		),
		dying: wounded.filter((_actor, index) => data[`dying-${index}`])
	};
}

/**
 * Those left Mortally Wounded and untended through the Phase die of it (p8):
 * VIG 0 and Slain, on one card, and a played Knight's fall is announced as any other.
 * GMs only.
 * @param {Actor[]} dying
 * @returns {Promise<string[]>} Their names.
 */
export async function dieUntended(dying) {
	if (!game.user.isGM || !dying.length) return [];
	// World actors and Tokens' own side by side, so each is written for itself.
	await Promise.all(dying.map((actor) => actor.update({ "system.virtues.vig.value": 0, "system.mortalWound": false, "system.slain": true }, causedBy("damage"))));
	const names = dying.map((actor) => actor.name);
	await postCard(null, "report", {
		title: t("phaseEnd.dying.title"),
		tagline: calendarLabel(getCalendar()),
		entries: names.map((name) => ({ name, lines: [t("phaseEnd.dying.line")] })),
		hint: t("phaseEnd.dying.hint")
	});
	for (const actor of dying) await announceFallenKnight(actor, "slain");
	return names;
}

/**
 * What the Night cost the Company by Morning (p18), rolled and taken on one
 * card: d6 SPI for travelling through it, d6 VIG for Winter outdoors, d6 CLA
 * without proper sleep, d6 VIG deprived of essential needs. Who went without
 * is remembered for the next Morning. GMs only.
 * @param {PhaseEnd} answers
 * @param {import("../rules/time.js").Calendar} ending The Night that ended.
 * @returns {Promise<object[]>} The card's entries.
 */
export async function takeMorningLosses({ mode, dire, members }, ending) {
	if (!game.user.isGM) return [];
	await game.settings.set(SYSTEM_ID, DEPRIVED_SETTING, members.filter(({ deprived }) => deprived).map(({ actor }) => actor.id));
	const winter = ending.season === "winter";
	const rolls = [];
	const entries = [];
	const updates = [];
	for (const { actor, noSleep, deprived } of members) {
		const kinds = morningHardships({ mode, winter, dire }, { noSleep, deprived });
		if (!kinds.length) continue;
		const { update, taken } = await rollVirtueLosses(actor, kinds.map((kind) => ({ kind, virtue: HARDSHIPS.find(({ key }) => key === kind).virtue })));
		rolls.push(...taken.map(({ roll }) => roll));
		const lines = taken.map(({ kind, virtue, roll, from, to }) => {
			const lost = t("time.hardship.lost", { amount: roll.total, virtue: t(`virtues.${virtue}.abbr`), from, to });
			return t("phaseEnd.morning.line", { kind: t(`time.hardship.kinds.${kind}.label`), lost });
		});
		updates.push(actor.update(update, causedBy("hardship")));
		entries.push({ name: actor.name, lines });
	}
	if (!entries.length) return entries;
	await Promise.all(updates);
	await postCard(null, "report", {
		title: t("phaseEnd.morning.title"),
		tagline: calendarLabel(getCalendar()),
		entries,
		hint: t("time.hardship.notDamage")
	}, { rolls });
	return entries;
}
