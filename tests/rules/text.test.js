import { describe, expect, it } from "vitest";
import { MINOR_WORDS, escapeHTML, joinLines, logicalLines, paragraphs, parentheticals, splitOutside, titleCase } from "../../module/rules/text.js";

describe("joinLines", () => {
	it("joins with a space, or keeps a hyphen that split a word", () => {
		expect(joinLines("a warm", "hearth")).toBe("a warm hearth");
		expect(joinLines("candle-", "flame")).toBe("candle-flame");
	});
});

describe("logicalLines", () => {
	it("joins lines wrapped mid-sentence or inside a parenthesis", () => {
		expect(logicalLines(["Tongs (d6, heated in the", "forge first), apron", "Grumbles about the weather.", "Sells to anybody."])).toEqual([
			"Tongs (d6, heated in the forge first), apron",
			"Grumbles about the weather.",
			"Sells to anybody."
		]);
	});

	it("carries a line on after a word a sentence can't end on, even before a capital", () => {
		expect(logicalLines(["Once sailed to the far side of", "Greyholm and back."])).toEqual(["Once sailed to the far side of Greyholm and back."]);
		expect(logicalLines(["Spear (d8),", "Shield (d4)"])).toEqual(["Spear (d8), Shield (d4)"]);
	});

	it("starts a new line at each bullet, and tidies spacing", () => {
		expect(logicalLines(["• Hums when", "nobody  listens.", "", "• Wants a quiet life."])).toEqual(["Hums when nobody listens.", "Wants a quiet life."]);
	});
});

describe("escapeHTML", () => {
	it("escapes markup", () => {
		expect(escapeHTML("<b>\"Tom\" & Jo</b>")).toBe("&lt;b&gt;&quot;Tom&quot; &amp; Jo&lt;/b&gt;");
	});
});

describe("titleCase", () => {
	it("keeps minor words low unless they start it", () => {
		expect(titleCase("THE WAY TO THE KEEP FROM HERE")).toBe("The Way to the Keep From Here");
	});

	it("takes its own minor words, and can keep an apostrophe inside a word", () => {
		const options = { minorWords: new Set([...MINOR_WORDS, "from", "with"]), apostrophes: true };
		expect(titleCase("THE LICH'S WAY FROM HERE", options)).toBe("The Lich's Way from Here");
		expect(titleCase("THE LICH’S WAY", options)).toBe("The Lich’s Way");
		expect(titleCase("THE LICH'S WAY")).toBe("The Lich'S Way");
	});
});

describe("paragraphs", () => {
	it("makes each text that isn't empty a paragraph, escaped", () => {
		expect(paragraphs("One & two", "", undefined, "Three")).toBe("<p>One &amp; two</p><p>Three</p>");
		expect(paragraphs()).toBe("");
	});
});

describe("splitOutside", () => {
	it("splits only outside parentheses, trimming parts and dropping empty ones", () => {
		expect(splitOutside("Sword (d8, hefty), mail (A1),, shield", /^,/)).toEqual(["Sword (d8, hefty)", "mail (A1)", "shield"]);
		expect(splitOutside("mace and shield (A1 and d4) or bow", /^\s+(?:and|or)\s+/i)).toEqual(["mace", "shield (A1 and d4)", "bow"]);
	});

	it("passes over a bracket that closes nothing", () => {
		expect(splitOutside("a), b (c, d)", /^,/)).toEqual(["a)", "b (c, d)"]);
	});
});

describe("parentheticals", () => {
	it("finds each outermost parenthesis that closes", () => {
		expect(parentheticals("x (a (b) c) y (d")).toEqual([{ open: 2, close: 10, inner: "a (b) c" }]);
		expect(parentheticals(") (a) (b)")).toEqual([{ open: 2, close: 4, inner: "a" }, { open: 6, close: 8, inner: "b" }]);
		expect(parentheticals("none")).toEqual([]);
	});
});
