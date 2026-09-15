import { t } from "../chat/cards.js";
import { ARMOUR_KINDS } from "../config.js";
import { VIRTUES } from "../rules/virtues.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/** One sheet for every item type; the template shows the fields each type has. */
export class BastionlandItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-item"],
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

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const item = this.item;

		return Object.assign(context, {
			item,
			system: item.system,
			systemFields: item.system.schema.fields,
			typeLabel: game.i18n.localize(`TYPES.Item.${item.type}`),
			isWeapon: item.type === "weapon",
			isArmour: item.type === "armour",
			isScar: item.type === "scar",
			isGear: item.type === "gear",
			kindOptions: Object.fromEntries(ARMOUR_KINDS.map((key) => [key, game.i18n.localize(`bastionland.item.kinds.${key}`)])),
			remedyOptions: { "": t("item.notRemedy"), ...Object.fromEntries(VIRTUES.map((key) => [key, t(`virtues.${key}.label`)])) },
			enrichedDescription: await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description, {
				secrets: item.isOwner,
				relativeTo: item
			})
		});
	}
}
