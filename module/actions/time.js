import { chooseDialog, inputDialog } from "../apps/ui.js";
import { chooseActor } from "../apps/actor-pick.js";
import { postCard, t } from "../chat/cards.js";
import { AGES } from "../config.js";
import { changeGlory } from "../rules/glory.js";
import { isDoomed, isScarPending, scarForRoll } from "../rules/scars.js";
import { loadArtIndex, mythEntry } from "../book-art/art-index.js";
import { resolvedMyths } from "../rules/gm-toolkit.js";
import { crisisRollsDue, dramaRollsDue } from "../rules/season-log.js";
import { emptySeats } from "../rules/dominion.js";
import { designDone, grandDesigns } from "../rules/grand-designs.js";
import {
	AGE_PURSUITS,
	AGING_VIRTUE_ROLL,
	HARDSHIPS,
	OLD_AGE_LOSS,
	PHASE_ICONS,
	SEASON_ICONS,
	SEASON_PURSUITS,
	afterOldAge,
	agedScore,
	agingSteps,
	olderAge,
	legacyGlory,
	pursuitMakings,
	pursuitsFor,
	nextAge,
	nextDay,
	nextPhase,
	nextSeason,
	seasonKey
} from "../rules/time.js";
import { updateActors } from "./actor-updates.js";
import { causedBy } from "./ledger.js";
import { getMythNotes } from "./myth-notes.js";
import { getRealm, isRealmScene } from "./realm.js";
import { VIRTUES, downBy, fullVirtues, slainUpdate } from "../rules/virtues.js";
import { calendarLabel, getCalendar, setCalendar } from "./calendar.js";
import { tasksDueNotices } from "./council-tasks.js";
import { tableRenewalNotices } from "./knight-tables.js";
import { settleDomains, worldDomains } from "./dominion.js";
import { seatCircle } from "./court.js";
import { collectionEntry, markCollection, markSeasonEvent, seasonEventsNow } from "./season-events.js";
import { recordSeasonTurn } from "./season-log.js";
import { timelineAged, timelineSeasonTurn } from "./timeline-events.js";
import { adjustGlory, gloryLines, recordRankReached } from "./glory.js";
import { settleScars } from "./scars.js";
import { knightSquire } from "./squires.js";
import { chooseSuccessor, heirOf } from "./succession.js";
import { burnMorningAfflictions, sufferMorningAfflictions } from "./afflictions.js";
import { companySituation, wildernessRoll } from "./wilderness.js";
import { askPhaseEnd, dieUntended, takeMorningLosses } from "./phase-end.js";
import { followPursuits } from "./pursuits.js";
import { markLongAbsences } from "./homecoming.js";
import { rollVirtueLosses } from "./virtue-loss.js";
import { direWeatherRisk, rollRefereeTable } from "./referee-rolls.js";
import { rollSkyAndWeather } from "./sky-weather.js";
import { atMercyOfWeather } from "../rules/referee-rolls.js";
import { showedOmen } from "../rules/wilderness.js";
import { isCompanyKnight, isKnight } from "../rules/knight-types.js";
import { escapeHTML } from "../rules/text.js";
import { companyKnights, inCompany, playerCharacter } from "./knights.js";
import { announceFallenKnight, companionsOf } from "./fallen.js";

/**
 * Ask who takes part in something the Company does together. Those given as
 * present and every Knight or Squire whose Token is selected are listed ticked,
 * then every other, ticked when they ride with the Company. NPCs and NPC
 * Knights are listed only when given. Players see only the characters they
 * own, since those are all they can change. The Slain take no part, so a Season
 * that restores Virtues doesn't raise them. With pursuits, each picks one too,
 * and says beside it what a pursuit that makes something made (p17); a Squire
 * isn't offered those only a Knight can follow. As an Age turns, each who has a
 * stage of life to grow into is ticked to grow older. With companions, each
 * Knight's steed and followers are listed after them, ticked as they are.
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.icon
 * @param {string} options.intro
 * @param {string} options.ok
 * @param {Actor[]} [options.present]
 * @param {Actor[]} [options.others] Listed unticked, for the Referee to tick any that take part.
 * @param {string[]} [options.pursuits]
 * @param {boolean} [options.knightsOnly] Leave out those given who aren't Knights.
 * @param {boolean} [options.aging] Ask who grows a stage older, as an Age turns.
 * @param {boolean} [options.onlyGiven] List only those given, not the selected Tokens or the world's Knights.
 * @param {boolean} [options.companions] List each Knight's steed and followers too, from companionsOf.
 * @returns {Promise<{actor: Actor, pursuit: string|null, making: string|null, older: boolean}[]|null>}
 *   Those ticked, or null if closed. `making` is one of the pursuit's PURSUIT_MAKINGS, or null where not said yet.
 */
