import { getCalendar, registerCalendarSetting } from "./module/actions/calendar.js";
import { awardGlory } from "./module/actions/glory.js";
import { addNewRealmButton, newRealm } from "./module/actions/realm.js";
import { openRefereeRolls, rollRefereeTable } from "./module/actions/referee-rolls.js";
import { addSurpriseOption, rollSurprise } from "./module/actions/surprise.js";
import { wildernessRoll } from "./module/actions/wilderness.js";
import { addNewKnightButton, openKnightChooser } from "./module/apps/KnightChooser.js";
import { addNewNpcButton, openNpcChooser } from "./module/apps/NpcChooser.js";
import { openSparkTables } from "./module/apps/SparkTables.js";
import { openTimePanel } from "./module/apps/TimePanel.js";
import { addDirectoryButton } from "./module/apps/ui.js";
import { importBookArt } from "./module/book-art/importer.js";
import { ensureImportMacro, registerBookArtSettings } from "./module/book-art/macro.js";
import { RealmLayer } from "./module/canvas/RealmLayer.js";
import { registerRealmHooks } from "./module/canvas/realm-hooks.js";
import { registerAttackCards } from "./module/chat/attack-card.js";
import { t } from "./module/chat/cards.js";
import { DomainModel } from "./module/data-models/DomainModel.js";
import { KnightModel } from "./module/data-models/KnightModel.js";
import { NpcModel } from "./module/data-models/NpcModel.js";
import {
	AbilityModel,
	ArmourModel,
	GearModel,
	PassionModel,
	ScarModel,
	WeaponModel
} from "./module/data-models/items.js";
import { BastionlandItemSheet } from "./module/sheets/BastionlandItemSheet.js";
import { DomainSheet } from "./module/sheets/DomainSheet.js";
import { KnightSheet } from "./module/sheets/KnightSheet.js";
import { NpcSheet } from "./module/sheets/NpcSheet.js";
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

/** The Referee's tools GMs get in the Roll Tables directory, in order. */
const REFEREE_TOOLS = [
	{ className: "bastionland-referee-rolls", icon: "fa-solid fa-dice-d6", label: "refereeRolls.title", open: openRefereeRolls },
	{ className: "bastionland-spark-tables", icon: "fa-solid fa-wand-sparkles", label: "spark.title", open: openSparkTables },
	{ className: "bastionland-time", icon: "fa-solid fa-hourglass-half", label: "time.title", open: openTimePanel }
];

Hooks.once("init", () => {
	CONFIG.Actor.dataModels.knight = KnightModel;
	CONFIG.Actor.dataModels.npc = NpcModel;
	CONFIG.Actor.dataModels.domain = DomainModel;
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
	DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, NpcSheet, {
		types: ["npc"],
		makeDefault: true,
		label: "bastionland.sheet.title"
	});
	DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DomainSheet, {
		types: ["domain"],
		makeDefault: true,
		label: "bastionland.sheet.title"
	});

	// Partials shared by the Knight and NPC sheets, and used inside chat cards,
	// which render outside any sheet.
	foundry.applications.handlebars.loadTemplates({
		"bastionland.item-row": templatePath("actor/parts/item-row.hbs"),
		"bastionland.add-item": templatePath("actor/parts/add-item.hbs"),
		"bastionland.virtue-scores": templatePath("actor/parts/virtue-scores.hbs"),
		"bastionland.condition-items": templatePath("actor/parts/condition-items.hbs"),
		"bastionland.feat-list": templatePath("actor/parts/feat-list.hbs"),
		"bastionland.save-result": templatePath("chat/parts/save-result.hbs")
	});

	registerBookArtSettings();

	// The world's calendar of Ages, Seasons, Days and Phases.
	registerCalendarSetting();

	// Attack cards take Deny and Gambits after the roll, then apply the Damage.
	registerAttackCards();

	// Sheets left open come back where they were after a reload.
	registerSheetRestore();

	// Realm Scenes: the GM's Realm tools, Barriers that stop Tokens, and the hex readout.
	CONFIG.Canvas.layers.realm = { layerClass: RealmLayer, group: "interface" };
	registerRealmHooks();

	// Macros reach the system through here, such as Import Book Art.
	game.system.api = Object.freeze({
		importBookArt,
		openKnightChooser,
		openNpcChooser,
		newRealm,
		wildernessRoll,
		rollSurprise,
		openRefereeRolls,
		rollRefereeTable,
		openSparkTables,
		openTimePanel,
		awardGlory,
		getCalendar
	});
});

// Roll Surprise sits in the Combat Tracker's encounter menu.
Hooks.on("getCombatContextOptions", addSurpriseOption);

Hooks.once("ready", async () => {
	await Promise.all([restoreOpenSheets(), ensureImportMacro()]);
});

Hooks.on("renderActorDirectory", (_directory, element) => {
	addNewKnightButton(element);
	addNewNpcButton(element);
});

Hooks.on("renderSceneDirectory", (_directory, element) => addNewRealmButton(element));

Hooks.on("renderRollTableDirectory", (_directory, element) => {
	if (!game.user.isGM) return;
	for (const { label, open, ...button } of REFEREE_TOOLS) addDirectoryButton(element, { ...button, label: t(label), onClick: () => open() });
});
