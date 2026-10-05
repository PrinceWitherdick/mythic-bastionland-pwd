/**
 * The "(TEST ONLY) Populate World" macro: a fake game of Mythic Bastionland,
 * five Seasons in, for seeing what the sheets, the GM Toolkit and a Realm look
 * like once a campaign has been going a while. The world's calendar is moved
 * on a Phase at a time as the Company travels, so the Journey, the Spark
 * rolls, the Scars and the Season log carry the dates they would have had in
 * play, and the Seasons turn through the system's own Season turn.
 *
 * Nothing loads this in play. The macro imports it, so its imports here are
 * the very modules the system is running. Running the macro again removes
 * everything it made and puts the calendar and the GM Toolkit back.
 *
 * Its words are the fake game's own, written here in English: it's a tool for
 * testing, so nothing here goes in the language file. Names and text from the
 * rulebook are read from the GM's own import at run time, and never kept here.
 */
import { calendarLabel, getCalendar, setCalendar } from "../actions/calendar.js";
import { rollCityOmen } from "../actions/city-quest.js";
import { setCompanyHex } from "../actions/company.js";
import { settleTask } from "../actions/council-tasks.js";
import { linkKnightDomain, settleDomains, worldDomains } from "../actions/dominion.js";
import { adjustGlory } from "../actions/glory.js";
import { openGmToolkit, rollFreeMyth, theGmToolkit } from "../actions/gm-toolkit.js";
import { keepTableRoll, rollHexSparkSet, tellPlayersAboutHex, writeHexNote } from "../actions/hex-lore.js";
import { keepPartyNote, recordBarriersMet } from "../actions/hex-shared.js";
import { recordHexVisits } from "../actions/journey.js";
import { fillKnightFromBook, rollKnightTable } from "../actions/knight-tables.js";
import { echoRuin } from "../actions/landmarks.js";
import { castKey } from "../actions/myth-cast.js";
import { editMythNote } from "../actions/myth-notes.js";
import { actorData } from "../actions/npc.js";
import { createRealmScene, editRealm, getRealm, sceneGeometry } from "../actions/realm.js";
import { rollRefereeTable, rollSpark } from "../actions/referee-rolls.js";
import { collectionEntry, markCollection, markSeasonEvent } from "../actions/season-events.js";
import { recordMythCompleted, recordSeasonTurn, writeSeasonNotes } from "../actions/season-log.js";
import { endTheSession } from "../actions/session-end.js";
import { deleteHexJournals } from "../actions/hex-journals.js";
import { SITE_JOURNALS_SETTING, deleteSiteJournals, keepSiteJournal } from "../actions/site-journals.js";
import { writeSightings } from "../actions/sighted.js";
import { SITE_FLAG, SITE_SHEET_CLASS } from "../actions/sites.js";
import { announcePhase, announceSeason, hardshipFor, passTime, rollAging } from "../actions/time.js";
import { MUSTERED_FLAG, ORIGIN_FLAG, wearWarbandDown } from "../actions/warbands.js";
import { drawWeather, setWeather } from "../actions/weather.js";
import { findByRoll, loadArtIndex, mythEntry, seerEntry } from "../book-art/art-index.js";
import { GOODS_PACKS } from "../book-art/goods-folders.js";
import { postCard, t } from "../chat/cards.js";
import { TASK_SCOPE_ICONS, newTask } from "../rules/council-tasks.js";
import { newCourtMember } from "../rules/court.js";
import { STANDARD_KIT, knightItems, knightUpdate, startFor } from "../rules/creation.js";
import { crisesDrawn, crisisFor, crisisResult } from "../rules/dominion.js";
import { hasTable } from "../rules/knight-tables.js";
import { CAST_FLAG } from "../rules/myth-cast.js";
import { SQUIRE_EQUIPMENT, SQUIRE_GUARD, SQUIRE_IMAGE, SQUIRE_VIRTUE_ROLL, ponySystem, squireEquipment, squireItems, squireSystem } from "../rules/squires.js";
import { chargePath } from "../rules/heraldry-charges.js";
import { MAX_INLINE_LENGTH, PAINTING_HEIGHT, PAINTING_WIDTH, PAINT_SCALE } from "../rules/heraldry.js";
import { OMEN_COUNT } from "../rules/realm.js";
import { editFeature, placeFeature, setBarrier, setOmen, setRevealed } from "../rules/realm-edits.js";
import { createRandom } from "../rules/random.js";
import { scarDescription, scarForRoll, scarRaisesGuardNow } from "../rules/scars.js";
import { completedMythId, crisisRollsDue } from "../rules/season-log.js";
import { hexKey } from "../rules/realm-geometry.js";
import { sightable } from "../rules/sighted.js";
import { emptySite, numberedPoints, revealEntrance, revealPoint, rollSite, SITE_EDGES } from "../rules/sites.js";
import { HARDSHIPS, PHASES, nextAge, nextSeason, seasonKey } from "../rules/time.js";
import { VIRTUES } from "../rules/virtues.js";
import { SYSTEM_ID } from "../system-id.js";
import { deletionEntry, replacementEntry } from "../compat.js";
import { barriersBeside, companionActorData, heraldrySvg, isSteed, isWilderness, pickPlaces, propertyItems, seasonRoad } from "./plan.js";

/** Marks every document the macro makes, so running it again can find and delete them. */
export const TEST_FLAG = "testWorld";

/** The GM Toolkit flag keeping the calendar, notes and Seasons as they were, to put back. */
export const BEFORE_FLAG = "testWorldBefore";

const REALM_NAME = "Gravenmoor";
const REALM_SEED = "gravenmoor";
const FOLDER_NAME = "Test World";
const FOLDER_COLOR = "#6b3a8c";

/** The Company are Courtiers: Mature Knights-Gallant who begin at Court, in the Seat of Power (p6). */
const START = "courtier";

const DOMAIN_IMAGE = "icons/environment/settlement/castle.webp";
const STRUCTURE_IMAGE = "icons/environment/settlement/fence-wooden-picket.webp";
const FERRY_IMAGE = "icons/environment/settlement/ship.webp";
const PIKE_IMAGE = "icons/creatures/fish/fish-fangtooth-skeletal-green.webp";

/**
 * The three Knights, by their roll on the Knights table (p26). Each has a
 * Property of its own for a world whose book hasn't been imported.
 */
const COMPANY = Object.freeze([
	{
		key: "isolde",
		roll: "1-01",
		name: "Dame Isolde Marrow",
		arms: { division: null, field: ["azure"], charge: { key: "sun-a", tincture: "or" } },
		fallback: {
			type: "Lantern",
			property: ["Longsword (d8 hefty), mail (A1) and helm (A1)", "Round shield (d4, A1) painted with a lantern", "Steady steed (VIG 11, CLA 8, SPI 6, 3GD)"],
			ability: { name: "Lamplight", text: "Once each night, your lantern shows the way to the nearest shelter." },
			passion: { name: "Vigil", text: "Restore SPI when you keep watch through the whole Night alone." }
		}
	},
	{
		key: "corvin",
		roll: "1-10",
		name: "Sir Corvin Ashby",
		arms: { division: null, field: ["sable"], charge: { key: "crescent-a", tincture: "argent" } },
		fallback: {
			type: "Thistle",
			property: ["Hunting bow (d6 long), gambeson (A1)", "Pouch of thistledown", "Nervous steed (VIG 9, CLA 12, SPI 5, 2GD)"],
			ability: { name: "Prickle", text: "Anyone who grapples you takes d4 Damage." },
			passion: { name: "Stubbornness", text: "Restore SPI when you refuse an order from someone of higher Rank." }
		}
	},
	{
		key: "oswin",
		roll: "4-07",
		name: "Sir Oswin Hale",
		arms: { division: "perChevron", field: ["argent", "vert"], charge: null },
		fallback: {
			type: "Anvil",
			property: ["Warhammer (d8 hefty), ringmail (A1), plate (A1)", "Smith's tools", "Heavy warhorse (VIG 14, CLA 6, SPI 4, 3GD, d6 trample)"],
			ability: { name: "Mend", text: "Given a forge and a Phase, restore a broken weapon or piece of armour." },
			passion: { name: "Craft", text: "Restore SPI when you make something worth keeping." }
		}
	}
]);

/** What the GM named each Holding, by its style, in the order they're met. */
const HOLDING_NAMES = Object.freeze({
	castle: ["Castle Ormund", "Castle Veyle", "Castle Dunmere", "Castle Ashgrove"],
	town: ["Harrowgate", "Wendlebury", "Coldharbour", "Pellsford"],
	fortress: ["Blackstair Keep", "Fort Carrow", "Grimwold Keep", "Fort Aldren"],
	tower: ["Merrow Tower", "Tower of Saint Aud", "Thornwick Tower", "Greyfell Tower"]
});

/** What the GM named each Landmark, by its type. */
const LANDMARK_NAMES = Object.freeze({
	dwelling: ["Widow Pell's Mill", "The Charcoal-burners' Camp", "Old Mother Tansy's", "The Hermit's Cot"],
	sanctum: ["The Weeping Chapel", "The Well of Whispers", "The Hollow Oak", "The Salt Shrine"],
	monument: ["The Nine Maidens", "The Headless King", "The Giant's Chair", "The Old Tollstone"],
	hazard: ["The Sucking Mire", "Gallows Ford", "The Rotten Bridge", "The Scree of Teeth"],
	curse: ["The Blighted Orchard", "The Silent Village", "The Bleeding Stones", "The Weeping Field"],
	ruin: ["The Drowned Chapel", "Oldwall", "The Broken Abbey", "Saint Brannoc's Priory"]
});

/** Who holds each seat of the Council the Domain was granted with, besides the Circle. */
const COUNCIL = Object.freeze({ steward: "Maud Fenwick", marshal: "Sir Aldous Crane", sheriff: "Tobin Rook", envoy: "Lady Wren Ashgrove" });

/** What's written in the explored Site, by the kind of point, in the order they're numbered. */
const SITE_TEXT = Object.freeze({
	feature: ["A drowned nave: the pews float, and the water is warm", "The fallen bell tower, its bell somewhere under the silt", "A font that fills with black water however often it's emptied"],
	danger: ["Pike the length of a man, hungry for anything that wades", "The crypt floor, rotten through, over a sheer drop"],
	treasure: ["The reliquary of Saint Brannoc, sealed with green wax"]
});

const ROUTE_TEXT = Object.freeze({ closed: "Flooded to the ceiling", hidden: "A priest's passage behind the rood screen" });
const ENTRANCE_TEXT = Object.freeze({ open: "The west door, half sunk in the mere", hidden: "A crack behind the altar, just wide enough" });

