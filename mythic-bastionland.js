import { getCalendar, registerCalendarSetting } from "./module/actions/calendar.js";
import { registerCityQuestSetting, rollCityOmen } from "./module/actions/city-quest.js";
import { awardGlory } from "./module/actions/glory.js";
import { assignGmToolkit, ensureGmToolkit, GM_TOOLKIT_TYPE, openGmToolkit, registerGmToolkitHooks } from "./module/actions/gm-toolkit.js";
import { GOODS_PICTURES_STEP, pictureExistingGoods, registerGoodsPictures } from "./module/actions/goods-icons.js";
import { registerJourneyHooks } from "./module/actions/journey.js";
import { fileWaitingKnights, registerKnightFolderHooks } from "./module/actions/knight-folders.js";
import { registerLedgerHooks } from "./module/actions/ledger.js";
import { addNewRealmButton, keepRealmLooks, moveRealmPictures, newRealm, registerRealmSettings, stepRealmHistory } from "./module/actions/realm.js";
import { openRefereeRolls, rollRefereeTable } from "./module/actions/referee-rolls.js";
import { registerScopeSetting } from "./module/actions/scope.js";
import { SITE_MACRO_STEP, ensureSiteHotbar, seedSiteMacro } from "./module/actions/site-macro.js";
import { pickWeather, registerWeatherHooks, registerWeatherSetting } from "./module/actions/weather.js";
import { addNewSiteButton, newSite } from "./module/actions/sites.js";
import { watchCompanySize } from "./module/actions/squires.js";
import { registerSteedNames } from "./module/actions/steeds.js";
import { COMPANION_NAMES_STEP, KNIGHT_PROPERTY_STEP, dropOwnerFromCompanionNames, retypeKnightProperty } from "./module/actions/property.js";
import { STRUCTURE_ACTORS_STEP, convertStructureNpcs } from "./module/actions/structures.js";
import { addSurpriseOption, rollSurprise } from "./module/actions/surprise.js";
import { TEST_WORLD_MACRO_STEP, seedTestWorldMacro, syncTestWorldMacro, populateTestWorld } from "./module/actions/test-world-macro.js";
import { TOOLKIT_MACRO_STEP, ensureToolkitHotbar, seedToolkitMacro } from "./module/actions/toolkit-macro.js";
import { wildernessRoll } from "./module/actions/wilderness.js";
import { registerCompanyButton } from "./module/apps/CompanyButton.js";
import { openKnightChooser } from "./module/apps/KnightChooser.js";
import { openRealmAppearance, registerRealmAppearanceMenu } from "./module/apps/RealmAppearance.js";
import { registerDropdowns } from "./module/apps/dropdown.js";
import { installShieldClips } from "./module/apps/shield-clips.js";
import { SiteSheet } from "./module/apps/SiteSheet.js";
import { openSparkTables } from "./module/apps/SparkTables.js";
import { openTimePanel } from "./module/apps/TimePanel.js";
import { registerTravelRulesSetting } from "./module/apps/TravelRules.js";
import { WELCOME_STEP, greetGM, openWelcome, registerWelcome, welcomeOnlyNewWorlds, welcomesThisWorld } from "./module/apps/Welcome.js";
import { addDirectoryButton } from "./module/apps/ui.js";
import { GOODS_FOLDERS_STEP, seedGoodsFolders } from "./module/book-art/goods-folders.js";
import { NPC_PACK_STEP, openNpcPack, seedNpcPack } from "./module/book-art/npc-pack.js";
import { importBookArt } from "./module/book-art/importer.js";
import { squareKnightTokens } from "./module/book-art/square-tokens.js";
import { ensureImportHotbar, ensureImportMacro, registerBookArtSettings } from "./module/book-art/macro.js";
import { BastionlandToken, registerTokenHeraldryHooks } from "./module/canvas/BastionlandToken.js";
import { RealmLayer } from "./module/canvas/RealmLayer.js";
import { registerHexLoreSettings } from "./module/actions/hex-lore.js";
import { openHexLore } from "./module/apps/HexLore.js";
import { registerRealmHooks } from "./module/canvas/realm-hooks.js";
import { registerAttackFx } from "./module/actions/attack-fx.js";
import { registerAttackMemory } from "./module/actions/attack-memory.js";
import { registerAttackCards } from "./module/chat/attack-card.js";
import { registerGambitMarks } from "./module/chat/gambit-marks.js";
import { t } from "./module/chat/cards.js";
import { registerMoraleCards } from "./module/chat/morale-card.js";
import { WELCOME_CARDS_STEP, postWelcomeCards, registerWelcomeCards } from "./module/chat/welcome-cards.js";
import { registerCompanyLostCard } from "./module/chat/company-lost.js";
import { registerExplorationCards } from "./module/chat/exploration-card.js";
import { registerFallenCards } from "./module/chat/fallen-card.js";
import { registerLandmarkCards } from "./module/chat/landmark-card.js";
import { registerLandmarkSettings } from "./module/actions/landmarks.js";
import { registerDuelCards } from "./module/chat/duel-card.js";
import { registerLeadingHooks } from "./module/actions/leading.js";
import { DomainModel } from "./module/data-models/DomainModel.js";
import { GmToolkitModel } from "./module/data-models/GmToolkitModel.js";
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
import { registerClientSettings } from "./module/client-settings.js";
import { registerFonts } from "./module/fonts.js";
import { BastionlandItemSheet } from "./module/sheets/BastionlandItemSheet.js";
import { DomainSheet } from "./module/sheets/DomainSheet.js";
import { GmToolkitSheet } from "./module/sheets/GmToolkitSheet.js";
import { KnightSheet } from "./module/sheets/KnightSheet.js";
import { NpcSheet } from "./module/sheets/NpcSheet.js";
import { registerSettingsTabHooks } from "./module/sheets/settings-tab.js";
import { StructureSheet } from "./module/sheets/StructureSheet.js";
import { registerRestorableWindow, registerSheetRestore, restoreOpenSheets } from "./module/sheets/restore-open-sheets.js";
import { openRulebook, reopenableReader, toggleRulebook } from "./module/rulebook/BookReader.js";
import { bringInRulebook } from "./module/rulebook/bring-in.js";
import { RULEBOOK_MACRO_STEP, ensureRulebookHotbar, seedRulebookMacro } from "./module/rulebook/macro.js";
import { LUCK_MACRO_STEP, ensureLuckHotbar, seedLuckMacro } from "./module/actions/luck-macro.js";
import { ensureHotbarOrder } from "./module/actions/hotbar-order.js";
import { openRulebookSetup } from "./module/rulebook/RulebookSetup.js";
import { registerPageLinks } from "./module/rulebook/page-links.js";
import { registerKeywordTips } from "./module/rulebook/keyword-tips.js";
import { registerRulebookShare } from "./module/rulebook/share.js";
import { FIND_RULEBOOK_STEP, RULEBOOK_HOOK, canKeepRulebook, canReadRulebook, findKeptRulebook, hasRulebook, registerRulebookSettings } from "./module/rulebook/store.js";
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
	{ className: "bastionland-gm-toolkit", icon: "fa-solid fa-book-open-reader", label: "gmToolkit.name", open: openGmToolkit }
];

