import { calendarLabel, getCalendar } from "../actions/calendar.js";
import {
	addCrisis,
	crisisRoll,
	dramaInCourt,
	increasedCollections,
	namedSuccessor,
	passOnDomain,
	resolveCrisis,
	seizeDomain
} from "../actions/dominion.js";
import { assignTask, setTaskAside, settleTask, tasksBySeat } from "../actions/council-tasks.js";
import { addCourtMember, removeCourtMember } from "../actions/court.js";
import { t } from "../chat/cards.js";
import { COURT_ROLES, SERVES_A_SEAT, courtByRole } from "../rules/court.js";
import { COUNCIL_SEATS, crisisRolledThisSeason, isInTurmoil } from "../rules/dominion.js";
import { seasonKey } from "../rules/time.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * A Domain's sheet: the Holding, its ruler, the Council and the tasks it has in
 * hand, the Court, and the Crises the Domain faces.
 */
export class DomainSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-sheet", "bastionland-domain"],
		position: { width: 780, height: 780 },
		window: { resizable: true },
		form: { submitOnChange: true },
		actions: {
			crisisRoll: DomainSheet.#onCrisisRoll,
			addCrisis: DomainSheet.#onAddCrisis,
			resolveCrisis: DomainSheet.#onResolveCrisis,
			collections: DomainSheet.#onCollections,
			drama: DomainSheet.#onDrama,
			passOn: DomainSheet.#onPassOn,
			seize: DomainSheet.#onSeize,
			addCourtMember: DomainSheet.#onAddCourtMember,
			removeCourtMember: DomainSheet.#onRemoveCourtMember,
			assignTask: DomainSheet.#onAssignTask,
			settleTask: DomainSheet.#onSettleTask,
			setTaskAside: DomainSheet.#onSetTaskAside
		}
	};

	static PARTS = {
		sheet: {
			template: templatePath("actor/domain-sheet.hbs"),
			scrollable: [""]
		}
	};

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const actor = this.actor;
		const { system } = actor;
		const calendar = getCalendar();
		// Read once between the seats, since every one of them is drawn here.
		const tasks = tasksBySeat(actor, calendar);

		return Object.assign(context, {
			actor,
			system,
			seats: COUNCIL_SEATS.map((key) => ({
				key,
				label: t(`domain.council.${key}.label`),
				hint: t(`domain.council.${key}.hint`),
				value: system.council[key],
				// The tasks that seat has in hand (p20), each saying when its work is done.
				tasks: tasks[key],
				assign: t("domain.tasks.assign", { seat: t(`domain.council.${key}.label`) })
			})),
			court: DomainSheet.#courtContext(system.court),
			crises: system.crises.map((key, index) => ({
				index,
				name: t(`domain.crises.${key}.name`),
				flavour: t(`domain.crises.${key}.flavour`),
				resolution: t(`domain.crises.${key}.resolution`)
			})),
			misruleDue: system.misruleDue ? t("domain.misruleDue", { count: system.crises.length }) : null,
			rolled: t(crisisRolledThisSeason(actor, calendar) ? "domain.rolledThisSeason" : "domain.notRolledThisSeason", {
				season: calendarLabel(calendar)
			}),
			muster: t("domain.muster", { count: system.muster }),
			successorPlaceholder: successorPlaceholder(actor),
			turmoil: isInTurmoil(system.seized, seasonKey(calendar)) ? t("domain.conquest.inTurmoil") : null,
			enrichedNotes: await foundry.applications.ux.TextEditor.implementation.enrichHTML(system.notes, {
				secrets: actor.isOwner,
				relativeTo: actor
			})
		});
	}

	/**
	 * The Court by role (p20), every role shown even where nobody serves, so a
	 * Referee can see what a Court is made of. Only a Retainer names the Council
	 * seat they were taken on by.
	 * @param {unknown} court As stored.
	 * @returns {object[]}
	 */
	static #courtContext(court) {
		const seats = COUNCIL_SEATS.map((key) => ({ key, label: t(`domain.council.${key}.label`) }));
		return courtByRole(court).map(({ role, members }) => ({
			role,
			label: t(`domain.court.roles.${role}.label`),
			hint: t(`domain.court.roles.${role}.hint`),
			add: t(`domain.court.roles.${role}.add`),
			notePlaceholder: t(`domain.court.roles.${role}.notePlaceholder`),
			// "Vassals taken on by individual Council members", so only a Retainer serves a seat.
			servesASeat: role === SERVES_A_SEAT,
			members: members.map((member) => ({
				...member,
				seats: seats.map((seat) => ({ ...seat, selected: seat.key === member.seat }))
			}))
		}));
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {DomainSheet} */
	static #onCrisisRoll() {
		return crisisRoll(this.actor);
	}

	/** @this {DomainSheet} */
	static #onAddCrisis() {
		return addCrisis(this.actor);
	}

	/** @this {DomainSheet} */
	static #onResolveCrisis(_event, target) {
		return resolveCrisis(this.actor, Number(target.dataset.index));
	}

	/** @this {DomainSheet} */
	static #onCollections() {
		return increasedCollections(this.actor);
	}

	/** @this {DomainSheet} */
	static #onDrama() {
		return dramaInCourt(this.actor);
	}

	/** @this {DomainSheet} */
	static #onPassOn() {
		return passOnDomain(this.actor);
	}

	/** @this {DomainSheet} */
	static #onSeize() {
		return seizeDomain(this.actor);
	}

	/** @this {DomainSheet} */
	static #onAddCourtMember(_event, target) {
		const role = target.dataset.role;
		return COURT_ROLES.includes(role) ? addCourtMember(this.actor, role) : null;
	}

	/** @this {DomainSheet} */
	static #onRemoveCourtMember(_event, target) {
		return removeCourtMember(this.actor, target.closest("[data-member]")?.dataset.member);
	}

	/** @this {DomainSheet} */
	static #onAssignTask(_event, target) {
		return assignTask(this.actor, target.dataset.seat);
	}

	/** @this {DomainSheet} */
	static #onSettleTask(_event, target) {
		return settleTask(this.actor, target.closest("[data-task]")?.dataset.task);
	}

	/** @this {DomainSheet} */
	static #onSetTaskAside(_event, target) {
		return setTaskAside(this.actor, target.closest("[data-task]")?.dataset.task);
	}
}

/**
 * @param {Actor} domain
 * @returns {string} The successor field's placeholder: the ruling Knight's own successor stands in until the Domain names one.
 */
function successorPlaceholder(domain) {
	const heir = domain.system.successor.trim() ? "" : namedSuccessor(domain);
	return heir ? t("domain.successorFromKnight", { name: heir }) : t("domain.successorPlaceholder");
}
