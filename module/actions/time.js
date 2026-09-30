import { chooseDialog, inputDialog } from "../apps/ui.js";
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
	nextAge,
	nextDay,
	nextPhase,
	nextSeason,
	seasonKey
} from "../rules/time.js";
import { causedBy } from "./ledger.js";
import { getMythNotes } from "./myth-notes.js";
import { getRealm, isRealmScene } from "./realm.js";
import { VIRTUES } from "../rules/virtues.js";
import { calendarLabel, getCalendar, setCalendar } from "./calendar.js";
import { tasksDueNotices } from "./council-tasks.js";
import { tableRenewalNotices } from "./knight-tables.js";
import { settleDomains, worldDomains } from "./dominion.js";
import { collectionEntry, markCollection, markSeasonEvent, seasonEventsNow } from "./season-events.js";
import { recordSeasonTurn } from "./season-log.js";
import { adjustGlory, gloryLines } from "./glory.js";
import { settleScars } from "./scars.js";
import { knightSquire } from "./squires.js";
import { chooseSuccessor, heirOf } from "./succession.js";
import { sufferMorningAfflictions } from "./afflictions.js";
import { companySituation, wildernessRoll } from "./wilderness.js";
import { askPhaseEnd, dieUntended, takeMorningLosses } from "./phase-end.js";
import { followPursuits } from "./pursuits.js";
import { markLongAbsences } from "./homecoming.js";
import { rollVirtueLosses } from "./virtue-loss.js";
import { direWeatherRisk, rollRefereeTable } from "./referee-rolls.js";
import { rollSkyAndWeather } from "./sky-weather.js";
import { atMercyOfWeather } from "../rules/referee-rolls.js";

/**
 * Ask who takes part in something the Company does together. Those given as
 * present and everybody whose Token is selected are listed ticked, then every
 * Knight, ticked when a player owns them. Players see only the characters they
 * own, since those are all they can change. With pursuits, each picks one too.
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.icon
 * @param {string} options.intro
 * @param {string} options.ok
 * @param {Actor[]} [options.present]
 * @param {Actor[]} [options.others] Listed unticked, for the Referee to tick any that take part.
 * @param {string[]} [options.pursuits]
 * @param {boolean} [options.knightsOnly] Leave out selected Tokens that aren't Knights.
 * @returns {Promise<{actor: Actor, pursuit: string|null}[]|null>} Those ticked, or null if closed.
 */
export async function chooseCompany({ title, icon, intro, ok, present = [], others = [], pursuits = [], knightsOnly = false }) {
	const candidates = [];
	const seen = new Set();
	const add = (actor, included) => {
		if (!actor?.system?.virtues || (knightsOnly && actor.type !== "knight") || seen.has(actor.uuid)) return;
		if (!game.user.isGM && !actor.isOwner) return;
		seen.add(actor.uuid);
		candidates.push({ actor, included });
	};
	for (const actor of present) add(actor, true);
	for (const token of canvas?.tokens?.controlled ?? []) add(token.actor, true);
	for (const actor of others) add(actor, false);
	for (const actor of game.actors.filter((candidate) => candidate.type === "knight")) add(actor, actor.hasPlayerOwner);

	const data = await inputDialog({
		title,
		icon,
		template: "company",
		context: {
			intro,
			members: candidates.map(({ actor, included }, index) => ({ index, name: actor.name, included })),
			pursuits: pursuits.map((key) => ({ key, label: t(`time.pursuits.${key}.label`), hint: t(`time.pursuits.${key}.hint`) }))
		},
		ok: { label: ok }
	});
	if (!data) return null;

	return candidates
		.map(({ actor }, index) => ({ actor, included: data[`include-${index}`], pursuit: data[`pursuit-${index}`] }))
		.filter(({ included }) => included)
		.map(({ actor, pursuit }) => ({ actor, pursuit: pursuits.includes(pursuit) ? pursuit : null }));
}

/**
 * Settle every Scar whose GD increase comes with the next Season.
 * @param {Actor} actor
 * @returns {Promise<{rolls: Roll[], lines: string[], guardMax: number}>}
 */
function settleSeasonScars(actor) {
	const due = actor.items.filter((item) => item.type === "scar" && isScarPending(item.system) && scarForRoll(item.system.roll)?.bySeason);
	return settleScars(due, actor.system.guard.max);
}

/**
 * Succession (Between Ages, p17): a Knight names their successor, and a
 * successor who is still a Squire may be Knighted.
 * @param {Actor} knight
 * @returns {Promise<string[]>} Lines for the Age's card.
 */
async function establishSuccessor(knight) {
	const heir = await chooseSuccessor(knight);
	if (!heir) return [t("successor.unnamed")];
	const lines = [t("successor.named", { name: heir.name })];
	if (heir.system.isSquire && heir.isOwner && (await knightSquire(heir))) lines.push(t("successor.knighted", { name: heir.name }));
	return lines;
}