export async function chooseCompany({ title, icon, intro, ok, present = [], others = [], pursuits = [], knightsOnly = false, aging = false, onlyGiven = false, companions = false }) {
	const candidates = [];
	const seen = new Set();
	const add = (actor, included, given = false) => {
		if (!actor?.system?.virtues || actor.system.slain || seen.has(actor.uuid)) return;
		if (given ? knightsOnly && !isKnight(actor) : !isCompanyKnight(actor)) return;
		if (!game.user.isGM && !actor.isOwner) return;
		seen.add(actor.uuid);
		candidates.push({ actor, included });
	};
	const selected = onlyGiven ? [] : (canvas?.tokens?.controlled ?? []).map((token) => token.actor);
	for (const actor of present) add(actor, true, true);
	for (const actor of selected) add(actor, true);
	for (const actor of others) add(actor, false, true);
	if (!onlyGiven) for (const actor of companyKnights()) add(actor, inCompany(actor));
	if (companions) {
		for (const { actor, included } of candidates.filter(({ actor }) => isKnight(actor))) {
			for (const companion of companionsOf(actor)) add(companion, included, true);
		}
	}

	// What each pursuit offered could make, one list for every row, shown under the pursuit picked.
	const makings = pursuits.flatMap((pursuit) => pursuitMakings(pursuit).map((making) => ({
		value: making,
		pursuit,
		label: t(`time.pursuitMakes.${pursuit}.${making}`)
	})));
	const data = await inputDialog({
		title,
		icon,
		template: "company",
		context: {
			intro,
			members: candidates.map(({ actor, included }, index) => {
				const older = aging ? olderAge(actor.system.age) : null;
				return {
					index,
					name: actor.name,
					included,
					pursuits: pursuitsFor(pursuits, actor.system).map((key) => ({ key, label: t(`time.pursuits.${key}.label`) })),
					older: older ? t("time.aging.grows", { age: t(`age.${older}`) }) : null
				};
			}),
			pursuits: pursuits.map((key) => ({ key, label: t(`time.pursuits.${key}.label`), hint: t(`time.pursuits.${key}.hint`) })),
			makings
		},
		ok: { label: ok },
		render: makings.length ? (_event, dialog) => watchMakings(dialog) : undefined
	});
	if (!data) return null;

	return candidates
		.map(({ actor }, index) => ({ actor, included: data[`include-${index}`], pursuit: data[`pursuit-${index}`], making: data[`making-${index}`], older: data[`older-${index}`] }))
		.filter(({ included }) => included)
		.map(({ actor, pursuit, making, older }) => {
			const picked = pursuitsFor(pursuits, actor.system).includes(pursuit) ? pursuit : null;
			return { actor, pursuit: picked, making: pursuitMakings(picked).includes(making) ? making : null, older: Boolean(aging && older) };
		});
}

/**
 * Show what a row's pursuit could make only once one that makes something is
 * picked, offering only its own outcomes.
 * @param {foundry.applications.api.DialogV2} dialog
 */
function watchMakings(dialog) {
	const form = dialog.element.querySelector("form");
	if (!form) return;
	const update = (row) => {
		const pursuit = row.querySelector("[name^='pursuit-']")?.value ?? "";
		const select = row.querySelector("[data-making]");
		if (!select) return;
		let any = false;
		for (const option of select.querySelectorAll("option[data-pursuit]")) {
			option.hidden = option.disabled = option.dataset.pursuit !== pursuit;
			any ||= !option.hidden;
		}
		if (select.selectedOptions[0]?.disabled) select.value = "";
		select.hidden = !any;
	};
	const rows = form.querySelectorAll(".bastionland-company__member");
	for (const row of rows) update(row);
	form.addEventListener("change", (event) => {
		const row = event.target.closest?.(".bastionland-company__member");
		if (row && event.target.name?.startsWith("pursuit-")) update(row);
	});
}

/**
 * Settle every Scar whose GD increase comes with the next Season.
 * @param {Actor} actor
 * @param {string} ended The Season that ended, from seasonKey: the Timeline has them settled as it turned.
 * @returns {Promise<{rolls: Roll[], lines: string[], guardMax: number}>}
 */
function settleSeasonScars(actor, ended) {
	const due = actor.items.filter((item) => item.type === "scar" && isScarPending(item.system) && scarForRoll(item.system.roll)?.bySeason);
	return settleScars(actor, due, actor.system.guard.max, { when: ended });
}

/**
 * Succession (Between Ages, p17): a Knight names their successor, and a
 * successor who is still a Squire may be Knighted.
 * @param {Actor} knight
 * @returns {Promise<string[]>} Lines for the Age's card.
 */
async function establishSuccessor(knight) {
	// The Age's row on their thread says who they named.
	const heir = await chooseSuccessor(knight, { record: false });
	if (!heir) return [t("successor.unnamed")];
	const lines = [t("successor.named", { name: heir.name })];
	if (heir.system.isSquire && heir.isOwner && (await knightSquire(heir))) lines.push(t("successor.knighted", { name: heir.name }));
	return lines;
}

/**
 * Legacy (Between Ages, p17): a Knight's successor gains half of their current
 * Glory. A Knight who hasn't named one, or whose successor is Slain, is asked
 * to name one. A Squire gains no Glory (p7), so a successor still a Squire is
 * offered Knighting first, and without it the Legacy is lost.
 * @param {Actor} knight
 * @param {number} glory Theirs, with the new Age's Glory counted.
 * @returns {Promise<string[]>} Lines for the Age's card.
 */
async function bequeathGlory(knight, glory) {
	// heirOf passes over a Slain successor, who is asked about again.
	const heir = heirOf(knight) ?? await chooseSuccessor(knight, { record: false });
	if (!heir) return [t("successor.noLegacy")];
	const amount = legacyGlory(glory);
	const lines = [];
	if (amount && heir.system.isSquire) {
		const note = t("successor.legacySquire", { name: escapeHTML(heir.name), amount });
		if (!(heir.isOwner && (await knightSquire(heir, { note })))) return [t("successor.legacyLost", { name: heir.name, amount })];
		lines.push(t("successor.knighted", { name: heir.name }));
	}
	lines.push(t("successor.legacy", { name: heir.name, amount }));
	if (amount) lines.push(...(await adjustGlory(heir, amount)).map((line) => t("successor.heirLine", { name: heir.name, line })));
	return lines;
}

