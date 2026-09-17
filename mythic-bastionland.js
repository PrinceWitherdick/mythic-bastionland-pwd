import { getCalendar, registerCalendarSetting } from "./module/actions/calendar.js";
import { registerCityQuestSetting, rollCityOmen } from "./module/actions/city-quest.js";
import { awardGlory } from "./module/actions/glory.js";
import { openMythsPanel } from "./module/apps/MythsPanel.js";
import { addNewRealmButton, newRealm } from "./module/actions/realm.js";
import { openRefereeRolls, rollRefereeTable } from "./module/actions/referee-rolls.js";
import { addSurpriseOption, rollSurprise } from "./module/actions/surprise.js";
import { wildernessRoll } from "./module/actions/wilderness.js";
import { addNewKnightButton, openKnightChooser } from "./module/apps/KnightChooser.js";
import { addNewNpcButton, openNpcChooser } from "./module/apps/NpcChooser.js";
import { openSitesPanel } from "./module/apps/SitesPanel.js";
import { openSparkTables } from "./module/apps/SparkTables.js";
import { openTimePanel } from "./module/apps/TimePanel.js";
import { addDirectoryButton } from "./module/apps/ui.js";
import { GOODS_FOLDERS_STEP, seedGoodsFolders } from "./module/book-art/goods-folders.js";
import { importBookArt } from "./module/book-art/importer.js";
import { ensureImportMacro, registerBookArtSettings } from "./module/book-art/macro.js";
import { RealmLayer } from "./module/canvas/RealmLayer.js";
import { registerRealmHooks } from "./module/canvas/realm-hooks.js";
import { registerAttackCards } from "./module/chat/attack-card.js";
import { t } from "./module/chat/cards.js";
import { registerMoraleCards } from "./module/chat/morale-card.js";
import { registerDuelCards } from "./module/chat/duel-card.js";
import { registerLeadingHooks } from "./module/actions/leading.js";
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
import { registerWorldSetup, runWorldSetup } from "./module/world-setup.js";

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
	{ className: "bastionland-time", icon: "fa-solid fa-hourglass-half", label: "time.title", open: openTimePanel },
	{ className: "bastionland-sites", icon: "fa-solid fa-dungeon", label: "sites.title", open: openSitesPanel },
	{ className: "bastionland-myths", icon: "fa-solid fa-dragon", label: "myths.title", open: openMythsPanel }
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

	// Remembers the one-time setup each world has had.
	registerWorldSetup();

	// The world's calendar of Ages, Seasons, Days and Phases.
	registerCalendarSetting();

	// The Omens of the City the Company has encountered.
	registerCityQuestSetting();

	// Attack cards take Deny and Gambits after the roll, then apply the Damage.
	registerAttackCards();

	// Damage cards and group prompts roll Wavering Morale.
	registerMoraleCards();

	// Duel cards resolve both duelists' Attacks together, and settle Glory staked on them.
	registerDuelCards();

	// A Warband's leader stops sharing its Damage when their next turn starts.
	registerLeadingHooks();

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
		openSitesPanel,
		openMythsPanel,
		rollCityOmen,
		awardGlory,
		getCalendar
	});
});

// Tokens keep facing the same way when moved around the map, unless the GM turns
// Token Automatic Rotation back on. Core registers the setting after init.
Hooks.once("setup", () => {
	const autoRotate = game.settings.settings.get("core.tokenAutoRotate");
	if (autoRotate) autoRotate.default = false;
});

// Roll Surprise sits in the Combat Tracker's encounter menu.
Hooks.on("getCombatContextOptions", addSurpriseOption);

/** One-time work for each world, run in this order by the active GM. */
const WORLD_SETUP = Object.freeze([
	{ key: GOODS_FOLDERS_STEP, run: seedGoodsFolders }
]);

Hooks.once("ready", async () => {
	await Promise.all([
		restoreOpenSheets(),
		ensureImportMacro(),
		runWorldSetup(WORLD_SETUP)
	]);
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
