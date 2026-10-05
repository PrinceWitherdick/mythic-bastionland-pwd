import { describe, expect, it } from "vitest";
import { emptyHexNames, setHexName } from "../../module/rules/hex-names.js";
import { emptyShared, recordBarrierMet, recordTold, setPartyNote } from "../../module/rules/hex-shared.js";
import { emptyJourney, recordVisits } from "../../module/rules/journey.js";
import { emptyRealm, TERRAIN } from "../../module/rules/realm.js";
import { edgeKey, hexIndex, hexKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { sightedMarks } from "../../module/rules/sighted.js";
import {
	journeyLog,
	knownToPlayers,
	ofNote,
	openableHex,
	pickTravelsRealm,
	playerHexView,
	seasonYearsOn,
	sortViews,
	travelsList,
	viewSearchWords,
	viewTags,
	viewWords,
	visitedMarkHexes
} from "../../module/rules/travels.js";

const g = realmGeometry({ cols: 12, rows: 12 });
const hex = (col, row) => ({ col, row });
const when = (day) => ({ age: 1, season: "spring", day, phase: "morning" });

// Invented names, so no book text lives in the repository.
const SECRET_LANDMARK = "Gallows of the Grey Wife";
const SECRET_HOLDING = "Hidden Hall";
const LORE_NOTE = "The GM's own secret about the well";

const [town, ruin, mythHex, wild, seen, hiddenTown] = [hex(2, 2), hex(3, 3), hex(4, 4), hex(5, 5), hex(6, 6), hex(7, 7)];

function realmWith() {
	const realm = emptyRealm(g);
	realm.terrain[hexIndex(g, town)] = TERRAIN.indexOf("forest") + 1;
	realm.terrain[hexIndex(g, wild)] = TERRAIN.indexOf("forest") + 1;
	realm.holdings = [
		{ id: "h0", hex: town, style: "town", seat: true, name: "Ashford" },
		{ id: "h1", hex: hiddenTown, style: "castle", seat: false, name: SECRET_HOLDING }
	];
	realm.landmarks = [
		{ id: "l0", hex: ruin, type: "ruin", name: SECRET_LANDMARK, seer: null, revealed: false },
		{ id: "l1", hex: seen, type: "monument", name: "Second secret", seer: null, revealed: false },
		{ id: "l2", hex: wild, type: "hazard", name: "Bog of Teeth", seer: null, revealed: true }
	];
	realm.myths = [{ id: "m0", hex: mythHex, number: 3, d6: 1, d12: 1, omen: 0, revealed: false }];
	return realm;
}

/** The GM hid the castle's hex and the town's crown by hand. */
const handHidden = (at) => ({
	holding: hexKey(at) === hexKey(hiddenTown),
	seat: hexKey(at) === hexKey(town),
	terrain: hexKey(at) === hexKey(hiddenTown)
});

function sources() {
	const realm = realmWith();
	let journey = recordVisits(emptyJourney(), [town, ruin, mythHex], when(1));
	journey = recordVisits(journey, [wild, hiddenTown], when(2));
	let shared = recordTold(emptyShared(), ruin, { id: "t1", note: "Old stones.", at: 1 });
	shared = recordTold(shared, ruin, { id: "t2", note: "Crows nest there.", at: 2 });
	shared = setPartyNote(shared, hex(9, 9), { text: "Rumoured ford", byName: "Ada", at: 3 });
	const marks = sightedMarks(realm, { [hexKey(seen)]: { note: "a tower on the hill" } }, handHidden);
	return { realm, g, journey, shared, marks, handHidden, companyHex: wild };
}

/** @returns {string} Everything a player could be shown or search for, as one text. */
const everything = (list) => JSON.stringify(list) + [...list.visited, ...list.heardOf]
	.map((view) => viewSearchWords(view, viewWords(view, (key, data) => `${key} ${JSON.stringify(data ?? {})}`)).join(" "))
	.join(" ");

describe("playerHexView", () => {
	it("shows a Holding with its name, but not a crown the GM hid by hand", () => {
		const view = playerHexView(sources(), town);
		expect(view).toMatchObject({ terrain: "forest", holding: { style: "town", name: "Ashford", seat: false }, visits: { count: 1 } });
	});

	it("never shows a Landmark or Myth not yet found, or what the GM hid by hand", () => {
		const s = sources();
		expect(playerHexView(s, ruin)).toMatchObject({ landmark: null });
		expect(playerHexView(s, mythHex)).toMatchObject({ myth: null });
		expect(playerHexView(s, hiddenTown)).toMatchObject({ holding: null, terrain: null });
	});

	it("shows a found Landmark, and says the Company stands there", () => {
		expect(playerHexView(sources(), wild)).toMatchObject({ landmark: { type: "hazard", name: "Bog of Teeth" }, here: true });
	});

	it("gives what was told, newest first, and the Company's note", () => {
		const s = sources();
		expect(playerHexView(s, ruin).told.map((told) => told.id)).toEqual(["t2", "t1"]);
		expect(playerHexView(s, hex(9, 9))).toMatchObject({ party: { text: "Rumoured ford", byName: "Ada" }, visits: null, openable: true });
	});

	it("says something stands where it was seen from afar, and nothing once it's found", () => {
		const s = sources();
		expect(playerHexView(s, seen).sighted).toEqual({ note: "a tower on the hill" });
		s.realm.landmarks[1].revealed = true;
		s.marks = sightedMarks(s.realm, { [hexKey(seen)]: { note: "a tower on the hill" } }, handHidden);
		expect(playerHexView(s, seen).sighted).toBeNull();
	});
});

describe("knownToPlayers", () => {
	it("knows a hex by any one of a visit, a record or a mark, and not by none", () => {
		expect(knownToPlayers({ visits: { count: 1 } })).toBe(true);
		expect(knownToPlayers({ record: { told: [] } })).toBe(true);
		expect(knownToPlayers({ mark: { note: "" } })).toBe(true);
		expect(knownToPlayers({ visits: null, record: null, mark: null })).toBe(false);
	});
});

describe("openableHex", () => {
	it("opens a hex visited, told of, written about or seen from afar, and no other", () => {
		const s = sources();
		for (const at of [town, ruin, hex(9, 9), seen]) expect(openableHex(s, at)).toBe(true);
		expect(openableHex(s, hex(11, 11))).toBe(false);
	});
});

describe("travelsList", () => {
	it("lists the visited last reached first, then the rest by column and row", () => {
		const list = travelsList(sources());
		expect(list.visited.map((view) => view.key)).toEqual(["7,7", "5,5", "4,4", "3,3", "2,2"]);
		expect(list.heardOf.map((view) => view.key)).toEqual(["6,6", "9,9"]);
		expect(list).toMatchObject({ count: 5, total: 144 });
	});

	it("carries no secret of the Realm, and none of the GM's own notes", () => {
		const text = everything(travelsList(sources()));
		for (const secret of [SECRET_LANDMARK, "Second secret", SECRET_HOLDING, LORE_NOTE]) expect(text).not.toContain(secret);
		expect(text).toContain("Bog of Teeth");
		expect(text).toContain("Crows nest there.");
	});
});

describe("viewTags and ofNote", () => {
	it("tags what the players know a hex holds, and nothing kept from them", () => {
		const s = sources();
		expect(viewTags(playerHexView(s, town))).toEqual(["holding"]);
		expect(viewTags(playerHexView(s, wild))).toEqual(["landmark", "here"]);
		expect(viewTags(playerHexView(s, ruin))).toEqual(["told"]);
		expect(viewTags(playerHexView(s, mythHex))).toEqual([]);
		expect(viewTags(playerHexView(s, hiddenTown))).toEqual([]);
		expect(viewTags(playerHexView(s, hex(9, 9)))).toEqual(["noted", "heardOf"]);
		expect(viewTags(playerHexView(s, seen))).toEqual(["sighted", "heardOf"]);
	});

	it("counts a hex of note for anything beyond its terrain, but not for being stood in", () => {
		const s = sources();
		expect(ofNote(playerHexView(s, town))).toBe(true);
		expect(ofNote(playerHexView(s, mythHex))).toBe(false);
		s.companyHex = mythHex;
		expect(ofNote(playerHexView(s, mythHex))).toBe(false);
	});

	it("tags a Barrier run into from a hex", () => {
		const s = sources();
		s.shared = recordBarrierMet(s.shared, mythHex, { edge: edgeKey(mythHex, hex(4, 5)), byName: "Ada", at: 4 });
		expect(viewTags(playerHexView(s, mythHex))).toEqual(["barrier"]);
		expect(ofNote(playerHexView(s, mythHex))).toBe(true);
	});
});

describe("travelsList groups", () => {
	it("splits the visited between places of note and plain wilderness, each last reached first", () => {
		const list = travelsList(sources());
		expect(list.ofNote.map((view) => view.key)).toEqual(["5,5", "3,3", "2,2"]);
		expect(list.wilderness.map((view) => view.key)).toEqual(["7,7", "4,4"]);
	});
});

describe("sortViews", () => {
	it("keeps the last reached first, or puts them by name, or the most visited first", () => {
		const s = sources();
		s.journey = recordVisits(s.journey, [town], when(3));
		const views = travelsList(s).visited;
		expect(sortViews(views, "last").map((view) => view.key)).toEqual(["2,2", "7,7", "5,5", "4,4", "3,3"]);
		const names = { "2,2": "Ashford", "3,3": "b", "4,4": "Hex 10", "5,5": "Bog", "7,7": "Hex 9" };
		expect(sortViews(views, "name", (view) => names[view.key]).map((view) => view.key)).toEqual(["2,2", "3,3", "5,5", "7,7", "4,4"]);
		expect(sortViews(views, "most").map((view) => view.key)).toEqual(["2,2", "7,7", "5,5", "4,4", "3,3"]);
		expect(views.map((view) => view.key)).toEqual(["2,2", "7,7", "5,5", "4,4", "3,3"]);
	});
});

describe("journeyLog", () => {
	const keysOf = (day) => day.entries.map((entry) => `${entry.kind}:${entry.view.key}`);

	it("gathers the arrivals by Season and day, the latest day first, each in the order it went", () => {
		const log = journeyLog(sources());
		expect(log).toHaveLength(2);
		expect(log[0].when).toMatchObject({ season: "spring" });
		expect(log[0].days.map(keysOf)).toEqual([
			["arrived:5,5", "arrived:7,7"],
			["arrived:2,2", "arrived:3,3", "arrived:4,4"]
		]);
	});

	it("puts what was kept with no date last, as it was written", () => {
		const undated = journeyLog(sources()).at(-1);
		expect(undated.when).toBeNull();
		expect(undated.days.map(keysOf)).toEqual([["told:3,3", "told:3,3", "noted:9,9"]]);
		expect(undated.days[0].entries.map((entry) => entry.note ?? entry.byName)).toEqual(["Old stones.", "Crows nest there.", "Ada"]);
	});

	it("marks only a hex's first arrival as the first", () => {
		const s = sources();
		s.journey = recordVisits(s.journey, [town], when(3));
		const [latest] = journeyLog(s)[0].days;
		expect(latest.entries).toMatchObject([{ kind: "arrived", first: false, view: { key: "2,2" } }]);
		expect(journeyLog(s)[0].days[2].entries[0]).toMatchObject({ kind: "arrived", first: true, view: { key: "2,2" } });
	});

	it("follows the arrivals of a day with its tellings and Barriers met, by Phase", () => {
		const s = sources();
		s.shared = recordTold(s.shared, wild, { id: "t3", note: "Teeth in the mud.", when: when(2), at: 5 });
		s.shared = recordBarrierMet(s.shared, wild, { edge: edgeKey(wild, hex(5, 6)), byName: "Ada", when: { ...when(2), phase: "afternoon" }, at: 6 });
		s.journey = recordVisits(s.journey, [hex(5, 6)], { ...when(2), phase: "night" });
		const [day] = journeyLog(s)[0].days;
		expect(keysOf(day)).toEqual(["arrived:5,5", "arrived:7,7", "told:5,5", "met:5,5", "arrived:5,6"]);
		expect(day.entries[3]).toMatchObject({ direction: "south", byName: "Ada" });
	});

	it("carries no secret of the Realm", () => {
		const text = JSON.stringify(journeyLog(sources()));
		for (const secret of [SECRET_LANDMARK, "Second secret", SECRET_HOLDING, LORE_NOTE]) expect(text).not.toContain(secret);
		expect(text).toContain("Bog of Teeth");
	});

	it("is empty for a Company that hasn't set out", () => {
		expect(journeyLog({ ...sources(), journey: emptyJourney(), shared: emptyShared() })).toEqual([]);
	});
});

describe("viewWords", () => {
	const t = (key, data) => (data ? `${key}${JSON.stringify(data)}` : key);

	it("names a hex by its place, and lists what stands there", () => {
		const words = viewWords(playerHexView(sources(), wild), t);
		expect(words.title).toBe(t("realm.hexNamed", { name: "Bog of Teeth", hex: t("realm.hex", wild) }));
		expect(words.terrain).toBe("realm.terrain.forest");
		expect(words.features).toEqual(["realm.landmarks.hazard: Bog of Teeth"]);
		expect(words).toMatchObject({ name: "Bog of Teeth", coords: `realm.hex${JSON.stringify(wild)}` });
	});

	it("names a hex the GM named by that name first, with its column and row apart", () => {
		const named = { ...sources(), names: setHexName(emptyHexNames(), wild, "The Weeping Fen") };
		const view = playerHexView(named, wild);
		expect(view.name).toBe("The Weeping Fen");
		const words = viewWords(view, t);
		expect(words).toMatchObject({ name: "The Weeping Fen", coords: `realm.hex${JSON.stringify(wild)}` });
		expect(words.title).toBe(t("realm.hexNamed", { name: "The Weeping Fen", hex: t("realm.hex", wild) }));
	});

	it("gives a hex with no name its column and row alone", () => {
		const words = viewWords(playerHexView(sources(), mythHex), t);
		expect(words.name).toBe("");
		expect(words.title).toBe(words.coords);
	});
});

describe("openableHex", () => {
	it("never opens a hex to the players for its name alone", () => {
		const s = sources();
		const nowhere = hex(11, 11);
		const names = setHexName(emptyHexNames(), nowhere, "Dragon's lair");
		expect(openableHex({ ...s, names }, nowhere)).toBe(false);
		expect(playerHexView({ ...s, names }, nowhere).openable).toBe(false);
	});

	it("tells the players a hex's name only once it's one of their places, and a GM always", () => {
		const s = sources();
		const nowhere = hex(11, 11);
		const names = setHexName(emptyHexNames(), nowhere, "Dragon's lair");
		expect(playerHexView({ ...s, names }, nowhere).name).toBe("");
		expect(playerHexView({ ...s, names, gm: true }, nowhere).name).toBe("Dragon's lair");
	});
});

describe("visitedMarkHexes", () => {
	it("marks every hex come into", () => {
		expect(visitedMarkHexes(sources().journey).map(hexKey).sort()).toEqual(["2,2", "3,3", "4,4", "5,5", "7,7"]);
		expect(visitedMarkHexes(null)).toEqual([]);
	});
});

describe("pickTravelsRealm", () => {
	const realms = [
		{ id: "a", travelled: true },
		{ id: "b", company: true },
		{ id: "c", active: true },
		{ id: "d", viewed: true }
	];

	it("keeps the one chosen, else the one looked at, the active, the Company's, the travelled, the first", () => {
		expect(pickTravelsRealm(realms, "b")).toBe("b");
		expect(pickTravelsRealm(realms, "gone")).toBe("d");
		expect(pickTravelsRealm(realms.slice(0, 3))).toBe("c");
		expect(pickTravelsRealm(realms.slice(0, 2))).toBe("b");
		expect(pickTravelsRealm(realms.slice(0, 1))).toBe("a");
		expect(pickTravelsRealm([{ id: "z" }])).toBe("z");
		expect(pickTravelsRealm([])).toBeNull();
	});
});

describe("seasonYearsOn", () => {
	it("counts the years from the log's first Season of the same name and Age", () => {
		const at = (age, year, season) => ({ when: { age, year, season, day: 1, phase: "morning" }, days: [] });
		const log = [at(2, 4, "spring"), at(2, 3, "winter"), at(2, 3, "spring"), at(1, 2, "spring"), { when: null, days: [] }];
		expect(seasonYearsOn(log)).toEqual([1, 0, 0, 0, 0]);
		expect(seasonYearsOn([at(1, 1, "summer"), at(1, 3, "summer")])).toEqual([0, 2]);
	});
});