/**
 * What passes for each member of the Company as the Season or Age turns:
 * Virtues restored and Scars due by the next Season settled, and for a new Age
 * 1 Glory, d12 VIG lost by the Old, and a successor named or given a Legacy.
 * @param {{actor: Actor, pursuit: string|null}[]} company
 * @param {object} options
 * @param {boolean} options.newAge
 * @param {import("../rules/time.js").Calendar} options.before The Season that ended, whose Doom lifts.
 * @returns {Promise<{rolls: Roll[], entries: {name: string, actorId: string, pursuit: string|null, lines: string[]}[]}>}
 *   An entry for each of the Company, in its order. Its lines are what befell them beyond the Virtues
 *   every turn restores, which closeSeason says on the report.
 */
export async function passTime(company, { newAge, before }) {
	// The calendar has already moved on: what the turn brings goes on the Timeline beside the turn's own row.
	const ended = seasonKey(before);
	const rolls = [];
	const entries = [];
	const updates = [];
	const successions = [];
	const legacies = [];
	const ranks = [];
	// Those the Age's turn takes to VIG 0, who die peacefully (p17).
	const peaceful = [];
	for (const { actor, pursuit } of company) {
		const { system } = actor;
		const update = fullVirtues(system);
		const lines = [];
		// Doom lasts the Season it was taken in.
		if (isDoomed(actor.items.filter((item) => item.type === "scar").map((item) => item.system), before)) lines.push(t("time.doomLifts"));

		if (newAge && Number.isInteger(system.glory) && system.gainsGlory) {
			const change = changeGlory(system.glory, 1);
			update["system.glory"] = change.to;
			lines.push(...gloryLines(change));
			ranks.push([actor, change]);
		}
		if (newAge && system.age === "old") {
			const roll = await new Roll(OLD_AGE_LOSS).evaluate();
			rolls.push(roll);
			const { max, diesPeacefully } = afterOldAge(system.virtues.vig.max, roll.total);
			update["system.virtues.vig.max"] = max;
			update["system.virtues.vig.value"] = max;
			lines.push(t("time.oldAge", { amount: roll.total, from: system.virtues.vig.max, to: max }));
			if (diesPeacefully) {
				lines.push(t("time.diesPeacefully"));
				Object.assign(update, diedOfAge(actor));
				peaceful.push(actor);
			}
		}

		const scars = await settleSeasonScars(actor, ended);
		rolls.push(...scars.rolls);
		lines.push(...scars.lines);
		if (scars.guardMax !== system.guard.max) update["system.guard.max"] = scars.guardMax;

		if (newAge && pursuit === "succession") successions.push({ actor, lines });
		if (newAge && pursuit === "legacy") legacies.push({ actor, glory: update["system.glory"] ?? system.glory, lines });

		updates.push([actor, update]);
		entries.push({ name: actor.name, actorId: actor.id, pursuit: pursuit ? t(`time.pursuits.${pursuit}.label`) : null, lines });
	}
	await updateActors(updates, causedBy("season"));
	// Written once the Glory is, as adjustGlory does, which the Age's turn doesn't go through.
	await Promise.all(ranks.map(([actor, change]) => recordRankReached(actor, change, { when: ended })));
	// After the Company's own updates, so a successor who is also in the Company
	// keeps both what the Season restored and what Knighting or a Legacy gave them.
	for (const { actor, lines } of successions) lines.push(...(await establishSuccessor(actor)));
	for (const { actor, glory, lines } of legacies) lines.push(...(await bequeathGlory(actor, glory)));
	// A played Knight's player carries on some other way, as from any death (p8).
	for (const actor of peaceful) await announceFallenKnight(actor, "slain");
	return { rolls, entries };
}

/**
 * What dying peacefully of old age writes on somebody (p17): Slain at VIG 0,
 * and for a Knight with no Ultimate fate yet, that one.
 * @param {Actor} actor
 * @returns {object}
 */
const diedOfAge = (actor) => slainUpdate(actor, t("time.fateOldAge"));

/**
 * Whether skipping to a new Season restores somebody's Virtues (p9): anybody
 * outside the Company, the world's NPCs and every Knight left unticked, a
 * player's among them, short of their max. Only aging (othersOfAge) is kept to
 * those the Referee plays. The dead and the dying are left as they are.
 * @param {Actor} actor
 * @param {Set<Actor>} company Those passTime has restored already.
 * @returns {boolean}
 */
function restoredBySeason(actor, company) {
	const virtues = actor.system?.virtues;
	if (!virtues || company.has(actor) || !actor.isOwner || downBy(actor.system)) return false;
	return virtues.vig.value > 0 && VIRTUES.some((key) => virtues[key].value < virtues[key].max);
}

/**
 * Restore the Virtues of everybody the Season restores (p9) besides the
 * Company. As an Age turns, the Old among them are restored with their old
 * age's toll instead, in the one write (npcsOldAge).
 * @param {Set<Actor>} company Those passTime has restored already.
 * @param {boolean} newAge
 * @returns {Promise<void>}
 */