/** Who serves the Domain outside its Council (p20), in the order they came to Court. */
const COURT = Object.freeze([
	{ role: "retainer", name: "Piers Wendle", seat: "marshal", note: "The marshal's man. Held the gate in the battle, and wants it remembered." },
	{ role: "courtier", name: "Dame Ysolt Veyle", leverage: "Holds the old lord's debts, and the letters that prove them.", note: "Wants a seat on the Council, and says so at every supper." },
	{ role: "courtier", name: "Brother Anselm", leverage: "Heard the old lord's last confession.", note: "Keeps the chapel, and the Domain's accounts when the steward lets him." },
	{ role: "petitioner", name: "Goodwife Anne of the Mill", note: "Asks justice for a son the old lord's sheriff hanged." }
]);

/** A Warband for the Domain when the book's haven't been imported (p11). */
const LEVY = Object.freeze({ vig: 12, cla: 8, spi: 10, guard: 4, armour: 1, armourNote: "padded jacks", epithet: "Farmhands with spears, and a few with bows" });

/** The Squire Dame Isolde takes when she's granted her Domain. */
const SQUIRE_NAME = "Hugh Fenwick";

/**
 * What the GM wrote about open country the Company passed through, in the
 * order the road reaches it: whether the hex's Wilderness tables were rolled
 * (p22), another Spark Table rolled there, whether the players were told, and
 * the Company's own note on it. A `later` note is what the GM learns of the
 * place before the Season is out, told to the players then as a second
 * telling, with the Company's note rewritten to `laterParty` where there's one.
 * The last few hexes of open country are left as plain wilderness.
 */
const WAYSIDE = Object.freeze([
	{
		note: "A shepherd's bothy, empty, with the fire still warm. Whoever left, left in a hurry.", wild: true, tell: true,
		later: "The shepherd's bothy again: the shepherd turned up at the Seat's gate, half-starved. He says something came down off the hill at night and stood looking in at the door till dawn.",
		laterParty: "Bothy shepherd is alive! At the Seat's gate.\nSays something stood at his door all night. Didn't come in. Didn't leave a track.\nOswin wants to sleep there and see. Nobody else does."
	},
	{ note: "Fog in the hollow all Morning. Corvin swore he heard church bells where no church stands.", wild: true, party: "Bells in the fog?? Corvin says so. Nobody else heard them." },
	{
		note: "A ford, waist-deep, and a ferryman who wants a coin a horse and won't say who he pays.", spark: ["people", 0], tell: true, party: "Ferryman: a coin a horse. Haggle, he folds.",
		later: "The ferryman pays the steward at the Seat, a quarter of every coin. The steward keeps none of it for the Court.",
		laterParty: "Ferryman: a coin a horse. Haggle, he folds.\nHe pays the STEWARD. A quarter of everything. Tell Isolde before she tells the envoy."
	},
	{ note: "Wolves kept pace with the Company for a whole Phase, and never came closer.", wild: true, spark: ["combat", 0], tell: true, party: "Wolves followed us all Afternoon. Never closer than a bowshot. Somebody fed them once." },
	{ note: "Charcoal-burners' smoke. They'll trade, but won't talk about the woods to the north.", spark: ["people", 4], party: "Charcoal-burners trade salt for news. Don't ask about the woods." },
	{ note: "Old boundary stones, the arms on them chiselled off. The old lord's, or someone older's?", wild: true, tell: true },
	{
		note: "A gibbet at the crossroads, its tenant fresh. The sheriff's work, or a warning.", spark: ["civilisation", 3], tell: true,
		later: "The gibbet's gone, cut down and burnt where it stood. Nobody on the road will say who did it.",
		laterParty: "Gibbet at the crossroads. Cut down since. Ask the reeve, not the sheriff."
	},
	{ note: "Burnt farms, three in a row. The Famine's work, or someone's.", wild: true, party: "Burnt farms. Ask at the Domain who did this." },
	{ note: "A spring the locals call holy. The water tastes of iron.", wild: true, spark: ["nature", 4], tell: true, party: "Holy spring. Iron water: Corvin's cut closed overnight after he washed it. Fill the skins next time." },
	{ note: "Nothing here but rain and heather. The players spent the Phase arguing over the map.", wild: true, party: "Nothing here. Don't come back." },
	{
		note: "A drover's road through the heath, rutted deep. Cattle went north along it not long ago, a great many, and nobody drove them.", wild: true, spark: ["nature", 1], tell: true,
		party: "Hoofprints, hundreds, going north. No herders' prints anywhere.",
		later: "The cattle from the drover's road came back, every head, thin and quiet. The farmers won't milk them.",
		laterParty: "Cattle came back. Farmers won't touch them.\nCorvin says leave it. Isolde says it's the Myth. Oswin bought one."
	},
	{ note: "A hermit in a hollow oak, who'll pray for any Knight that brings him bread. He knew each of their names before they said them.", spark: ["people", 2], tell: true, party: "Hermit in the oak. Bring bread. He knows our names. HOW?" },
	{ note: "A milestone with the distance to the Seat cut on it, and under it in fresher letters a distance to somewhere with no name.", wild: true, spark: ["civilisation", 5], tell: true, party: "Milestone: 4 leagues to the Seat.\nAnd 12 leagues to... nothing written. Cut fresh." },
	{ note: "Hailstones the size of plums in the Morning, and the Afternoon too hot to ride in. The steeds won't settle here.", spark: ["nature", 3] }
]);

/** How often open country on the road gets written up: every this many hexes of it. */
const WAYSIDE_EVERY = 1;

/** How many of the wayside's later tellings come at each Season's end. */
const FOLLOW_UPS_A_SEASON = 2;

/** What the Company makes out of hidden things seen from afar (p197), in the order they're seen. */
const SIGHTINGS = Object.freeze(["Smoke, and a tower behind it", "Something tall and pale on the ridge", "Lights after dark"]);

/** The world settings the story changes, to put back as they were. */
const SETTINGS = Object.freeze(["weather", "cityQuest", "sessionEnd", SITE_JOURNALS_SETTING]);

/** The weather the Company is left in. */
const WEATHER_NOW = "rain";

/* -------------------------------------------- */
/*  The macro                                   */
/* -------------------------------------------- */

/** @param {ClientDocument|null|undefined} document */
const isTestDocument = (document) => document?.flags?.[SYSTEM_ID]?.[TEST_FLAG] === true;

const testFlags = () => ({ [SYSTEM_ID]: { [TEST_FLAG]: true } });

/** @returns {boolean} Whether the world holds a test world already. */
export function hasTestWorld() {
	return [game.actors, game.scenes, game.journal, game.folders, game.messages].some((collection) => collection.some(isTestDocument))
		|| Boolean(theGmToolkit()?.getFlag(SYSTEM_ID, BEFORE_FLAG));
}

/** Whether the macro is already at work, so a second click doesn't start it twice. */
let running = false;

/**
 * Make the test world, or remove it if the world has one. GMs only.
 * @returns {Promise<void>}
 */
export async function populateTestWorld() {
	if (!game.user.isGM) {
		ui.notifications.warn("Only a GM can populate or remove the test world.");
		return;
	}
	if (running) {
		ui.notifications.warn("The test world is still being built or removed.");
		return;
	}
	running = true;
	const removing = hasTestWorld();
	try {
		if (removing) {
			const confirmed = await confirm("Remove the Test World", [
				"This world holds the test world this macro made.",
				"<strong>Permanently delete</strong> its Knights, Squire, NPCs, Domain, Warband, Realm, Sites, folders and chat messages, and put the calendar, the weather, the City Quest and the GM Toolkit's notes and Seasons back as they were?"
			]);
			if (confirmed) await removeTestWorld();
			return;
		}
		const confirmed = await confirm("Populate the Test World", [
			`This adds a fake game five Seasons in: three Knights of a Company of Courtiers with their steeds, tables and a Squire; a Domain with its Council, Court, tasks and a Warband; the Realm of ${REALM_NAME} with its Journey, the GM's notes and Spark Table rolls on the places the Company has been, what the players were told, their own notes, the Barriers they ran into and what they saw from afar, its Myths, Omens and a Myth's Cast; two Sites; a year of chat with its feasts and masses; and the GM Toolkit's Seasons and notes filled in.`,
			"The world's calendar, weather and City Quest move on to where the game has got to. Run the macro again to remove it all and put them and the GM Toolkit back.",
			"It takes a minute. Leave Foundry be until it says it's done."
		]);
		if (confirmed) await buildTestWorld();
	} catch (error) {
		console.error(`${SYSTEM_ID} | The test world macro failed`, error);
		ui.notifications.error(removing
			? "Removing the test world failed part way. See the console, then run the macro again."
			: "Building the test world failed part way. See the console, then run the macro again to remove what it made.");
	} finally {
		running = false;
	}
}

/**
 * @param {string} title
 * @param {string[]} paragraphs HTML.
 * @returns {Promise<boolean>}
 */
async function confirm(title, paragraphs) {
	const answer = await foundry.applications.api.DialogV2.confirm({
		window: { title, icon: "fa-solid fa-flask" },
		classes: ["bastionland-dialog"],
		content: paragraphs.map((text) => `<p>${text}</p>`).join(""),
		rejectClose: false
	});
	return answer === true;
}

/**
 * Tag each chat message this browser posts while the test world is built, so
 * removing it finds them, and keep the dice quiet.
 * @param {ChatMessage} message
 * @param {object} _data
 * @param {object} _options
 * @param {string} userId
 */
function tagMessage(message, _data, _options, userId) {
	if (userId !== game.user.id) return;
	message.updateSource({ sound: null, flags: testFlags() });
}

