import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRealm } from "../../module/rules/realm.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const g = realmGeometry({ cols: 8, rows: 8 });
const hex = { col: 3, row: 4 };
const scene = { id: "realm" };

const writeHexNote = vi.fn();
const renameLandmark = vi.fn();
const openHexEditor = vi.fn();
const rollHexSparkSet = vi.fn(async () => []);
const twoRolls = { note: "Smoke to the north.", sparks: [{ id: "s1" }, { id: "s2" }] };
let heldRecord = twoRolls;

vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
vi.mock("../../module/actions/exploration.js", () => ({ takeExplorationAct: vi.fn() }));
vi.mock("../../module/actions/hex-lore.js", () => ({
	forgetHexSpark: vi.fn(),
	getHexRecord: () => heldRecord,
	hexFeatures: () => [],
	renameHexSpark: vi.fn(),
	rollHexSparkSet: (...args) => rollHexSparkSet(...args),
	sparkView: (spark) => spark,
	tellPlayersAboutHex: vi.fn(),
	writeHexNote: (...args) => writeHexNote(...args)
}));
vi.mock("../../module/actions/hex-journals.js", () => ({ hexJournalsOn: () => true, openHexJournal: vi.fn() }));
vi.mock("../../module/actions/journey.js", () => ({ getHexVisits: () => null, markHexVisited: vi.fn() }));
vi.mock("../../module/actions/landmarks.js", () => ({
	landmarkOfferView: vi.fn(() => null),
	renameLandmark: (...args) => renameLandmark(...args),
	rerollLandmarkName: vi.fn(),
	takeLandmarkOffer: vi.fn()
}));
vi.mock("../../module/actions/people.js", () => ({ rollUpHolding: vi.fn() }));
let heldRealm = emptyRealm(g);
vi.mock("../../module/actions/realm.js", () => ({
	getRealm: (one) => (one === scene ? { realm: heldRealm } : null),
	isDrawingRealm: () => false,
	sceneGeometry: () => g,
	stepRealmHistory: vi.fn()
}));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollRefereeTable: vi.fn() }));
let solo = false;
vi.mock("../../module/actions/solo.js", () => ({ keptFromMe: () => solo, realmKnown: (realm) => realm }));
vi.mock("../../module/actions/wilderness.js", () => ({ wildernessRoll: vi.fn() }));
const stepHexOmen = vi.fn();
const rollHexSeer = vi.fn(async () => {});
vi.mock("../../module/apps/hex-edit.js", () => ({
	HEX_FEATURE_ACTIONS: {
		rollSeer: ({ scene, hex }) => rollHexSeer(scene, hex),
		omenStep: ({ scene, hex }, target) => stepHexOmen(scene, hex, target.dataset.step),
		toggleReveal: vi.fn()
	}
}));
let heldActors = [];
vi.mock("../../module/actions/myth-cast.js", () => ({ castActors: () => heldActors, castKey: () => "1-01" }));
let heldRulers = [];
const grantHolding = vi.fn();
vi.mock("../../module/actions/holding-ruler.js", () => ({ grantHolding: (...args) => grantHolding(...args), rulersOf: () => heldRulers }));
const openSeerChooser = vi.fn();
vi.mock("../../module/apps/SeerChooser.js", () => ({ openSeerChooser: (...args) => openSeerChooser(...args) }));
const showMyth = vi.fn();
vi.mock("../../module/actions/gm-toolkit.js", () => ({ openGmToolkit: vi.fn(), theGmToolkit: () => ({ sheet: { showMyth } }) }));
vi.mock("../../module/apps/hex-forget.js", () => ({
	HEX_FORGET_ACTIONS: { forgetVisits: vi.fn(), forgetAll: vi.fn() },
	hexForgetContext: () => ({ noVisits: true, nothing: false })
}));
vi.mock("../../module/apps/HexEditor.js", () => ({ openHexEditor: (...args) => openHexEditor(...args) }));
vi.mock("../../module/apps/hex-rename.js", () => ({ wirePersonRename: vi.fn() }));
vi.mock("../../module/apps/RollPerson.js", () => ({ openRollPerson: vi.fn() }));
vi.mock("../../module/actions/calendar.js", () => ({ momentLabel: (when) => when.label }));

const { HEX_GM_ACTIONS, hexGmContext, hexGmState, sparkTab, writeHexGmField } = await import("../../module/apps/hex-gm-part.js");

