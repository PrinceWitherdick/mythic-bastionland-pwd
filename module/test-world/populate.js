/**
 * The "(TEST ONLY) Populate World" macro: a fake game of Mythic Bastionland,
 * five Seasons in, for seeing what the sheets, the GM Toolkit and a Realm look
 * like once a campaign has been going a while. The world's calendar is moved
 * on a Phase at a time as the Company travels, so the Journey, the Spark
 * rolls, the Scars and the Seasons page carry the dates they would have had in
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
import { setCompanyHex } from "../actions/company.js";
import { linkKnightDomain, settleDomains, worldDomains } from "../actions/dominion.js";
import { adjustGlory } from "../actions/glory.js";
import { openGmToolkit, theGmToolkit } from "../actions/gm-toolkit.js";
import { rollHexSpark, rollHexSparkSet, tellPlayersAboutHex, writeHexNote } from "../actions/hex-lore.js";
import { recordHexVisits } from "../actions/journey.js";
import { editMythNote } from "../actions/myth-notes.js";
import { actorData } from "../actions/npc.js";
import { createRealmScene, editRealm, getRealm, sceneGeometry } from "../actions/realm.js";
import { recordSeasonTurn, writeSeasonNotes } from "../actions/season-log.js";
import { SITE_FLAG, SITE_SHEET_CLASS } from "../actions/sites.js";
import { announcePhase, announceSeason, hardshipFor, passTime, rollAging } from "../actions/time.js";
import { findByRoll, loadArtIndex, mythEntry, seerEntry } from "../book-art/art-index.js";
import { postCard, statLabels, t } from "../chat/cards.js";
import { STANDARD_KIT, knightItems, knightUpdate, startFor } from "../rules/creation.js";
import { crisesDrawn, crisisFor, crisisResult } from "../rules/dominion.js";
import { mythRollTaken } from "../rules/gm-toolkit.js";
import { chargePath } from "../rules/heraldry-charges.js";
import { MAX_INLINE_LENGTH, PAINTING_HEIGHT, PAINTING_WIDTH, PAINT_SCALE } from "../rules/heraldry.js";
import { OMEN_COUNT } from "../rules/realm.js";
import { editFeature, placeFeature, setBarrier, setOmen, setRevealed } from "../rules/realm-edits.js";
import { createRandom } from "../rules/random.js";
import { scarForRoll, scarRaisesGuardNow } from "../rules/scars.js";
import { crisisRollsDue } from "../rules/season-log.js";
import { emptySite, numberedPoints, revealEntrance, revealPoint, rollSite, SITE_EDGES } from "../rules/sites.js";
import { HARDSHIPS, PHASES, nextAge, nextSeason, seasonKey } from "../rules/time.js";
import { VIRTUES } from "../rules/virtues.js";
import { SYSTEM_ID } from "../system-id.js";
import { barriersBeside, companionActorData, heraldrySvg, isSteed, pickPlaces, propertyItems, seasonRoad } from "./plan.js";

/** Marks every document the macro makes, so running it again can find and delete them. */
export const TEST_FLAG = "testWorld";

/** The GM Toolkit flag keeping the calendar, notes and Seasons as they were, to put back. */
export const BEFORE_FLAG = "testWorldBefore";

const REALM_NAME = "Gravenmoor";
const REALM_SEED = "gravenmoor";
const FOLDER_NAME = "Test World";
const FOLDER_COLOR = "#6b3a8c";

/** The Company are Courtiers: Mature Knights-Gallant with a place in Court at the Seat of Power (p6). */
const START = "courtier";

