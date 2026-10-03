import { editArmour, rollNpcVirtues } from "../actions/npc.js";
import { COMPANION_FLAG } from "../actions/property.js";
import { rollMoraleIfAccepted, rollReactionIfAccepted } from "../actions/saves.js";
import { strainWarband } from "../actions/warbands.js";
import { keyChoices, t } from "../chat/cards.js";
import { clearMoraleBreak } from "../chat/morale-card.js";
import { AGES, FEATS, NPC_SCALES, NPC_WIELDS, WEAKNESS_DICE } from "../config.js";
import { gearHeldInHands } from "../rules/attack.js";
import { isMoraleBreak } from "../rules/morale.js";
import { ownerOf } from "../rules/property.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { BastionlandActorSheet } from "./BastionlandActorSheet.js";
import { TabRailMixin } from "./tab-rail.js";
import { afflictTargets } from "../actions/afflictions.js";
import { changeAge } from "../actions/time.js";
import { restIfAccepted } from "../actions/recovery.js";

/** Item types the sheet offers to add, in sheet order. It lists every item the NPC has. */
const ADDED_TYPES = Object.freeze(["weapon", "armour", "gear"]);

/** What a Warband's Mortal Wound, SPI 0 and VIG 0 mean (Warfare, p11). */
const WARBAND_STATES = Object.freeze(["routed", "broken", "wipedOut"]);

/** An NPC's sheet, laid out like the stat blocks the book prints for its Cast. */
export class NpcSheet extends TabRailMixin(BastionlandActorSheet) {
	/** @override */
	static PROPERTY_ORDER = true;

	static DEFAULT_OPTIONS = {
		classes: ["bastionland-npc"],
		position: { width: 740, height: 800 },
		actions: {
			rollVirtues: NpcSheet.#onRollVirtues,
			afflictTargets: NpcSheet.#onAfflictTargets,
			rollMorale: NpcSheet.#onRollMorale,
			clearMoraleBreak: NpcSheet.#onClearMoraleBreak,
			rollReaction: NpcSheet.#onRollReaction,
			upkeep: NpcSheet.#onUpkeep,
			setScale: NpcSheet.#onSetScale,
			setAge: NpcSheet.#onSetAge,
			setWields: NpcSheet.#onSetWields,
			toggleFeat: NpcSheet.#onToggleFeat,
			clearLeader: NpcSheet.#onClearLeader,
			openOwner: NpcSheet.#onOpenOwner,
			editArmour: NpcSheet.#onEditArmour,
			rest: NpcSheet.#onRest
		}
	};

	static PARTS = {
		sheet: {
			template: templatePath("actor/npc-sheet.hbs"),
			scrollable: [""]
		}
	};

	/** The sheet's pages, picked from the rail hung off the window's edge. */
	static TABS = {
		primary: {
			initial: "npc",
			tabs: [
				{ id: "npc", icon: "fa-solid fa-chess-pawn", label: "bastionland.npc.tabs.npc" },
				{ id: "notes", icon: "fa-solid fa-feather-pointed", label: "bastionland.npc.tabs.notes" }
			]
		}
	};

	static RAIL_ANCHOR = ".bastionland-npc-header";

	static PREVIEWED_ART = ".bastionland-npc-header__img[data-name]";

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const system = this.actor.system;

