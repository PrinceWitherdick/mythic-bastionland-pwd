import { describe, expect, it } from "vitest";
import { escapeHTML, joinLines, logicalLines } from "../../module/rules/text.js";

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
