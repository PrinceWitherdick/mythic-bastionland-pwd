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
import { chooseDomainArms, domainArmsView } from "../actions/domain-arms.js";
import { holdingChoices } from "../actions/homecoming.js";
import { editCourtMember, knightChoices, removeCourtMember, seatCircle, seatLabel, takeIntoCourt } from "../actions/court.js";
import { dismissWarband, musterView, musterWarband } from "../actions/warbands.js";
import { TimelineTab, onTimelineAction } from "../apps/timeline-ui.js";
import { t } from "../chat/cards.js";
import { RETAINER_SEATS, SERVES_A_SEAT, circleKnights, courtMembers, retainerChoices, seatHolder, seatOf } from "../rules/court.js";
import { DESIGN_ICONS, DESIGN_SCALES, designDone, designReady, grandDesigns, newDesign } from "../rules/grand-designs.js";
import { COUNCIL_SEATS, crisisRolledThisSeason, emptySeats, isInTurmoil, namesItsDomain } from "../rules/dominion.js";
import { seasonKey } from "../rules/time.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { TabRailMixin } from "./tab-rail.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * A Domain's sheet: the Holding, its ruler, the Council and the tasks it has in
 * hand, the Court, and the Crises the Domain faces.
 */
export class DomainSheet extends TabRailMixin(HandlebarsApplicationMixin(ActorSheetV2)) {
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
			editCourtMember: DomainSheet.#onEditCourtMember,
			removeCourtMember: DomainSheet.#onRemoveCourtMember,
			seatCircle: DomainSheet.#onSeatCircle,
			openKnight: DomainSheet.#onOpenSheet,
			addDesign: DomainSheet.#onAddDesign,
			removeDesign: DomainSheet.#onRemoveDesign,
			muster: DomainSheet.#onMuster,
			dismissWarband: DomainSheet.#onDismissWarband,
			openWarband: DomainSheet.#onOpenSheet,
			assignTask: DomainSheet.#onAssignTask,
			settleTask: DomainSheet.#onSettleTask,
			setTaskAside: DomainSheet.#onSetTaskAside,
			chooseArms: DomainSheet.#onChooseArms,
			timeline: onTimelineAction
		}
	};

	static PARTS = {
		sheet: {
			template: templatePath("actor/domain-sheet.hbs"),
			scrollable: [""]
		}
	};

	/** The sheet's pages, picked from the rail hung off the window's edge. */
	static RAIL_ANCHOR = ".bastionland-npc-header";

	static TABS = {
		primary: {
			initial: "domain",
			tabs: [
				{ id: "domain", icon: "fa-solid fa-chess-rook", label: "bastionland.domain.tabs.domain" },
				// The Domain's thread of the campaign's Timeline.
				{ id: "timeline", icon: "fa-solid fa-timeline", label: "bastionland.domain.tabs.timeline" },
				{ id: "notes", icon: "fa-solid fa-feather-pointed", label: "bastionland.domain.tabs.notes" }
			]
		}
	};

	/** Its name, as "Tal’s Domain", without Foundry's "Domain:" in front. */
	get title() {
		const { name } = this.actor;
		return namesItsDomain(name, t("domain.button")) ? name : t("domain.title", { name });
	}

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
			// Its ruler's arms where its picture was, or whatever it was set to show instead.
			arms: domainArmsView(actor),
			seats:COUNCIL_SEATS.map((key) => ({
				key,
				label: t(`domain.council.${key}.label`),
				hint: t(`domain.council.${key}.hint`),
				// Who sits there: a Retainer picked from the Court, or the Knights of the Circle.
				...(RETAINER_SEATS.includes(key) ? DomainSheet.#retainerSeat(system, key) : DomainSheet.#circleSeat(system)),
				// The tasks that seat has in hand (p20), each saying when its work is done.
				tasks: tasks[key],
				assign: t("domain.tasks.assign", { seat: t(`domain.council.${key}.label`) })
			})),
			// A seat left empty invites trouble (p204), so the sheet says which.
			emptySeats: DomainSheet.#emptySeatsNotice(system.council),
			court: DomainSheet.#courtContext(system),
			designs: DomainSheet.#designsContext(system.designs, calendar),
			designScales: DESIGN_SCALES.map((scale) => ({ scale, icon: DESIGN_ICONS[scale], label: t(`domain.designs.scales.${scale}.add`), hint: t(`domain.designs.scales.${scale}.hint`) })),
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
			// The Warbands this Holding has in the field, against what it can raise (p11, p21).
			warbands: DomainSheet.#musterContext(actor),
			successorPlaceholder: successorPlaceholder(actor),
			// The Holding it rules, which a ruler comes home to from a long absence (p20).
			holdings: holdingChoices(actor),
			turmoil: isInTurmoil(system.seized, seasonKey(calendar)) ? t("domain.conquest.inTurmoil") : null,
			enrichedNotes: await foundry.applications.ux.TextEditor.implementation.enrichHTML(system.notes, {
				secrets: actor.isOwner,
				relativeTo: actor
			}),
			timeline: await this.#timeline.context(context.tabs)
		});
	}

	/** The Timeline page: the Domain's own thread. */
	#timeline = new TimelineTab(this);

	/**
	 * A Timeline page that missed a change while hidden is drawn again as it's opened.
	 * @override
	 */
	changeTab(tab, group, options) {
		super.changeTab(tab, group, options);
		this.#timeline.shown(tab);
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		this.#timeline.wire(this.element);
	}

	/**
	 * @param {Record<string, string>} council
	 * @returns {string|null} Which seats that must be filled stand empty, or null when none do.
	 */
	static #emptySeatsNotice(council) {
		const seats = emptySeats(council).map((seat) => t(`domain.council.${seat}.label`));
		return seats.length ? t("domain.council.empty", { seats: seats.join(", ") }) : null;
	}

	/**
	 * The works the Domain has in hand (Grand Designs, p21), each saying when it's done.
	 * @param {unknown} designs As stored.
	 * @param {import("../rules/time.js").Calendar} calendar Now.
	 * @returns {object[]}
	 */
	static #designsContext(designs, calendar) {
		return grandDesigns(designs).map((design) => {
			const ready = designReady(design);
			const done = designDone(design, calendar);
			return {
				id: design.id,
				what: design.what,
				icon: DESIGN_ICONS[design.scale],
				scale: t(`domain.designs.scales.${design.scale}.label`),
				done,
				when: done ? t("domain.designs.done") : t("domain.designs.readyBy", { season: t(`time.seasons.${ready.season}`), age: ready.age })
			};
		});
	}

	/**
	 * One of the seats granted to a Retainer: the Retainers it may go to, and
	 * a name written in before seats were filled from the Court, kept until
	 * world setup makes them a Retainer.
	 * @param {object} system The Domain's.
	 * @param {string} seat One of RETAINER_SEATS.
	 * @returns {object}
	 */
	static #retainerSeat(system, seat) {
		const holder = seatHolder(system.council, system.court, seat);
		const choices = retainerChoices(system.council, system.court, seat);
		const nobody = !choices.length && !holder?.legacy;
		return {
			retainers: true,
			choices,
			legacy: holder?.legacy ? holder.name : "",
			blank: t(nobody ? "domain.council.noRetainers" : "domain.council.nobody"),
			blankHint: nobody ? t("domain.council.noRetainersHint") : ""
		};
	}

	/**
	 * The Circle: the Knights sitting in it, each opening their sheet.
	 * @param {object} system The Domain's.
	 * @returns {object}
	 */
	static #circleSeat(system) {
		const knights = circleKnights(system.council.circle, knightChoices());
		return {
			circle: true,
			knights: knights.map((knight) => ({ ...knight, uuid: knight.legacy ? "" : game.actors.get(knight.id)?.uuid }))
		};
	}

	/**
	 * The Court (p20) as one list, by role in the book's order: each member's
	 * name, role and seat on a line, with their note and leverage under it.
	 * @param {object} system The Domain's.
	 * @returns {object[]}
	 */
	static #courtContext(system) {
		return courtMembers(system.court).map((member) => {
			const held = seatOf(system.council, member.id);
			// A Retainer granted a seat holds it; one who isn't may serve whoever took them on.
			const serves = member.role === SERVES_A_SEAT && member.seat ? t("domain.court.servesSeat", { seat: seatLabel(member.seat) }) : "";
			const leverage = member.leverage ? t("domain.court.leverageLine", { leverage: member.leverage }) : "";
			return {
				id: member.id,
				name: member.name || t("domain.court.unnamed"),
				role: t(`domain.court.roles.${member.role}.one`),
				roleHint: t(`domain.court.roles.${member.role}.hint`),
				seat: held ? seatLabel(held) : serves,
				held: Boolean(held),
				gloss: [member.note, leverage].filter(Boolean).join(" · ")
			};
		});
	}

	/**
	 * What the Authority block says of the Domain’s soldiers.
	 * @param {Actor} domain
	 * @returns {object}
	 */
	static #musterContext(domain) {
		const { state, lines } = musterView(domain);
		return {
			lines,
			tally: t("warband.mustered", { count: state.mustered, muster: state.muster }),
			full: state.full ? t("warband.full") : null
		};
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
	static #onAddCourtMember() {
		return takeIntoCourt(this.actor);
	}

	/** @this {DomainSheet} */
	static #onEditCourtMember(_event, target) {
		return editCourtMember(this.actor, target.closest("[data-member]")?.dataset.member);
	}

	/** @this {DomainSheet} */
	static #onSeatCircle() {
		return seatCircle(this.actor);
	}

	/**
	 * Open the sheet of the Knight or Warband clicked, named by the nearest uuid.
	 * @this {DomainSheet}
	 */
	static #onOpenSheet(_event, target) {
		const actor = fromUuidSync(target.closest("[data-uuid]")?.dataset.uuid ?? "");
		actor?.sheet.render({ force: true });
		return actor;
	}

	/** @this {DomainSheet} */
	static #onRemoveCourtMember(_event, target) {
		return removeCourtMember(this.actor, target.closest("[data-member]")?.dataset.member);
	}

	/** @this {DomainSheet} */
	static #onAddDesign(_event, target) {
		const design = newDesign(target.dataset.scale, getCalendar(), Date.now());
		if (!design) return null;
		return this.actor.update({ [`system.designs.${foundry.utils.randomID()}`]: design });
	}

	/** @this {DomainSheet} */
	static #onRemoveDesign(_event, target) {
		const id = target.closest("[data-design]")?.dataset.design;
		if (!id) return null;
		return this.actor.update({ [`system.designs.-=${id}`]: null });
	}

	/** @this {DomainSheet} */
	static #onMuster() {
		return musterWarband(this.actor);
	}

	/** @this {DomainSheet} */
	static #onDismissWarband(_event, target) {
		return dismissWarband(this.actor, target.closest("[data-warband]")?.dataset.warband);
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

	/** @this {DomainSheet} */
	static #onChooseArms() {
		return chooseDomainArms(this.actor);
	}

	/** Watches the world's Knights while open, since the arms it shows are one of theirs: [hook, id] pairs. */
	#knightHooks = [];

	/** @override */
	_onFirstRender(context, options) {
		super._onFirstRender(context, options);
		const redraw = (actor) => actor.type === "knight" && this.render();
		this.#knightHooks = [
			["updateActor", Hooks.on("updateActor", (actor, changes) => knightChangesArms(changes) && redraw(actor))],
			["createActor", Hooks.on("createActor", redraw)],
			["deleteActor", Hooks.on("deleteActor", redraw)]
		];
		this.#timeline.watch();
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		for (const [hook, id] of this.#knightHooks) Hooks.off(hook, id);
		this.#knightHooks = [];
		this.#timeline.unwatch();
	}
}

/**
 * @param {object} changes A Knight's update.
 * @returns {boolean} Whether it can change which arms a Domain shows: their painting, which Domain they rule, or their name.
 */
function knightChangesArms(changes) {
	return "name" in changes || foundry.utils.hasProperty(changes, "system.heraldry") || foundry.utils.hasProperty(changes, "system.domain");
}

/**
 * @param {Actor} domain
 * @returns {string} The successor field's placeholder: the ruling Knight's own successor stands in until the Domain names one.
 */
function successorPlaceholder(domain) {
	const heir = domain.system.successor.trim() ? "" : namedSuccessor(domain);
	return heir ? t("domain.successorFromKnight", { name: heir }) : t("domain.successorPlaceholder");
}