async function restoreOthers(company, newAge) {
	const aging = new Set(newAge ? oldOthers(company) : []);
	const others = game.actors.filter((actor) => restoredBySeason(actor, company) && !aging.has(actor));
	if (!others.length) return;
	await updateActors(others.map((actor) => [actor, fullVirtues(actor.system)]), causedBy("season"));
}

/**
 * Move on to the next Phase and post it (p18). The Referee first says how the
 * Phase that ends was spent, in one window: the Wilderness Roll follows from
 * it, and as the Night ends, what the Night cost each of the Company. Then the
 * new Phase begins, with its weather where the lands are at its mercy. GMs only.
 * @param {object} [known] What's already known of the Phase's end, for askPhaseEnd.
 * @returns {Promise<import("../rules/time.js").Calendar|null>} Null when the window was closed.
 */
export async function advancePhase(known = {}) {
	if (!game.user.isGM) return null;
	// One Phase ends at a time: a Barrier's window and Next Phase open together would both move the calendar on.
	if (endingPhase) {
		ui.notifications.info(t("phaseEnd.alreadyOpen"));
		return null;
	}
	endingPhase = true;
	try {
		return await endPhase(known);
	} finally {
		endingPhase = false;
	}
}

/** Whether a Phase's end window is open or its Phase is still being moved on. */
let endingPhase = false;

/**
 * The work of advancePhase, once it's sure no other Phase is ending.
 * @param {object} known
 * @returns {Promise<import("../rules/time.js").Calendar|null>}
 */
async function endPhase(known) {
	const ending = getCalendar();
	const answers = await askPhaseEnd(ending, known);
	if (!answers) return null;
	// Rolled while the Phase it ends is still the Phase, so a Curse it finds blinds the one after.
	const met = answers.wilderness
		? await wildernessRoll({ scene: answers.scene, phase: ending.phase, mode: answers.mode === "camp" ? "camp" : "travel", atBarrier: Boolean(known.atBarrier) })
		: null;
	// A hostile Omen in the night keeps those camping from proper sleep (p18).
	if (await omenBrokeSleep(ending, answers, met)) answers.members = answers.members.map((member) => ({ ...member, noSleep: true }));
	const calendar = nextPhase(getCalendar());
	await setCalendar(calendar);
	// Nobody lies untended through a Phase and lives (p8). They die as it ends, so the new Phase takes nothing more from them.
	if (answers.dying?.length) await dieUntended(answers.dying);
	// Each morning, a daily affliction takes its toll.
	const afflicted = calendar.phase === "morning" ? await sufferMorningAfflictions() : null;
	// What the Night cost and the Morning's afflictions go on the new Phase's own card, not cards of their own.
	const befell = [answers.members.length ? await takeMorningLosses(answers, ending) : null, afflicted?.section ? afflicted : null].filter(Boolean);
	await announcePhase(calendar, { sections: befell.map(({ section }) => section), rolls: befell.flatMap(({ rolls }) => rolls) });
	// What a daily affliction burns as Damage comes after, on Damage cards of its own.
	if (afflicted) await burnMorningAfflictions(afflicted.sufferers);
	// The new day's Sky and Weather, rolled as the Company breaks camp (p197).
	if (answers.sky) await rollSkyAndWeather(answers.sky);
	await phaseWeather(calendar);
	return calendar;
}

/**
 * Whether the Omen a night's camping met kept the Company from sleeping (p18):
 * a hostile Omen does, and only the Referee can say whether this one was.
 * @param {import("../rules/time.js").Calendar} ending
 * @param {{mode: string|null, members: {noSleep: boolean}[]}} answers From askPhaseEnd.
 * @param {object|null} met What the Wilderness Roll turned up.
 * @returns {Promise<boolean>}
 */
async function omenBrokeSleep(ending, answers, met) {
	if (ending.phase !== "night" || answers.mode !== "camp" || !showedOmen(met)) return false;
	if (answers.members.every((member) => member.noSleep)) return false;
	const choice = await chooseDialog({
		title: t("phaseEnd.hostileOmen.title"),
		icon: "fa-solid fa-campground",
		message: t("phaseEnd.hostileOmen.text"),
		buttons: [
			{ action: "hostile", label: t("phaseEnd.hostileOmen.hostile"), icon: "fa-solid fa-bed-pulse" },
			{ action: "calm", label: t("phaseEnd.hostileOmen.calm"), icon: "fa-solid fa-bed", default: true }
		]
	});
	return choice === "hostile";
}

/**
 * Where dire weather rules the land, it's rolled for as each Phase begins
 * (p18). The Company in a Holding is indoors, and one on no Realm is on no
 * land the world's setting speaks for, so neither rolls.
 * @param {import("../rules/time.js").Calendar} calendar The Phase beginning.
 * @returns {Promise<object|null>} What the weather table gave, or null when it wasn't rolled.
 */
async function phaseWeather(calendar) {
	if (!atMercyOfWeather(direWeatherRisk(), calendar.season)) return null;
	const standing = companySituation();
	if (!standing || standing.situation.holding) return null;
	return rollRefereeTable("weather");
}

/**
 * Tell the table the Day has moved into a Phase, on a card painted in that
 * Phase's light, with any Council task whose time has come (p20) and any
 * Knight's table that comes round with it, and what befell the Company as the
 * Phase began.
 * @param {import("../rules/time.js").Calendar} calendar
 * @param {object} [befell]
 * @param {{title: string, entries: object[], hint?: string}[]} [befell.sections]
 * @param {Roll[]} [befell.rolls]
 */
