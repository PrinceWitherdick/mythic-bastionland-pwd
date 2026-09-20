import { describe, expect, it } from "vitest";
import { DRAWING_RULES, bookDrawingGroups, drawingShortfalls, drawingTally, finishPlacement, sheetDrawingGroups } from "../../module/rules/realm-drawing.js";
import { LANDMARK_TYPES, REALM_BRUSHES, REALM_TOOLS, emptyRealm } from "../../module/rules/realm.js";

const hex = (col, row) => ({ col, row });

/** A Realm drawn as the Blank Realm sheet asks, on a 12x12 map. */
function drawnRealm() {
	const realm = emptyRealm({ cols: 12, rows: 12 });
	realm.terrain.fill(3);
	realm.rivers = [[hex(1, 1), hex(1, 2), hex(1, 3)]];
	realm.barriers = Array.from({ length: 24 }, (_, index) => ({ id: null, edge: `e${index}`, revealed: false }));
	realm.holdings = ["castle", "town", "fortress", "tower"].map((style, index) => ({ id: null, hex: hex(index + 1, 5), style, seat: index === 0, name: "" }));
	realm.myths = Array.from({ length: 6 }, (_, index) => ({ id: null, hex: hex(index + 1, 8), number: index + 1, d6: 1, d12: 1, omen: 0, revealed: false }));
	realm.landmarks = LANDMARK_TYPES.flatMap((type, index) => [1, 2, 3].map((n) => ({ id: null, hex: hex(index + 1, 9 + n), type, name: "", seer: null, revealed: false })));
	return realm;
}

describe("DRAWING_RULES", () => {
	it("gives every step a brush of the palette or a Realm tool that draws it, not both", () => {
		const sections = DRAWING_RULES.flatMap((group) => group.sections);
		expect(sections.map((section) => section.key)).toEqual(["terrain", "barriers", "river", "holdings", "myths", "landmarks"]);
		for (const section of sections) {
			if (section.brush) expect(section.tool).toBeUndefined();
			else expect(REALM_TOOLS).toContain(section.tool);
		}
	});

	it("lays all but the Myths with the one paint tool", () => {
		const sections = DRAWING_RULES.flatMap((group) => group.sections);
		const brushes = sections.filter((section) => section.brush);
		expect(brushes.map(({ key, brush }) => ({ key, brush }))).toEqual([
			{ key: "terrain", brush: "terrain" },
			{ key: "barriers", brush: "barrier" },
			{ key: "river", brush: "river" },
			{ key: "holdings", brush: "holding" },
			{ key: "landmarks", brush: "landmark" }
		]);
		for (const { brush } of brushes) expect(REALM_BRUSHES).toContain(brush);
		// Each brush is picked from the palette, so none of them is a tool of its own.
		for (const brush of REALM_BRUSHES.filter((name) => name !== "terrain")) expect(REALM_TOOLS).not.toContain(brush);
	});
});

describe("bookDrawingGroups", () => {
	// Invented stand-ins for the book's sections, so no book text lives in the repository.
	const paragraph = (text) => ({ kind: "paragraph", text });
	const book = [
		{ heading: "Bending the Road", blocks: [paragraph("Notes, not laws.")] },
		{ heading: "Wilderness", blocks: [paragraph("Paint moors."), paragraph("Draw Walls."), paragraph("Draw streams."), paragraph("And more water.")] },
		{ heading: "Holdings", blocks: [paragraph("Place towers."), paragraph("Crown one.")] },
		{ heading: "MYTH HEXES", blocks: [paragraph("Number the Myths.")] },
		{ heading: "Landmarks", blocks: [paragraph("Mark Sites."), { kind: "term", label: "Cairns", text: "Heaps of stone." }] },
		{ heading: "Far Countries", blocks: [paragraph("Beyond lies the sea.")] }
	];

	it("gives each step the book's words for it, in the book's order, with its other sections between", () => {
		const groups = bookDrawingGroups(book);
		expect(groups.map((group) => [group.key, group.heading])).toEqual([
			["book-0", "Bending the Road"], ["wilderness", "Wilderness"], ["holdings", "Holdings"],
			["myths", "MYTH HEXES"], ["landmarks", "Landmarks"], ["book-5", "Far Countries"]
		]);
		const wilderness = groups[1].parts;
		expect(wilderness.map((part) => part.step.key)).toEqual(["terrain", "barriers", "river"]);
		// The last step takes whatever is left over.
		expect(wilderness.map((part) => part.blocks.map((block) => block.text))).toEqual([["Paint moors."], ["Draw Walls."], ["Draw streams.", "And more water."]]);
		expect(groups[2].parts).toEqual([{ key: "holdings", step: DRAWING_RULES[1].sections[0], blocks: book[2].blocks }]);
		expect(groups[0].parts).toEqual([{ key: "book-0", step: null, blocks: book[0].blocks }]);
	});

	it("gives nothing unless the book has every step's section", () => {
		expect(bookDrawingGroups(book.filter((section) => section.heading !== "Holdings"))).toBeNull();
		expect(bookDrawingGroups([])).toBeNull();
	});
});

