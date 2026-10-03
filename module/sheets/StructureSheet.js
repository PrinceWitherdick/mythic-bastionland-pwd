import { editArmour } from "../actions/npc.js";
import { collide, repair } from "../actions/structures.js";
import { t } from "../chat/cards.js";
import { STRUCTURE_KINDS } from "../rules/structures.js";
import { templatePath } from "../system-id.js";
import { BastionlandActorSheet } from "./BastionlandActorSheet.js";

/** Item types the sheet offers to add, in sheet order: a siege engine's weapons, a ship's cargo. */
const ADDED_TYPES = Object.freeze(["weapon", "gear"]);

/** A structure's, ship's or siege engine's sheet: GD, Armour, repairs and collisions (Wood and Stone, p11). */
export class StructureSheet extends BastionlandActorSheet {
	static DEFAULT_OPTIONS = {
		classes: ["bastionland-structure"],
		position: { width: 700, height: 680 },
		actions: {
			setKind: StructureSheet.#onSetKind,
			repair: StructureSheet.#onRepair,
			collide: StructureSheet.#onCollide,
			editArmour: StructureSheet.#onEditArmour
		}
	};

	static PARTS = {
		sheet: {
			template: templatePath("actor/structure-sheet.hbs"),
			scrollable: [""]
		}
	};

	static PREVIEWED_ART = ".bastionland-npc-header__img[data-name]";

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const { system } = this.actor;

		return Object.assign(context, {
			kinds: STRUCTURE_KINDS.map((key) => ({
				key,
				label: t(`structure.kinds.${key}.label`),
				hint: t(`structure.kinds.${key}.hint`),
				active: system.kind === key
			})),
			kindRules: t(`structure.kinds.${system.kind}.hint`),
			isShip: system.kind === "ship",
			// A wall has nothing to attack with, but a siege engine or the Chariot does.
			canAttack: this.actor.items.some((item) => item.type === "weapon"),
			addTypes: ADDED_TYPES.map((type) => ({ type, label: game.i18n.localize(`TYPES.Item.${type}`) })),
			items: await this._prepareItems()
		});
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {StructureSheet} */
	static #onSetKind(_event, target) {
		const { kind } = target.dataset;
		if (!STRUCTURE_KINDS.includes(kind)) return;
		return this.actor.update({ "system.kind": kind });
	}

	/** @this {StructureSheet} */
	static #onRepair() {
		return repair(this.actor);
	}

	/** @this {StructureSheet} */
	static #onCollide() {
		return collide(this.actor);
	}

	/** @this {StructureSheet} */
	static #onEditArmour() {
		return editArmour(this.actor);
	}
}