/** Delete everything the macro made, and put back what it changed. */
async function removeTestWorld() {
	const remove = async (documentName, collection) => {
		const ids = collection.filter(isTestDocument).map((document) => document.id);
		if (ids.length) await foundry.utils.getDocumentClass(documentName).deleteDocuments(ids);
		return ids.length;
	};
	const messages = await remove("ChatMessage", game.messages);
	// The Realm's hex entries are made by the system, not the macro, so they go by the Realm they're for.
	await deleteHexJournals(game.scenes.filter(isTestDocument).map((scene) => scene.id));
	// So are its Sites' journals, which go by the Site.
	await deleteSiteJournals(game.journal.filter(isTestDocument).map((entry) => entry.id));
	const scenes = await remove("Scene", game.scenes);
	const actors = await remove("Actor", game.actors);
	const entries = await remove("JournalEntry", game.journal);
	await remove("Folder", game.folders);

	const toolkit = theGmToolkit();
	const before = toolkit?.getFlag(SYSTEM_ID, BEFORE_FLAG);
	if (before) {
		await setCalendar(before.calendar);
		// A test world made before the settings were kept leaves them as they are.
		for (const [key, value] of Object.entries(before.settings ?? {})) await game.settings.set(SYSTEM_ID, key, value);
		if (before.settings) await drawWeather();
		await toolkit.update(Object.fromEntries([
			["system.notes", before.notes ?? ""],
			replacementEntry("system.seasons", before.seasons ?? {}),
			deletionEntry(`flags.${SYSTEM_ID}.${BEFORE_FLAG}`)
		]));
	}
	if (!canvas.scene && game.scenes.active) await game.scenes.active.view();
	ui.notifications.info(`Removed the test world: ${actors} actors, ${scenes} Realm, ${entries} Sites and ${messages} chat messages.${before ? " The calendar, the weather, the City Quest and the GM Toolkit are as they were." : ""}`);
}