export function announcePhase(calendar, { sections = [], rolls = [] } = {}) {
	return postCard(null, "report", {
		sections,
		tone: calendar.phase,
		icon: PHASE_ICONS[calendar.phase],
		title: t(`time.phases.${calendar.phase}`),
		tagline: calendarLabel(calendar),
		// Night brings round a table rolled each night, and Morning a new Day's.
		due: [...tasksDueNotices(calendar), ...tableRenewalNotices(calendar.phase === "night" ? ["night"] : calendar.phase === "morning" ? ["day"] : [])],
		hint: t(`time.phaseHints.${calendar.phase}`)
	}, { rolls });
}

/**
 * Turn the Season or the Age: the Company takes part, then every Domain due
 * for misrule falls into it. GMs only.
 * @param {object} options
 * @param {boolean} options.newAge
 * @param {(calendar: object) => object} options.next  Moves the calendar on.
 * @param {string} options.label  Path below `bastionland.` naming the turn.
 * @param {string} options.icon
 * @param {string[]} options.pursuits
 * @param {(before: object, after: object) => string} options.intro
 * @param {(after: object) => string} options.turned The report's title.
 * @param {string} options.kind  How the Season ends, one of SEASON_TURNS in rules/season-log.js.
 * @param {string} [options.note] Said on the report before anything else.
 * @returns {Promise<import("../rules/time.js").Calendar|null>}
 */
async function turnTime({ newAge, next, label, icon, pursuits, intro, turned, kind, note = null }) {
	if (!game.user.isGM) return null;
	const before = getCalendar();
	const after = next(before);
	const company = await chooseCompany({ title: t(label), icon, intro: intro(before, after), ok: t(label), pursuits, knightsOnly: true, aging: newAge });
	if (!company) return null;

	await setCalendar(after);
	// A ruler away from their Holding as the Season turns returns from a long absence (p20).
	await markLongAbsences();
	const { rolls, entries } = await passTime(company, { newAge, before });
	const ticked = new Set(company.map(({ actor }) => actor));
	await restoreOthers(ticked, newAge);
	// What a Service or Courtesy made goes on the report with the rest (p17, p192).
	await followPursuits(company, entries, t(`time.seasons.${after.season}`));
	const ended = seasonKey(before);
	// Every Season ends with the Realm's collection (p17), whether the Age turns with it or not.
	const collection = await markCollection(ended, before.season);
	const { entries: domains, fell } = await settleDomains(ended);
	await closeSeason(after, ended, { kind, title: turned(after), note, rolls, collection: collection ? collectionEntry(collection) : null, knights: entries, domains });
	// In misrule Knights leave (p20): the Referee unticks those of its Circle who ride away.
	for (const domain of fell) {
		if (domain.system.council.circle.length) await seatCircle(domain, { intro: t("domain.misruleLeave", { name: domain.name }) });
	}
	if (newAge) await growOlder(company.filter(({ older }) => older).map(({ actor }) => actor), ticked);
	return after;
}

/**
 * The Season, or the Age, has turned: post its report, keep it in the Season
 * log, and write it on the Timeline. The report and the log say each Knight's
 * Virtues were restored; the Timeline keeps only what else befell them.
 * @param {import("../rules/time.js").Calendar} after The Season begun.
 * @param {string} ended The Season that ended, from seasonKey.
 * @param {object} turn
 * @param {string} turn.kind One of SEASON_TURNS in rules/season-log.js.
 * @param {string} turn.title
 * @param {string|null} [turn.note] Said on the report before anything else.
 * @param {Roll[]} [turn.rolls]
 * @param {{name: string, lines: string[]}|null} [turn.collection] The Realm's collection, from collectionEntry.
 * @param {object[]} turn.knights The Company's entries, from passTime.
 * @param {{domainId: string, lines: string[]}[]} turn.domains From settleDomains.
 */
export async function closeSeason(after, ended, { kind, title, note = null, rolls = [], collection = null, knights, domains }) {
	const restored = t("time.restored");
	const entries = [...(collection ? [collection] : []), ...knights.map((entry) => ({ ...entry, lines: [restored, ...entry.lines] })), ...domains];
	await Promise.all([
		announceSeason(after, { title, entries, note }, { rolls }),
		recordSeasonTurn(ended, { kind, title, entries, note }),
		timelineSeasonTurn(ended, { kind, title, note, collection, knights, domains })
	]);
}

/**
 * Everybody in the world who isn't one of the players' own or in the Company
 * as time turns: the NPCs, and the Knights the Referee plays. Not the dead.
 * @param {Set<Actor>} company
 * @returns {Actor[]}
 */
const othersOfAge = (company) => game.actors.filter((actor) => actor.system?.virtues && actor.isOwner && !actor.system.slain
	&& !company.has(actor) && !playerCharacter(actor));

/**
 * @param {Set<Actor>} company
 * @returns {Actor[]} Those of othersOfAge given an Age of Old.
 */
const oldOthers = (company) => othersOfAge(company).filter((actor) => actor.system.age === "old");

/**
 * The Old lose d12 VIG as each Age ends, and a quiet death comes to any it
 * takes to VIG 0 (p17): every NPC in the world given an Age of Old, and every
 * Old Knight the Referee plays, on one card. The Company's own Old are taken
 * care of as the Age turns for them. The Season's restoring (restoreOthers) is
 * written with the toll, so each is written once.
 * @param {Set<Actor>} company
 * @returns {Promise<object[]>} The card's entries.
 */
