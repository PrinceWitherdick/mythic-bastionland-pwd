import { confirmDialog, inputDialog } from "../apps/ui.js";
import { keyChoices, postCard, t } from "../chat/cards.js";
import {
	TASK_SCOPES,
	TASK_SCOPE_ICONS,
	bringsCrisis,
	councilTasks,
	isSaveRisk,
	isTaskDue,
	newTask,
	normalizeTasks,
	taskDueAt,
	taskOutcome,
	tasksDue
} from "../rules/council-tasks.js";
import { COUNCIL_SEATS, isSameName } from "../rules/dominion.js";
import { readRefereeTable } from "../rules/referee-rolls.js";
import { escapeHTML } from "../rules/text.js";
import { VIRTUES } from "../rules/virtues.js";
import { calendarLabel, getCalendar } from "./calendar.js";
import { crisisEntry, inflictCrisis, misruleWarning, worldDomains } from "./dominion.js";
import { evaluateSave, saveContext } from "./saves.js";

/**
 * Council tasks (p20): a seat is given work that takes a Phase, a Week or a
 * full Season, and it's settled as a normal action (p16) when its time comes.
 * Failure typically brings a Crisis, which is drawn here. Each task is kept
 * under an id of its own, as the Court is, so only setting, settling and
 * setting aside come through here.
 */

/** @param {string} seat One of COUNCIL_SEATS. */
const seatLabel = (seat) => t(`domain.council.${seat}.label`);

/**
 * Who holds a seat, as the sheet has it written.
 * @param {Actor} domain
 * @param {string} seat
 * @returns {string} Blank where nobody has been named.
 */
const seatHolder = (domain, seat) => (domain?.system?.council?.[seat] ?? "").trim();

/**
 * The actor who holds a Council seat, so that a task can be settled with their
 * own Save. Seats are written as the GM likes, so they're matched by name.
 * @param {Actor} domain
 * @param {string} seat One of COUNCIL_SEATS.
 * @returns {Actor|null} Null where nobody of that name has a sheet.
 */
export function councilActor(domain, seat) {
	const name = seatHolder(domain, seat);
	if (!name) return null;
	return game.actors.find((actor) => actor.system?.virtues && isSameName(actor.name, name)) ?? null;
}

/**
 * What can settle a task (p16). A Save needs somebody with Virtues to roll it,
 * so the Saves are offered only where the seat's holder has a sheet.
 * @param {Actor|null} actor Whoever holds the seat.
 * @returns {{key: string, label: string, selected: boolean}[]}
 */
function riskChoices(actor) {
	const choices = [
		{ key: "none", label: t("domain.tasks.risks.none") },
		{ key: "luck", label: t("domain.tasks.risks.luck") },
		...(actor
			? VIRTUES.map((virtue) => ({
				key: virtue,
				label: t("domain.tasks.risks.save", { virtue: t(`virtues.${virtue}.abbr`), name: actor.name })
			}))
			: [])
	];
	// The Luck Roll is the Referee's own fallback, so it stands ready.
	return choices.map((choice) => ({ ...choice, selected: choice.key === "luck" }));
}

/**
 * How a task reads on a sheet or a card: what settles it, and when the work is done.
 * @param {import("../rules/council-tasks.js").CouncilTask} task
 * @param {Actor|null} holder Whoever holds the seat, already looked up.
 * @returns {string}
 */
function riskLabel(task, holder) {
	if (!isSaveRisk(task.risk)) return t(`domain.tasks.risks.${task.risk}`);
	const virtue = t(`virtues.${task.risk}.abbr`);
	return holder ? t("domain.tasks.risks.save", { virtue, name: holder.name }) : t("domain.tasks.risks.saveAlone", { virtue });
}

/**
 * Set one of the Council a task. The scope is what the book leaves to the
 * Referee, and the risk is the Action Procedure's fourth step.
 * @param {Actor} domain
 * @param {string} seat One of COUNCIL_SEATS.
 * @returns {Promise<string|null>} The task's id, or null for a seat the Council doesn't have.
 */
export async function assignTask(domain, seat) {
	if (!COUNCIL_SEATS.includes(seat) || !domain?.isOwner) return null;
	const holder = seatHolder(domain, seat);
	const actor = councilActor(domain, seat);
	const data = await inputDialog({
		title: t("domain.tasks.assignTitle"),
		icon: "fa-solid fa-scroll",
		template: "council-task",
		context: {
			intro: holder
				? t("domain.tasks.assignIntroNamed", { holder: escapeHTML(holder), seat: seatLabel(seat) })
				: t("domain.tasks.assignIntro", { seat: seatLabel(seat) }),
			scopes: keyChoices(TASK_SCOPES, "domain.tasks.scopes", { mark: "selected", hint: false }),
			risks: riskChoices(actor)
		},
		ok: { label: t("domain.tasks.set"), icon: "fa-solid fa-scroll" }
	});
	if (!data) return null;

	const task = newTask(seat, {
		what: data.what,
		scope: data.scope,
		risk: data.risk,
		started: getCalendar(),
		at: Date.now()
	});
	if (!task) return null;

	const id = foundry.utils.randomID();
	await domain.update({ [`system.tasks.${id}`]: task });
	await postCard(domain, "note", {
		icon: TASK_SCOPE_ICONS[task.scope],
		text: t("domain.tasks.taken", {
			who: holder || seatLabel(seat),
			what: task.what || t("domain.tasks.whatUnwritten"),
			scope: t(`domain.tasks.scopes.${task.scope}.takes`)
		})
	});
	return id;
}

