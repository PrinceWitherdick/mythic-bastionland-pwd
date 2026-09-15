import { addNewRealmButton, newRealm } from "./module/actions/realm.js";
import { wildernessRoll } from "./module/actions/wilderness.js";
import { importBookArt } from "./module/book-art/importer.js";
import { ensureImportMacro, registerBookArtSettings } from "./module/book-art/macro.js";
import { RealmLayer } from "./module/canvas/RealmLayer.js";
import { registerRealmHooks } from "./module/canvas/realm-hooks.js";
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

	registerBookArtSettings();

	// Sheets left open come back where they were after a reload.
	registerSheetRestore();

	// Realm Scenes: the GM's Realm tools, Barriers that stop Tokens, and the hex readout.
	CONFIG.Canvas.layers.realm = { layerClass: RealmLayer, group: "interface" };
	registerRealmHooks();

	// Macros reach the system through here, such as Import Book Art.
	game.system.api = Object.freeze({ importBookArt, newRealm, wildernessRoll });
});

Hooks.once("ready", async () => {
	await Promise.all([restoreOpenSheets(), ensureImportMacro()]);
});

Hooks.on("renderSceneDirectory", (_directory, element) => addNewRealmButton(element));
