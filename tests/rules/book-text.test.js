import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BOOK_PRINTS, BOOK_TEXT_FALLBACKS, bookTextPages, findBookText, fingerprint, fingerprintLetters, pageRaw, withBookText } from "../../module/rules/book-text.js";

// Text here is invented so no book text lives in the repository. Items are
// shaped as pdf.js hands them over: runs of text, with empty items and
// hasEOL where a line ends.

const root = join(import.meta.dirname, "../..");
const lang = JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8"));

/** A page's items from lines of runs. */
const page = (...lines) => lines.flatMap((line) => [...[line].flat().map((str) => ({ str, hasEOL: false })), { str: "", hasEOL: true }]);

const pages = {
	4: page(
		"4",
		["MOORLAND ", "WALKS"],
		"Walkers keep to the drove roads, which are dry in",
		["all but the ", "wettest", " months."],
		"A walker caught out after dark must find a non-",
		"Soaked hedge or a barn.",
		"“Mind the bog,” the shepherds say.",
		"• Carry a lantern",
		"• Carry a stick"
	),
	5: page(
		"5",
		"GATES",
		"Close every gate behind you.",
		"close every gate behind you, twice."
	)
};
const itemsOf = (number) => pages[number] ?? null;

describe("pageRaw", () => {
	it("joins a page's lines with spaces, and a word broken at a hyphen without one", () => {
		const raw = pageRaw(pages[4]);
		expect(raw).toContain("dry in all but the wettest months.");
		expect(raw).toContain("a non-Soaked hedge");
	});
});

describe("fingerprint", () => {
	it("is taken of letters, digits and stops, ignoring spaces, quotes and dashes", () => {
		expect(fingerprint("Close every gate behind you.")).toEqual(fingerprint("Close  every gate—behind you."));
		expect(fingerprint("Close every gate behind you.")).not.toEqual(fingerprint("Close every gate behind you"));
	});

	it("tells capitals apart, so the same words set as a heading and in a sentence are two passages", () => {
		expect(fingerprint("Close every gate")).not.toEqual(fingerprint("close every gate"));
	});

	it("counts a ligature as its letters", () => {
		expect(fingerprintLetters("ﬁeld").text).toBe("field");
	});
});

describe("findBookText", () => {
	const prints = (entries) => Object.fromEntries(Object.entries(entries).map(([key, [number, ...spans]]) => [key, [number, ...spans.map((span) => (Array.isArray(span) ? [...fingerprint(span[1]), span[0]] : fingerprint(span)))]]));

	it("finds a passage across lines and runs, with single spaces", () => {
		const { texts, missing } = findBookText(itemsOf, prints({ walk: [4, "Walkers keep to the drove roads, which are dry in all but the wettest months."] }));
		expect(missing).toEqual([]);
		expect(texts.walk).toBe("Walkers keep to the drove roads, which are dry in all but the wettest months.");
	});

	it("keeps the quotes around a passage", () => {
		const { texts } = findBookText(itemsOf, prints({ said: [4, "Mind the bog,” the shepherds say."] }));
		expect(texts.said).toBe("“Mind the bog,” the shepherds say.");
	});

	it("joins the spans of a passage, giving a stop to a bullet that has none", () => {
		const { texts } = findBookText(itemsOf, prints({ kit: [4, "Carry a lantern", "Carry a stick"] }));
		expect(texts.kit).toBe("Carry a lantern. Carry a stick.");
	});

	it("reads a span from its own page", () => {
		const { texts } = findBookText(itemsOf, prints({ both: [4, "Carry a stick", [5, "Close every gate behind you."]] }));
		expect(texts.both).toBe("Carry a stick. Close every gate behind you.");
	});

	it("looks a page either side, in case a printing moved the passage", () => {
		const { texts } = findBookText(itemsOf, prints({ moved: [4, "Close every gate behind you."] }));
		expect(texts.moved).toBe("Close every gate behind you.");
	});

	it("takes the words set as printed, not the same words in other capitals", () => {
		const { texts } = findBookText(itemsOf, prints({ lower: [5, "close every gate behind you, twice."] }));
		expect(texts.lower).toBe("close every gate behind you, twice.");
	});

	it("lists a passage that isn't on the page, and doesn't find half of one", () => {
		const { texts, missing } = findBookText(itemsOf, prints({ gone: [4, "Nothing like this is printed."], half: [4, "Carry a stick", "Nothing like this either."] }));
		expect(texts).toEqual({});
		expect(missing).toEqual(["gone", "half"]);
	});

	it("reads nothing from a book that isn't there", () => {
		expect(findBookText(() => null, prints({ walk: [4, "Carry a stick"] })).missing).toEqual(["walk"]);
	});
});

describe("bookTextPages", () => {
	it("lists each page a passage may be on, with a page either side", () => {
		expect(bookTextPages({ a: [4, [10, "x"]], b: [9, [10, "y"], [10, "z", 12]] })).toEqual([3, 4, 5, 8, 9, 10, 11, 12, 13]);
	});
});

describe("withBookText", () => {
	const prints = { "scars.distress.effect": [9, [10, "x"]], "scars.distress.flavour": [9, [10, "y"]] };

	it("lays the words read from the book over the language file", () => {
		const tree = withBookText({ bastionland: {} }, { "scars.distress.flavour": "Words from the book." }, prints);
		expect(tree.bastionland.scars.distress.flavour).toBe("Words from the book.");
	});

	it("gives a key the book hasn't filled its fallback, or nothing", () => {
		const tree = withBookText({ bastionland: { unread: { scars: { distress: "The system's own line." } } } }, {}, prints);
		expect(tree.bastionland.scars.distress.effect).toBe("The system's own line.");
		expect(tree.bastionland.scars.distress.flavour).toBe("");
	});
});

describe("the passages the system shows", () => {
	const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang.bastionland);

	it.each(Object.entries(BOOK_PRINTS))("%s is a page and fingerprints, and no words", (_key, [number, ...spans]) => {
		expect(Number.isInteger(number) && number > 0).toBe(true);
		expect(spans.length).toBeGreaterThan(0);
		for (const [length, hash, own] of spans) {
			expect(Number.isInteger(length) && length > 0).toBe(true);
			expect(hash).toMatch(/^[0-9a-z]{12}$/);
			if (own !== undefined) expect(Number.isInteger(own)).toBe(true);
		}
	});

	it("keeps none of the book's words in the language file, under the keys they're shown by", () => {
		expect(Object.keys(BOOK_PRINTS).filter((key) => lookup(key) !== undefined)).toEqual([]);
	});

	it("has a line of the system's own for each fallback", () => {
		for (const [key, fallback] of Object.entries(BOOK_TEXT_FALLBACKS)) {
			expect(BOOK_PRINTS[key], key).toBeDefined();
			expect(typeof lookup(fallback), fallback).toBe("string");
		}
	});
});