async function npcsOldAge(company) {
	const old = oldOthers(company);
	if (!old.length) return [];
	const rolls = [];
	const entries = [];
	const updates = [];
	for (const actor of old) {
		const roll = await new Roll(OLD_AGE_LOSS).evaluate();
		rolls.push(roll);
		const from = actor.system.virtues.vig.max;
		const { max, diesPeacefully } = afterOldAge(from, roll.total);
		const restored = restoredBySeason(actor, company) ? fullVirtues(actor.system) : {};
		const vig = restored["system.virtues.vig.value"] ?? actor.system.virtues.vig.value;
		updates.push({ _id: actor.id, ...restored, "system.virtues.vig.max": max, "system.virtues.vig.value": Math.min(vig, max), ...(diesPeacefully ? diedOfAge(actor) : {}) });
		entries.push({ name: actor.name, lines: [t("time.oldAge", { amount: roll.total, from, to: max }), ...(diesPeacefully ? [t("time.diesPeacefully")] : [])] });
	}
	// Every one a world actor, so one write takes them all.
	await Actor.updateDocuments(updates, causedBy("season"));
	await postCard(null, "report", { title: t("time.aging.oldNpcs"), tagline: calendarLabel(getCalendar()), entries }, { rolls });
	return entries;
}

/**
 * A new Age of the world (p17): the Company ticked to grow a stage older, Young
 * to Mature or Mature to Old, reroll their Virtues for it. Anybody else in the
 * world given an Age is asked about afterwards, only where there is somebody.
 * @param {Actor[]} actors Those of the Company who grow older, as ticked when the Age turned.
 * @param {Set<Actor>} company Everybody in the Company, whom the Age's turn has seen to already.
 */
async function growOlder(actors, company) {
	await npcsOldAge(company);
	const npcs = othersOfAge(company).filter((actor) => olderAge(actor.system.age));
	// Offered, not ticked, so a new Age doesn't reroll the whole world by default.
	const others = npcs.length
		? await chooseCompany({
			title: t("time.aging.title"),
			icon: "fa-solid fa-hourglass-half",
			intro: t("time.aging.newAgeOthers"),
			ok: t("time.aging.roll"),
			others: npcs,
			onlyGiven: true
		})
		: [];
	for (const actor of [...actors, ...(others ?? []).map(({ actor }) => actor)]) {
		const age = olderAge(actor.system.age);
		if (age) await rollAging(actor, age);
	}
}

/**
 * Every Realm's resolved Myths, each owed a new Myth in its place now the
 * Season has turned (p27).
 * @returns {Promise<{scene: string, number: number, name: string}[]>}
 */
async function mythsToReplace() {
	const waiting = game.scenes.filter((scene) => isRealmScene(scene))
		.flatMap((scene) => resolvedMyths(getRealm(scene).realm, getMythNotes(scene)).map((myth) => ({ scene: scene.id, myth })));
	if (!waiting.length) return [];
	const index = await loadArtIndex();
	return waiting.map(({ scene, myth }) => ({ scene, number: myth.number, name: mythEntry(index, myth).name }));
}

/**
 * @param {Actor[]} domains
 * @param {import("../rules/time.js").Calendar} calendar Now.
 * @returns {string[]} One line naming every Domain's Grand Designs that are done, or none.
 */
function designsDoneNotices(domains, calendar) {
	const works = domains.flatMap((domain) => grandDesigns(domain.system.designs)
		.filter((design) => designDone(design, calendar))
		.map((design) => `${design.what || t(`domain.designs.scales.${design.scale}.label`)} (${domain.name})`));
	return works.length ? [t("time.due.designs", { works: works.join(", ") })] : [];
}

/**
 * @param {Actor[]} domains
 * @returns {string[]} A line for each Domain with a seat on its Council that must be filled standing empty.
 */
function emptySeatNotices(domains) {
	return domains.flatMap((domain) => {
		const seats = emptySeats(domain.system.council).map((seat) => t(`domain.council.${seat}.label`));
		return seats.length ? [t("time.due.emptySeats", { domain: domain.name, seats: seats.join(", ") })] : [];
	});
}

/**
 * Tell the table a new Season has begun, on a card painted in the Season's
 * colours, with what passed as it turned and what's due now it has: the
 * Crisis Roll and Drama in Court for every Domain (p20–21), any Council task
 * the Season has finished (p20), each resolved Myth's replacement (p27), and
 * every Knight's table that comes round with it.
 * @param {import("../rules/time.js").Calendar} calendar The new Season.
 * @param {object} report
 * @param {string} report.title
 * @param {object[]} report.entries
 * @param {string|null} [report.note]
 * @param {object} [options] For postCard.
 */
export async function announceSeason(calendar, { title, entries, note = null }, options) {
	const domains = worldDomains();
	const due = crisisRollsDue(domains, calendar);
	const drama = dramaRollsDue(domains, calendar);
	// Council tasks whose Phase, Week or Season is up wait to be settled (p20).
	const tasks = tasksDueNotices(calendar);
	const myths = await mythsToReplace();
	return postCard(null, "report", {
		tone: calendar.season,
		icon: SEASON_ICONS[calendar.season],
		title,
		tagline: calendarLabel(calendar),
		entries,
		due: [
			...(due.length ? [t("time.due.crisis", { domains: due.map((domain) => domain.name).join(", ") })] : []),
			...(drama.length ? [t("time.due.drama", { domains: drama.map((domain) => domain.name).join(", ") })] : []),
			...(myths.length ? [t("time.due.myths", { myths: myths.map((myth) => myth.name).join(", ") })] : []),
			// Seats left empty, which invite trouble (p204).
			...emptySeatNotices(domains),
			// Works whose time has come (p21), until they're struck off.
			...designsDoneNotices(domains, calendar),
			...tasks,
			// Tables a Knight rolls on again each Season, and each Day, since a Season begins on a new one.
			...tableRenewalNotices(["season", "day"])
		],
		replaceMyths: myths.map((myth) => ({ ...myth, label: t("time.due.replaceMyth", { myth: myth.name }) })),
		hint: [note, t("time.unresolvedHint")].filter(Boolean).join(" ")
	}, options);
}

