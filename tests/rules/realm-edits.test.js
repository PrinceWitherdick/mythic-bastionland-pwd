import { describe, expect, it } from "vitest";
import { emptyRealm, featureAt, terrainAt, validateRealm } from "../../module/rules/realm.js";
import { edgeKey, hexDistance, hexKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import {
	barrierState,
	clearRiver,
	editFeature,
	featureStands,
	layRiver,
	paintTerrain,
	placeFeature,
	placeMapPicture,
	relayRealm,
	riverEnds,
	setBarrier,
	setMapPicture,
	setOmen,
	setRevealed,
	traceCourse,
	trimRiver,
	unusedMythNumbers
} from "../../module/rules/realm-edits.js";

const g = realmGeometry();
const hex = (col, row) => ({ col, row });

function sampleRealm() {
	const realm = emptyRealm(g, "edits");
	realm.terrain.fill(8);
	realm.holdings = [{ id: "h1", hex: hex(2, 2), style: "castle", seat: true, name: "Greyhold" }];
	realm.myths = [{ id: "m1", hex: hex(6, 6), number: 1, d6: 2, d12: 3, omen: 2, revealed: false }];
	realm.landmarks = [{ id: "l1", hex: hex(9, 9), type: "sanctum", name: "", seer: { d6: 4, d12: 5 }, revealed: false }];
	return realm;
}

describe("paintTerrain", () => {
	it("paints hexes on the map and leaves the original alone", () => {
		const realm = sampleRealm();
		const painted = paintTerrain(realm, g, [hex(1, 1), hex(3, 3), hex(40, 1)], 10);
		expect(terrainAt(painted, g, hex(1, 1))).toBe(10);
		expect(terrainAt(painted, g, hex(3, 3))).toBe(10);
		expect(terrainAt(realm, g, hex(1, 1))).toBe(8);
		expect(paintTerrain(realm, g, [hex(1, 1)], 13)).toBe(realm);
	});
});

describe("placeFeature", () => {
	it("replaces what's in a hex, keeping an id while it stays the same kind", () => {
		const realm = sampleRealm();
		const renamed = placeFeature(realm, g, hex(2, 2), { kind: "holding", style: "tower", name: "Stillwatch", seat: true });
		expect(renamed.holdings).toEqual([{ id: "h1", hex: hex(2, 2), style: "tower", seat: true, name: "Stillwatch" }]);

		const swapped = placeFeature(realm, g, hex(2, 2), { kind: "landmark", type: "ruin" });
		expect(swapped.holdings).toEqual([]);
		expect(featureAt(swapped, hex(2, 2)).landmark).toMatchObject({ id: null, type: "ruin", seer: null, revealed: false });

		expect(featureAt(placeFeature(realm, g, hex(6, 6), null), hex(6, 6))).toEqual({ holding: null, myth: null, landmark: null });
	});

	it("moves the Seat of Power to a new Seat", () => {
		const realm = placeFeature(sampleRealm(), g, hex(10, 3), { kind: "holding", style: "town", seat: true });
		expect(realm.holdings.filter((holding) => holding.seat).map((holding) => holding.hex)).toEqual([hex(10, 3)]);
	});

	describe("a disputed Seat (p202)", () => {
		const seats = (realm) => realm.holdings.filter((holding) => holding.seat).map(({ hex: at, disputed }) => ({ hex: at, disputed: Boolean(disputed) }));

		it("keeps both crowns once the first Seat is marked disputed, and marks the second too", () => {
			const marked = editFeature(sampleRealm(), g, hex(2, 2), { disputed: true });
			expect(featureAt(marked, hex(2, 2)).holding).toEqual({ id: "h1", hex: hex(2, 2), style: "castle", seat: true, name: "Greyhold", disputed: true });
			const rival = placeFeature(marked, g, hex(10, 3), { kind: "holding", style: "town", seat: true });
			expect(seats(rival)).toEqual([{ hex: hex(2, 2), disputed: true }, { hex: hex(10, 3), disputed: true }]);
			expect(validateRealm(rival, g).filter((problem) => problem.reason === "seat")).toEqual([]);
		});

		it("keeps both crowns when the new Seat comes marked disputed", () => {
			const rival = placeFeature(sampleRealm(), g, hex(10, 3), { kind: "holding", style: "town", seat: true, disputed: true });
			expect(seats(rival)).toEqual([{ hex: hex(2, 2), disputed: true }, { hex: hex(10, 3), disputed: true }]);
		});

		it("keeps both crowns, unmarked, while the rules for setup are ignored", () => {
			const realm = { ...sampleRealm(), setup: { ignoreRules: true } };
			const rival = placeFeature(realm, g, hex(10, 3), { kind: "holding", style: "town", seat: true });
			expect(seats(rival)).toEqual([{ hex: hex(2, 2), disputed: false }, { hex: hex(10, 3), disputed: false }]);
			expect(validateRealm(rival, g).filter((problem) => problem.reason === "seat")).toEqual([]);
		});

		it("settles the dispute in a Seat's favour when its mark comes off", () => {
			const marked = editFeature(sampleRealm(), g, hex(2, 2), { disputed: true });
			const rival = placeFeature(marked, g, hex(10, 3), { kind: "holding", style: "town", seat: true });
			const settled = editFeature(rival, g, hex(10, 3), { disputed: false });
			expect(seats(settled)).toEqual([{ hex: hex(10, 3), disputed: false }]);
			expect(featureAt(settled, hex(2, 2)).holding).toEqual({ id: "h1", hex: hex(2, 2), style: "castle", seat: false, name: "Greyhold" });
		});

		it("settles the dispute once the rival Seat loses its crown, or its hex is cleared", () => {
			const marked = editFeature(sampleRealm(), g, hex(2, 2), { disputed: true });
			const rival = placeFeature(marked, g, hex(10, 3), { kind: "holding", style: "town", seat: true });
			expect(seats(editFeature(rival, g, hex(10, 3), { seat: false }))).toEqual([{ hex: hex(2, 2), disputed: false }]);
			const cleared = placeFeature(rival, g, hex(10, 3), null);
			expect(seats(cleared)).toEqual([{ hex: hex(2, 2), disputed: false }]);
			// A new Seat now takes the crown, as it would from any lone Seat.
			expect(seats(placeFeature(cleared, g, hex(10, 3), { kind: "holding", style: "town", seat: true }))).toEqual([{ hex: hex(10, 3), disputed: false }]);
		});

		it("keeps the mark through other edits, and drops it with the crown", () => {
			const marked = editFeature(sampleRealm(), g, hex(2, 2), { disputed: true });
			expect(featureAt(editFeature(marked, g, hex(2, 2), { name: "Stillwatch" }), hex(2, 2)).holding).toMatchObject({ seat: true, disputed: true });
			expect(featureAt(placeFeature(marked, g, hex(2, 2), { kind: "holding", style: "tower", seat: true }), hex(2, 2)).holding).toMatchObject({ disputed: true });
			expect(featureAt(editFeature(marked, g, hex(2, 2), { seat: false }), hex(2, 2)).holding).not.toHaveProperty("disputed");
			expect(featureAt(editFeature(sampleRealm(), g, hex(2, 2), { seat: false, disputed: true }), hex(2, 2)).holding).not.toHaveProperty("disputed");
		});
	});

	it("gives a new Myth the first free number, and moves a Myth that takes its number", () => {
		const realm = sampleRealm();
		const added = placeFeature(realm, g, hex(4, 10), { kind: "myth" });
		expect(featureAt(added, hex(4, 10)).myth).toMatchObject({ id: null, number: 2, d6: 1, d12: 1, omen: 0, revealed: false });
		expect(unusedMythNumbers(added)).toEqual([3, 4, 5, 6]);

		const moved = placeFeature(realm, g, hex(11, 11), { kind: "myth", number: 1 });
		expect(moved.myths).toEqual([{ id: "m1", hex: hex(11, 11), number: 1, d6: 2, d12: 3, omen: 2, revealed: false }]);
	});

	it("keeps a Sanctum's Seer and drops it for other Landmarks", () => {
		const realm = sampleRealm();
		expect(featureAt(placeFeature(realm, g, hex(9, 9), { kind: "landmark", type: "sanctum", name: "Stone Circle" }), hex(9, 9)).landmark)
			.toMatchObject({ id: "l1", name: "Stone Circle", seer: { d6: 4, d12: 5 } });
		expect(featureAt(placeFeature(realm, g, hex(9, 9), { kind: "landmark", type: "sanctum", seer: { d6: 6, d12: 12 } }), hex(9, 9)).landmark.seer)
			.toEqual({ d6: 6, d12: 12 });
		expect(featureAt(placeFeature(realm, g, hex(9, 9), { kind: "landmark", type: "hazard" }), hex(9, 9)).landmark.seer).toBeNull();
	});

	it("ignores hexes off the map and kinds it doesn't know", () => {
		const realm = sampleRealm();
		expect(placeFeature(realm, g, hex(0, 3), { kind: "holding" })).toBe(realm);
		expect(placeFeature(realm, g, hex(3, 3), { kind: "dragon" })).toBe(realm);
	});
});

describe("editFeature", () => {
	it("keeps the Myth a Ruin echoes, and forgets it when the Ruin becomes something else", () => {
		const start = placeFeature(emptyRealm(g, "echo"), g, hex(3, 3), { kind: "landmark", type: "ruin" });
		const echoed = editFeature(start, g, hex(3, 3), { echo: { d6: 5, d12: 9 } });
		expect(featureAt(echoed, hex(3, 3)).landmark.echo).toEqual({ d6: 5, d12: 9 });
		const named = editFeature(echoed, g, hex(3, 3), { name: "Burned village" });
		expect(featureAt(named, hex(3, 3)).landmark).toMatchObject({ name: "Burned village", echo: { d6: 5, d12: 9 } });
		const dwelling = editFeature(named, g, hex(3, 3), { type: "dwelling" });
		expect(featureAt(dwelling, hex(3, 3)).landmark).not.toHaveProperty("echo");
	});

	it("changes one thing about a Holding and keeps the rest", () => {
		const realm = sampleRealm();
		expect(featureAt(editFeature(realm, g, hex(2, 2), { name: "Stillwatch" }), hex(2, 2)).holding)
			.toEqual({ id: "h1", hex: hex(2, 2), style: "castle", seat: true, name: "Stillwatch" });
		expect(featureAt(editFeature(realm, g, hex(2, 2), { style: "tower" }), hex(2, 2)).holding)
			.toMatchObject({ style: "tower", seat: true, name: "Greyhold" });
	});

	it("keeps a Myth's Omens and the rest of its roll", () => {
		expect(featureAt(editFeature(sampleRealm(), g, hex(6, 6), { d12: 11 }), hex(6, 6)).myth)
			.toEqual({ id: "m1", hex: hex(6, 6), number: 1, d6: 2, d12: 11, omen: 2, revealed: false });
	});

	it("changes half of a Sanctum's Seer roll", () => {
		expect(featureAt(editFeature(sampleRealm(), g, hex(9, 9), { seer: { d6: 6 } }), hex(9, 9)).landmark.seer).toEqual({ d6: 6, d12: 5 });
	});

	it("keeps half a Seer roll typed for a Sanctum that has no Seer yet", () => {
		const sanctum = editFeature(placeFeature(sampleRealm(), g, hex(3, 3), { kind: "landmark", type: "sanctum" }), g, hex(3, 3), { seer: { d6: 3 } });
		expect(featureAt(sanctum, hex(3, 3)).landmark.seer).toEqual({ d6: 3, d12: 1 });
		expect(featureAt(editFeature(sanctum, g, hex(3, 3), { seer: { d12: 7 } }), hex(3, 3)).landmark.seer).toEqual({ d6: 3, d12: 7 });
		expect(featureAt(editFeature(sampleRealm(), g, hex(9, 9), { seer: { d6: 0 } }), hex(9, 9)).landmark.seer).toEqual({ d6: 4, d12: 5 });
	});

	it("leaves an empty hex alone", () => {
		const realm = sampleRealm();
		expect(editFeature(realm, g, hex(4, 4), { name: "Nowhere" })).toBe(realm);
	});
});

describe("featureStands", () => {
	const realm = sampleRealm();

	it("knows the Holding a brush would lay is already standing there", () => {
		expect(featureStands(realm, hex(2, 2), { kind: "holding", style: "castle" })).toBe(true);
		expect(featureStands(realm, hex(2, 2), { kind: "holding", style: "tower" })).toBe(false);
		expect(featureStands(realm, hex(4, 4), { kind: "holding", style: "castle" })).toBe(false);
	});

	it("still lays a Holding that the brush would crown", () => {
		const town = placeFeature(realm, g, hex(4, 4), { kind: "holding", style: "town" });
		expect(featureStands(town, hex(4, 4), { kind: "holding", style: "town", seat: true })).toBe(false);
		expect(featureStands(town, hex(4, 4), { kind: "holding", style: "town" })).toBe(true);
		expect(featureStands(realm, hex(2, 2), { kind: "holding", style: "castle", seat: true })).toBe(true);
	});

	it("knows the Landmark a brush would lay is already standing there", () => {
		expect(featureStands(realm, hex(9, 9), { kind: "landmark", type: "sanctum" })).toBe(true);
		expect(featureStands(realm, hex(9, 9), { kind: "landmark", type: "ruin" })).toBe(false);
		expect(featureStands(realm, hex(9, 9), { kind: "holding", style: "castle" })).toBe(false);
	});

	it("leaves a Myth and an empty hex to be painted over", () => {
		expect(featureStands(realm, hex(6, 6), { kind: "landmark", type: "ruin" })).toBe(false);
		expect(featureStands(realm, hex(6, 6), { kind: "myth", number: 1 })).toBe(false);
		expect(featureStands(realm, hex(5, 5), null)).toBe(false);
		expect(featureStands(realm, hex(5, 5), { kind: "holding" })).toBe(false);
		expect(featureStands(realm, hex(5, 5), { kind: "landmark" })).toBe(false);
	});
});

describe("Barriers", () => {
	const edge = edgeKey(hex(4, 4), hex(4, 5));

	it("takes an edge from none to hidden to revealed and off again", () => {
		const realm = sampleRealm();
		expect(barrierState(realm, edge)).toBe("none");
		const hidden = setBarrier(realm, g, edge, "hidden");
		expect(barrierState(hidden, edge)).toBe("hidden");
		const revealed = setBarrier(hidden, g, edge, "revealed");
		expect(revealed.barriers).toEqual([{ id: null, edge, revealed: true }]);
		expect(setBarrier(revealed, g, edge, "none").barriers).toEqual([]);
	});

	it("refuses edges that aren't between two hexes of the map", () => {
		const realm = sampleRealm();
		expect(setBarrier(realm, g, "1,1|4,4", "hidden")).toBe(realm);
		expect(setBarrier(realm, g, edgeKey(hex(12, 1), hex(13, 1)), "hidden")).toBe(realm);
	});
});

describe("setRevealed and setOmen", () => {
	it("shows a hex's hidden things and counts Omens within 0 to 6", () => {
		const realm = sampleRealm();
		expect(featureAt(setRevealed(realm, hex(6, 6), true), hex(6, 6)).myth.revealed).toBe(true);
		expect(setOmen(realm, 1, 9).myths[0].omen).toBe(6);
		expect(setOmen(realm, 1, -2).myths[0].omen).toBe(0);
		expect(setOmen(realm, 5, 3)).toEqual(realm);
	});
});

describe("drawing the river", () => {
	const column = (col, from, to) => Array.from({ length: to - from + 1 }, (_, index) => hex(col, from + index));
	const keys = (hexes) => hexes.map(hexKey);
	const riverProblems = (realm) => validateRealm(realm, g).filter((problem) => problem.kind === "river");
	/** A course the pointer drew through each of these hexes in turn. */
	const drag = (...stops) => stops.reduce((course, stop) => traceCourse(g, course, stop), []);
	const withRivers = (...rivers) => Object.assign(sampleRealm(), { rivers: rivers.filter((course) => course.length) });

	it("fills in hexes the pointer jumped over, and takes back what it goes back over", () => {
		const course = drag(hex(3, 1), hex(3, 4));
		expect(keys(course)).toEqual(keys(column(3, 1, 4)));
		expect(keys(traceCourse(g, course, hex(3, 2)))).toEqual(keys(column(3, 1, 2)));
		expect(traceCourse(g, course, hex(3, 4))).toBe(course);
		expect(traceCourse(g, course, hex(40, 1))).toBe(course);

		const wide = drag(hex(1, 1), hex(9, 7), hex(2, 11));
		wide.slice(1).forEach((step, index) => expect(hexDistance(g, wide[index], step)).toBe(1));
		expect(new Set(keys(wide)).size).toBe(wide.length);
	});

	it("draws a new river beside the old, and ignores a click", () => {
		const realm = withRivers(column(3, 1, 5));
		const drawn = layRiver(realm, g, drag(hex(8, 1), hex(8, 6)));
		expect(drawn.rivers.map(keys)).toEqual([keys(column(3, 1, 5)), keys(column(8, 1, 6))]);
		expect(realm.rivers).toHaveLength(1);
		expect(riverProblems(drawn)).toEqual([]);
		expect(layRiver(realm, g, [hex(8, 1)])).toBe(realm);
	});

	it("draws a river on a Realm without one", () => {
		const drawn = layRiver(withRivers(), g, drag(hex(8, 1), hex(8, 6)));
		expect(drawn.rivers.map(keys)).toEqual([keys(column(8, 1, 6))]);
	});

	it("carries the river on from its mouth, or back from its source", () => {
		const realm = withRivers(column(3, 3, 5));
		expect(layRiver(realm, g, drag(hex(3, 5), hex(3, 8))).rivers.map(keys)).toEqual([keys(column(3, 3, 8))]);
		expect(layRiver(realm, g, drag(hex(3, 3), hex(3, 1))).rivers.map(keys)).toEqual([keys(column(3, 1, 5))]);
	});

	it("branches off a hex along a river, joined to it there, and adds nothing for a drag along it", () => {
		const realm = withRivers(column(3, 1, 8));
		const course = drag(hex(3, 4), hex(7, 4));
		const branched = layRiver(realm, g, course);
		expect(branched.rivers.map(keys)).toEqual([keys(column(3, 1, 8)), keys(course)]);
		expect(riverProblems(branched)).toEqual([]);
		expect(layRiver(realm, g, drag(hex(3, 4), hex(3, 6)))).toBe(realm);
	});

	it("joins a river the new water reaches, and stops there", () => {
		const realm = withRivers(column(3, 1, 8));
		const joined = layRiver(realm, g, drag(hex(8, 5), hex(3, 5), hex(1, 5)));
		const [kept, branch] = joined.rivers;
		expect(joined.rivers).toHaveLength(2);
		expect(branch.at(-1).col).toBe(3);
		expect(branch.filter((step) => step.col <= 3)).toHaveLength(1);
		expect(keys(kept)).toEqual(keys(column(3, 1, 8)));

		// A river carried on from its end joins another it runs into.
		const other = withRivers(column(3, 1, 8), column(8, 1, 4));
		const carried = layRiver(other, g, drag(hex(8, 4), hex(1, 6)));
		expect(carried.rivers).toHaveLength(2);
		expect(keys(carried.rivers[1].slice(0, 4))).toEqual(keys(column(8, 1, 4)));
		expect(carried.rivers[1].at(-1).col).toBe(3);
		expect(riverProblems(carried)).toEqual([]);
	});

	it("carries on a river only from a loose end, which is what's ringed", () => {
		const branch = drag(hex(3, 4), hex(7, 4));
		const realm = withRivers(column(3, 1, 8), branch);
		expect(keys(riverEnds(realm))).toEqual(keys([hex(3, 1), hex(3, 8), branch.at(-1)]));
		const longer = layRiver(realm, g, drag(branch.at(-1), hex(10, 4)));
		expect(longer.rivers).toHaveLength(2);
		expect(keys(longer.rivers[1].slice(0, branch.length))).toEqual(keys(branch));
		expect(longer.rivers[1].length).toBeGreaterThan(branch.length);
	});

	it("stops the new water where it reaches the river it kept", () => {
		const realm = withRivers(column(3, 1, 5));
		const looped = layRiver(realm, g, drag(hex(3, 5), hex(6, 5), hex(6, 2), hex(1, 2)));
		expect(riverProblems(looped)).toEqual([]);
		expect(keys(looped.rivers[0].slice(0, 5))).toEqual(keys(column(3, 1, 5)));
		expect(looped.rivers[0].slice(5).some((step) => step.col === 3 && step.row <= 5)).toBe(false);
		expect(layRiver(realm, g, [hex(3, 5), hex(3, 4)])).toBe(realm);
	});

	it("cuts the river back from the nearer end, or takes it away", () => {
		const realm = withRivers(column(3, 1, 8));
		expect(trimRiver(realm, hex(3, 6)).rivers.map(keys)).toEqual([keys(column(3, 1, 5))]);
		expect(trimRiver(realm, hex(3, 2)).rivers.map(keys)).toEqual([keys(column(3, 3, 8))]);
		expect(trimRiver(realm, hex(5, 5))).toBe(realm);
		expect(clearRiver(realm).rivers).toEqual([]);
		expect(realm.rivers[0]).toHaveLength(8);
		expect(clearRiver(withRivers())).toEqual(withRivers());
	});

	it("cuts the river that loses least where rivers meet, and drops one cut to a single hex", () => {
		const branch = drag(hex(3, 4), hex(7, 4));
		const realm = withRivers(column(3, 1, 8), branch);
		const cut = trimRiver(realm, hex(3, 4));
		expect(cut.rivers.map(keys)).toEqual([keys(column(3, 1, 8)), keys(branch.slice(1))]);

		const short = withRivers(column(3, 1, 2), column(8, 1, 4));
		const promoted = trimRiver(short, hex(3, 1));
		expect(promoted.rivers.map(keys)).toEqual([keys(column(8, 1, 4))]);

		expect(clearRiver(realm)).toMatchObject({ rivers: [] });
	});
});

describe("a Realm's pictures", () => {
	const g = realmGeometry();
	const blank = () => emptyRealm(g, "pictures");
	const players = { src: "art/realm-maps/open.webp" };

	it("takes a players' map", () => {
		const open = setMapPicture(blank(), "players", players);
		expect(open.picture).toEqual({ players: { ...players, bare: false } });
		// The Realm it was made from is untouched.
		expect(blank().picture).toBeUndefined();
	});

	it("won't take a referee's map, or any other", () => {
		const open = setMapPicture(blank(), "players", players);
		expect(setMapPicture(open, "referee", { src: "secret.webp" })).toBe(open);
		expect(setMapPicture(blank(), "nobody", players)).toEqual(blank());
	});

	it("goes back to the system's own ink when the players' map is taken away", () => {
		const open = setMapPicture(blank(), "players", players);
		expect(setMapPicture(open, "players", null).picture).toBeUndefined();
	});

	it("remembers where a picture was lined up, and forgets it when the picture changes", () => {
		const open = setMapPicture(blank(), "players", players);
		const lined = placeMapPicture(open, "players", { x: 800, y: 900, width: 1700, height: 2000 });
		expect(lined.picture.players).toEqual({ ...players, bare: false, x: 800, y: 900, width: 1700, height: 2000 });
		expect(placeMapPicture(open, "referee", { x: 1, y: 2, width: 3, height: 4 })).toBe(open);
		// Another picture is another thing to line up.
		expect(setMapPicture(lined, "players", { src: "art/realm-maps/other.webp" }).picture.players).toEqual({ src: "art/realm-maps/other.webp", bare: false });
	});

	it("moves and sizes a measured picture without stretching it", () => {
		const laid = setMapPicture(blank(), "players", { ...players, x: 500, y: 600, width: 900, height: 1000 });
		const moved = placeMapPicture(laid, "players", { x: 520, y: 590, width: 1800, height: 700 });
		expect(moved.picture.players).toEqual({ ...players, bare: false, x: 520, y: 590, width: 1800, height: 2000 });
	});

	it("keeps a map with no hexes on it bare as it's lined up, until another picture takes its place", () => {
		const laid = setMapPicture(blank(), "players", { ...players, bare: true, x: 500, y: 600, width: 900, height: 1000 });
		expect(placeMapPicture(laid, "players", { x: 520, y: 590, width: 1800, height: 700 }).picture.players.bare).toBe(true);
		expect(setMapPicture(laid, "players", { src: "art/realm-maps/other.webp" }).picture.players.bare).toBe(false);
	});
});

describe("relayRealm", () => {
	const rows = realmGeometry({ layout: "evenRows" });

	it("keeps a Realm whose rivers and Barriers still join up as it is", () => {
		const realm = sampleRealm();
		// Straight down a column is a river either way: with pointed tops it zigzags down the rows.
		realm.rivers = [[hex(4, 1), hex(4, 2), hex(4, 3)]];
		realm.barriers = [{ id: "b1", edge: edgeKey(hex(5, 5), hex(5, 6)), revealed: false }];
		expect(relayRealm(realm, rows)).toBe(realm);
	});

	it("cuts a river where its hexes no longer meet, and drops what breaks off alone", () => {
		const realm = sampleRealm();
		// A step up and across from an odd row meets on the book's sheet but not with pointed tops, where only the
		// rows set in reach up and across to the right: so (3,5) to (4,4) and (5,3) to (6,2) come apart.
		realm.rivers = [[hex(3, 2), hex(3, 3), hex(3, 4), hex(3, 5), hex(4, 4), hex(4, 3), hex(4, 2), hex(5, 3), hex(6, 2)]];
		expect(realm.rivers[0].every((step, index) => !index || hexDistance(g, realm.rivers[0][index - 1], step) === 1)).toBe(true);
		const relaid = relayRealm(realm, rows);
		expect(relaid.rivers.map((course) => course.map(hexKey))).toEqual([["3,2", "3,3", "3,4", "3,5"], ["4,4", "4,3", "4,2", "5,3"]]);
		for (const course of relaid.rivers) course.slice(1).forEach((step, index) => expect(hexDistance(rows, course[index], step)).toBe(1));
		// The Realm it was made from is untouched, and everything else goes with its hex.
		expect(realm.rivers[0]).toHaveLength(9);
		expect(relaid.holdings).toEqual(realm.holdings);
		expect(relaid.terrain).toEqual(realm.terrain);
	});

	it("drops a Barrier between hexes that no longer share an edge", () => {
		const realm = sampleRealm();
		const kept = edgeKey(hex(5, 5), hex(5, 6));
		realm.barriers = [
			{ id: "b1", edge: kept, revealed: false },
			{ id: "b2", edge: edgeKey(hex(3, 5), hex(4, 4)), revealed: true }
		];
		expect(relayRealm(realm, rows).barriers.map((barrier) => barrier.edge)).toEqual([kept]);
	});
});
