import { KnightModel } from "./module/data-models/KnightModel.js";
import {
	AbilityModel,
	ArmourModel,
	GearModel,
	PassionModel,
	ScarModel,
	WeaponModel
} from "./module/data-models/items.js";
import { BastionlandItemSheet } from "./module/sheets/BastionlandItemSheet.js";
import { KnightSheet } from "./module/sheets/KnightSheet.js";
import { registerSheetRestore, restoreOpenSheets } from "./module/sheets/restore-open-sheets.js";
import { SYSTEM_ID, templatePath } from "./module/system-id.js";

const ITEM_MODELS = {
	weapon: WeaponModel,
	armour: ArmourModel,
	gear: GearModel,
	ability: AbilityModel,
	passion: PassionModel,
	scar: ScarModel
};

Hooks.once("init", () => {
	CONFIG.Actor.dataModels.knight = KnightModel;
	Object.assign(CONFIG.Item.dataModels, ITEM_MODELS);

	const { DocumentSheetConfig } = foundry.applications.apps;
	DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, KnightSheet, {
		types: ["knight"],
		makeDefault: true,
		label: "bastionland.sheet.title"
	});
	DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, BastionlandItemSheet, {
		types: Object.keys(ITEM_MODELS),
		makeDefault: true,
		label: "bastionland.sheet.title"
	});

	// Partials used inside chat cards, which render outside any sheet.
	foundry.applications.handlebars.loadTemplates({
		"bastionland.save-result": templatePath("chat/parts/save-result.hbs")
	});

	// Sheets left open come back where they were after a reload.
	registerSheetRestore();
});

Hooks.once("ready", async () => {
	await restoreOpenSheets();
});