/**
 * Turn the Season (Between Seasons, p17): each Knight taking part has their
 * Virtues restored and chooses a pursuit. GMs only.
 * @returns {Promise<import("../rules/time.js").Calendar|null>}
 */
export function turnSeason() {
	const season = (calendar) => t(`time.seasons.${calendar.season}`);
	return turnTime({
		newAge: false,
		next: nextSeason,
		kind: "season",
		label: "time.banner.months",
		icon: "fa-solid fa-leaf",
		pursuits: SEASON_PURSUITS,
		intro: (before, after) => t("time.seasonIntro", { season: season(before), next: season(after) }),
		turned: (after) => t("time.seasonTurned", { season: season(after) })
	});
}

/**
 * Turn the Age (Between Ages, p17): each Knight taking part has their Virtues
 * restored, gains 1 Glory and chooses a pursuit, and the Old lose d12 VIG.
 * The new Age begins in Spring. GMs only.
 * @returns {Promise<import("../rules/time.js").Calendar|null>}
 */
export function turnAge() {
	return turnTime({
		newAge: true,
		next: nextAge,
		kind: "age",
		label: "time.banner.year",
		icon: "fa-solid fa-hourglass-end",
		pursuits: AGE_PURSUITS,
		intro: (_before, after) => t("time.ageIntro", { age: after.age }),
		turned: (after) => t("time.ageTurned", { age: after.age })
	});
}

/**
 * Advancing Time's Weeks step (p17): on to the Season's next event that
 * matters. The next of the Season's events comes to pass and a new
 * Morning dawns on it. The Realm's collection ends the Season, so reaching that
 * turns the Season instead. No Phase card is posted, since the event's own card
 * tells the table where the Company now stands. GMs only.
 * @returns {Promise<import("../rules/time.js").Calendar|null>}
 */
export async function weeksPass() {
	if (!game.user.isGM) return null;
	const calendar = getCalendar();
	const { next } = seasonEventsNow(calendar);
	if (!next) {
		ui.notifications.info(t("time.events.nothingLeft", { season: t(`time.seasons.${calendar.season}`) }));
		return null;
	}
	if (next.collection) return turnSeason();

	if (!(await markSeasonEvent(next.key, { weeks: true }))) return null;
	const after = nextDay(calendar);
	await setCalendar(after);
	// Weeks away from their Holding make a ruler's return a long absence (p20).
	await markLongAbsences();
	return after;
}

/**
 * Journey to a distant Realm (Distant Realms, p14), which normally sees the
 * Company arrive in the next Season. The Season turns as it does between
 * Seasons, but nobody chooses a pursuit, since the Knights are on the road
 * rather than guarding the Realm. If another Realm Scene is chosen as the
 * destination, it becomes the active Scene. GMs only.
 * @returns {Promise<import("../rules/time.js").Calendar|null>}
 */
export async function journeyToDistantRealm() {
	if (!game.user.isGM) return null;
	const realms = game.scenes.filter((scene) => isRealmScene(scene) && !scene.active);
	let destination = null;
	if (realms.length) {
		// One of many, so a radio list with one button. "Elsewhere" is never a Scene, so it travels without one.
		const elsewhere = { name: t("time.distant.elsewhere") };
		const choice = await chooseActor([...realms, elsewhere], {
			title: t("time.distant.title"),
			icon: "fa-solid fa-route",
			message: t("time.distant.where")
		});
		if (!choice) return null;
		destination = choice === elsewhere ? null : choice;
	}

	const season = (calendar) => t(`time.seasons.${calendar.season}`);
	// The Company dialog escapes its intro itself.
	const where = destination?.name ?? t("time.distant.aDistantRealm");
	const after = await turnTime({
		newAge: false,
		next: nextSeason,
		kind: "distant",
		label: "time.distant.title",
		icon: "fa-solid fa-route",
		pursuits: [],
		intro: (_before, next) => t("time.distant.intro", { realm: where, season: season(next) }),
		turned: (next) => t("time.distant.arrived", { season: season(next) }),
		note: t("time.distant.note", { realm: where })
	});
	// Gone to another Realm, every ruler riding with the Company is away from their Holding, even
	// one who set out from its hex, and comes home from a long absence (p20).
	if (after) await markLongAbsences({ leaving: true });
	if (after && destination) await destination.activate();
	return after;
}

/**
 * Virtue Loss from hardship on the road (Travel, p18): everybody ticked loses
 * d6 from the Virtue it costs. GMs only.
 * @param {string} key One of HARDSHIPS.
 * @returns {Promise<object[]|null>}
 */
