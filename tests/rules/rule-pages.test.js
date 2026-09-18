import { describe, expect, it } from "vitest";
import { RULE_PAGES, rulePageFromItems, titleCase } from "../../module/rules/rule-pages.js";

// Text here is invented so no book text lives in the repository. Sizes and
// positions follow the printed rules pages: 11pt text in two columns starting
// at 71pt and 309pt, headings in capitals in a bold face, lines 11pt apart,
// bullets 13pt and paragraphs 19pt, with a large title and page number.

/** A pdf.js text item at a font size and baseline, set in a named font. */
const run = (fontName) => (str, x, y, size = 11, width = str.length * size * 0.45) => ({ str, transform: [size, 0, 0, size, x, y], width, fontName });
const body = run("body");
const bold = run("bold");

const LEFT = 70.9;
const RIGHT = 308.8;

/** Lines down a column, each an array of runs; null leaves a paragraph's gap. */
function column(x, lines, top = 640) {
	const items = [];
	let y = top;
	for (const line of lines) {
		if (line === null) {
			y -= 8;
			continue;
		}
		for (const item of line(x, y)) items.push(item);
		y -= 11;
	}
	return items;
}

const text = (str) => (x, y) => [body(str, x, y)];
const heading = (str) => (x, y) => [bold(str, x, y)];

const page = [
	body("7", 21.7, 21.2, 22),
	...column(LEFT, [
		heading("BENDING THE ROAD"),
		text("These notes suit a common map, but a"),
		text("Referee may change them."),
		null,
		heading("THE GRID OF STONES"),
		text("A map is ruled in squares of a"),
		text("league each."),
		null,
		text("A league measures a few things:"),
		null,
		(x, y) => [body("•", x, y - 2), body("How far a crow flies", x + 18, y - 2)],
		(x, y) => [body("•", x, y - 4), body("How far a mule walks before", x + 18, y - 4)],
		(x, y) => [body("dusk falls", x + 18, y - 4)],
		null,
		heading("MOORLAND"),
		(x, y) => [body("Most squares are moor. Tables (", x, y, 11, 146), body("p9", x + 146, y, 11, 18.6), body(") help", x + 164.6, y, 11, 30)],
		text("here. Paint patches of d8 squares alike."),
		null,
		text("Some squares have a Wall on an edge."),
		null,
		text("Most maps have a stream running"),
		text("across."),
		null,
		heading("TOWERS"),
		text("Place 3 Towers far apart.")
	]),
	...column(RIGHT, [
		heading("OLD SITES"),
		text("A typical map has 2 of each Site."),
		null,
		(x, y) => [bold("Cairns", x, y), body(": Heaps of stone.", x + 38, y)],
		null,
		(x, y) => [bold("Wells", x, y), body(": Deep and cold. Travellers may", x + 30.2, y)],
		(x, y) => [body("restore", x, y, 11, 35), body("VIG", x + 38, y, 7.9, 15), body("here.", x + 56, y)],
		null,
		(x, y) => [bold("Gibbets:", x, y, 11, 42.2), body("Grim. Hurry past.", x + 45.3, y)],
		null,
		heading("FAR COUNTRIES"),
		text("Beyond the moor lies the sea.")
	]),
	body("Making a Map", 130.5, 664.8, 54)
];

describe("RULE_PAGES", () => {
	it("reads Creating a Realm from p14", () => {
		expect(RULE_PAGES).toEqual({ creatingRealm: 14 });
	});
});

describe("titleCase", () => {
	it("capitalises each word but the small ones after the first", () => {
		expect(titleCase("BREAKING THE RULES")).toBe("Breaking the Rules");
		expect(titleCase("THE HEX MAP")).toBe("The Hex Map");
		expect(titleCase("MYTH HEXES")).toBe("Myth Hexes");
	});
});

describe("rulePageFromItems", () => {
	const sections = rulePageFromItems(page);

	it("reads each headed section down the left column, then the right", () => {
		expect(sections.map((section) => section.heading)).toEqual([
			"Bending the Road", "The Grid of Stones", "Moorland", "Towers", "Old Sites", "Far Countries"
		]);
	});

	it("joins wrapped lines into paragraphs, and starts one at each wider gap", () => {
		expect(sections[0].blocks).toEqual([{ kind: "paragraph", text: "These notes suit a common map, but a Referee may change them." }]);
		expect(sections[2].blocks).toEqual([
			{ kind: "paragraph", text: "Most squares are moor. Tables (p9) help here. Paint patches of d8 squares alike." },
			{ kind: "paragraph", text: "Some squares have a Wall on an edge." },
			{ kind: "paragraph", text: "Most maps have a stream running across." }
		]);
	});

	it("reads bullets, each carrying on over its wrapped lines", () => {
		expect(sections[1].blocks).toEqual([
			{ kind: "paragraph", text: "A map is ruled in squares of a league each." },
			{ kind: "paragraph", text: "A league measures a few things:" },
			{ kind: "bullet", text: "How far a crow flies" },
			{ kind: "bullet", text: "How far a mule walks before dusk falls" }
		]);
	});

	it("reads a line that starts in bold as a labelled line, whichever side of the colon the bold ends", () => {
		expect(sections[4].blocks).toEqual([
			{ kind: "paragraph", text: "A typical map has 2 of each Site." },
			{ kind: "term", label: "Cairns", text: "Heaps of stone." },
			{ kind: "term", label: "Wells", text: "Deep and cold. Travellers may restore VIG here." },
			{ kind: "term", label: "Gibbets", text: "Grim. Hurry past." }
		]);
	});

	it("leaves out the page's title and number", () => {
		const all = JSON.stringify(sections);
		expect(all).not.toContain("Making a Map");
		expect(sections.at(-1).blocks).toEqual([{ kind: "paragraph", text: "Beyond the moor lies the sea." }]);
	});

	it("gives nothing for a page without headings", () => {
		expect(rulePageFromItems([body("Just a line.", LEFT, 600)])).toBeNull();
		expect(rulePageFromItems([])).toBeNull();
	});
});
