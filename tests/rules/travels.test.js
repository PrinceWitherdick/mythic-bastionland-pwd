import { describe, expect, it } from "vitest";
import { emptyShared, recordTold, setPartyNote } from "../../module/rules/hex-shared.js";
import { emptyJourney, recordVisits } from "../../module/rules/journey.js";
import { emptyRealm, TERRAIN } from "../../module/rules/realm.js";
import { hexIndex, hexKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { sightedMarks } from "../../module/rules/sighted.js";
import {
	openableHex,
	pickTravelsRealm,
	playerHexView,
	travelsList,
	viewSearchWords,
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

describe("viewWords", () => {
	const t = (key, data) => (data ? `${key}${JSON.stringify(data)}` : key);

	it("names a hex by its place, and lists what stands there", () => {
		const words = viewWords(playerHexView(sources(), wild), t);
		expect(words.title).toBe(`Bog of Teeth (realm.hex${JSON.stringify(wild)})`);
		expect(words.terrain).toBe("realm.terrain.forest");
		expect(words.features).toEqual(["realm.landmarks.hazard: Bog of Teeth"]);
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