describe("sheetDrawingGroups", () => {
	it("sets out the sheet's words in the same shape, each step's text then its labelled lines", () => {
		const groups = sheetDrawingGroups((key) => `<${key}>`);
		expect(groups.map((group) => group.key)).toEqual(DRAWING_RULES.map((group) => group.key));
		expect(groups[0].parts.map((part) => part.blocks)).toEqual(["terrain", "barriers", "river"].map((key) => [{ kind: "paragraph", text: `<sections.${key}.text>` }]));
		const landmarks = groups.at(-1).parts[0].blocks;
		expect(landmarks).toHaveLength(1 + LANDMARK_TYPES.length);
		expect(landmarks[1]).toEqual({ kind: "term", label: "<sections.landmarks.lines.dwelling.label>", text: "<sections.landmarks.lines.dwelling.text>" });
	});
});

describe("drawingTally", () => {
	it("counts a blank Realm as nothing drawn, against the sheet's numbers", () => {
		const tally = drawingTally(emptyRealm({ cols: 12, rows: 12 }));
		expect(tally.terrain).toEqual([{ key: "terrain", count: 0, target: 144, done: false }]);
		expect(tally.barriers).toEqual([{ key: "barriers", count: 0, target: 24, done: false }]);
		expect(tally.river).toEqual([{ key: "river", count: 0, target: null, done: false, rivers: 0 }]);
		expect(tally.holdings.map((entry) => [entry.key, entry.target])).toEqual([["holdings", 4], ["seat", 1]]);
		expect(tally.myths[0].target).toBe(6);
		expect(tally.landmarks.map((entry) => [entry.key, entry.target])).toEqual(LANDMARK_TYPES.map((type) => [type, 3]));
	});

	it("marks every step done for a Realm drawn as the sheet asks", () => {
		expect(drawingShortfalls(drawnRealm())).toEqual([]);
	});

	it("wants exactly one Seat of Power", () => {
		const realm = drawnRealm();
		realm.holdings[1].seat = true;
		expect(drawingShortfalls(realm)).toEqual([{ key: "seat", count: 2, target: 1, done: false }]);
	});

	it("counts every river drawn, and the hexes they run through", () => {
		const realm = drawnRealm();
		realm.rivers = [[hex(1, 1), hex(1, 2), hex(1, 3)], [hex(1, 2), hex(2, 2)], [hex(5, 5)]];
		expect(drawingTally(realm).river).toEqual([{ key: "river", count: 4, target: null, done: true, rivers: 2 }]);
		realm.rivers = realm.rivers.slice(1);
		expect(drawingTally(realm).river[0]).toMatchObject({ count: 2, done: true, rivers: 1 });
	});

	it("names what's short, and a river of one hex isn't a river yet", () => {
		const realm = drawnRealm();
		realm.rivers = [[hex(1, 1)]];
		realm.terrain[0] = 0;
		realm.landmarks = realm.landmarks.filter((landmark) => landmark.type !== "ruin");
		expect(drawingShortfalls(realm).map((entry) => entry.key)).toEqual(["terrain", "river", "ruin"]);
	});
});

describe("finishPlacement", () => {
	const map = { left: 100, right: 900, top: 50, bottom: 650 };

	it("centres the button under the map", () => {
		expect(finishPlacement(map, { width: 200, height: 40 })).toEqual({ left: 400, top: 662 });
	});

	it("keeps it above the floor when the map runs off the screen", () => {
		expect(finishPlacement({ ...map, bottom: 2000 }, { width: 200, height: 40, floor: 1000 })).toEqual({ left: 400, top: 948 });
	});

	it("grows with the interface scale", () => {
		expect(finishPlacement(map, { width: 200, height: 40, scale: 1.5 })).toEqual({ left: 350, top: 668 });
	});
});