/**
 * Legacy (Between Ages, p17): a Knight's successor gains half of their current
 * Glory. A Knight who hasn't named one is asked to.
 * @param {Actor} knight
 * @param {number} glory Theirs, with the new Age's Glory counted.
 * @returns {Promise<string[]>} Lines for the Age's card.
 */
async function bequeathGlory(knight, glory) {
	const heir = heirOf(knight) ?? (await chooseSuccessor(knight));
	if (!heir) return [t("successor.noLegacy")];
	const amount = legacyGlory(glory);
	const lines = [t("successor.legacy", { name: heir.name, amount })];
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
 * @returns {Promise<{rolls: Roll[], entries: object[]}>}
 */
export async function passTime(company, { newAge, before }) {
	const rolls = [];
	const entries = [];
	const updates = [];
	const successions = [];
	const legacies = [];
	for (const { actor, pursuit } of company) {
		const { system } = actor;
		const update = Object.fromEntries(VIRTUES.map((key) => [`system.virtues.${key}.value`, system.virtues[key].max]));
		const lines = [t("time.restored")];
		// Doom lasts the Season it was taken in.
		if (isDoomed(actor.items.filter((item) => item.type === "scar").map((item) => item.system), before)) lines.push(t("time.doomLifts"));

		if (newAge && Number.isInteger(system.glory) && system.gainsGlory) {
			const change = changeGlory(system.glory, 1);
			update["system.glory"] = change.to;
			lines.push(...gloryLines(change));
		}
		if (newAge && system.age === "old") {
			const roll = await new Roll(OLD_AGE_LOSS).evaluate();
			rolls.push(roll);
			const { max, diesPeacefully } = afterOldAge(system.virtues.vig.max, roll.total);
			update["system.virtues.vig.max"] = max;
			update["system.virtues.vig.value"] = max;
			lines.push(t("time.oldAge", { amount: roll.total, from: system.virtues.vig.max, to: max }));
			if (diesPeacefully) lines.push(t("time.diesPeacefully"));
		}

		const scars = await settleSeasonScars(actor);
		rolls.push(...scars.rolls);
		lines.push(...scars.lines);
		if (scars.guardMax !== system.guard.max) update["system.guard.max"] = scars.guardMax;

		if (newAge && pursuit === "succession") successions.push({ actor, lines });
		if (newAge && pursuit === "legacy") legacies.push({ actor, glory: update["system.glory"] ?? system.glory, lines });

		updates.push([actor, update]);
		entries.push({ name: actor.name, pursuit: pursuit ? t(`time.pursuits.${pursuit}.label`) : null, lines });
	}
	await Promise.all(updates.map(([actor, update]) => actor.update(update)));
	// After the Company's own updates, so a successor who is also in the Company
	// keeps both what the Season restored and what Knighting or a Legacy gave them.
	for (const { actor, lines } of successions) lines.push(...(await establishSuccessor(actor)));
	for (const { actor, glory, lines } of legacies) lines.push(...(await bequeathGlory(actor, glory)));
	return { rolls, entries };
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
	if (answers.wilderness) {
		await wildernessRoll({ scene: answers.scene, phase: ending.phase, mode: answers.mode === "camp" ? "camp" : "travel", atBarrier: Boolean(known.atBarrier) });
	}
	const calendar = nextPhase(getCalendar());
	await setCalendar(calendar);
	await announcePhase(calendar);
	if (answers.members.length) await takeMorningLosses(answers, ending);
	// Nobody lies untended through a Phase and lives (p8).
	if (answers.dying?.length) await dieUntended(answers.dying);
	// Each morning, a daily affliction takes its toll.
	if (calendar.phase === "morning") await sufferMorningAfflictions();
	// The new day's Sky and Weather, rolled as the Company breaks camp (p197).
	if (answers.sky) await rollSkyAndWeather(answers.sky);
	await phaseWeather(calendar);
	return calendar;
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
 * Knight's table that comes round with it.
 * @param {import("../rules/time.js").Calendar} calendar
 */
export function announcePhase(calendar) {
	return postCard(null, "report", {
		tone: calendar.phase,
		icon: PHASE_ICONS[calendar.phase],
		title: t(`time.phases.${calendar.phase}`),
		tagline: calendarLabel(calendar),
		// Night brings round a table rolled each night, and Morning a new Day's.
		due: [...tasksDueNotices(calendar), ...tableRenewalNotices(calendar.phase === "night" ? ["night"] : calendar.phase === "morning" ? ["day"] : [])],
		hint: t(`time.phaseHints.${calendar.phase}`)
	});
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
	const company = await chooseCompany({ title: t(label), icon, intro: intro(before, after), ok: t(label), pursuits, knightsOnly: true });
	if (!company) return null;

	await setCalendar(after);
	// A ruler away from their Holding as the Season turns returns from a long absence (p20).
	await markLongAbsences();
	const { rolls, entries } = await passTime(company, { newAge, before });
	// What a Service or Courtesy made goes on the report with the rest (p17, p192).
	await followPursuits(company, entries, t(`time.seasons.${after.season}`));
	const ended = seasonKey(before);
	// Every Season ends with the Realm's collection (p17), whether the Age turns with it or not.
	const collection = await markCollection(ended, before.season);
	const domains = await settleDomains(ended);
	const title = turned(after);
	const all = [...(collection ? [collectionEntry(collection)] : []), ...entries, ...domains];
	await Promise.all([
		announceSeason(after, { title, entries: all, note }, { rolls }),
		recordSeasonTurn(ended, { kind, title, entries: all, note })
	]);
	if (newAge) await growOlder(company.map(({ actor }) => actor));
	return after;
}

/**
 * The Old lose d12 VIG as each Age ends, and a quiet death comes to any it
 * takes to VIG 0 (p17): every NPC in the world given an Age of Old, on one card. The
 * Company's own Old are taken care of as the Age turns for them.
 * @returns {Promise<object[]>} The card's entries.
 */
async function npcsOldAge() {
	const old = game.actors.filter((actor) => actor.type === "npc" && actor.system.age === "old" && actor.isOwner);
	if (!old.length) return [];
	const rolls = [];
	const entries = [];
	const updates = [];
	for (const actor of old) {
		const roll = await new Roll(OLD_AGE_LOSS).evaluate();
		rolls.push(roll);
		const from = actor.system.virtues.vig.max;
		const { max, diesPeacefully } = afterOldAge(from, roll.total);
		updates.push({ _id: actor.id, "system.virtues.vig.max": max, "system.virtues.vig.value": Math.min(actor.system.virtues.vig.value, max) });
		entries.push({ name: actor.name, lines: [t("time.oldAge", { amount: roll.total, from, to: max }), ...(diesPeacefully ? [t("time.diesPeacefully")] : [])] });
	}
	// Every one a world actor, so one write takes them all.
	await Actor.updateDocuments(updates);
	await postCard(null, "report", { title: t("time.aging.oldNpcs"), tagline: calendarLabel(getCalendar()), entries }, { rolls });
	return entries;
}

/**
 * A new Age of the world (p17): ask which of the Company grow a stage older,
 * Young to Mature or Mature to Old, and reroll their Virtues for it.
 * @param {Actor[]} actors Those who took part in the Age's turn.
 */
async function growOlder(actors) {
	await npcsOldAge();
	// The Company, and anybody else in the world given an Age that has one to grow into.
	const npcs = game.actors.filter((actor) => actor.type === "npc" && olderAge(actor.system.age));
	const company = actors.filter((actor) => olderAge(actor.system.age));
	if (!company.length && !npcs.length) return;
	const chosen = await chooseCompany({
		title: t("time.aging.title"),
		icon: "fa-solid fa-hourglass-half",
		intro: t("time.aging.newAge"),
		ok: t("time.aging.roll"),
		present: company,
		// Anybody else given an Age is offered, not ticked, so a new Age doesn't reroll the whole world by default.
		others: npcs
	});
	for (const { actor } of chosen ?? []) {
		const age = olderAge(actor.system.age);
		if (age) await rollAging(actor, age);
	}
}

/**
 * The names of every Realm's resolved Myths, each owed a new Myth in its place
 * now the Season has turned (p27).
 * @returns {Promise<string[]>}
 */
async function mythsToReplace() {
	const scenes = game.scenes.filter((scene) => isRealmScene(scene));
	const waiting = scenes.flatMap((scene) => resolvedMyths(getRealm(scene).realm, getMythNotes(scene)));
	if (!waiting.length) return [];
	const index = await loadArtIndex();
	return waiting.map((myth) => mythEntry(index, myth).name);
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
			...(myths.length ? [t("time.due.myths", { myths: myths.join(", ") })] : []),
			// Seats left empty, which invite trouble (p204).
			...emptySeatNotices(domains),
			// Works whose time has come (p21), until they're struck off.
			...designsDoneNotices(domains, calendar),
			...tasks,
			// Tables a Knight rolls on again each Season, and each Day, since a Season begins on a new one.
			...tableRenewalNotices(["season", "day"])
		],
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
		label: "time.turnSeason",
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
		label: "time.turnAge",
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
		const choice = await chooseDialog({
			title: t("time.distant.title"),
			icon: "fa-solid fa-route",
			message: t("time.distant.where"),
			buttons: [
				...realms.map((scene, index) => ({ action: scene.id, label: scene.name, default: index === 0 })),
				{ action: "elsewhere", icon: "fa-solid fa-map", label: t("time.distant.elsewhere") }
			]
		});
		if (!choice) return null;
		destination = realms.find((scene) => scene.id === choice) ?? null;
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
		updates.push(actor.update(update, causedBy("hardship")));
		entries.push({ name: actor.name, lines: [t("time.hardship.lost", { amount: roll.total, virtue: abbr, from, to })] });
	}
	await Promise.all(updates);
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
	if (choice === "skip") return actor.update({ "system.age": age });
	if (choice !== "roll") return null;
	return rollAging(actor, age);
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
	await actor.update(update);
	await postCard(actor, "creation", {
		title: t("time.aging.title"),
		tagline: steps.map((step) => t(`time.aging.${step}`)).join(" · "),
		lines
	}, { rolls });
	return scores;
}