/** Build the test world, keeping what it changes so removing it can put that back. */
async function buildTestWorld() {
	if (!theGmToolkit()) await openGmToolkit();
	const toolkit = theGmToolkit();
	if (!toolkit) {
		ui.notifications.warn("The world has no GM Toolkit yet. Relaunch the world, then run the macro again.");
		return;
	}
	ui.notifications.info("Building the test world. Leave Foundry be until it says it's done.");
	await toolkit.update({
		[`flags.${SYSTEM_ID}.${BEFORE_FLAG}`]: {
			calendar: getCalendar(),
			notes: toolkit.system.notes,
			seasons: foundry.utils.deepClone(toolkit.system.seasons ?? {}),
			settings: Object.fromEntries(SETTINGS.map((key) => [key, foundry.utils.deepClone(game.settings.get(SYSTEM_ID, key))]))
		}
	});
	// So its Sites get their Journal entries, whatever this world had chosen. Removing it puts the setting back.
	await game.settings.set(SYSTEM_ID, SITE_JOURNALS_SETTING, true);

	const hook = Hooks.on("preCreateChatMessage", tagMessage);
	try {
		const story = new TestGame(await loadArtIndex(), toolkit);
		await story.play();
	} finally {
		Hooks.off("preCreateChatMessage", hook);
	}
	ui.notifications.info(`The test world is ready: the Company of ${REALM_NAME}, Harvest of Age 2. Run the macro again to remove it.`);
	await toolkit.sheet.render({ force: true, tab: "places" });
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * Roll until the dice land as wanted, for a result the story needs, such as
 * the Scar a Knight took. Nothing is posted until the roll that's kept.
 * @param {string} formula
 * @param {(total: number) => boolean} wanted
 * @returns {Promise<Roll>}
 */
async function rollUntil(formula, wanted) {
	for (let tries = 0; tries < 500; tries++) {
		const roll = await new Roll(formula).evaluate();
		if (wanted(roll.total)) return roll;
	}
	throw new Error(`${formula} never rolled what was wanted`);
}

/**
 * Paint a Knight's arms the way the heraldry painter keeps them when it
 * can't upload: a WebP data URL of the whole painting.
 * @param {object} arms As COMPANY gives them.
 * @returns {Promise<string>} The data URL, or "" when it couldn't be painted.
 */
async function paintArms({ division, field, charge }) {
	try {
		const bearing = charge
			? { svg: await (await fetch(foundry.utils.getRoute(chargePath(charge.key)))).text(), tincture: charge.tincture }
			: null;
		const size = { width: PAINTING_WIDTH * PAINT_SCALE, height: PAINTING_HEIGHT * PAINT_SCALE };
		const image = new Image();
		image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(heraldrySvg({ division, field, charge: bearing }, size))}`;
		await image.decode();
		const painting = document.createElement("canvas");
		painting.width = size.width;
		painting.height = size.height;
		painting.getContext("2d").drawImage(image, 0, 0, size.width, size.height);
		const url = painting.toDataURL("image/webp", 0.9);
		return url.length <= MAX_INLINE_LENGTH ? url : "";
	} catch (error) {
		console.warn(`${SYSTEM_ID} | Couldn't paint the test Knight's arms`, error);
		return "";
	}
}

/** @returns {string} A paragraph of HTML for each line. */
const html = (...lines) => lines.filter(Boolean).map((line) => `<p>${line}</p>`).join("");

/** @returns {string} A list of HTML. */
const list = (...items) => `<ul>${items.filter(Boolean).map((item) => `<li>${item}</li>`).join("")}</ul>`;

/* -------------------------------------------- */
/*  The game                                    */
/* -------------------------------------------- */

/**
 * The Company's first five Seasons in Gravenmoor. Each Season is played out in
 * order: the calendar moves on as the Company travels, and what happens is
 * written where the system keeps it, through the system's own functions where
 * one does the job without asking anything.
 */
class TestGame {
	/**
	 * @param {object|null} index The art index, or null when the book hasn't been imported.
	 * @param {Actor} toolkit
	 */
	constructor(index, toolkit) {
		this.index = index;
		this.toolkit = toolkit;
		/** @type {Record<string, Folder>} By document type. */
		this.folders = {};
		/** @type {Scene|null} */
		this.scene = null;
		/** @type {Record<string, Actor>} The Knights, by their key in COMPANY. */
		this.knights = {};
		/** @type {{col: number, row: number}|null} Where the Company is. */
		this.here = null;
		/** @type {{col: number, row: number}[]} Every hex the Company has come into, in order. */
		this.walked = [];
		/** What's happened to each Knight that their Chronicle tells. */
		this.deeds = { isolde: [], corvin: [], oswin: [] };
		/** @type {Record<string, Folder>} Each Knight's own folder, by their key in COMPANY. */
		this.knightFolders = {};
		this.domain = null;
		/** @type {Actor|null} The Domain's Warband. */
		this.warband = null;
		/** @type {Set<string>} The open country the Company has passed through, by hex key. */
		this.wilds = new Set();
		/** @type {Set<string>} The hexes whose Wilderness tables have been rolled, by hex key. */
		this.wildRolled = new Set();
		/** How many Company's notes the players have written, to take turns writing them. */
		this.partyNotes = 0;
		/** @type {{hex: {col: number, row: number}, lore: object}[]} Wayside hexes the GM learns more of later, the next first. */
		this.followUps = [];
		/** How many hidden Barriers the Company has run into, to take turns finding them. */
		this.barriersMet = 0;
	}

	async play() {
		await this.makeFolders();
		await setCalendar({ age: 1, season: "spring", day: 1, phase: "morning" });
		await this.makeRealm();
		await this.makeKnights();
		await this.springOfAgeOne();
		await this.harvestOfAgeOne();
		await this.winterOfAgeOne();
		await this.springOfAgeTwo();
		await this.harvestOfAgeTwo();
		await this.writeUp();
		await setWeather(WEATHER_NOW);
		await this.endSession();
	}

	/** @returns {Actor[]} The Company, in the order COMPANY lists them. */
	get company() {
		return COMPANY.map(({ key }) => this.knights[key]);
	}

	/** @returns {object} The Realm as it stands now. */
	get realm() {
		return getRealm(this.scene).realm;
	}

	/**
	 * @param {number} number
	 * @returns {object|null} The Myth with that number, as it stands now.
	 */
	myth(number) {
		return this.realm.myths.find((myth) => myth.number === number) ?? null;
	}

	/** @param {object} myth @returns {string} Its name, from the GM's import where there is one. */
	mythName(myth) {
		return myth ? mythEntry(this.index, myth).name : "the Myth";
	}

	/** @param {object} changes Parts of the calendar to move on. */
	at(changes) {
		return setCalendar({ ...getCalendar(), ...changes });
	}

	/* -------------------------------------------- */
	/*  Setting up                                  */
	/* -------------------------------------------- */

	async makeFolders() {
		const Folder = foundry.utils.getDocumentClass("Folder");
		for (const type of ["Actor", "Scene", "JournalEntry"]) {
			this.folders[type] = await Folder.create({ name: FOLDER_NAME, type, color: FOLDER_COLOR, flags: testFlags() });
		}
	}

	/** Roll Gravenmoor, name its places as a GM would, and pick where the story goes. */
	async makeRealm() {
		this.scene = await createRealmScene({ name: REALM_NAME, seed: REALM_SEED });
		if (!this.scene) throw new Error("The Realm couldn't be made");
		await this.scene.update({ folder: this.folders.Scene.id, flags: testFlags() });

		await editRealm(this.scene, (realm, g) => {
			let next = realm;
			const used = {};
			const nameFor = (names, kind) => {
				const index = used[kind] ?? 0;
				used[kind] = index + 1;
				return names[kind]?.[index] ?? "";
			};
			for (const holding of realm.holdings) next = editFeature(next, g, holding.hex, { name: nameFor(HOLDING_NAMES, holding.style) });
			for (const landmark of realm.landmarks) next = editFeature(next, g, landmark.hex, { name: nameFor(LANDMARK_NAMES, landmark.type) });
			return next;
		});

		this.g = sceneGeometry(this.scene);
		const places = pickPlaces(this.realm, this.g);
		this.places = places;
		this.here = places.seat?.hex ?? { col: 1, row: 1 };
		const [first, second, third] = places.myths.map((myth) => myth.number);
		this.mythNumbers = { first, second, third };
		const name = (place, fallback) => place?.name || fallback;
		this.names = {
			seat: name(places.seat, "the Seat of Power"),
			sanctum: name(places.sanctum, "the Sanctum"),
			ruin: name(places.ruin, "the ruin"),
			tourney: name(places.tourney, "the town"),
			domain: name(places.domain, "the tower"),
			dwelling: name(places.dwelling, "the Dwelling"),
			monument: name(places.monument, "the Monument")
		};
	}

	/**
	 * Make the three Knights as the Knight chooser would, with their Property
	 * filled in as weapons, armour and gear, their steeds, and their arms.
	 */
	async makeKnights() {
		const start = startFor(START);
		const kitNames = Object.fromEntries(STANDARD_KIT.map(({ key }) => [key, t(`chooser.kit.${key}`)]));
		const scores = [...VIRTUES, "guard"];
		for (const spec of COMPANY) {
			const entry = findByRoll(this.index?.knights, spec.roll);
			const book = entry?.property?.length ? entry : null;
			const knight = book ?? { name: `The ${spec.fallback.type} Knight`, ...spec.fallback };
			const seer = book ? findByRoll(this.index?.seers, spec.roll) : null;

			const rolls = [];
			const rolled = {};
			for (const key of scores) {
				const roll = await new Roll(key === "guard" ? start.guard : start.virtues).evaluate();
				rolls.push(roll);
				rolled[key] = key === "guard" ? roll.total : Math.min(19, roll.total);
			}
			const update = knightUpdate({ start, virtues: rolled, guard: rolled.guard, knight, seer });
			const { items, companions } = propertyItems(knight.property);
			const actor = await Actor.implementation.create({
				name: spec.name,
				type: "knight",
				folder: this.folders.Actor.id,
				flags: testFlags(),
				...foundry.utils.expandObject(update),
				items: [...items, ...knightItems({ ...knight, property: [] }, kitNames)]
			});
			this.knights[spec.key] = actor;
			// Filed as a Knight made in play is (knight-folders.js): a folder of their own, found by its flag.
			const folder = await foundry.utils.getDocumentClass("Folder").create({
				name: spec.name,
				type: "Actor",
				folder: this.folders.Actor.id,
				flags: { [SYSTEM_ID]: { [TEST_FLAG]: true, knight: actor.id } }
			});
			this.knightFolders[spec.key] = folder;
			await actor.update({ folder: folder.id });
			await postCard(actor, "creation", {
				title: t("chooser.card.scores"),
				tagline: t(`chooser.starts.${start.key}.label`),
				lines: scores.map((key) => ({ label: key === "guard" ? t("guard.abbr") : t(`virtues.${key}.abbr`), value: rolled[key] }))
			}, { rolls });

			const changes = { "system.heraldry": await paintArms(spec.arms) };
			for (const [index, companion] of companions.entries()) {
				const data = companionActorData(companion);
				const npc = await Actor.implementation.create({
					...data,
					name: `${companion.name} (${spec.name.split(" ").slice(0, 2).join(" ")})`,
					folder: folder.id,
					flags: testFlags()
				});
				if (index === 0 && isSteed(companion.name)) changes["system.steed"] = npc.uuid;
			}
			await actor.update(changes);
			await this.knightTable(actor);
		}
	}

	/**
	 * Fill in the d6 table on a Knight's page, as their sheet does once it's
	 * opened, and roll it as a player would at the start. Only with the book.
	 * @param {Actor} actor
	 */
	async knightTable(actor) {
		try {
			await fillKnightFromBook(actor, { seer: false });
			if (!hasTable(actor.system.bookTable)) return;
			const rolled = await rollKnightTable(actor);
			if (!rolled) return;
			await rolled.card;
			await rolled.save();
		} catch (error) {
			// The table is read from the PDF; the story goes on without it.
			console.warn(`${SYSTEM_ID} | Couldn't roll ${actor.name}'s table`, error);
		}
	}

	/* -------------------------------------------- */
	/*  What happens                                */
	/* -------------------------------------------- */

	/**
	 * Travel a Season's road a day at a time, moving the calendar on a Phase
	 * each hex. Day 1 is spent where the Season began.
	 * @param {{days: object[][], end: object}} road From seasonRoad.
	 * @param {object} [events]
	 * @param {(index: number, steps: object[]) => Promise<void>} [events.onDay] After each day's travel.
	 * @param {(stop: string, hex: object) => Promise<void>} [events.onArrive] On reaching a stop.
	 * @param {boolean} [events.camp] The road ends where the Company is now: its Token is put there
	 *   at the end, and the Journey counts the Token's hex itself, so the last hex isn't counted here.
	 */
	async travel({ days }, { onDay, onArrive, camp = false } = {}) {
		for (const [index, steps] of days.entries()) {
			for (const [step, { hex, arrive }] of steps.entries()) {
				await this.at({ day: index + 2, phase: PHASES[step] });
				const last = index === days.length - 1 && step === steps.length - 1;
				if (!(camp && last)) {
					await recordHexVisits(this.scene, [hex]);
					await this.wayside(hex);
				}
				this.walked.push(hex);
				this.here = hex;
				if (arrive) await onArrive?.(arrive, hex);
			}
			await onDay?.(index, steps);
		}
	}

	/**
	 * @param {{col: number, row: number}} hex
	 * @param {string} note
	 */
	note(hex, note) {
		return hex ? writeHexNote(this.scene, hex, note) : null;
	}

	/**
	 * Tell the players what the GM's note on a hex says, as its Tell the
	 * Players button does, so their Travels keep it. Quietly: the story tells
	 * a good many, and a notification for each would bury the build's own.
	 * @param {{col: number, row: number}} hex
	 */
	tell(hex) {
		return hex ? tellPlayersAboutHex({ scene: this.scene, hex, quiet: true }) : null;
	}

	/**
	 * The Company's own note on a hex, written by the players in turn, or by the
	 * GM in a world with no players.
	 * @param {{col: number, row: number}} hex
	 * @param {string} text
	 */
	partyNote(hex, text) {
		if (!hex) return null;
		const players = game.users.filter((user) => !user.isGM);
		const user = players.length ? players[this.partyNotes++ % players.length] : game.user;
		return keepPartyNote(this.scene, hex, text, user);
	}

	/**
	 * Every so often, open country the Company passes through gets written up
	 * as it's reached: the GM's note, the Spark Tables rolled for it, and what
	 * the players made of it.
	 * @param {{col: number, row: number}} hex
	 */
	async wayside(hex) {
		const key = hexKey(hex);
		if (this.wilds.has(key) || !isWilderness(this.realm, hex)) return;
		this.wilds.add(key);
		if (this.wilds.size % WAYSIDE_EVERY) return;
		const lore = WAYSIDE[this.wilds.size / WAYSIDE_EVERY - 1];
		if (!lore) return;
		await this.note(hex, lore.note);
		if (lore.wild) await this.wilderness(hex);
		if (lore.spark) await this.spark(hex, ...lore.spark);
		if (lore.tell) await this.tell(hex);
		if (lore.party) await this.partyNote(hex, lore.party);
		if (lore.later) this.followUps.push({ hex, lore });
	}

	/**
	 * What the GM learned since of a few wayside hexes, written over their note
	 * and told to the players, so those hexes hold two tellings; the Company
	 * rewrites its note to match.
	 */
	async followUp() {
		for (const { hex, lore } of this.followUps.splice(0, FOLLOW_UPS_A_SEASON)) {
			await this.note(hex, lore.later);
			await this.tell(hex);
			if (lore.laterParty) await this.partyNote(hex, lore.laterParty);
		}
	}

	/**
	 * Mark the hidden things the Company can see from afar (p197) from where it
	 * camps and the road just behind it, as the Referee's window marks them.
	 */
	async sightFromAfar() {
		const seen = new Map();
		for (const hex of this.walked.slice(-4).reverse()) {
			for (const { hex: there } of sightable(this.realm, this.g, hex, () => ({}))) {
				if (seen.size < SIGHTINGS.length && !seen.has(hexKey(there))) seen.set(hexKey(there), { note: SIGHTINGS[seen.size] });
			}
		}
		if (seen.size) await writeSightings(this.scene, { set: Object.fromEntries(seen) });
	}

	/** @param {{col: number, row: number}} hex */
	reveal(hex) {
		return hex ? editRealm(this.scene, (realm) => setRevealed(realm, hex, true)) : null;
	}

	/** Reveal the first hidden Barrier beside the road walked so far, as the Company finds it barring the way. */
	async findBarrier() {
		const [edge] = barriersBeside(this.realm, this.walked);
		if (!edge) return;
		await editRealm(this.scene, (realm, g) => setBarrier(realm, g, edge, "revealed"));
		// Kept in the players' record of the hex the Company stood in, as running into it on the map keeps it.
		const ends = edge.split("|");
		const stood = this.walked.findLast((hex) => ends.includes(hexKey(hex)));
		const finder = Object.values(this.knights)[this.barriersMet++ % COMPANY.length];
		if (stood) await recordBarriersMet(this.scene, [{ hex: stood, edges: [edge] }], finder?.name ?? "");
	}

	/**
	 * Roll one Spark Table for a hex, when the GM has imported the book's, and
	 * keep it there as the Spark Tables window does.
	 * @param {{col: number, row: number}} hex
	 * @param {string} key A SPARK_PAGES key.
	 * @param {number} index The table's place on its page.
	 */
	async spark(hex, key, index) {
		const page = this.index?.spark?.find((candidate) => candidate.key === key);
		const table = page?.tables?.[index];
		if (!hex || !table) return null;
		const { results } = await rollSpark(table);
		return keepTableRoll({ scene: this.scene, hex, page, table, results });
	}

	/** @param {{col: number, row: number}} hex Rolled as the Wilderness is (p22). */
	wilderness(hex) {
		if (!hex || !this.index?.spark?.length || this.wildRolled.has(hexKey(hex))) return null;
		this.wildRolled.add(hexKey(hex));
		return rollHexSparkSet({ scene: this.scene, hex });
	}

	/**
	 * The Company meets a Myth's next Omen (p18), shown to the GMs as the GM
	 * Toolkit's Next Omen shows it.
	 * @param {number} number
	 */
	async omen(number) {
		const myth = this.myth(number);
		if (!myth || myth.omen >= OMEN_COUNT) return;
		const omen = myth.omen + 1;
		await editRealm(this.scene, (realm) => setOmen(realm, number, omen));
		const { name, page, entry } = mythEntry(this.index, myth);
		await postCard(null, "omen", {
			title: `${myth.number}. ${name}`,
			tagline: page ? t("realm.key.page", { page }) : null,
			img: entry?.path ?? null,
			omen: t("realm.wilderness.omen", { omen, count: OMEN_COUNT }),
			text: entry?.omens?.[omen - 1] ?? null,
			hint: omen === OMEN_COUNT ? t("realm.wilderness.omensComplete") : null
		}, { mode: "gm" });
	}

	/**
	 * A resolved Myth replaced by a new one in the next Season (p27), rolled as
	 * the GM Toolkit's Roll the New Myth rolls it.
	 * @param {number} number
	 */
	async newMyth(number) {
		const myth = this.myth(number);
		if (!myth) return;
		const { d6, d12, rolls } = await rollFreeMyth(this.realm);
		const rolled = { number, d6, d12 };
		await editRealm(this.scene, (realm, g) => placeFeature(realm, g, myth.hex, { kind: "myth", ...rolled, omen: 0, revealed: false }));
		const { name, page, entry } = mythEntry(this.index, rolled);
		await postCard(null, "omen", {
			title: `${number}. ${name}`,
			tagline: page ? t("realm.key.page", { page }) : null,
			img: entry?.path ?? null,
			omen: t("gmToolkit.myths.newMythRolled", { hex: t("realm.hex", myth.hex) }),
			text: null,
			hint: t("gmToolkit.myths.newMythHint")
		}, { rolls, mode: "gm" });
	}

	/**
	 * Award 1 Glory by other means (p6) to those given, as Award Glory does.
	 * @param {string} key One of GLORY_AWARDS.
	 * @param {Actor[]} knights
	 */
	async award(key, knights) {
		const entries = [];
		for (const actor of knights) entries.push({ name: actor.name, lines: await adjustGlory(actor, 1) });
		await postCard(null, "report", {
			title: t(`glory.awards.${key}.label`),
			tagline: calendarLabel(getCalendar()),
			entries,
			hint: t(`glory.awards.${key}.hint`)
		});
	}

	/**
	 * A Knight takes a Scar (p9), recorded as Roll Scar records one: the
	 * story's Scar, rolled on the die that caused it, and everything after it
	 * rolled for real.
	 * @param {Actor} actor
	 * @param {number} faces The die that caused it.
	 * @param {number} wanted The Scar, 1-12.
	 * @returns {Promise<string>} The Scar's name as recorded.
	 */
	async scar(actor, faces, wanted) {
		const scar = scarForRoll(wanted);
		const text = (part) => t(`scars.${scar.key}.${part}`);
		const rolls = [await rollUntil(`1d${faces}`, (total) => total === wanted)];
		const lines = [];
		const update = {};
		let location = null;
		if (scar.detail) {
			const detail = await new Roll("1d6").evaluate();
			rolls.push(detail);
			location = t(`scars.${scar.key}.detail.${detail.total}`);
		}
		if (scar.loss) {
			const { virtue, formula } = scar.loss;
			const loss = await new Roll(formula).evaluate();
			rolls.push(loss);
			update[`system.virtues.${virtue}.value`] = Math.max(0, actor.system.virtues[virtue].value - loss.total);
			lines.push(t("scarRoll.lost", { amount: loss.total, virtue: t(`virtues.${virtue}.abbr`) }));
		}
		const maxGuard = actor.system.guard.max;
		if (scarRaisesGuardNow(scar, maxGuard)) {
			const raise = await new Roll("1d6").evaluate();
			rolls.push(raise);
			update["system.guard.max"] = maxGuard + raise.total;
			lines.push(t("scarRoll.guardRaised", { amount: raise.total, value: maxGuard + raise.total }));
		}
		if (!foundry.utils.isEmpty(update)) await actor.update(update);
		const name = location ? `${text("name")} (${location})` : text("name");
		await actor.createEmbeddedDocuments("Item", [{
			type: "scar",
			name,
			system: { roll: scar.roll, season: seasonKey(getCalendar()), description: scarDescription(text("flavour"), text("effect")) }
		}]);
		await postCard(actor, "scar", { faces, roll: scar.roll, name: text("name"), flavour: text("flavour"), effect: text("effect"), location, lines }, { rolls });
		return name;
	}

	/**
	 * One of the Season's feasts or masses (p17) comes to pass, marked on the
	 * Time page and told to the table as its button there tells it.
	 * @param {string} key From SEASON_EVENTS.
	 */
	feast(key) {
		return markSeasonEvent(key);
	}

	/**
	 * Turn the Season or the Age through the system's own Season turn, with
	 * each Knight's pursuit chosen, and record it in the GM Toolkit.
	 * @param {object} options
	 * @param {boolean} [options.newAge]
	 * @param {Record<string, string>} options.pursuits By Knight key.
	 * @param {Record<string, string[]>} [options.more] Lines a Knight's entry gains, by Knight key.
	 */
	async turn({ newAge = false, pursuits, more = {} }) {
		await this.followUp();
		const before = getCalendar();
		const after = newAge ? nextAge(before) : nextSeason(before);
		await setCalendar(after);
		// Succession asks who's named; the story names them itself, so the pursuit is only written on the card.
		const company = COMPANY.map(({ key }) => ({ actor: this.knights[key], pursuit: pursuits[key] === "succession" ? null : pursuits[key] }));
		const { rolls, entries } = await passTime(company, { newAge, before });
		COMPANY.forEach(({ key }, index) => {
			if (pursuits[key] === "succession") entries[index].pursuit = t("time.pursuits.succession.label");
			entries[index].lines.push(...(more[key] ?? []));
		});
		const ended = seasonKey(before);
		// Every Season ends with the Realm's collection (p17), as the Time page's own turn has it.
		const collection = await markCollection(ended, before.season);
		const all = [...(collection ? [collectionEntry(collection)] : []), ...entries, ...(await settleDomains(ended))];
		const title = newAge ? t("time.ageTurned", { age: after.age }) : t("time.seasonTurned", { season: t(`time.seasons.${after.season}`) });
		await announceSeason(after, { title, entries: all }, { rolls });
		await recordSeasonTurn(ended, { kind: newAge ? "age" : "season", title, entries: all, note: null });
	}

	/* -------------------------------------------- */
	/*  The Seasons                                 */
	/* -------------------------------------------- */

	/** Spring, Age 1: presented at Court, then out to find the Seer at the Sanctum. */
	async springOfAgeOne() {
		const { isolde, corvin, oswin } = this.knights;
		const { seat, sanctum, dwelling } = this.places;
		const { first } = this.mythNumbers;
		await recordHexVisits(this.scene, [this.here]);
		this.walked.push(this.here);
		await this.feast("feastOfTheSun");
		await this.note(seat?.hex, `The Court of ${this.names.seat}, where the Company hold places as Courtiers. The steward keeps a cold hall; the kitchens are warmer, and the cook talks.`);
		await this.spark(seat?.hex, "civilisation", 0);
		await this.tell(seat?.hex);
		await this.partyNote(seat?.hex, "Home, sort of. The cook talks if you carry her water. The steward hates Oswin already.");
		await this.note(dwelling?.hex, `${this.names.dwelling}. Said at Court to take in travellers and ask no questions. Not visited yet.`);
		// Heard of at Court, so the players' Places hold it before the Company goes there.
		await this.tell(dwelling?.hex);
		await this.reveal(dwelling?.hex);

		const road = seasonRoad(this.realm, this.g, this.here, [{ name: "sanctum", hex: sanctum?.hex ?? this.here }]);
		await this.travel(road, {
			onDay: async (index, steps) => {
				if (index === 0) await this.omen(first);
				if (index === 0) await this.wilderness(steps.at(-1).hex);
			},
			onArrive: async (_stop, hex) => {
				await this.reveal(hex);
				const seer = sanctum?.seer ? seerEntry(this.index, sanctum.seer) : null;
				await this.note(hex, `${this.names.sanctum}, where ${seer?.name ?? "the Seer"} keeps their vigil. They asked each Knight for a lock of hair and would not say why.`);
				await this.makeSeer(seer);
				await this.spark(hex, "people", 1);
				await this.tell(hex);
				await this.partyNote(hex, "The Seer took a lock of hair from each of us. WHY? Don't give them anything else.");
				await this.omen(first);
				const scar = await this.scar(corvin, 6, 1);
				this.deeds.corvin.push(`Spring, Age 1: ambushed on the road to ${this.names.sanctum}, and took ${scar}.`);
				await this.feast("sceptremass");
			}
		});
		this.deeds.isolde.push(`Spring, Age 1: presented at the Court of ${this.names.seat}.`);
		this.deeds.oswin.push(`Spring, Age 1: presented at the Court of ${this.names.seat}; the steward already dislikes him.`);
		await writeSeasonNotes(seasonKey(getCalendar()), `The Company arrive at ${this.names.seat} as Courtiers. First session: introductions at Court, then out to find the Seer at ${this.names.sanctum}. ${isolde.name} charmed the envoy; ${oswin.name} did not.`);
		await this.turn({ pursuits: { isolde: "courtesy", corvin: "pilgrimage", oswin: "service" } });
	}

	/** Harvest, Age 1: the Drowned Chapel explored, and the tourney won. */
	async harvestOfAgeOne() {
		const { isolde } = this.knights;
		const { ruin, tourney, monument } = this.places;
		const { first, second } = this.mythNumbers;
		const stops = [{ name: "ruin", hex: ruin?.hex }, { name: "tourney", hex: tourney?.hex }].filter((stop) => stop.hex);
		await this.feast("feastOfTheStars");
		const road = seasonRoad(this.realm, this.g, this.here, stops);
		await this.travel(road, {
			onDay: async (index) => {
				if (index === 0) await this.omen(first);
				if (index === 1) {
					await this.omen(second);
					await this.reveal(monument?.hex);
					await this.note(monument?.hex, `${this.names.monument}, seen from the road: standing stones that seem to lean away from whoever looks at them.`);
				}
			},
			onArrive: async (stop, hex) => {
				if (stop === "ruin") {
					await this.reveal(hex);
					await this.note(hex, `${this.names.ruin}: a flooded chapel on the old pilgrim road, explored in Harvest of Age 1. See the Site. The bell is still down there somewhere.`);
					await this.makeSites(hex);
					await this.makeMere();
					await this.spark(hex, "nature", 2);
					await this.tell(hex);
					await this.partyNote(hex, "Do NOT wade. Pike. The bell is still down there, and so is the reliquary.");
					// A Ruin hints at a Myth the Realm doesn't hold (p14), whispered to the Referee.
					await echoRuin(this.scene);
					const scar = await this.scar(isolde, 10, 10);
					this.deeds.isolde.push(`Harvest, Age 1: dragged under at ${this.names.ruin}, and came up with ${scar}.`);
				} else {
					await this.feast("eldermass");
					await this.note(hex, `${this.names.tourney}. The Harvest tourney, held on Eldermass: ${isolde.name} unhorsed the champion in front of half the Realm. The reeve still owes the Company a supper.`);
					await this.spark(hex, "civilisation", 6);
					await this.tell(hex);
					await this.partyNote(hex, "Isolde won the tourney! The reeve owes us a supper. Collect it.");
					await this.omen(first);
					await this.award("tournament", [isolde]);
					this.deeds.isolde.push(`Harvest, Age 1: won the Harvest tourney at ${this.names.tourney}.`);
				}
			}
		});
		await writeSeasonNotes(seasonKey(getCalendar()), `Explored ${this.names.ruin}. The players loved the floating pews. Then the Harvest tourney at ${this.names.tourney}, which ${isolde.name} won.`);
		await this.turn({ pursuits: { isolde: "service", corvin: "courtesy", oswin: "pilgrimage" } });
	}

	/** Winter, Age 1: a hard road, and the first Myth met to its end. */
	async winterOfAgeOne() {
		const { isolde, corvin, oswin } = this.knights;
		const { first } = this.mythNumbers;
		const mythHex = this.myth(first)?.hex;
		await this.feast("feastOfTheMoon");
		// What the GM learned over Winter, kept from the players: their Travels still hold what they were told in Spring.
		await this.note(this.places.seat?.hex, `The Court of ${this.names.seat}. The steward keeps a cold hall: he owes money all over the Realm, and the envoy knows to whom. The cook talks.`);
		await hardshipFor(HARDSHIPS.find(({ key }) => key === "winter"), this.company);
		const road = seasonRoad(this.realm, this.g, this.here, mythHex ? [{ name: "myth", hex: mythHex }] : []);
		await this.travel(road, {
			onDay: async (index) => {
				if (index === 0) {
					await this.omen(first);
					await this.findBarrier();
					// A pilgrim at the fire tells of the City (p172), and the Referee rolls its first Omen.
					await rollCityOmen();
				}
			},
			onArrive: async (_stop, hex) => {
				await this.omen(first);
				await this.reveal(hex);
				const myth = this.myth(first);
				const name = this.mythName(myth);
				await editMythNote(this.scene, myth, {
					note: `${name}: all six Omens met between Spring and Winter of Age 1. It ended at ${t("realm.hex", hex)}, with ${oswin.name} holding the line. The Knights each took Glory for it.`,
					resolved: true
				});
				await recordMythCompleted({ id: completedMythId(this.scene.id, myth), name });
				await this.award("myth", this.company);
				await this.note(hex, `Where ${name} ended, in the deep of Winter. Burnt ground; nothing grows here yet.`);
				await this.spark(hex, "nature", 1);
				await this.tell(hex);
				await this.partyNote(hex, `Where ${name} ended. Nothing grows. Don't camp here.`);
				for (const key of ["isolde", "corvin", "oswin"]) this.deeds[key].push(`Winter, Age 1: saw ${name} to its end.`);
				await this.feast("kindlemass");
			}
		});
		await writeSeasonNotes(seasonKey(getCalendar()), `A hard Winter on the road: everyone lost VIG to the cold. ${this.mythName(this.myth(first))} ended at last. Good session; ${corvin.name}'s player cried.`);
		await corvin.update({ "system.successor": oswin.uuid });
		await this.turn({
			newAge: true,
			pursuits: { isolde: "duty", corvin: "succession", oswin: "duty" },
			more: { corvin: [t("successor.named", { name: oswin.name })] }
		});
		this.deeds.corvin.push(`Between the Ages: named ${oswin.name} his successor.`);
		// The group decides who grows older as the Age turns (p17).
		await rollAging(isolde, "old");
		this.deeds.isolde.push("Between the Ages: grew Old. Grey at the temples now, and slower in the mornings.");
	}

	/** Spring, Age 2: a new Myth, a battle, and a Holding granted. */
	async springOfAgeTwo() {
		const { isolde, corvin, oswin } = this.knights;
		const { domain } = this.places;
		const { first, second } = this.mythNumbers;
		await this.newMyth(first);
		await this.feast("feastOfTheSun");
		const road = seasonRoad(this.realm, this.g, this.here, domain ? [{ name: "domain", hex: domain.hex }] : []);
		await this.travel(road, {
			onDay: async (index, steps) => {
				if (index === 0) {
					await this.reveal(this.myth(second)?.hex);
					await this.omen(second);
					await this.wilderness(steps.at(-1).hex);
				}
			},
			onArrive: async (_stop, hex) => {
				await this.award("battle", [isolde, oswin]);
				const scar = await this.scar(oswin, 12, 12);
				this.deeds.oswin.push(`Spring, Age 2: fought at ${this.names.domain} and took ${scar} from a man he'll meet again.`);
				await this.makeDomain(hex);
				this.deeds.isolde.push(`Spring, Age 2: led the charge at ${this.names.domain}, and was granted it after.`);
				this.deeds.corvin.push(`Spring, Age 2: kept the baggage while the others fought at ${this.names.domain}. Won't hear the end of it.`);
				await this.makeSquire(isolde);
				this.deeds.isolde.push(`Spring, Age 2: took ${SQUIRE_NAME}, the steward's boy, as her Squire.`);
				await this.feast("sceptremass");
				// The Circle's week riding the bounds is up before the Season is.
				await this.at({ day: getCalendar().day + 1, phase: "morning" });
				await this.settleTasks("circle");
			}
		});
		await writeSeasonNotes(seasonKey(getCalendar()), `The new Age. A new Myth stirs where the old one ended. The battle at ${this.names.domain}: ${isolde.name} was granted it after. ${corvin.name} sat it out.`);
		await this.turn({ pursuits: { isolde: "service", corvin: "pilgrimage", oswin: "courtesy" } });
	}

	/** Harvest, Age 2, where the game has got to: on the road toward the next Myth. */
	async harvestOfAgeTwo() {
		const { isolde, corvin, oswin } = this.knights;
		const { second, third } = this.mythNumbers;
		const target = this.myth(second)?.hex;
		await this.feast("feastOfTheStars");
		// Famine in the stores: the Warband goes short before the Company rides out.
		if (this.warband) await wearWarbandDown(this.warband, "poorlyFed");
		if (this.domain) await this.setTask("envoy", { what: "Carry the Domain's greetings, and its excuses, to the Seat of Power", scope: "season", risk: "luck" });
		const road = seasonRoad(this.realm, this.g, this.here, target ? [{ name: "myth", hex: target }] : [], { stopShort: true });
		await this.travel(road, {
			camp: true,
			onDay: async (index, steps) => {
				if (index === 0) {
					await this.omen(second);
					await this.makeCast(this.myth(second));
					await rollCityOmen();
				}
				if (index === road.days.length - 1) {
					await this.omen(third);
					await this.findBarrier();
					await this.wilderness(steps[0].hex);
				}
			}
		});

		// Today: a Morning's fighting on the road, and the Company is resting up in the Afternoon.
		const today = road.days.length + 1;
		await this.at({ day: today, phase: "morning" });
		await announcePhase(getCalendar());
		const doom = await this.scar(corvin, 12, 11);
		this.deeds.corvin.push(`Harvest, Age 2: took ${doom} in a skirmish on the road. It lasts the Season.`);
		await this.at({ phase: "afternoon" });
		await announcePhase(getCalendar());

		const final = this.here;
		const myth = this.myth(second);
		await this.note(final, `The Company's camp on the road to ${this.mythName(myth)}. Smoke to the north at dusk; nobody has gone to look yet. It's been raining since noon.`);
		await this.spark(final, "people", 2);
		await this.partyNote(final, "Camp. Smoke to the north: look in the Morning. Corvin wants a rest day.");
		await editMythNote(this.scene, myth, { note: `Its Omens keep turning up around ${this.names.domain}, and the villagers are starting to blame the Company. They're a day or two from it now.` });
		const rumoured = this.myth(third);
		if (rumoured) await editMythNote(this.scene, rumoured, { note: "One Omen, met on the road north. The players haven't tied it to anything yet." });
		// The Journey counts the hex the Company's Token is put in, as it would the Referee placing it.
		await setCompanyHex(this.scene, final, { name: `The Company of ${REALM_NAME}` });
		await this.sightFromAfar();

		await isolde.update({ "system.virtues.vig.value": Math.max(1, isolde.system.virtues.vig.max - 3), "system.virtues.spi.value": Math.max(1, isolde.system.virtues.spi.max - 4), "system.guard.value": Math.min(2, isolde.system.guard.max) });
		await corvin.update({ "system.virtues.cla.value": Math.max(1, corvin.system.virtues.cla.max - 5), "system.guard.value": Math.min(1, corvin.system.guard.max), "system.fatigued": true });
		await oswin.update({ "system.virtues.vig.value": Math.max(1, oswin.system.virtues.vig.max - 6), "system.virtues.cla.value": Math.max(1, oswin.system.virtues.cla.max - 1) });
		this.deeds.isolde.push(`Harvest, Age 2: rides out from ${this.names.domain} with the walls half-mended.`);
		this.deeds.oswin.push(`Harvest, Age 2: sits in the Circle at ${this.names.domain}, and is courting its envoy.`);
		await writeSeasonNotes(seasonKey(getCalendar()), `On the road toward ${this.mythName(myth)}. ${corvin.name} took a Doom Scar this Season: a Mortal Wound would Slay him until it turns. ${this.names.domain} is owed its Crisis Roll.`);
	}

	/* -------------------------------------------- */
	/*  People and places                           */
	/* -------------------------------------------- */

	/**
	 * The Seer at the Sanctum, from their stat block in the GM's import.
	 * @param {{name: string, entry: object|null}|null} seer From seerEntry.
	 */
	async makeSeer(seer) {
		if (!seer?.entry?.stats) return;
		const data = actorData({ name: seer.entry.name, stats: seer.entry.stats, lines: seer.entry.lines ?? [] });
		await Actor.implementation.create({
			...data,
			name: data.name || seer.name,
			...(seer.entry.path ? { img: seer.entry.path } : {}),
			system: { ...data.system, notes: `${data.system.notes ?? ""}${html(`Keeps ${this.names.sanctum}. Met in Spring of Age 1; took a lock of hair from each Knight.`)}` },
			folder: this.folders.Actor.id,
			flags: testFlags()
		});
	}

	/**
	 * A Myth's Cast, made from their stat blocks in the GM's import as the GM
	 * Toolkit's Make button makes them: marked as the Myth's, and kept in a
	 * folder of its own that the Toolkit files anyone made later in. The first
	 * was met on the road.
	 * @param {object|null} myth
	 */
	async makeCast(myth) {
		const { entry } = myth ? mythEntry(this.index, myth) : {};
		if (!entry?.cast?.length) return;
		const key = castKey(this.scene, myth);
		const folder = await foundry.utils.getDocumentClass("Folder").create({
			name: entry.name,
			type: "Actor",
			folder: this.folders.Actor.id,
			flags: { [SYSTEM_ID]: { [TEST_FLAG]: true, [CAST_FLAG]: key } }
		});
		for (const [index, person] of entry.cast.entries()) {
			const data = actorData(person);
			const met = index === 0 ? html(`Met on the road in Harvest of Age 2. Knows where ${entry.name} will show itself next.`) : "";
			await Actor.implementation.create({
				type: data.type,
				name: data.name || entry.name,
				...(entry.path ? { img: entry.path } : {}),
				system: { ...data.system, notes: `${data.system.notes ?? ""}${met}` },
				items: data.items,
				folder: folder.id,
				flags: { [SYSTEM_ID]: { [TEST_FLAG]: true, [CAST_FLAG]: { myth: key, from: String(person.name ?? "") } } }
			});
		}
	}

	/**
	 * A Squire for a Knight (p7), rolled as Take a Squire rolls one and riding
	 * their pony. By the book only a Company of one or two Knights takes
	 * Squires; the Referee allowed this one, as Take a Squire lets a GM.
	 * @param {Actor} knight
	 */
	async makeSquire(knight) {
		const rolls = [];
		const virtues = {};
		const lines = [];
		for (const key of VIRTUES) {
			const roll = await new Roll(SQUIRE_VIRTUE_ROLL).evaluate();
			rolls.push(roll);
			virtues[key] = roll.total;
			lines.push({ label: t(`virtues.${key}.abbr`), value: roll.total });
		}
		lines.push({ label: t("guard.abbr"), value: SQUIRE_GUARD });
		const equipment = await new Roll("1d6").evaluate();
		rolls.push(equipment);
		const names = { dagger: t("chooser.kit.dagger"), ...Object.fromEntries(SQUIRE_EQUIPMENT.map(({ key }) => [key, t(`squire.equipment.${key}`)])) };
		lines.push({ label: t("squire.equipmentRoll", { roll: equipment.total }), value: names[squireEquipment(equipment.total).key] });

		const folder = knight.folder?.id ?? this.folders.Actor.id;
		const pony = await Actor.implementation.create({ name: t("squire.pony", { name: SQUIRE_NAME }), type: "npc", system: ponySystem(), folder, flags: testFlags() });
		const squire = await Actor.implementation.create({
			name: SQUIRE_NAME,
			type: "knight",
			img: SQUIRE_IMAGE,
			folder,
			flags: testFlags(),
			system: {
				...squireSystem(virtues),
				serves: knight.uuid,
				steed: pony.uuid,
				notes: html(`The steward's son at ${this.names.domain}, given to ${knight.name} the day she was granted it. Eager, clumsy, and reports everything to his mother.`)
			},
			items: squireItems(equipment.total, names)
		});
		lines.push({ label: t("steed.label"), value: pony.name });
		await knight.update({ "system.squire": squire.uuid });
		await postCard(knight, "creation", {
			title: t("squire.title"),
			tagline: t("squire.tagline", { name: squire.name, knight: knight.name }),
			lines,
			note: t("squire.hint")
		}, { rolls });
	}

	/**
	 * The Holding granted to Dame Isolde after the battle, with its Council, its
	 * first Crisis Roll, and its walls.
	 * @param {{col: number, row: number}} hex
	 */
	async makeDomain(hex) {
		const { isolde, oswin } = this.knights;
		const court = this.court();
		// Each seat is granted to its holder, who serves in the Court as a Retainer.
		const council = Object.fromEntries(Object.entries(COUNCIL).map(([seat, name]) => [seat, Object.keys(court).find((id) => court[id].name === name) ?? ""]));
		this.domain = await Actor.implementation.create({
			name: this.names.domain,
			type: "domain",
			img: DOMAIN_IMAGE,
			folder: this.folders.Actor.id,
			flags: testFlags(),
			system: {
				seat: false,
				successor: oswin.name,
				council: { ...council, circle: [oswin.id] },
				court,
				notes: html(
					`Granted to ${isolde.name} after the battle in Spring of Age 2. The old lord's household stayed on; the steward was his.`,
					"The walls need work before Winter."
				)
			}
		});
		await linkKnightDomain(isolde, this.domain);
		await this.crisis(this.domain);
		await this.setTask("steward", { what: "Find where the grain went, before the Famine takes the village", scope: "season", risk: "none" });
		await this.setTask("circle", { what: "Ride the bounds and count the burnt farms", scope: "week", risk: "vig" });
		await this.musterLevy(this.domain);
		await Actor.implementation.create({
			name: `${this.names.domain} palisade`,
			type: "structure",
			img: STRUCTURE_IMAGE,
			folder: this.folders.Actor.id,
			flags: testFlags(),
			system: {
				kind: "structure",
				guard: { value: 5, max: 8 },
				armour: 1,
				armourNote: "timber",
				notes: html("Burnt in two places during the battle, and only half mended.")
			}
		});
		await this.note(hex, `${this.names.domain}, granted to ${isolde.name} after the battle in Spring of Age 2. The palisade burned in two places. Famine in the stores.`);
		await this.spark(hex, "civilisation", 7);
		await this.spark(hex, "people", 5);
		await this.tell(hex);
		await this.partyNote(hex, "Ours! Well, Isolde's. Walls before Winter. Keep an eye on the steward.");
	}

	/**
	 * A Domain's Crisis Roll (p20) landing on a Dilemma, and the GM choosing the
	 * first of the two Crises offered, as the Crisis Roll asks them to.
	 * @param {Actor} domain
	 */
	async crisis(domain) {
		const roll = await rollUntil("1d6", (total) => crisisResult(total) === "dilemma");
		const rolls = [roll];
		const drawn = [];
		while (drawn.length < crisesDrawn("dilemma")) {
			const draw = await new Roll("1d6").evaluate();
			rolls.push(draw);
			const key = crisisFor(draw.total, [...domain.system.crises, ...drawn]);
			if (!key) break;
			drawn.push(key);
		}
		const [chosen] = drawn;
		if (!chosen) return;
		await domain.update({ "system.crises": [...domain.system.crises, chosen], "system.crisisRolled": seasonKey(getCalendar()) });
		await postCard(domain, "report", {
			title: t("domain.crisisRoll"),
			description: t("domain.crisisRollHint"),
			tagline: t("domain.results.crisis.dilemma"),
			d6: roll.total,
			entries: [{ name: t(`domain.crises.${chosen}.name`), lines: [t(`domain.crises.${chosen}.flavour`), t(`domain.crises.${chosen}.resolution`)].filter(Boolean) }]
		}, { rolls });
	}

	/**
	 * The Domain's Court (p20), by id as the sheet keeps it: the Retainers
	 * holding the Council's seats first, and the Seer at the Sanctum sending an
	 * acolyte in their stead.
	 * @returns {object}
	 */
	court() {
		const members = [
			...Object.values(COUNCIL).map((name) => ({ role: "retainer", name })),
			...COURT,
			{ role: "seer", name: `An acolyte from ${this.names.sanctum}`, note: "Sent to watch the Knights. Burns something in the chapel every Night." }
		];
		const at = Date.now();
		return Object.fromEntries(members.map((member, index) => [
			foundry.utils.randomID(),
			{ ...newCourtMember(member.role, at + index), ...member }
		]));
	}

	/**
	 * Give one of the Council a task, as the Domain sheet's Set a Task does.
	 * @param {string} seat One of COUNCIL_SEATS.
	 * @param {{what: string, scope: string, risk: string}} details
	 */
	async setTask(seat, details) {
		const task = newTask(seat, { ...details, started: getCalendar(), at: Date.now() });
		if (!task) return;
		await this.domain.update({ [`system.tasks.${foundry.utils.randomID()}`]: task });
		const holder = COUNCIL[seat] || (seat === "circle" ? this.knights.oswin?.name : "") || t(`domain.council.${seat}.label`);
		await postCard(this.domain, "note", {
			icon: TASK_SCOPE_ICONS[task.scope],
			text: t("domain.tasks.taken", { who: holder, what: task.what, scope: t(`domain.tasks.scopes.${task.scope}.takes`) })
		});
	}

	/**
	 * Settle a seat's tasks, rolling what they put at risk.
	 * @param {string} seat One of COUNCIL_SEATS.
	 */
	async settleTasks(seat) {
		if (!this.domain) return;
		const ids = Object.entries(this.domain.system.tasks ?? {}).filter(([, task]) => task?.seat === seat).map(([id]) => id);
		for (const id of ids) await settleTask(this.domain, id);
	}

	/**
	 * Muster a Warband of Vassals for the Domain (p21), as Muster a Warband
	 * does: the book's first Warband where the GM has imported them, or a levy
	 * of the story's own.
	 * @param {Actor} domain
	 */
	async musterLevy(domain) {
		const book = await this.bookWarband();
		const origin = "vassals";
		const track = (value) => ({ value, max: value });
		const data = book ?? {
			type: "npc",
			name: `The Levy of ${domain.name}`,
			system: {
				epithet: LEVY.epithet,
				virtues: { vig: track(LEVY.vig), cla: track(LEVY.cla), spi: track(LEVY.spi) },
				guard: track(LEVY.guard),
				armour: LEVY.armour,
				armourNote: LEVY.armourNote
			}
		};
		this.warband = await Actor.implementation.create({
			...data,
			system: { ...data.system, scale: "warband", notes: html(`Raised at ${domain.name} after the battle. Half of them fought for the old lord.`) },
			folder: this.folders.Actor.id,
			flags: { ...data.flags, [SYSTEM_ID]: { ...data.flags?.[SYSTEM_ID], [TEST_FLAG]: true, [MUSTERED_FLAG]: domain.id, [ORIGIN_FLAG]: origin } }
		});
		await postCard(domain, "report", {
			title: t("warband.muster.title"),
			tagline: t("warband.muster.raised", { name: this.warband.name, domain: domain.name }),
			entries: [{
				name: this.warband.name,
				pursuit: t(`warband.origins.${origin}.label`),
				lines: [t(`warband.origins.${origin}.text`), t("warband.muster.needs")]
			}],
			hint: t("warband.muster.marshal")
		});
	}

	/** @returns {Promise<object|null>} The book's first Warband (p11), from the Beasts & Hirelings compendium Import PDF fills. */
	async bookWarband() {
		const pack = game.packs?.get(`world.${GOODS_PACKS.actors.name}`);
		if (!pack?.visible) return null;
		try {
			const warband = (await pack.getDocuments()).find((actor) => actor.type === "npc" && actor.folder?.name === t("goods.folders.warbands"));
			return warband ? game.actors.fromCompendium(warband) : null;
		} catch (error) {
			console.warn(`${SYSTEM_ID} | Couldn't read the book's Warbands`, error);
			return null;
		}
	}

	/**
	 * Two Sites: the Drowned Chapel, explored, with what the Company found
	 * written in; and a barrow prepared for later, not yet visited.
	 * @param {{col: number, row: number}} hex The ruin's.
	 */
	async makeSites(hex) {
		const JournalEntry = foundry.utils.getDocumentClass("JournalEntry");
		// Each Site's journal is made at once, rather than a moment after, so it's there when the macro says it's done.
		const create = async (name, site) => keepSiteJournal(await JournalEntry.create({
			name,
			folder: this.folders.JournalEntry.id,
			flags: { core: { sheetClass: SITE_SHEET_CLASS }, [SYSTEM_ID]: { [SITE_FLAG]: site, [TEST_FLAG]: true } }
		}));

		let chapel = rollSite(emptySite(), createRandom(`${REALM_SEED}-chapel`));
		chapel.notes = `${this.names.ruin}, at ${t("realm.hex", hex)}. A pilgrim chapel the mere rose over. Explored in Harvest of Age 1.`;
		const used = { feature: 0, danger: 0, treasure: 0 };
		for (const key of numberedPoints(chapel)) {
			const point = chapel.points[key];
			point.text = SITE_TEXT[point.kind][used[point.kind]++] ?? "";
			if (point.entrance) point.entranceText = ENTRANCE_TEXT[point.entrance];
		}
		for (const { key } of SITE_EDGES) {
			const route = chapel.routes[key];
			if (route.kind && ROUTE_TEXT[route.kind]) route.text = ROUTE_TEXT[route.kind];
		}
		for (const key of numberedPoints(chapel).slice(0, 3)) chapel = revealPoint(chapel, key, true);
		for (const key of numberedPoints(chapel)) {
			if (chapel.points[key].entrance === "open") chapel = revealEntrance(chapel, key, true);
		}
		await create(this.names.ruin, chapel);

		const barrow = rollSite(emptySite(), createRandom(`${REALM_SEED}-barrow`));
		barrow.notes = "A barrow the Seer mentioned. Rolled up ahead of time; the Company haven't found it yet.";
		await create("The Barrow of the Nine", barrow);
	}

	/**
	 * The ferry that took the Company across the mere to the Drowned Chapel,
	 * and the pike that holed it: a ship and a beast with every box of their
	 * sheets filled in, for seeing those sheets full.
	 */
	async makeMere() {
		const track = (value, max = value) => ({ value, max });
		const folder = this.folders.Actor.id;
		await Actor.implementation.create({
			name: "The Grey Heron",
			type: "structure",
			img: FERRY_IMAGE,
			folder,
			flags: testFlags(),
			system: {
				kind: "ship",
				epithet: `The Ferry of ${this.names.ruin}`,
				stone: false,
				guard: track(3, 6),
				armour: 1,
				armourNote: "Tarred oak planking, doubled at the bow",
				carries: "8 passengers, or 4 riders and their steeds",
				notes: [
					"<h2>The ferry</h2>",
					html(
						"A flat-bottomed pilgrim ferry, poled across the mere by Brother Anselm, who has outlived the chapel it served.",
						`Holed below the waterline in Harvest of Age 1, when the pike rose under it with ${this.knights.isolde.name} aboard. Anselm patched it with a door from the chapel.`
					),
					"<h2>Aboard</h2>",
					list(
						"A harpoon on a swivel at the bow, for the pike. Anselm has never hit it.",
						"Six sacks of pilgrims' salt that nobody has come to buy in years.",
						"A spare pair of oars, split in the same attack."
					),
					`<section class="secret" id="secret-ferry">${html("Anselm rows the barrow-robbers across by night, for a share of what they bring back.")}</section>`
				].join("")
			},
			items: [
				{
					name: "Bow harpoon",
					type: "weapon",
					system: {
						damage: "d8",
						ranged: true,
						slow: true,
						rarity: "uncommon",
						quantity: { value: 3, max: 5 },
						specialist: { die: "d10", situation: "against anything in the water" },
						description: html("Lashed to a swivel at the bow. Its line is fifty feet of tarred rope.")
					}
				},
				{ name: "Boathook", type: "weapon", system: { damage: "d6", long: true, description: html("Mostly for fending off the pews.") } },
				{ name: "Pilgrims' salt", type: "gear", system: { quantity: { value: 6, max: 6 }, rarity: "common", description: html("Six sacks, damp at the bottom.") } },
				{ name: "Spare oars", type: "gear", system: { broken: true, description: html("Split when the pike struck.") } },
				{ name: "Cask of eel-oil", type: "gear", system: { remedy: "spi", restock: "season", description: html("Anselm swears by it against the cold. One cup each, shared out round a fire.") } }
			]
		});

		await Actor.implementation.create({
			name: "Old Gullet",
			type: "npc",
			img: PIKE_IMAGE,
			folder,
			flags: testFlags(),
			system: {
				epithet: `The Pike of ${this.names.ruin}`,
				scale: "individual",
				age: "old",
				wields: "free",
				virtues: { vig: track(13, 17), cla: track(12), spi: track(6, 9) },
				guard: track(2, 6),
				armour: 1,
				armourNote: "Scales like roof slates, green with weed",
				wounded: true,
				fatigued: true,
				immunity: "Can't be harmed while wholly under the water.",
				weakness: { text: "The chapel bell: its ringing drives it into the deep", die: "d8", known: true },
				inflicts: [{ id: foundry.utils.randomID(), name: "Mere-rot", loss: "1d4", virtue: "vig", when: "day" }],
				feats: { smite: false, focus: false, deny: true },
				notes: [
					"<h2>Traits</h2>",
					list(
						"The length of a man and a half, and older than the flood.",
						"Rises under anything that wades or floats, and drags it down.",
						"Its bite festers: those it wounds lose VIG each morning until the wound is cleaned with salt."
					),
					"<h2>What the Company know</h2>",
					html(
						`${this.knights.isolde.name} was dragged under in Harvest of Age 1 and put a blade in its flank, which is still there.`,
						"Ringing the bell sent it into the deep. The bell is under the silt now."
					),
					`<section class="secret" id="secret-pike">${html("The reliquary of Saint Brannoc is in its belly. Anselm knows, and would sooner keep the pike than lose the pilgrims it scares away.")}</section>`
				].join("")
			},
			items: [
				{ name: "Rake of teeth", type: "weapon", system: { damage: "d8", hefty: true, description: html("Backward-curved; what it bites, it keeps.") } },
				{ name: "Tail", type: "weapon", system: { damage: "d6", nonLethal: true, description: html("Swamps a boat or knocks a wader flat.") } },
				{ name: "Isolde's dagger", type: "weapon", system: { damage: "d6", equipped: false, description: html("Still in its flank, rusted to the hilt.") } },
				{ name: "Reliquary of Saint Brannoc", type: "gear", system: { rarity: "rare", description: html("Sealed with green wax. In its belly.") } }
			]
		});
	}

	/* -------------------------------------------- */
	/*  Writing it up                               */
	/* -------------------------------------------- */

	/** The Knights' Chronicles, what they know of their Seers, and the GM's own notes. */
	async writeUp() {
		const { isolde, corvin, oswin } = this.knights;
		const chronicle = (deeds) => `<h2>Chronicle</h2>${list(...deeds.map((deed) => foundry.utils.escapeHTML(deed)))}`;
		await isolde.update({
			"system.notes": chronicle(this.deeds.isolde),
			"system.seerNotes": html("Hasn't been seen since the Knighting. Isolde means to ask them what her Oath was really for.")
		});
		await corvin.update({
			"system.notes": chronicle(this.deeds.corvin),
			"system.seerNotes": html(`Corvin swears they were at the edge of the crowd at the ${this.names.tourney} tourney, and gone when he looked again.`)
		});
		await oswin.update({
			"system.notes": chronicle(this.deeds.oswin),
			"system.seerNotes": html("Gave him a riddle at his Knighting. He still hasn't worked it out, and won't admit it.")
		});

		const second = this.myth(this.mythNumbers.second);
		const due = crisisRollsDue(worldDomains(), getCalendar()).map((domain) => domain.name);
		await this.toolkit.update({
			"system.notes": [
				"<h2>Where we left off</h2>",
				html(`${calendarLabel(getCalendar())}. The Company are camped on the road to ${this.mythName(second)}, a day or two short of it. ${corvin.name} is Fatigued, and Doomed until the Season turns.`),
				"<h2>Plans the players shared</h2>",
				list(
					`${isolde.name}: mend the walls of ${this.names.domain} before Winter, and find the Famine's cause.`,
					`${corvin.name}: find out what the Seer at ${this.names.sanctum} wanted with the locks of hair.`,
					`${oswin.name}: win the envoy of ${this.names.domain} over, and settle the man who humiliated him.`
				),
				"<h2>Threads</h2>",
				list(
					`${this.mythName(second)} is close. Its next Omen should land on the Company, not near them.`,
					due.length ? `Crisis Roll owed this Season: ${due.join(", ")}.` : null,
					`${COUNCIL.steward}'s search for the grain is due. Settle it on the Domain sheet, and let her lie about it.`,
					this.warband ? `${this.warband.name} went hungry at the Feast of the Stars. Another lean week and they'll stop following orders.` : null,
					`${SQUIRE_NAME} squires for ${isolde.name}, though a Company of three shouldn't take Squires by the book. I allowed it; he's the steward's spy.`,
					`${this.names.dwelling} is still unvisited. Someone there knows who holds the Seat's debts.`
				),
				`<section class="secret" id="secret-testworld">${html(`The steward at ${this.names.domain} is still loyal to the old lord, and is starving the stores on purpose.`)}</section>`
			].join("")
		});
	}

	/**
	 * End the session where the game has got to, as the Ending a Session window
	 * ends one (p16): no time passes, two threads left hanging are rolled on,
	 * and the recap and the players' plans go into this Season's notes.
	 */
	async endSession() {
		const { corvin } = this.knights;
		const situations = [];
		for (const name of ["The smoke to the north", `${COUNCIL.steward} and the missing grain`]) {
			const rolled = await rollRefereeTable("unresolved");
			if (rolled) situations.push({ name, d6: rolled.d6, result: rolled.result });
		}
		await endTheSession({
			step: "none",
			passed: t("sessionEnd.time.steps.none.card"),
			situations,
			glory: [],
			plans: `Go and look at the smoke in the Morning, then on to ${this.mythName(this.myth(this.mythNumbers.second))}. ${corvin.name} wants to rest a day first; nobody else does.`,
			recap: "A skirmish on the road in the Morning, and a wet Afternoon in camp. Short session: two players were late."
		});
	}
}
