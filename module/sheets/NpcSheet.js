import { pasteStatBlock } from "../actions/npc.js";
import { rollMorale } from "../actions/saves.js";
import { openNpcChooser } from "../apps/NpcChooser.js";
import { t } from "../chat/cards.js";
import { FEATS, NPC_SCALES } from "../config.js";
import { templatePath } from "../system-id.js";
import { BastionlandActorSheet } from "./BastionlandActorSheet.js";

/** Item types the sheet offers to add, in sheet order. It lists every item the NPC has. */
const ADDED_TYPES = Object.freeze(["weapon", "armour", "gear"]);

/** What a Warband's Mortal Wound, SPI 0 and VIG 0 mean (Warfare, p11). */
const WARBAND_STATES = Object.freeze(["routed", "broken", "wipedOut"]);

/** An NPC's sheet, laid out like the stat blocks the book prints for its Cast. */
export class NpcSheet extends BastionlandActorSheet {
	static DEFAULT_OPTIONS = {
		classes: ["bastionland-npc"],
		position: { width: 740, height: 800 },
		actions: {
			chooseNpc: NpcSheet.#onChooseNpc,
			pasteStatBlock: NpcSheet.#onPasteStatBlock,
			rollMorale: NpcSheet.#onRollMorale,
			setScale: NpcSheet.#onSetScale,
			toggleFeat: NpcSheet.#onToggleFeat,
			clearLeader: NpcSheet.#onClearLeader
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
			leader: system.warband && system.leader ? t("npc.leader.label", { name: fromUuidSync(system.leader)?.name ?? t("npc.leader.missing") }) : null,
			featChoices: FEATS.map(({ key }) => ({ key, label: t(`feats.${key}.name`), active: system.feats[key] })),
			addTypes: ADDED_TYPES.map((type) => ({ type, label: game.i18n.localize(`TYPES.Item.${type}`) })),
			items: await this._prepareItems()
		});
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {NpcSheet} */
	static #onChooseNpc() {
		return openNpcChooser(this.actor);
	}

	/** @this {NpcSheet} */
	static #onPasteStatBlock() {
		return pasteStatBlock(this.actor);
	}

	/** @this {NpcSheet} */
	static #onRollMorale() {
		return rollMorale(this.actor);
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
	static #onToggleFeat(_event, target) {
		const { feat } = target.dataset;
		if (!(feat in this.actor.system.feats)) return;
		return this.actor.update({ [`system.feats.${feat}`]: !this.actor.system.feats[feat] });
	}
}
