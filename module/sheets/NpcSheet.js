import { pasteStatBlock } from "../actions/npc.js";
import { COMPANION_FLAG } from "../actions/property.js";
import { rollMorale, rollReaction } from "../actions/saves.js";
import { convertToStructure } from "../actions/structures.js";
import { strainWarband } from "../actions/warbands.js";
import { t } from "../chat/cards.js";
import { FEATS, NPC_SCALES } from "../config.js";
import { ownerOf } from "../rules/property.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { BastionlandActorSheet } from "./BastionlandActorSheet.js";

/** Item types the sheet offers to add, in sheet order. It lists every item the NPC has. */
const ADDED_TYPES = Object.freeze(["weapon", "armour", "gear"]);

/** What a Warband's Mortal Wound, SPI 0 and VIG 0 mean (Warfare, p11). */
const WARBAND_STATES = Object.freeze(["routed", "broken", "wipedOut"]);

/** An NPC's sheet, laid out like the stat blocks the book prints for its Cast. */
export class NpcSheet extends BastionlandActorSheet {
	/** @override */
	static PROPERTY_ORDER = true;

	static DEFAULT_OPTIONS = {
		classes: ["bastionland-npc"],
		position: { width: 740, height: 800 },
		actions: {
			pasteStatBlock: NpcSheet.#onPasteStatBlock,
			rollMorale: NpcSheet.#onRollMorale,
			rollReaction: NpcSheet.#onRollReaction,
			upkeep: NpcSheet.#onUpkeep,
			setScale: NpcSheet.#onSetScale,
			toggleFeat: NpcSheet.#onToggleFeat,
			clearLeader: NpcSheet.#onClearLeader,
			openOwner: NpcSheet.#onOpenOwner,
			makeStructure: NpcSheet.#onMakeStructure
		}
	};

	static PARTS = {
		sheet: {
			template: templatePath("actor/npc-sheet.hbs"),
			scrollable: [""]
		}
	};

	static PREVIEWED_ART = ".bastionland-npc-header__img[data-name]";

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const system = this.actor.system;

		return Object.assign(context, {
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
			ownedBy: this.#owner(),
			leader: system.warband && system.leader ? t("npc.leader.label", { name: fromUuidSync(system.leader)?.name ?? t("npc.leader.missing") }) : null,
			featChoices: FEATS.map(({ key }) => ({ key, label: t(`feats.${key}.name`), active: system.feats[key] })),
			addTypes: ADDED_TYPES.map((type) => ({ type, label: game.i18n.localize(`TYPES.Item.${type}`) })),
			items: await this._preparePropertyItems()
		});
	}

	/**
	 * Keep the height the Traits & Notes box was dragged to, since the sheet
	 * redraws on every change to the NPC.
	 * @override
	 */
	_syncPartState(partId, newElement, priorElement, state) {
		super._syncPartState(partId, newElement, priorElement, state);
		const box = ".bastionland-npc-notes > prose-mirror, .bastionland-npc-notes > .editor-content";
		const height = priorElement.querySelector(box)?.style.height;
		const target = newElement.querySelector(box);
		if (height && target) target.style.height = height;
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
			{ action: "pasteStatBlock", icon: "fa-solid fa-paste", label: t("npc.pasteStatBlock") }
		];
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {NpcSheet} */
	static #onPasteStatBlock() {
		return pasteStatBlock(this.actor);
	}

	/** @this {NpcSheet} */
	static #onRollMorale() {
		return rollMorale(this.actor);
	}

	/** @this {NpcSheet} */
	static #onRollReaction() {
		return rollReaction(this.actor);
	}

	/** @this {NpcSheet} */
	static #onUpkeep() {
		return strainWarband(this.actor);
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
	static #onMakeStructure() {
		return convertToStructure(this.actor);
	}

	/** @this {NpcSheet} */
	static #onToggleFeat(_event, target) {
		const { feat } = target.dataset;
		if (!(feat in this.actor.system.feats)) return;
		return this.actor.update({ [`system.feats.${feat}`]: !this.actor.system.feats[feat] });
	}
}
