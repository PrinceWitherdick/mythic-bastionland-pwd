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
import { t } from "../chat/cards.js";
import { COUNCIL_SEATS, crisisRolledThisSeason, isInTurmoil } from "../rules/dominion.js";
import { seasonKey } from "../rules/time.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** A Domain's sheet: the Holding, its ruler and Council, and the Crises it faces. */
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
			seize: DomainSheet.#onSeize
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

		return Object.assign(context, {
			actor,
			system,
			seats: COUNCIL_SEATS.map((key) => ({
				key,
				label: t(`domain.council.${key}.label`),
				hint: t(`domain.council.${key}.hint`),
				value: system.council[key]
			})),
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
}

/**
 * @param {Actor} domain
 * @returns {string} The successor field's placeholder: the ruling Knight's own successor stands in until the Domain names one.
 */
function successorPlaceholder(domain) {
	const heir = domain.system.successor.trim() ? "" : namedSuccessor(domain);
	return heir ? t("domain.successorFromKnight", { name: heir }) : t("domain.successorPlaceholder");
}
