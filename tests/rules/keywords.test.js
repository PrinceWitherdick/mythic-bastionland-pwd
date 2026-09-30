import { describe, expect, it } from "vitest";
import { BOOK_PRINTS } from "../../module/rules/book-text.js";
import { KEYWORDS, findKeywords } from "../../module/rules/keywords.js";

/** The words found, as written. */
const words = (text) => findKeywords(text).map(({ index, length }) => text.slice(index, index + length));

/** The keys found. */
const keys = (text) => findKeywords(text).map(({ key }) => key);

describe("findKeywords", () => {
	it("finds the book's capitalised rule words", () => {
		expect(keys("Fail a VIG Save and become Fatigued.")).toEqual(["vigour", "save", "fatigue"]);
		expect(keys("Characters caught defenceless are Exposed.")).toEqual(["exposed"]);
	});

	it("leaves the same words alone when they're only words", () => {
		expect(findKeywords("save your breath, guard the gate, a long day, deny it")).toEqual([]);
	});

	it("matches a phrase whole rather than the word inside it", () => {
		expect(words("a Strong Gambit and a Mortal Wound")).toEqual(["Strong Gambit", "Mortal Wound"]);
		expect(keys("Mortally Wounded")).toEqual(["mortalWound"]);
		expect(keys("they are Wounded")).toEqual(["wounded"]);
	});

	it("reads GD after a number, but not a word inside a longer one", () => {
		expect(words("Sentry: 3GD")).toEqual(["GD"]);
		expect(findKeywords("Spirited Feathers GDX")).toEqual([]);
	});

	it("counts Long and Slow only where a weapon's qualities are listed", () => {
		expect(words("Greatsword (2d10 long)")).toEqual(["long"]);
		expect(words("Crossbow: 2d8 slow")).toEqual(["slow"]);
		expect(words("(d10, Long)")).toEqual(["Long"]);
		expect(words("(2d10, Slow, Long)")).toEqual(["Slow", "Long"]);
		expect(words("Long weapons require both hands")).toEqual(["Long"]);
		expect(findKeywords("Long ago, a Slow river")).toEqual([]);
	});

	it("reads the qualities the Attack dialog joins with a middle dot", () => {
		expect(words("d10 · Long")).toEqual(["Long"]);
		expect(words("d8 · Hefty · Slow")).toEqual(["Hefty", "Slow"]);
		expect(words("d6 · Ranged")).toEqual(["Ranged"]);
	});

	it("finds Hefty and Blast wherever they're capitalised, and lower case after dice", () => {
		expect(words("Mace (d8 hefty)")).toEqual(["hefty"]);
		expect(words("Only one Hefty item")).toEqual(["Hefty"]);
		expect(words("Stone Thrower: d12 blast")).toEqual(["blast"]);
		expect(words("gains +d12 or Blast")).toEqual(["Blast"]);
		expect(findKeywords("a blast of wind, a hefty sum")).toEqual([]);
	});

	it("says where each word is and which page explains it", () => {
		expect(findKeywords("an Impaired attack")).toEqual([{ index: 3, length: 8, key: "impaired", page: 8 }]);
	});
});

describe("the keywords' tips", () => {
	it("has the book's words for every keyword, and a keyword for every tip", () => {
		const tips = Object.keys(BOOK_PRINTS).filter((key) => key.startsWith("keywords.")).map((key) => key.slice("keywords.".length));
		expect(tips.sort()).toEqual(KEYWORDS.map(({ key }) => key).sort());
	});

	it("names each keyword once", () => {
		const all = KEYWORDS.map(({ key }) => key);
		expect(new Set(all).size).toBe(all.length);
	});
});
