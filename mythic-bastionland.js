import { getCalendar, registerCalendarSetting } from "./module/actions/calendar.js";
import { registerCityQuestSetting, rollCityOmen } from "./module/actions/city-quest.js";
import { awardGlory } from "./module/actions/glory.js";
import { openMythsPanel } from "./module/apps/MythsPanel.js";
import { addNewRealmButton, keepRealmLooks, moveRealmPictures, newRealm, registerRealmSettings, stepRealmHistory } from "./module/actions/realm.js";
import { openRefereeRolls, rollRefereeTable } from "./module/actions/referee-rolls.js";
import { SITE_MACRO_STEP, ensureSiteHotbar, seedSiteMacro } from "./module/actions/site-macro.js";
import { addNewSiteButton, newSite } from "./module/actions/sites.js";
import { STRUCTURE_ACTORS_STEP, convertStructureNpcs } from "./module/actions/structures.js";
import { addSurpriseOption, rollSurprise } from "./module/actions/surprise.js";
import { wildernessRoll } from "./module/actions/wilderness.js";
import { openKnightChooser } from "./module/apps/KnightChooser.js";
import { openNpcChooser } from "./module/apps/NpcChooser.js";
import { openRealmAppearance, registerRealmAppearanceMenu } from "./module/apps/RealmAppearance.js";
import { installShieldClips } from "./module/apps/shield-clips.js";
import { SiteSheet } from "./module/apps/SiteSheet.js";
import { openSparkTables } from "./module/apps/SparkTables.js";
import { openTimePanel } from "./module/apps/TimePanel.js";
import { registerTravelRulesSetting } from "./module/apps/TravelRules.js";
import { addDirectoryButton } from "./module/apps/ui.js";
import { GOODS_FOLDERS_STEP, seedGoodsFolders } from "./module/book-art/goods-folders.js";
import { importBookArt } from "./module/book-art/importer.js";
import { ensureImportHotbar, ensureImportMacro, registerBookArtSettings } from "./module/book-art/macro.js";
import { RealmLayer } from "./module/canvas/RealmLayer.js";
import { registerHexLoreSettings } from "./module/actions/hex-lore.js";
import { openHexLore } from "./module/apps/HexLore.js";
import { registerRealmHooks } from "./module/canvas/realm-hooks.js";
import { registerAttackCards } from "./module/chat/attack-card.js";
import { t } from "./module/chat/cards.js";
import { registerMoraleCards } from "./module/chat/morale-card.js";
import { registerDuelCards } from "./module/chat/duel-card.js";
import { registerLeadingHooks } from "./module/actions/leading.js";
import { DomainModel } from "./module/data-models/DomainModel.js";
import { KnightModel } from "./module/data-models/KnightModel.js";
import { NpcModel } from "./module/data-models/NpcModel.js";
import { StructureModel } from "./module/data-models/StructureModel.js";
import {
	AbilityModel,
	ArmourModel,
	GearModel,
	PassionModel,
	ScarModel,
	WeaponModel
} from "./module/data-models/items.js";
import { registerFonts } from "./module/fonts.js";
import { BastionlandItemSheet } from "./module/sheets/BastionlandItemSheet.js";
import { DomainSheet } from "./module/sheets/DomainSheet.js";
import { KnightSheet } from "./module/sheets/KnightSheet.js";
import { NpcSheet } from "./module/sheets/NpcSheet.js";
import { StructureSheet } from "./module/sheets/StructureSheet.js";
import { registerRestorableWindow, registerSheetRestore, restoreOpenSheets } from "./module/sheets/restore-open-sheets.js";
import { openRulebook, reopenableReader, toggleRulebook } from "./module/rulebook/BookReader.js";
import { RULEBOOK_MACRO_STEP, ensureRulebookHotbar, seedRulebookMacro } from "./module/rulebook/macro.js";
import { LUCK_MACRO_STEP, ensureLuckHotbar, seedLuckMacro } from "./module/actions/luck-macro.js";
import { openRulebookSetup } from "./module/rulebook/RulebookSetup.js";
import { registerRulebookShare } from "./module/rulebook/share.js";
import { RULEBOOK_HOOK, canKeepRulebook, canReadRulebook, hasRulebook, registerRulebookSettings } from "./module/rulebook/store.js";
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
	{ className: "bastionland-sites", icon: "fa-solid fa-dungeon", label: "sites.newSite", open: newSite },
	{ className: "bastionland-myths", icon: "fa-solid fa-dragon", label: "myths.title", open: openMythsPanel }
];