		return Object.assign(context, {
			// A Warband has no Age of its own; anybody else may be given one.
			ages: this.actor.system.scale === "warband" ? [] : AGES.map((key) => ({ key, label: t(`age.${key}`), active: this.actor.system.age === key })),
			wields: this.#wieldsChoices(),
			weaknessDice: Object.fromEntries(WEAKNESS_DICE.map((die) => [die, `+${die}`])),
			scales: NPC_SCALES.map((key) => ({
				key,
				label: t(`npc.scales.${key}.label`),
				hint: t(`npc.scales.${key}.hint`),
				active: system.scale === key
			})),
			warbandStates: system.warband
				? WARBAND_STATES.map((key) => ({
					key,
					active: system.warband[key],
					label: t(`npc.warband.${key}.label`),
					hint: t(`npc.warband.${key}.hint`)
				}))
				: [],
			// Fled or surrendered after a failed Morale Save (p10), until the × clears it.
			moraleBroken: isMoraleBreak(system.moraleBroken)
				? { label: t(`morale.broke.${system.moraleBroken}.label`), hint: t("morale.broke.clear") }
				: null,
			ownedBy: this.#owner(),
			leader: system.warband && system.leader ? t("npc.leader.label", { name: fromUuidSync(system.leader)?.name ?? t("npc.leader.missing") }) : null,
			featChoices: FEATS.map(({ key }) => ({ key, label: t(`feats.${key}.name`), active: system.feats[key] })),
			addTypes: ADDED_TYPES.map((type) => ({ type, label: game.i18n.localize(`TYPES.Item.${type}`) })),
			items: await this._preparePropertyItems()
		});
	}

	/** The uuid of the Knight this belonged to when the sheet was last drawn. */
	#ownerUuid = null;

	/**
	 * @returns {{name: string, uuid: string}|null} The Knight whose steed or
	 *   other companion this is, so the sheet names them instead of its name
	 *   having to carry them.
	 */
	#owner() {
		const owner = ownerOf(game.actors, { uuid: this.actor.uuid, companionOf: this.actor.getFlag(SYSTEM_ID, COMPANION_FLAG) });
		this.#ownerUuid = owner?.uuid ?? null;
		return owner ? { name: owner.name, uuid: owner.uuid } : null;
	}

	/**
	 * Keep the owner named here in step: a Knight renamed, or one who takes
	 * this companion or lets it go, redraws the sheet.
	 * @override
	 */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		const redraw = (actor) => {
			if (actor.type !== "knight") return;
			if (actor.system?.steed === this.actor.uuid || actor.uuid === this.#ownerUuid) this.render();
		};
		this._watchHooks(["updateActor", "deleteActor"], redraw);
	}

	/** @override */
	_headerButtons() {
		if (!this.isEditable) return [];
		return [
			// Those of the Cast who cause an affliction pass it on to whoever is targeted.
			...(this.actor.system.inflicts?.length ? [{ action: "afflictTargets", icon: "fa-solid fa-virus", label: t("afflictions.afflict"), tooltip: t("afflictions.afflictHint") }] : []),
			// Hirelings and other folk have d12+d6 in each Virtue (p13); a Warband's are the book's.
			...(this.actor.system.scale === "warband" ? [] : [{ action: "rollVirtues", icon: "fa-solid fa-dice", label: t("npc.rollVirtues"), tooltip: t("npc.rollVirtuesHint") }])
		];
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {NpcSheet} */
	static #onAfflictTargets() {
		return afflictTargets(this.actor);
	}

	/** @this {NpcSheet} */
	static #onRollVirtues() {
		return rollNpcVirtues(this.actor);
	}

	/** @this {NpcSheet} */
	static #onRollMorale() {
		return rollMoraleIfAccepted(this.actor);
	}

	/** @this {NpcSheet} */
	static #onClearMoraleBreak() {
		return clearMoraleBreak(this.actor);
	}

	/** @this {NpcSheet} */
	static #onRollReaction() {
		return rollReactionIfAccepted(this.actor);
	}

	/** @this {NpcSheet} */
	static #onUpkeep() {
		return strainWarband(this.actor);
	}

	/** @this {NpcSheet} */
	static #onSetAge(_event, target) {
		const { age } = target.dataset;
		// Clicking the Age they are forgets it again.
		if (age === this.actor.system.age) return this.actor.update({ "system.age": "" });
		return changeAge(this.actor, age);
	}

	/**
	 * How they hold their weapons (p12): read off their gear, or said outright.
	 * A Warband's Attack is its members', so it isn't asked.
	 * @returns {{key: string, label: string, hint: string, active: boolean}[]}
	 */
	#wieldsChoices() {
		const system = this.actor.system;
		if (system.scale === "warband") return [];
		const reading = gearHeldInHands([...this.actor.items]) ? "hands" : "free";
		return [
			{ key: "", label: t("npc.wields.auto.label"), hint: t(`npc.wields.auto.${reading}`), active: !system.wields },
			...keyChoices(NPC_WIELDS, "npc.wields", { mark: "active", chosen: system.wields })
		];
	}

	/** @this {NpcSheet} */
	static #onSetWields(_event, target) {
		return this.actor.update({ "system.wields": target.dataset.wields ?? "" });
	}

	/** @this {NpcSheet} */
	static #onSetScale(_event, target) {
		const { scale } = target.dataset;
		if (!NPC_SCALES.includes(scale)) return;
		return this.actor.update({ "system.scale": scale });
	}

	/** @this {NpcSheet} */
	static #onClearLeader() {
		return this.actor.update({ "system.leader": "" });
	}

	/** @this {NpcSheet} */
	static #onOpenOwner(_event, target) {
		const rider = fromUuidSync(target.dataset.uuid);
		return rider?.sheet.render({ force: true });
	}

	/** @this {NpcSheet} */
	static #onEditArmour() {
		return editArmour(this.actor);
	}

	/** @this {NpcSheet} */
	static #onRest() {
		return restIfAccepted(this.actor);
	}

	/** @this {NpcSheet} */
	static #onToggleFeat(_event, target) {
		const { feat } = target.dataset;
		if (!(feat in this.actor.system.feats)) return;
		return this.actor.update({ [`system.feats.${feat}`]: !this.actor.system.feats[feat] });
	}
}