/**
 * Settle a task: roll whatever was put at risk, tell the table what came of it,
 * and give the Domain a Crisis where it failed (p20). The task leaves the
 * Council's hands either way, since its card is the record of it.
 * @param {Actor} domain
 * @param {string} id
 * @returns {Promise<string|null>} One of TASK_OUTCOMES, or null where no such task is in hand.
 */
export async function settleTask(domain, id) {
	const task = normalizeTasks(domain?.system.tasks)[id];
	if (!task || !domain.isOwner) return null;

	const actor = isSaveRisk(task.risk) ? councilActor(domain, task.seat) : null;
	const notes = [];
	// A seat whose holder has lost their sheet, or was renamed, falls back to the
	// Luck Roll, which p16 offers in the same breath as the Save.
	let risk = task.risk;
	if (isSaveRisk(risk) && !actor) {
		notes.push(t("domain.tasks.noSheet", { name: seatHolder(domain, task.seat) || seatLabel(task.seat) }));
		risk = "luck";
	}

	const rolls = [];
	let save = null;
	let luck = null;
	if (isSaveRisk(risk)) {
		save = await evaluateSave(actor, risk);
		rolls.push(save.roll);
	} else if (risk === "luck") {
		const roll = await new Roll("1d6").evaluate();
		rolls.push(roll);
		luck = roll.total;
	}

	const outcome = taskOutcome(risk, { d6: luck, passed: save?.passed ?? null });
	let crisis = null;
	if (bringsCrisis(outcome)) {
		const drawn = await inflictCrisis(domain);
		rolls.push(...drawn.rolls);
		crisis = drawn.key;
		if (!crisis) notes.push(t("domain.tasks.everyCrisis"));
	}

	await domain.update({ [`system.tasks.-=${id}`]: null });
	const holder = seatHolder(domain, task.seat);
	await postCard(domain, "council-task", {
		icon: TASK_SCOPE_ICONS[task.scope],
		title: t("domain.tasks.settledTitle"),
		tagline: holder ? t("domain.tasks.by", { seat: seatLabel(task.seat), name: holder }) : seatLabel(task.seat),
		what: task.what || t("domain.tasks.whatUnwritten"),
		scope: t(`domain.tasks.scopes.${task.scope}.took`),
		save: save ? saveContext(save) : null,
		luck: luck === null ? null : { d6: luck, result: t(`refereeRolls.tables.luck.results.${readRefereeTable("luck", luck).result}`) },
		noRoll: risk === "none" ? t("domain.tasks.risks.none") : null,
		outcome: t(`domain.tasks.outcomes.${outcome}.label`),
		crisis: crisis ? crisisEntry(crisis) : null,
		hint: [t(`domain.tasks.outcomes.${outcome}.hint`), ...notes, misruleWarning(domain)].filter(Boolean).join(" ")
	}, { rolls });
	return outcome;
}

/**
 * Take a task back out of a Council member's hands, unsettled. What was written
 * about it goes with it, so one that was written down is confirmed first.
 * @param {Actor} domain
 * @param {string} id
 * @returns {Promise<boolean>} Whether it was set aside.
 */
export async function setTaskAside(domain, id) {
	const task = normalizeTasks(domain?.system.tasks)[id];
	if (!task || !domain.isOwner) return false;

	if (task.what && !(await confirmDialog({
		title: t("domain.tasks.setAside"),
		icon: "fa-solid fa-xmark",
		message: t("domain.tasks.setAsideConfirm", { what: escapeHTML(task.what), seat: seatLabel(task.seat) })
	}))) return false;

	await domain.update({ [`system.tasks.-=${id}`]: null });
	return true;
}

/**
 * Every task as the Domain sheet lists them, gathered under the seat each was
 * given to. A sheet draws all five seats at once, so the list is read once
 * between them, and a seat's holder — who is found by name among every actor —
 * is looked up once however many tasks they have in hand.
 * @param {Actor} domain
 * @param {import("../rules/time.js").Calendar} now
 * @returns {Record<string, object[]>} A list for each of COUNCIL_SEATS, empty where there's no work.
 */
export function tasksBySeat(domain, now) {
	const holders = new Map();
	const holderFor = (seat) => {
		if (!holders.has(seat)) holders.set(seat, councilActor(domain, seat));
		return holders.get(seat);
	};

	const bySeat = Object.fromEntries(COUNCIL_SEATS.map((seat) => [seat, []]));
	for (const task of councilTasks(domain.system.tasks)) {
		const due = isTaskDue(task, now);
		bySeat[task.seat]?.push({
			id: task.id,
			icon: TASK_SCOPE_ICONS[task.scope],
			what: task.what || t("domain.tasks.whatUnwritten"),
			due,
			gloss: [
				t(`domain.tasks.scopes.${task.scope}.takes`),
				riskLabel(task, holderFor(task.seat)),
				due ? t("domain.tasks.dueNow") : t("domain.tasks.dueAt", { when: calendarLabel(taskDueAt(task)) })
			].join(" · ")
		});
	}
	return bySeat;
}

/**
 * What the table is told as time moves on: every Domain with Council work
 * waiting to be settled.
 * @param {import("../rules/time.js").Calendar} calendar Now.
 * @returns {string[]} A line for each Domain, for a card's Due block.
 */
export function tasksDueNotices(calendar) {
	return worldDomains().flatMap((domain) => {
		const due = tasksDue(domain.system.tasks, calendar);
		if (!due.length) return [];
		return [t(due.length === 1 ? "domain.tasks.dueNoticeOne" : "domain.tasks.dueNotice", { name: domain.name, count: due.length })];
	});
}