Hooks.once("init", () => {
	CONFIG.Actor.dataModels.knight = KnightModel;
	CONFIG.Actor.dataModels.npc = NpcModel;
	CONFIG.Actor.dataModels.domain = DomainModel;
	CONFIG.Actor.dataModels.structure = StructureModel;
	CONFIG.Actor.dataModels[GM_TOOLKIT_TYPE] = GmToolkitModel;
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
	DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, GmToolkitSheet, {
		types: [GM_TOOLKIT_TYPE],
		makeDefault: true,
		label: "bastionland.gmToolkit.name"
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
		"bastionland.chronicle-tab": templatePath("actor/parts/chronicle-tab.hbs"),
		"bastionland.recovery-list": templatePath("actor/parts/recovery-list.hbs"),
		"bastionland.age-choices": templatePath("actor/parts/age-choices.hbs"),
		"bastionland.gambit-list": templatePath("actor/parts/gambit-list.hbs"),
		"bastionland.scar-list": templatePath("actor/parts/scar-list.hbs"),
		"bastionland.steed-block": templatePath("actor/parts/steed-block.hbs"),
		"bastionland.book-table-line": templatePath("actor/parts/book-table-line.hbs"),
		"bastionland.table-sentence": templatePath("actor/parts/table-sentence.hbs"),
		"bastionland.realm-tally": templatePath("apps/parts/realm-tally.hbs"),
		"bastionland.realm-count": templatePath("apps/parts/realm-count.hbs"),
		"bastionland.season-events": templatePath("apps/parts/season-events.hbs"),
		"bastionland.off-course": templatePath("apps/parts/off-course.hbs"),
		"bastionland.gm-toolkit-hex": templatePath("actor/gm-toolkit/hex-card.hbs"),
		"bastionland.gm-toolkit-cast": templatePath("actor/gm-toolkit/cast.hbs"),
		"bastionland.gm-toolkit-cast-actor": templatePath("actor/gm-toolkit/cast-actor.hbs"),
		"bastionland.company-picture": templatePath("dialogs/parts/company-picture.hbs"),
		"bastionland.save-result": templatePath("chat/parts/save-result.hbs"),
		"bastionland.settings-tab": templatePath("actor/parts/settings-tab.hbs")
	});

	// The sheets' faces, offered by Foundry's font menus as well as the stylesheet.
	registerFonts();

	// Each person's own Text Size, Contrast, Typeface and the like, applied before
	// any window is drawn, and the Settings page on Knight sheets and the GM Toolkit.
	registerClientSettings();
	registerSettingsTabHooks();

	registerBookArtSettings();

	// Remembers the one-time setup each world has had.
	registerWorldSetup();

	// The world's calendar of Ages, Seasons, Days and Phases.
	registerCalendarSetting();

	// The Scope the group settled on, and the plan a Chronicle keeps (p6).
	registerScopeSetting();

	// The blight a Curse leaves: the next travelling Phase counts as travelling blind.
	registerLandmarkSettings();

	// The weather, for a table with FXMaster to draw it; it follows the active Scene.
	registerWeatherSetting();
	registerWeatherHooks();

	// The Omens of the City the Company has encountered.
	registerCityQuestSetting();

	// Attack cards take Deny and Gambits after the roll, then apply the Damage.
	registerAttackCards();
	registerGambitMarks();

	// Attacks drawn on the map and heard at the table, for a world with Sequencer,
	// JB2A and the SoundFx Library.
	registerAttackFx();

	// The Attack dialog opens on the choices last rolled with for that actor.
	registerAttackMemory();

	// Damage cards and group prompts roll Wavering Morale.
	registerMoraleCards();

	// A Wilderness card offers what the Landmark it found asks of the Company.
	registerLandmarkCards();
	registerExplorationCards();
	registerFallenCards();

	// Duel cards resolve both duelists' Attacks together, and settle Glory staked on them.
	registerDuelCards();

	// A Warband's leader stops sharing its Damage when their next turn starts.
	registerLeadingHooks();

	// Each Knight's Ledger of the changes made to them.
	registerLedgerHooks();

	// Each Knight gets a folder of their own in the Company's, where their steed and Squire are kept.
	registerKnightFolderHooks();

	// Sheets left open come back where they were after a reload.
	registerSheetRestore();

	// The outline the sheet and the heraldry painter clip the shield to.
	installShieldClips();

	// Every dropdown in the system's windows drops a list drawn on the parchment
	// rather than the browser's own.
	registerDropdowns();

	// The GM's own copy of the rulebook, read in Foundry's PDF viewer, with a
	// hotkey, Show Players, and the book reopening after a reload.
	registerRulebookSettings();
	registerRestorableWindow("rulebook", "BookReader", reopenableReader);
	registerRulebookShare();
	// Every "(p16)" in a window or chat card opens the book at that page.
	registerPageLinks();
	// Hovering a rule word, such as Exposed or Hefty, says what it means.
	registerKeywordTips();
	game.keybindings.register(SYSTEM_ID, "openRulebook", {
		name: "bastionland.rulebook.keybinding.name",
		hint: "bastionland.rulebook.keybinding.hint",
		editable: [{ key: "KeyB" }],
		onDown: () => toggleRulebook()
	});

	// Realm Scenes: the GM's Realm tools, Barriers that stop Tokens, and the hex readout.
	CONFIG.Canvas.layers.realm = { layerClass: RealmLayer, group: "interface" };
	registerRealmHooks();
	CONFIG.Token.objectClass = BastionlandToken;
	registerTokenHeraldryHooks();
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

	// The GM Toolkit: one per world, each GM's character so C opens it, and where the Company has been on each Realm.
	registerGmToolkitHooks();
	registerJourneyHooks();

	// Weapons, armour, gear, beasts and structures get a picture their name calls for.
	registerGoodsPictures();

	// A steed renamed by its Knight keeps what the book called it under the name.
	registerSteedNames();

	// The window a new world greets its GM with, offering to bring in the rulebook PDF.
	registerWelcome();

	// And the chat cards waiting beside it, to import the PDF and create a Realm.
	registerWelcomeCards();

	// A Company Token deleted by mistake: the GMs are whispered a way to put it back.
	registerCompanyLostCard();

	// And a Realm with no Company on it at all offers the Referee one over the map.
	registerCompanyButton();

	// Macros reach the system through here, such as Import PDF.
	game.system.api = Object.freeze({
		bringInRulebook,
		// Only the art and tables, for macros written before Import PDF kept a copy to read as well.
		importBookArt,
		openKnightChooser,
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
		openGmToolkit,
		// The Myths window became the GM Toolkit's first page; macros that open it still work.
		openMythsPanel: () => openGmToolkit("myths"),
		// The NPC chooser gave way to the NPCs compendium; macros that open it open that instead.
		openNpcChooser: openNpcPack,
		rollCityOmen,
		awardGlory,
		getCalendar,
		pickWeather,
		openRulebook,
		openRulebookSetup,
		toggleRulebook,
		openWelcome,
		// The (TEST ONLY) Populate World macro, which can't import populate.js by path under the release bundle.
		populateTestWorld
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
	// First, so it sees whether any other step has been done here before.
	{ key: WELCOME_STEP, run: welcomeOnlyNewWorlds },
	// A new world takes up the book another world kept, before the cards ask for one.
	{ key: FIND_RULEBOOK_STEP, run: () => findKeptRulebook(welcomesThisWorld) },
	// Right after it, so only a world it still greets is posted them.
	{ key: WELCOME_CARDS_STEP, run: () => postWelcomeCards(welcomesThisWorld) },
	{ key: RULEBOOK_MACRO_STEP, run: seedRulebookMacro },
	{ key: LUCK_MACRO_STEP, run: seedLuckMacro },
	{ key: SITE_MACRO_STEP, run: seedSiteMacro },
	{ key: TOOLKIT_MACRO_STEP, run: seedToolkitMacro },
	// In the Macro Directory only, never on a hotbar.
	{ key: TEST_WORLD_MACRO_STEP, run: seedTestWorldMacro },
	{ key: GOODS_FOLDERS_STEP, run: seedGoodsFolders },
	// Worlds that imported the book before there was an NPCs compendium. Import PDF fills it itself,
	// and either way it takes in the Seers compendium there used to be.
	{ key: NPC_PACK_STEP, run: seedNpcPack },
	{ key: STRUCTURE_ACTORS_STEP, run: convertStructureNpcs },
	// Knights made before their Property was read into weapons and armour.
	{ key: KNIGHT_PROPERTY_STEP, run: retypeKnightProperty },
	// After it, so the companions it makes are named as the rest: their own sheet says whose they are.
	{ key: COMPANION_NAMES_STEP, run: dropOwnerFromCompanionNames },
	// After it, so the older steeds it finds are drawn the same as the new.
	{ key: GOODS_PICTURES_STEP, run: pictureExistingGoods },
	{ key: "realmSheetPictures", run: moveRealmPictures },
	{ key: "realmLookPerScene", run: keepRealmLooks },
	// Again, once each Scene has its own look: for terrain pictures named by terrain rather than
	// number, and for Scenes drawn when a river through a Valley had a picture of its own, now that
	// it is the river laid over the Valley's own picture. One pass redraws a Scene for both.
	{ key: "realmValleyRivers", run: moveRealmPictures }
]);

Hooks.once("ready", async () => {
	// Nothing else waits on this.
	squareKnightTokens();
	// Only small Companies may keep Squires: the GMs hear when the Company grows past that.
	watchCompanySize();
	// Knights made while no GM was on get their folders now.
	fileWaitingKnights();
	const setup = runWorldSetup(WORLD_SETUP);
	await Promise.all([
		restoreOpenSheets(),
		// Import PDF takes the hotbar's last slot once every other macro has its own,
		// then the GM Toolkit (a player's Luck Roll) is put in the first.
		Promise.all([ensureImportMacro(), setup.then(ensureToolkitHotbar).then(ensureRulebookHotbar).then(ensureLuckHotbar).then(ensureSiteHotbar)])
			.then(ensureImportHotbar)
			.then(ensureHotbarOrder),
		setup.then(syncTestWorldMacro),
		// Once world setup has decided whether this world is new, which it does by its having no Actors.
		// Every GM, not only the one who made it, is then given it as their character.
		setup.then(ensureGmToolkit).then(assignGmToolkit)
	]);
	// A new world's GM is welcomed last, on top of any sheets that came back.
	greetGM();
});

/**
 * The Domain button on a Knight's sheet reads that Domain's name, so it
 * follows the Domain being renamed or deleted.
 * @param {Actor} actor
 */
const refreshDomainButtons = (actor) => {
	if (actor.type !== "domain") return;
	for (const app of foundry.applications.instances.values()) {
		if (app instanceof KnightSheet && app.actor.system.domain === actor.uuid) app.refreshHeaderButtons();
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