export async function sufferHardship(key) {
	if (!game.user.isGM) return null;
	const hardship = HARDSHIPS.find((candidate) => candidate.key === key);
	if (!hardship) return null;

	const name = t(`time.hardship.kinds.${key}.label`);
	const company = await chooseCompany({
		title: name,
		icon: "fa-solid fa-person-hiking",
		intro: `${t(`time.hardship.kinds.${key}.hint`)} ${t("time.hardship.intro")}`,
		ok: t("time.hardship.roll")
	});
	if (!company) return null;
	if (!company.length) {
		ui.notifications.info(t("time.hardship.none"));
		return null;
	}
	return hardshipFor(hardship, company.map(({ actor }) => actor));
}

/**
 * Everybody given loses d6 from one Virtue, told on one card. What a hardship
 * of the road costs (p17), and what pushing through a Hazard costs as well
 * (p14), which is no hardship of the book's own list.
 * @param {Actor[]} actors
 * @param {string} virtue One of VIRTUES.
 * @param {object} words
 * @param {string} words.title Heads the card.
 * @returns {Promise<object[]>} The card's entries.
 */
export async function virtueLoss(actors, virtue, { title }) {
	const abbr = t(`virtues.${virtue}.abbr`);
	const rolls = [];
	const entries = [];
	const updates = [];
	for (const actor of actors) {
		const { update, taken } = await rollVirtueLosses(actor, [{ virtue }]);
		if (!taken.length) continue;
		const [{ roll, from, to }] = taken;
		rolls.push(roll);
		updates.push([actor, update]);
		entries.push({ name: actor.name, lines: [t("time.hardship.lost", { amount: roll.total, virtue: abbr, from, to })] });
	}
	await updateActors(updates, causedBy("hardship"));
	await postCard(null, "report", { title, tagline: calendarLabel(getCalendar()), entries, hint: t("time.hardship.notDamage") }, { rolls });
	return entries;
}

/**
 * The d6 one of the book's own hardships costs (p17).
 * @param {{key: string, virtue: string}} hardship From HARDSHIPS.
 * @param {Actor[]} actors
 * @param {object} [options]
 * @param {string} [options.title] Heads the card. The hardship's own name by default.
 * @returns {Promise<object[]>} The card's entries.
 */
export const hardshipFor = (hardship, actors, { title = null } = {}) =>
	virtueLoss(actors, hardship.virtue, { title: title ?? t(`time.hardship.kinds.${hardship.key}.label`) });

/**
 * Change a character's Age. Growing Mature or Old offers a fresh d12+d6 for
 * each Virtue, the higher kept by the Mature and the lower by the Old.
 * @param {Actor} actor
 * @param {string} age One of AGES.
 */
export async function changeAge(actor, age) {
	if (!AGES.includes(age) || age === actor.system.age) return null;
	const steps = agingSteps(actor.system.age, age);
	if (!steps.length) return actor.update({ "system.age": age });

	const choice = await chooseDialog({
		title: t("time.aging.title"),
		icon: "fa-solid fa-hourglass-half",
		message: t("time.aging.intro", { name: foundry.utils.escapeHTML(actor.name), age: t(`age.${age}`) }),
		buttons: [
			{ action: "roll", label: t("time.aging.roll"), icon: "fa-solid fa-dice", default: true },
			{ action: "skip", label: t("time.aging.skip"), icon: "fa-solid fa-forward" }
		]
	});
	if (choice === "skip") return skipAging(actor, age);
	if (choice !== "roll") return null;
	return rollAging(actor, age);
}

/**
 * Grow a character older with their Virtues as they are. Their thread still
 * says they aged, with no rolls under it.
 * @param {Actor} actor
 * @param {string} age One of AGES, older than theirs.
 * @returns {Promise<Actor>}
 */
async function skipAging(actor, age) {
	await actor.update({ "system.age": age }, causedBy("aging"));
	await timelineAged(actor, age);
	return actor;
}

/**
 * Grow a character older, rerolling each Virtue on d12+d6 for each Age they
 * grow into, and tell the table on one card.
 * @param {Actor} actor
 * @param {string} age One of AGES, older than theirs.
 * @returns {Promise<Record<string, {value: number, max: number}>>} Their Virtues now.
 */
export async function rollAging(actor, age) {
	const steps = agingSteps(actor.system.age, age);
	const scores = Object.fromEntries(VIRTUES.map((key) => [key, { value: actor.system.virtues[key].value, max: actor.system.virtues[key].max }]));
	const rolls = [];
	const lines = [];
	for (const step of steps) {
		for (const key of VIRTUES) {
			const roll = await new Roll(AGING_VIRTUE_ROLL).evaluate();
			rolls.push(roll);
			const aged = agedScore(scores[key], roll.total, step);
			lines.push({
				label: t("time.aging.line", { age: t(`age.${step}`), virtue: t(`virtues.${key}.abbr`) }),
				value: t("time.aging.value", { rolled: roll.total, from: scores[key].max, to: aged.max })
			});
			scores[key] = aged;
		}
	}

	const update = { "system.age": age };
	for (const key of VIRTUES) {
		update[`system.virtues.${key}.max`] = scores[key].max;
		update[`system.virtues.${key}.value`] = scores[key].value;
	}
	await actor.update(update, causedBy("aging"));
	await Promise.all([
		timelineAged(actor, age, lines.map(({ label, value }) => `${label}: ${value}`)),
		postCard(actor, "creation", {
			title: t("time.aging.title"),
			tagline: steps.map((step) => t(`time.aging.${step}`)).join(" · "),
			lines
		}, { rolls })
	]);
	return scores;
}
