import { rollScar } from "../actions/scars.js";
import { openKnightChooser } from "../apps/KnightChooser.js";
import { t } from "../chat/cards.js";
import { AGES, GAMBITS, PROPERTY_TYPES } from "../config.js";
import { RANKS } from "../rules/glory.js";
import { templatePath } from "../system-id.js";
import { BastionlandActorSheet } from "./BastionlandActorSheet.js";

/** The Knight character sheet, laid out after the official printed sheet. */
export class KnightSheet extends BastionlandActorSheet {
	static DEFAULT_OPTIONS = {
		position: { width: 860, height: 920 },
		actions: {
			chooseKnight: KnightSheet.#onChooseKnight,
			rollScar: KnightSheet.#onRollScar,
			setAge: KnightSheet.#onSetAge
		}
	};

	static PARTS = {
		sheet: {
			template: templatePath("actor/knight-sheet.hbs"),
			scrollable: [""]
		}
	};

	static PREVIEWED_ART = ".bastionland-heraldry img[data-name]";

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const system = this.actor.system;
		const [property, abilities, passions, scars] = await Promise.all([
			this._prepareItems(...PROPERTY_TYPES),
			this._prepareItems("ability"),
			this._prepareItems("passion"),
			this._prepareItems("scar")
		]);

		return Object.assign(context, {
			ages: AGES.map((key) => ({ key, label: t(`age.${key}`), active: system.age === key })),
			ranks: RANKS.map((rank) => ({
				key: rank.key,
				glory: rank.glory,
				label: t(`rank.${rank.key}`),
				active: system.rank === rank.key
			})),
			nextRank: system.nextRank
				? t("sheet.toNextRank", { needed: system.nextRank.needed, rank: t(`rank.${system.nextRank.key}`) })
				: t("sheet.worthiest"),
			propertyTypes: PROPERTY_TYPES.map((type) => ({ type, label: game.i18n.localize(`TYPES.Item.${type}`) })),
			property,
			abilities,
			passions,
			scars,
			gambits: GAMBITS.map((key) => t(`gambits.${key}`))
		});
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {KnightSheet} */
	static #onChooseKnight() {
		return openKnightChooser(this.actor);
	}

	/** @this {KnightSheet} */
	static #onRollScar() {
		return rollScar(this.actor);
	}

	/** @this {KnightSheet} */
	static #onSetAge(_event, target) {
		return this.actor.update({ "system.age": target.dataset.age });
	}
}