const view = { openable: true, barriers: [], told: [] };

beforeEach(() => {
	globalThis.game = { user: { isGM: true } };
});

afterEach(() => {
	heldRecord = twoRolls;
	heldRealm = emptyRealm(g);
	heldActors = [];
	heldRulers = [];
	solo = false;
	delete globalThis.game;
	vi.clearAllMocks();
});

describe("the Lay of the Land, the GM's part of a hex in Places", () => {
	it("is drawn for a GM alone", () => {
		expect(hexGmContext({ scene, hex, view, index: null, state: hexGmState() })).not.toBeNull();
		game.user.isGM = false;
		expect(hexGmContext({ scene, hex, view, index: null, state: hexGmState() })).toBeNull();
	});

	it("holds the GM's note to change, the rolls newest first, and what there is to forget", () => {
		const part = hexGmContext({ scene, hex, view, index: { spark: [{}] }, state: hexGmState() });
		expect(part.note).toBe("Smoke to the north.");
		expect(part.land.sparks.map((spark) => spark.id)).toEqual(["s2", "s1"]);
		expect(part.forget).toEqual({ noVisits: true, nothing: false });
		// The hex itself is changed in a window of its own, opened from the pen beside its terrain.
		expect(part).not.toHaveProperty("edit");
		expect(part.journal).toBe(true);
	});

	it("shows the latest go of rolls in full and folds each earlier one into a dated row", () => {
		heldRecord = {
			note: "",
			sparks: [
				{ id: "a", table: "Ground", batch: "x", when: "Morning" },
				{ id: "b", table: "Sky", batch: "x", when: "Morning" },
				{ id: "c", table: "Mood", batch: "y", when: "Noon" },
				{ id: "d", table: "Ground", batch: "z", when: "Night" }
			]
		};
		const state = hexGmState();
		state.older.add("a");
		const part = hexGmContext({ scene, hex, view, index: null, state });
		expect(part.land.sparks.map((spark) => spark.id)).toEqual(["d"]);
		expect(part.land.older).toEqual([
			{ key: "c", when: "Noon", names: "Mood", open: false, sparks: [heldRecord.sparks[2]] },
			{ key: "a", when: "Morning", names: "Sky, Ground", open: true, sparks: [heldRecord.sparks[1], heldRecord.sparks[0]] }
		]);
	});

	it("keeps every person met here in full, whenever they were rolled", () => {
		heldRecord = {
			note: "",
			sparks: [
				{ id: "p1", table: "A person", batch: "x", person: true },
				{ id: "a", table: "Ground", batch: "x" },
				{ id: "p2", table: "A person", batch: "y", person: true },
				{ id: "b", table: "Sky", batch: "z" }
			]
		};
		const part = hexGmContext({ scene, hex, view, index: null, state: hexGmState() });
		expect(part.people.map((spark) => spark.id)).toEqual(["p2", "p1"]);
		expect(part.land.sparks.map((spark) => spark.id)).toEqual(["b"]);
		expect(part.land.older.map((row) => row.sparks.map((spark) => spark.id))).toEqual([["a"]]);
	});

	it("sorts what's kept into tabs: people, the land, and the Holding where one stands", () => {
		expect(sparkTab({ person: true, page: "civilisation" }, true)).toBe("people");
		expect(sparkTab({ page: "people" }, false)).toBe("people");
		expect(sparkTab({ page: "civilisation" }, true)).toBe("holding");
		// With no Holding here, a roll on the Civilisation tables is read with the land.
		expect(sparkTab({ page: "civilisation" }, false)).toBe("land");
		expect(sparkTab({ page: "nature" }, true)).toBe("land");
		expect(sparkTab({ page: "combat" }, true)).toBe("land");
	});

	it("has a tab for the people and the land, and for a Landmark or Holding only where the hex has one", () => {
		const keys = (part) => part.tabs.map(({ key }) => key);
		const bare = hexGmContext({ scene, hex, view, index: null, state: hexGmState() });
		expect(keys(bare)).toEqual(["people", "land"]);
		expect(bare.holding).toBeNull();
		expect(bare.landmark).toBeNull();
		heldRealm = { ...emptyRealm(g), holdings: [{ hex, style: "town" }], landmarks: [{ hex, type: "sanctum" }] };
		heldRecord = {
			note: "",
			sparks: [
				{ id: "h1", page: "civilisation", table: "Holding", batch: "x" },
				{ id: "p1", page: "people", table: "A person", batch: "x", person: true },
				{ id: "n1", page: "nature", table: "Ground", batch: "y" }
			]
		};
		const full = hexGmContext({ scene, hex, view, index: null, state: hexGmState() });
		expect(keys(full)).toEqual(["people", "land", "landmark", "holding"]);
		// The Landmark's tab is named by its type.
		expect(full.tabs[2].label).toBe("realm.landmarks.sanctum");
		expect(full.tabs.map(({ count }) => count)).toEqual([1, 1, 0, 1]);
		expect(full.holding.sparks.map((spark) => spark.id)).toEqual(["h1"]);
		expect(full.land.sparks.map((spark) => spark.id)).toEqual(["n1"]);
	});

	it("opens on the tab last chosen, or the land's where this hex hasn't that tab", () => {
		const state = { ...hexGmState(), tab: "people" };
		const part = hexGmContext({ scene, hex, view, index: null, state });
		expect(part.tab).toBe("people");
		expect(part.tabs.filter(({ active }) => active).map(({ key }) => key)).toEqual(["people"]);
		state.tab = "holding";
		expect(hexGmContext({ scene, hex, view, index: null, state }).tab).toBe("land");
		// The choice is kept for the next hex that has a Holding.
		expect(state.tab).toBe("holding");
	});

	it("says under the note whether what the players were last told is out of date, with Tell the players where they're behind", () => {
		const told = [{ id: "b", note: "Smoke to the north.", when: { label: "Spring" } }, { id: "a", note: "Smoke.", when: null }];
		const part = hexGmContext({ scene, hex, view: { ...view, told }, index: null, state: hexGmState() });
		expect(part.told.state).toBe("current");
		expect(part.told.latest).toBe("Smoke to the north.");
		expect(part.told.says.map(({ key, text, tell }) => [key, text, tell])).toEqual([
			["current", "hexGm.told.current", null],
			["stale", "hexGm.told.stale", "hexGm.told.tellAgain"],
			["unsaid", "hexGm.told.unsaid", "hexLore.tell"],
			["kept", "hexGm.told.kept", null]
		]);
		heldRecord = { note: "Smoke and a fire to the north.", sparks: [] };
		expect(hexGmContext({ scene, hex, view: { ...view, told }, index: null, state: hexGmState() }).told.state).toBe("stale");
		// An undated telling is worded without a date.
		const undated = hexGmContext({ scene, hex, view: { ...view, told: [told[1]] }, index: null, state: hexGmState() }).told;
		expect(undated.says.find(({ key }) => key === "stale").text).toBe("hexGm.told.staleUndated");
		expect(hexGmContext({ scene, hex, view, index: null, state: hexGmState() }).told.state).toBe("unsaid");
	});

	it("names the land of a hex the players don't know, which their part leaves out", () => {
		expect(hexGmContext({ scene, hex, view, index: null, state: hexGmState() }).terrain).toBeNull();
		expect(hexGmContext({ scene, hex, view: { ...view, openable: false }, index: null, state: hexGmState() })).toHaveProperty("terrain");
	});

	it("saves each field to its own writer as it's changed", () => {
		writeHexGmField(scene, hex, { name: "note", value: "A well." });
		expect(writeHexNote).toHaveBeenCalledWith(scene, hex, "A well.");
		writeHexGmField(scene, hex, { name: "landmarkName", value: "  The Leaning Stone  " });
		expect(renameLandmark).toHaveBeenCalledWith(scene, hex, "The Leaning Stone");
		// The hex's own fields are Edit this hex's, and the players' note is Places' own.
		expect(writeHexGmField(scene, hex, { name: "kind", value: "myth" })).toBeUndefined();
		expect(writeHexGmField(scene, hex, { name: "party", value: "theirs" })).toBeUndefined();
	});

	it("opens Edit this hex on the hex shown, from the pen beside its terrain", () => {
		HEX_GM_ACTIONS.editHex({ scene, hex });
		expect(openHexEditor).toHaveBeenCalledWith({ scene, hex });
	});

	it("has an action for every button its template draws", () => {
		const template = read("templates/apps/parts/hex-gm.hbs");
		const drawn = new Set([...template.matchAll(/data-action="([^"]+)"/g)].map(([, action]) => action));
		for (const action of drawn) expect(HEX_GM_ACTIONS, action).toHaveProperty(action);
		// And the players' part's own buttons for a GM, the pen that opens Edit this hex among them.
		expect(HEX_GM_ACTIONS).toHaveProperty("markVisited");
		expect(HEX_GM_ACTIONS).toHaveProperty("editHex");
		// And the Journal it hangs in the window's title bar.
		expect(HEX_GM_ACTIONS).toHaveProperty("hexJournal");
	});

	it("leaves the players' told list to players, a GM reading it in the Lay of the Land", () => {
		const detail = read("templates/apps/parts/travels-hex-detail.hbs");
		expect(detail).toMatch(/\{\{#unless gm\}\}\s*<h3 class="bastionland-heading">\{\{localize "bastionland\.travels\.told\.heading"\}\}<\/h3>/);
		expect(detail).not.toContain("forgetTold");
		expect(read("templates/apps/parts/hex-gm.hbs")).not.toMatch(/forgetTold|data-hex-told/);
	});

	it("rolls a wilderness hex once however often it's clicked", async () => {
		const state = hexGmState();
		const target = { disabled: false };
		await Promise.all([HEX_GM_ACTIONS.rollWildHex({ scene, hex, state }, target), HEX_GM_ACTIONS.rollWildHex({ scene, hex, state }, target)]);
		expect(rollHexSparkSet).toHaveBeenCalledTimes(1);
		expect(rollHexSparkSet).toHaveBeenCalledWith({ scene, hex });
		expect(target.disabled).toBe(false);
	});

	it("has a Myth tab where a Myth stands, with the Omen playing out, the one to come, and its Cast", () => {
		heldRealm = { ...emptyRealm(g), myths: [{ number: 2, hex, d6: 1, d12: 1, omen: 2, revealed: false }] };
		heldActors = [{ uuid: "Actor.a", name: "Ally", myth: "1-01" }];
		const part = hexGmContext({ scene, hex, view, index: null, state: { ...hexGmState(), tab: "myth" } });
		expect(part.tabs.map(({ key }) => key)).toEqual(["people", "land", "myth"]);
		expect(part.tab).toBe("myth");
		expect(part.myth.number).toBe(2);
		expect(part.myth.omens.map(({ label }) => label)).toEqual(["gmToolkit.myths.current", "gmToolkit.myths.next"]);
		expect([part.myth.none, part.myth.all]).toEqual([false, false]);
		// Anyone put in its Cast by hand opens their sheet; the book's Cast waits on Import PDF.
		expect(part.myth.cast).toEqual([{ name: "Ally", uuid: "Actor.a" }]);
		expect(part.myth.castMissing).toBe(true);
		// Played alone, only the Omens met are read.
		solo = true;
		expect(hexGmContext({ scene, hex, view, index: null, state: hexGmState() }).myth.omens.map(({ label }) => label)).toEqual(["gmToolkit.myths.current"]);
		heldRealm.myths[0].omen = 0;
		expect(hexGmContext({ scene, hex, view, index: null, state: hexGmState() }).myth.omens).toEqual([]);
	});

	it("names a Sanctum's Seer once rolled, and offers the roll", () => {
		heldRealm = { ...emptyRealm(g), landmarks: [{ hex, type: "sanctum" }] };
		expect(hexGmContext({ scene, hex, view, index: null, state: hexGmState() }).landmark.seer).toEqual({ name: null, roll: "hexGm.seer.roll" });
		heldRealm.landmarks[0].seer = { d6: 2, d12: 3 };
		expect(hexGmContext({ scene, hex, view, index: null, state: hexGmState() }).landmark.seer).toEqual({ name: "realm.panel.reference", roll: "hexGm.seer.again" });
		heldRealm.landmarks[0].type = "dwelling";
		expect(hexGmContext({ scene, hex, view, index: null, state: hexGmState() }).landmark.seer).toBeNull();
	});

	it("names who rules a Holding, by Knight and Domain, once it's on the map", () => {
		heldRealm = { ...emptyRealm(g), holdings: [{ id: "tile", hex, style: "castle", seat: false, name: "Ashford" }] };
		heldRulers = [
			{ domain: { uuid: "Actor.d1", name: "Ashford", system: { ruler: "" } }, knight: { uuid: "Actor.k1", name: "Sir Brand" } },
			{ domain: { uuid: "Actor.d2", name: "The Old Claim", system: { ruler: " Dame Wren " } }, knight: null }
		];
		const ruler = hexGmContext({ scene, hex, view, index: null, state: hexGmState() }).ruler;
		expect(ruler.rulers).toEqual([
			{ domain: { uuid: "Actor.d1", name: "Ashford" }, knight: { uuid: "Actor.k1", name: "Sir Brand" }, named: null },
			{ domain: { uuid: "Actor.d2", name: "The Old Claim" }, knight: null, named: "Dame Wren" }
		]);
		expect(ruler.grant).toBe("hexGm.ruler.change");
		heldRulers = [];
		expect(hexGmContext({ scene, hex, view, index: null, state: hexGmState() }).ruler.grant).toBe("hexGm.ruler.grant");
		// A Holding not yet drawn as a Tile has nothing a Domain can name.
		heldRealm.holdings[0].id = null;
		expect(hexGmContext({ scene, hex, view, index: null, state: hexGmState() }).ruler).toBeNull();
		heldRealm.holdings = [];
		expect(hexGmContext({ scene, hex, view, index: null, state: hexGmState() }).ruler).toBeNull();
	});

	it("chooses a Sanctum's Seer and grants a Holding from the hex shown", () => {
		HEX_GM_ACTIONS.chooseSeer({ scene, hex });
		expect(openSeerChooser).toHaveBeenCalledWith({ scene, hex });
		HEX_GM_ACTIONS.grantHolding({ scene, hex });
		expect(grantHolding).toHaveBeenCalledWith(scene, hex);
	});

	it("steps the Myth's Omens, rolls the Seer, and opens the Myth in the Toolkit", async () => {
		HEX_GM_ACTIONS.omenStep({ scene, hex }, { dataset: { step: "-1" } });
		expect(stepHexOmen).toHaveBeenCalledWith(scene, hex, "-1");
		await HEX_GM_ACTIONS.rollSeer({ scene, hex, state: hexGmState() });
		expect(rollHexSeer).toHaveBeenCalledWith(scene, hex);
		await HEX_GM_ACTIONS.mythInToolkit({ scene, hex }, { dataset: { myth: "2" } });
		expect(showMyth).toHaveBeenCalledWith(scene, 2);
	});
});

describe("Places, as a GM's one view of a hex", () => {
	const places = read("module/apps/TravelsPlaces.js");
	const detail = read("templates/apps/parts/travels-hex-detail.hbs");
	const card = read("templates/actor/gm-toolkit/hex-card.hbs");

	it("draws the GM's part under what the players know, for a hex they know or not", () => {
		expect(detail).toMatch(/\{\{\/if\}\}\s*\{\{#with gm\}\}\{\{> "bastionland\.hex-gm"\}\}\{\{\/with\}\}\s*\{\{\/if\}\}\s*<\/aside>/);
		expect(places).toContain("if (game.user.isGM) wireHexGmPart(detail, { scene, hex, state: this.hexGm });");
		// The Journal hangs in the title bar, hung again whenever the hex is drawn; Tell the players ends the line under the note that says they're behind.
		expect(places).toContain("...(game.user.isGM ? hexGmHeaderButtons(this.element) : []),");
		// So does Ping, for anyone, after the Journal, where the hex is on the map: the detail no longer draws it.
		expect(places).toMatch(/hexGmHeaderButtons\(this\.element\) : \[\]\),\s*\.\.\.\(this\.element\.querySelector\("\.bastionland-travels-detail\[data-ping\]"\)\s*\? \[\{ action: "pingHex"/);
		expect(places).toContain("pingHex: TravelsPlaces.#onPing,");
		expect(detail).not.toContain('data-action="showTravelsHex"');
		expect(detail).toContain("{{#if onMap}}{{#if (or openable gm)}} data-ping{{/if}}{{/if}}");
		const template = read("templates/apps/parts/hex-gm.hbs");
		expect(template).not.toContain('data-action="hexJournal"');
		expect(template).toMatch(/\{\{text\}\}\{\{#if tell\}\} <button type="button" class="bastionland-hex-lore__told-tell" data-action="tellHex">\{\{tell\}\}<\/button>\{\{\/if\}\}/);
		expect(template.match(/data-action="tellHex"/g)).toHaveLength(1);
	});

	it("is where the Toolkit's places open, one row each with nothing to edit in it", () => {
		expect(card).toContain('data-action="openHex"');
		expect(card).not.toMatch(/<textarea|data-action="(tellHex|rollHexSet|forgetSpark|hexJournal|landmarkOffer)"/);
	});
});