Hooks.once("init", () => {
	CONFIG.Actor.dataModels.knight = KnightModel;
	CONFIG.Actor.dataModels.npc = NpcModel;
	CONFIG.Actor.dataModels.domain = DomainModel;
	CONFIG.Actor.dataModels.structure = StructureModel;
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
	DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, StructureSheet, {
		types: ["structure"],
		makeDefault: true,
		label: "bastionland.sheet.title"
	});
	// A Site's Journal entry names this sheet in its flags, so it opens on its map. Other entries never do.
	DocumentSheetConfig.registerSheet(foundry.documents.JournalEntry, SYSTEM_ID, SiteSheet, {
		makeDefault: false,
		canBeDefault: false,
		label: "bastionland.sites.sheet"
	});

	// Partials shared by the Knight, NPC and Structure sheets, and used inside chat cards,
	// which render outside any sheet.
	foundry.applications.handlebars.loadTemplates({
		"bastionland.item-row": templatePath("actor/parts/item-row.hbs"),
		"bastionland.add-item": templatePath("actor/parts/add-item.hbs"),
		"bastionland.virtue-scores": templatePath("actor/parts/virtue-scores.hbs"),
		"bastionland.npc-header": templatePath("actor/parts/npc-header.hbs"),
		"bastionland.condition-items": templatePath("actor/parts/condition-items.hbs"),
		"bastionland.feat-list": templatePath("actor/parts/feat-list.hbs"),
		"bastionland.save-result": templatePath("chat/parts/save-result.hbs")
	});

	// The sheets' faces, offered by Foundry's font menus as well as the stylesheet.
	registerFonts();

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

	// The outline the sheet and the heraldry painter clip the shield to.
	installShieldClips();

	// The GM's own copy of the rulebook, read in Foundry's PDF viewer, with a
	// hotkey, Show Players, and the book reopening after a reload.
	registerRulebookSettings();
	registerRestorableWindow("rulebook", "BookReader", reopenableReader);
	registerRulebookShare();
	game.keybindings.register(SYSTEM_ID, "openRulebook", {
		name: "bastionland.rulebook.keybinding.name",
		hint: "bastionland.rulebook.keybinding.hint",
		editable: [{ key: "KeyB" }],
		onDown: () => toggleRulebook()
	});

	// Realm Scenes: the GM's Realm tools, Barriers that stop Tokens, and the hex readout.
	CONFIG.Canvas.layers.realm = { layerClass: RealmLayer, group: "interface" };
	registerRealmHooks();
	// Foundry's own Undo key reaches the Realm layer; Redo has no key of Foundry's.
	game.keybindings.register(SYSTEM_ID, "redoRealm", {
		name: "bastionland.realm.keybinding.redo.name",
		hint: "bastionland.realm.keybinding.redo.hint",
		editable: [
			{ key: "KeyY", modifiers: ["Control"] },
			{ key: "KeyZ", modifiers: ["Control", "Shift"] }
		],
		restricted: true,
		onDown: () => {
			if (!canvas.ready || canvas.activeLayer !== canvas.realm) return false;
			stepRealmHistory(canvas.scene, "redo");
			return true;
		}
	});

	// How Realm Scenes are drawn: a skin, a set of colours, and the GM's own pictures.
	registerRealmSettings();
	registerRealmAppearanceMenu();

	// What the GM has written about each hex of a Realm, and how a hex with
	// nothing written down is offered to them.
	registerHexLoreSettings();

	// Travel and Exploration beside Realm Scenes, folded or open as each browser left it.
	registerTravelRulesSetting();

	// Macros reach the system through here, such as Import Book Art.
	game.system.api = Object.freeze({
		importBookArt,
		openKnightChooser,
		openNpcChooser,
		newRealm,
		openRealmAppearance,
		wildernessRoll,
		rollSurprise,
		openRefereeRolls,
		rollRefereeTable,
		rollLuck: () => rollRefereeTable("luck"),
		openSparkTables,
		openHexLore,
		openTimePanel,
		newSite,
		openMythsPanel,
		rollCityOmen,
		awardGlory,
		getCalendar,
		openRulebook,
		openRulebookSetup,
		toggleRulebook
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
	{ key: RULEBOOK_MACRO_STEP, run: seedRulebookMacro },
	{ key: LUCK_MACRO_STEP, run: seedLuckMacro },
	{ key: SITE_MACRO_STEP, run: seedSiteMacro },
	{ key: GOODS_FOLDERS_STEP, run: seedGoodsFolders },
	{ key: STRUCTURE_ACTORS_STEP, run: convertStructureNpcs },
	{ key: "realmSheetPictures", run: moveRealmPictures },
	{ key: "realmLookPerScene", run: keepRealmLooks }
]);

Hooks.once("ready", async () => {
	const setup = runWorldSetup(WORLD_SETUP);
	await Promise.all([
		restoreOpenSheets(),
		// Import Book Art takes the hotbar's last slot once every other macro has its own.
		Promise.all([ensureImportMacro(), setup.then(ensureRulebookHotbar).then(ensureLuckHotbar).then(ensureSiteHotbar)]).then(ensureImportHotbar),
	]);
});

/**
 * The Domain button on a Knight's sheet reads that Domain's name, so it
 * follows the Domain being renamed or deleted.
 * @param {Actor} actor
 */
const refreshDomainButtons = (actor) => {
	if (actor.type !== "domain") return;
	for (const app of foundry.applications.instances.values()) {
		if (app instanceof KnightSheet && app.actor.system.domain === actor.uuid) app.refreshDomainButton();
	}
};
Hooks.on("updateActor", refreshDomainButtons);
Hooks.on("deleteActor", refreshDomainButtons);

// New Site sits in the Journal directory for GMs, and the rulebook for GMs and
// for players the GM offers it to.
Hooks.on("renderJournalDirectory", (_directory, element) => {
	addNewSiteButton(element);
	const canSetUp = canKeepRulebook() && !hasRulebook();
	if (!canSetUp && !(hasRulebook() && canReadRulebook())) return;
	addDirectoryButton(element, {
		className: "bastionland-rulebook",
		icon: "fa-solid fa-book",
		label: t("rulebook.open"),
		onClick: () => openRulebook() ?? openRulebookSetup()
	});
});

// Redrawn so the button follows the book being set, forgotten, or offered to players.
Hooks.on(RULEBOOK_HOOK, () => ui.journal?.render());

Hooks.on("renderSceneDirectory", (_directory, element) => addNewRealmButton(element));

Hooks.on("renderRollTableDirectory", (_directory, element) => {
	if (!game.user.isGM) return;
	for (const { label, open, ...button } of REFEREE_TOOLS) addDirectoryButton(element, { ...button, label: t(label), onClick: () => open() });
});
