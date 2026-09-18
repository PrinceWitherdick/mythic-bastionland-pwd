import { t } from "../chat/cards.js";
import { ARMOUR_KINDS } from "../config.js";
import { SPECIALIST_DICE } from "../rules/attack.js";
import { VIRTUES } from "../rules/virtues.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/**
 * One sheet for every item type; the template shows the fields each type has.
 * Opened by `openNew`, it writes an item the actor doesn't have yet and only
 * adds it when the player saves.
 */
export class BastionlandItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
	static DEFAULT_OPTIONS = {
		// Not "bastionland-item": that is the class on an item's row in a sheet's
		// list, and its padding and rule would be painted around this window.
		classes: [SYSTEM_ID, "bastionland", "bastionland-item-window"],
		position: { width: 480, height: 520 },
		window: { resizable: true },
		form: { submitOnChange: true }
	};

	static PARTS = {
		sheet: {
			template: templatePath("item/item-sheet.hbs"),
			scrollable: [""]
		}
	};

	/**
	 * Open a sheet for an item an actor doesn't carry yet. The item is written in
	 * one go and only added when the player saves, so a + button pressed by
	 * mistake leaves the actor as it was.
	 * @param {Actor} actor The actor the item would belong to.
	 * @param {string} type The item type to write.
	 * @returns {BastionlandItemSheet} The sheet, already rendering.
	 */
	static openNew(actor, type) {
		const name = Item.implementation.defaultName({ type, parent: actor });
		// Unsaved and without an id, which is how Foundry tells a sheet that its
		// submission creates the document rather than updating one.
		const draft = new Item.implementation({ type, name }, { parent: actor });
		const sheet = new this({
			document: draft,
			canCreate: true,
			form: { submitOnChange: false, closeOnSubmit: true }
		});
		sheet.render({ force: true });
		return sheet;
	}

	/** @returns {boolean} Whether this sheet is writing an item that hasn't been added yet. */
	get isNew() {
		return !this.item.id;
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const item = this.item;

		return Object.assign(context, {
			item,
			system: item.system,
			systemFields: item.system.schema.fields,
			typeLabel: game.i18n.localize(`TYPES.Item.${item.type}`),
			isNew: this.isNew,
			// An Ability, Passion or Scar is nothing you could hold, so it has no picture.
			hasPicture: !["ability", "passion", "scar"].includes(item.type),
			isWeapon: item.type === "weapon",
			isArmour: item.type === "armour",
			isScar: item.type === "scar",
			isGear: item.type === "gear",
			kindOptions: Object.fromEntries(ARMOUR_KINDS.map((key) => [key, game.i18n.localize(`bastionland.item.kinds.${key}`)])),
			specialistOptions: { "": t("item.notSpecialist"), ...Object.fromEntries(SPECIALIST_DICE.map((die) => [die, `+${die}`])) },
			remedyOptions: { "": t("item.notRemedy"), ...Object.fromEntries(VIRTUES.map((key) => [key, t(`virtues.${key}.label`)])) },
			enrichedDescription: await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description, {
				secrets: item.isOwner,
				relativeTo: item
			})
		});
	}

	/** @inheritDoc */
	_prepareSubmitData(event, form, formData, updateData) {
		const submitData = super._prepareSubmitData(event, form, formData, updateData);
		// The form has no field for the type, and creating the item needs one.
		if (this.isNew) submitData.type = this.item.type;
		return submitData;
	}
}