const STEED_IMAGE = "icons/environment/people/cavalry.webp";
const DOMAIN_IMAGE = "icons/environment/settlement/castle.webp";
const STRUCTURE_IMAGE = "icons/environment/settlement/fence-wooden-picket.webp";

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
			property: ["Longsword (d8 hefty), mail (A1) and helm (A1)", "Kite shield (d4, A1) painted with a lantern", "Steady steed (VIG 11, CLA 9, SPI 5, 3GD)"],
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
			property: ["Warhammer (d8 hefty), ringmail (A1), plate (A1)", "Smith's tools", "Heavy warhorse (VIG 14, CLA 6, SPI 5, 3GD, d6 trample)"],
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
				"<strong>Permanently delete</strong> its Knights, NPCs, Domain, Realm, Sites, folders and chat messages, and put the calendar and the GM Toolkit's notes and Seasons back as they were?"
			]);
			if (confirmed) await removeTestWorld();
			return;
		}
		const confirmed = await confirm("Populate the Test World", [
			`This adds a fake game five Seasons in: three Knights of a Company of Courtiers, their steeds and a Domain, the Realm of ${REALM_NAME} with its Journey, Places, Myths and Omens, two Sites, a year of chat, and the GM Toolkit's Seasons and notes filled in.`,
			"The world's calendar moves on to where the game has got to. Run the macro again to remove it all and put the calendar and the GM Toolkit back.",
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
	const scenes = await remove("Scene", game.scenes);
	const actors = await remove("Actor", game.actors);
	const entries = await remove("JournalEntry", game.journal);
	await remove("Folder", game.folders);

	const toolkit = theGmToolkit();
	const before = toolkit?.getFlag(SYSTEM_ID, BEFORE_FLAG);
	if (before) {
		await setCalendar(before.calendar);
		await toolkit.update({
			"system.notes": before.notes ?? "",
			"system.seasons": foundry.data.operators.ForcedReplacement.create(before.seasons ?? {}),
			[`flags.${SYSTEM_ID}.${BEFORE_FLAG}`]: new foundry.data.operators.ForcedDeletion()
		});
	}
	if (!canvas.scene && game.scenes.active) await game.scenes.active.view();
	ui.notifications.info(`Removed the test world: ${actors} actors, ${scenes} Realm, ${entries} Sites and ${messages} chat messages.${before ? " The calendar and the GM Toolkit are as they were." : ""}`);
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
			seasons: foundry.utils.deepClone(toolkit.system.seasons ?? {})
		}
	});

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
		this.domain = null;
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
		const places = pickPlaces(this.realm);
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
			const update = knightUpdate({ start, virtues: rolled, guard: rolled.guard, knight, seer, statLabels: statLabels() });
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
					...(isSteed(companion.name) ? { img: STEED_IMAGE } : {}),
					name: `${companion.name} (${spec.name.split(" ").slice(0, 2).join(" ")})`,
					folder: this.folders.Actor.id,
					flags: testFlags()
				});
				if (index === 0 && isSteed(companion.name)) changes["system.steed"] = npc.uuid;
			}
			await actor.update(changes);
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
				if (!(camp && last)) await recordHexVisits(this.scene, [hex]);
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

	/** @param {{col: number, row: number}} hex */
	reveal(hex) {
		return hex ? editRealm(this.scene, (realm) => setRevealed(realm, hex, true)) : null;
	}

	/** Reveal the first hidden Barrier beside the road walked so far, as the Company finds it barring the way. */
	async findBarrier() {
		const [edge] = barriersBeside(this.realm, this.walked);
		if (edge) await editRealm(this.scene, (realm, g) => setBarrier(realm, g, edge, "revealed"));
	}

	/**
	 * Roll one Spark Table for a hex, when the GM has imported the book's.
	 * @param {{col: number, row: number}} hex
	 * @param {string} page A SPARK_PAGES key.
	 * @param {number} index The table's place on its page.
	 */
	spark(hex, page, index) {
		if (!hex || !this.index?.spark?.some((candidate) => candidate.key === page)) return null;
		return rollHexSpark({ scene: this.scene, hex, page, index });
	}

	/** @param {{col: number, row: number}} hex Rolled as the Wilderness is (p22). */
	wilderness(hex) {
		if (!hex || !this.index?.spark?.length) return null;
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
		let d6;
		let d12;
		for (let tries = 0; tries < 100; tries++) {
			d6 = await new Roll("1d6").evaluate();
			d12 = await new Roll("1d12").evaluate();
			if (!mythRollTaken(this.realm, { d6: d6.total, d12: d12.total })) break;
		}
		const rolled = { number, d6: d6.total, d12: d12.total };
		await editRealm(this.scene, (realm, g) => placeFeature(realm, g, myth.hex, { kind: "myth", ...rolled, omen: 0, revealed: false }));
		const { name, page, entry } = mythEntry(this.index, rolled);
		await postCard(null, "omen", {
			title: `${number}. ${name}`,
			tagline: page ? t("realm.key.page", { page }) : null,
			img: entry?.path ?? null,
			omen: t("gmToolkit.myths.newMythRolled", { hex: t("realm.hex", myth.hex) }),
			text: null,
			hint: t("gmToolkit.myths.newMythHint")
		}, { rolls: [d6, d12], mode: "gm" });
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
			system: { roll: scar.roll, season: seasonKey(getCalendar()), description: `<p><em>${text("flavour")}</em></p><p>${text("effect")}</p>` }
		}]);
		await postCard(actor, "scar", { faces, roll: scar.roll, name: text("name"), flavour: text("flavour"), effect: text("effect"), location, lines }, { rolls });
		return name;
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
		const all = [...entries, ...(await settleDomains(ended))];
		const title = newAge ? t("time.ageTurned", { age: after.age }) : t("time.seasonTurned", { season: t(`time.seasons.${after.season}`) });
		await announceSeason(after, { title, entries: all }, { rolls });
		await recordSeasonTurn(ended, { kind: newAge ? "age" : "season", title, entries: all, note: null });
	}

	/* -------------------------------------------- */
	/*  The Seasons                                 */
	/* -------------------------------------------- */

	/** Age 1, Spring: presented at Court, then out to find the Seer at the Sanctum. */
	async springOfAgeOne() {
		const { isolde, corvin, oswin } = this.knights;
		const { seat, sanctum, dwelling } = this.places;
		const { first } = this.mythNumbers;
		await recordHexVisits(this.scene, [this.here]);
		this.walked.push(this.here);
		await this.note(seat?.hex, `The Court of ${this.names.seat}, where the Company hold places as Courtiers. The steward keeps a cold hall; the kitchens are warmer, and the cook talks.`);
		await this.spark(seat?.hex, "civilisation", 0);
		await this.note(dwelling?.hex, `${this.names.dwelling}. Said at Court to take in travellers and ask no questions. Not visited yet.`);
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
				await this.omen(first);
				const scar = await this.scar(corvin, 6, 1);
				this.deeds.corvin.push(`Spring, Age 1: ambushed on the road to ${this.names.sanctum}, and took ${scar}.`);
			}
		});
		this.deeds.isolde.push(`Spring, Age 1: presented at the Court of ${this.names.seat}.`);
		this.deeds.oswin.push(`Spring, Age 1: presented at the Court of ${this.names.seat}; the steward already dislikes him.`);
		await writeSeasonNotes("1-spring", `The Company arrive at ${this.names.seat} as Courtiers. First session: introductions at Court, then out to find the Seer at ${this.names.sanctum}. ${isolde.name} charmed the envoy; ${oswin.name} did not.`);
		await this.turn({ pursuits: { isolde: "courtesy", corvin: "pilgrimage", oswin: "service" } });
	}

	/** Age 1, Harvest: the Drowned Chapel explored, and the tourney won. */
	async harvestOfAgeOne() {
		const { isolde } = this.knights;
		const { ruin, tourney, monument } = this.places;
		const { first, second } = this.mythNumbers;
		const stops = [{ name: "ruin", hex: ruin?.hex }, { name: "tourney", hex: tourney?.hex }].filter((stop) => stop.hex);
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
					await tellPlayersAboutHex({ scene: this.scene, hex });
					const scar = await this.scar(isolde, 10, 10);
					this.deeds.isolde.push(`Harvest, Age 1: dragged under at ${this.names.ruin}, and came up with ${scar}.`);
				} else {
					await this.note(hex, `${this.names.tourney}. The Harvest tourney: ${isolde.name} unhorsed the champion in front of half the Realm. The reeve still owes the Company a supper.`);
					await this.spark(hex, "civilisation", 6);
					await this.omen(first);
					await this.award("tournament", [isolde]);
					this.deeds.isolde.push(`Harvest, Age 1: won the Harvest tourney at ${this.names.tourney}.`);
				}
			}
		});
		await writeSeasonNotes("1-harvest", `Explored ${this.names.ruin}. The players loved the floating pews. Then the Harvest tourney at ${this.names.tourney}, which ${isolde.name} won.`);
		await this.turn({ pursuits: { isolde: "service", corvin: "courtesy", oswin: "pilgrimage" } });
	}

	/** Age 1, Winter: a hard road, and the first Myth met to its end. */
	async winterOfAgeOne() {
		const { isolde, corvin, oswin } = this.knights;
		const { first } = this.mythNumbers;
		const mythHex = this.myth(first)?.hex;
		await hardshipFor(HARDSHIPS.find(({ key }) => key === "winter"), this.company);
		const road = seasonRoad(this.realm, this.g, this.here, mythHex ? [{ name: "myth", hex: mythHex }] : []);
		await this.travel(road, {
			onDay: async (index) => {
				if (index === 0) {
					await this.omen(first);
					await this.findBarrier();
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
				await this.award("myth", this.company);
				await this.note(hex, `Where ${name} ended, in the deep of Winter. Burnt ground; nothing grows here yet.`);
				for (const key of ["isolde", "corvin", "oswin"]) this.deeds[key].push(`Winter, Age 1: saw ${name} to its end.`);
			}
		});
		await writeSeasonNotes("1-winter", `A hard Winter on the road: everyone lost VIG to the cold. ${this.mythName(this.myth(first))} ended at last. Good session; ${corvin.name}'s player cried.`);
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

	/** Age 2, Spring: a new Myth, a battle, and a Holding granted. */
	async springOfAgeTwo() {
		const { isolde, corvin, oswin } = this.knights;
		const { domain } = this.places;
		const { first, second } = this.mythNumbers;
		await this.newMyth(first);
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
			}
		});
		await writeSeasonNotes("2-spring", `The new Age. A new Myth stirs where the old one ended. The battle at ${this.names.domain}: ${isolde.name} was granted it after. ${corvin.name} sat it out.`);
		await this.turn({ pursuits: { isolde: "service", corvin: "pilgrimage", oswin: "courtesy" } });
	}

	/** Age 2, Harvest, where the game has got to: on the road toward the next Myth. */
	async harvestOfAgeTwo() {
		const { isolde, corvin, oswin } = this.knights;
		const { second, third } = this.mythNumbers;
		const target = this.myth(second)?.hex;
		const road = seasonRoad(this.realm, this.g, this.here, target ? [{ name: "myth", hex: target }] : [], { stopShort: true });
		await this.travel(road, {
			camp: true,
			onDay: async (index, steps) => {
				if (index === 0) {
					await this.omen(second);
					await this.makeCast(this.myth(second));
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
		await this.note(final, `The Company's camp on the road to ${this.mythName(myth)}. Smoke to the north at dusk; nobody has gone to look yet.`);
		await editMythNote(this.scene, myth, { note: `Its Omens keep turning up around ${this.names.domain}, and the villagers are starting to blame the Company. They're a day or two from it now.` });
		const rumoured = this.myth(third);
		if (rumoured) await editMythNote(this.scene, rumoured, { note: "One Omen, met on the road north. The players haven't tied it to anything yet." });
		// The Journey counts the hex the Company's Token is put in, as it would the Referee placing it.
		await setCompanyHex(this.scene, final);

		await isolde.update({ "system.virtues.vig.value": Math.max(1, isolde.system.virtues.vig.max - 3), "system.virtues.spi.value": Math.max(1, isolde.system.virtues.spi.max - 4), "system.guard.value": Math.min(2, isolde.system.guard.max) });
		await corvin.update({ "system.virtues.cla.value": Math.max(1, corvin.system.virtues.cla.max - 5), "system.guard.value": Math.min(1, corvin.system.guard.max), "system.fatigued": true });
		await oswin.update({ "system.virtues.vig.value": Math.max(1, oswin.system.virtues.vig.max - 6), "system.virtues.cla.value": Math.max(1, oswin.system.virtues.cla.max - 1) });
		this.deeds.isolde.push(`Harvest, Age 2: rides out from ${this.names.domain} with the walls half-mended.`);
		this.deeds.oswin.push(`Harvest, Age 2: sits in the Circle at ${this.names.domain}, and is courting its envoy.`);
		await writeSeasonNotes("2-harvest", `On the road toward ${this.mythName(myth)}. ${corvin.name} took a Doom Scar this Season: a Mortal Wound would Slay him until it turns. ${this.names.domain} is owed its Crisis Roll.`);
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
	 * One of a Myth's Cast, met on the road, from their stat block in the GM's import.
	 * @param {object|null} myth
	 */
	async makeCast(myth) {
		const { entry } = myth ? mythEntry(this.index, myth) : {};
		const person = entry?.cast?.[0];
		if (!person) return;
		const data = actorData(person);
		await Actor.implementation.create({
			type: data.type,
			name: data.name || entry.name,
			...(entry.path ? { img: entry.path } : {}),
			system: { ...data.system, notes: `${data.system.notes ?? ""}${html(`Met on the road in Harvest of Age 2. Knows where ${entry.name} will show itself next.`)}` },
			items: data.items,
			folder: this.folders.Actor.id,
			flags: testFlags()
		});
	}

	/**
	 * The Holding granted to Dame Isolde after the battle, with its Council, its
	 * first Crisis Roll, and its walls.
	 * @param {{col: number, row: number}} hex
	 */
	async makeDomain(hex) {
		const { isolde, oswin } = this.knights;
		this.domain = await Actor.implementation.create({
			name: this.names.domain,
			type: "domain",
			img: DOMAIN_IMAGE,
			folder: this.folders.Actor.id,
			flags: testFlags(),
			system: {
				seat: false,
				council: { ...COUNCIL, circle: oswin.name },
				notes: html(
					`Granted to ${isolde.name} after the battle in Spring of Age 2. The old lord's household stayed on; the steward was his.`,
					"The walls need work before Winter."
				)
			}
		});
		await linkKnightDomain(isolde, this.domain);
		await this.crisis(this.domain);
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
			tagline: t("domain.results.crisis.dilemma"),
			d6: roll.total,
			entries: [{ name: t(`domain.crises.${chosen}.name`), lines: [t(`domain.crises.${chosen}.flavour`), t(`domain.crises.${chosen}.resolution`)] }]
		}, { rolls });
	}

	/**
	 * Two Sites: the Drowned Chapel, explored, with what the Company found
	 * written in; and a barrow prepared for later, not yet visited.
	 * @param {{col: number, row: number}} hex The ruin's.
	 */
	async makeSites(hex) {
		const JournalEntry = foundry.utils.getDocumentClass("JournalEntry");
		const create = (name, site) => JournalEntry.create({
			name,
			folder: this.folders.JournalEntry.id,
			flags: { core: { sheetClass: SITE_SHEET_CLASS }, [SYSTEM_ID]: { [SITE_FLAG]: site, [TEST_FLAG]: true } }
		});

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
					`${this.names.dwelling} is still unvisited. Someone there knows who holds the Seat's debts.`
				),
				`<section class="secret" id="secret-testworld">${html(`The steward at ${this.names.domain} is still loyal to the old lord, and is starving the stores on purpose.`)}</section>`
			].join("")
		});
	}
}
