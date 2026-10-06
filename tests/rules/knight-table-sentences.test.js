import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { spreads } from "../../module/rules/book-art.js";
import { articleFor, asPattern, rollForKnightPage, tableSentence, withSentences } from "../../module/rules/knight-table-sentences.js";

// Entries here are invented so no book text lives in the repository.

const shown = (sentence) => sentence && `${sentence.before}[${sentence.entry}]${sentence.after}`;

describe("tableSentence", () => {
	it("puts the entry in its place, without its capital within a sentence", () => {
		expect(tableSentence("The lantern found you at the {entry}.", "Marsh")).toEqual({ before: "The lantern found you at the ", entry: "marsh", after: "." });
	});

	it("gives it a capital where it starts a sentence", () => {
		expect(shown(tableSentence("{entry} is your rival.", "a jealous baker"))).toBe("[A jealous baker] is your rival.");
		expect(shown(tableSentence("Why? {entry}.", "the oath forbids it"))).toBe("Why? [The oath forbids it].");
	});

	it("keeps the capital of a word the book always capitalises, or one in capitals", () => {
		expect(shown(tableSentence("You fear {entry}.", "Seers"))).toBe("You fear [Seers].");
		expect(shown(tableSentence("You owe {entry}.", "Knight-Captain Hale"))).toBe("You owe [Knight-Captain Hale].");
		expect(shown(tableSentence("It grants: {entry}.", "A2 against fire"))).toBe("It grants: [A2 against fire].");
		expect(shown(tableSentence("It costs: {entry}.", "VIG Save or faint"))).toBe("It costs: [VIG Save or faint].");
		expect(shown(tableSentence("It ends: {entry}.", "Knights Errant weep"))).toBe("It ends: [Knights Errant weep].");
	});

	it("keeps the entry as written for {Entry}", () => {
		expect(shown(tableSentence("The song begins: {Entry}.", "The Moth and the Moon"))).toBe("The song begins: [The Moth and the Moon].");
	});

	it("reads a lone \"Self\" as the Knight themself", () => {
		expect(shown(tableSentence("Your teacher: {entry}.", "Self"))).toBe("Your teacher: [yourself].");
	});

	it("gives an article for {a entry}, unless the entry has one, is plural, or is stuff rather than a thing", () => {
		expect(shown(tableSentence("You ride {a entry}.", "Old mule"))).toBe("You ride an [old mule].");
		expect(shown(tableSentence("It is patched with {a entry}.", "Padded coat"))).toBe("It is patched with a [padded coat].");
		expect(shown(tableSentence("It is patched with {a entry}.", "Polished steel"))).toBe("It is patched with [polished steel].");
		// The pattern's own noun takes the article, so the entry only describes it.
		expect(shown(tableSentence("You wear {a entry} cloak.", "Thick fur"))).toBe("You wear a [thick fur] cloak.");
		expect(shown(tableSentence("You ride {a entry}.", "Pony (d6 kick)"))).toBe("You ride a [pony (d6 kick)].");
		expect(shown(tableSentence("You ride {a entry}.", "The abbot's goat"))).toBe("You ride [the abbot's goat].");
		expect(shown(tableSentence("It came from {a entry}.", "Sunken barges"))).toBe("It came from [sunken barges].");
		expect(shown(tableSentence("{a entry} guards you.", "Iron hound"))).toBe("An [iron hound] guards you.");
		expect(shown(tableSentence("{a entry} guards you.", "Two hounds"))).toBe("[Two hounds] guards you.");
	});

	it("gives \"the\" for {the entry}, unless the entry has its own", () => {
		expect(shown(tableSentence("You were cursed by {the entry}.", "Lord of the marsh"))).toBe("You were cursed by the [lord of the marsh].");
		expect(shown(tableSentence("You were cursed by {the entry}.", "A passing hermit"))).toBe("You were cursed by [a passing hermit].");
	});

	it("drops the pattern's full stop after an entry with its own", () => {
		expect(shown(tableSentence("The twist: {Entry}.", "Owls!"))).toBe("The twist: [Owls!]");
		expect(shown(tableSentence("It shows the {entry}.", "Fall of..."))).toBe("It shows the [fall of...]");
	});

	it("gives nothing without a place for the entry, or an entry", () => {
		expect(tableSentence("No place here.", "Marsh")).toBeNull();
		expect(tableSentence("At the {entry}.", "")).toBeNull();
		expect(tableSentence(null, "Marsh")).toBeNull();
	});
});

describe("articleFor", () => {
	it("says \"an\" before a vowel, but \"a\" where it's said with a \"you\" or a \"wuh\"", () => {
		expect(articleFor("Ember")).toBe("an");
		expect(articleFor("Unicorn")).toBe("a");
		expect(articleFor("One-eyed crow")).toBe("a");
		expect(articleFor("Crow")).toBe("a");
	});

	it("treats a word ending in \"ss\" as one, not a plural", () => {
		expect(articleFor("Brass bell")).toBe("a");
		expect(articleFor("Abbess")).toBe("an");
	});

	it("says nothing before stuff, unless the pattern's own noun follows", () => {
		expect(articleFor("Polished steel")).toBe("");
		expect(articleFor("Polished steel", "a", { beforeNoun: true })).toBe("a");
	});
});

describe("rollForKnightPage", () => {
	it("finds the roll whose Knight is printed on a page", () => {
		const [first, second] = spreads();
		expect(rollForKnightPage(first.knightPage)).toBe(first.roll);
		expect(rollForKnightPage(String(second.knightPage))).toBe(second.roll);
		expect(rollForKnightPage(first.mythPage)).toBeNull();
	});
});

describe("withSentences", () => {
	const [first] = spreads();
	const page = { page: first.knightPage };
	const said = (line) => line.sentence?.parts.map((part) => (part.bold ? `[${part.text}]` : part.text)).join("");

	it("tells each result with its column's pattern, by the Knight's roll and the column's number", () => {
		const asked = [];
		const patternFor = (roll, column) => {
			asked.push([roll, column]);
			return column === 2 ? "It smells of {entry}." : null;
		};
		const lines = withSentences(page, [{ index: 0, roll: 3, entry: "Cellar" }, { index: 1, roll: 5, entry: "Smoke" }], patternFor);
		expect(asked).toEqual([[first.roll, 1], [first.roll, 2]]);
		expect(lines.map(said)).toEqual([undefined, "It smells of [smoke]."]);
	});

	it("joins a column that finishes the line before it", () => {
		const patternFor = (_roll, column) => (column === 1
			? "Your tapestry shows the {entry}"
			: { line: "Its subject is {entry}.", join: "{entry}." });
		const lines = withSentences(page, [{ index: 0, roll: 1, entry: "Birth of..." }, { index: 1, roll: 4, entry: "A wandering Seer" }], patternFor);
		expect(lines).toHaveLength(1);
		expect(said(lines[0])).toBe("Your tapestry shows the [birth of...] [a wandering Seer].");
	});

	it("leaves a joining column on its own line when the column before it wasn't rolled", () => {
		const patternFor = () => ({ line: "Its subject is {entry}.", join: "{entry}." });
		const lines = withSentences(page, [{ index: 1, roll: 4, entry: "A wandering Seer" }], patternFor);
		expect(said(lines[0])).toBe("Its subject is [a wandering Seer].");
	});

	it("tells nothing for a table not on a Knight's page", () => {
		expect(withSentences({ page: 1 }, [{ index: 0, roll: 2, entry: "Cellar" }], () => "At the {entry}.")).toEqual([{ index: 0, roll: 2, entry: "Cellar", sentence: null }]);
	});
});

describe("asPattern", () => {
	it("takes a line on its own, and a joining column in both its forms", () => {
		expect(asPattern("At the {entry}.")).toBe("At the {entry}.");
		const joining = { line: "Its subject is {entry}.", join: "{entry}." };
		expect(asPattern(joining)).toBe(joining);
	});

	it("takes nothing else, since no pattern was written under that key", () => {
		for (const found of [undefined, null, 7, {}, { join: "{entry}." }, ["At the {entry}."]]) {
			expect(asPattern(found)).toBeNull();
		}
	});
});

describe("the sentence patterns", () => {
	const en = JSON.parse(fs.readFileSync(new URL("../../languages/en.json", import.meta.url), "utf8"));
	const sentences = (en.bastionland ?? en).knightTable.sentences;

	it("has one for each column of every Knight's table", () => {
		expect(Object.keys(sentences).sort()).toEqual(spreads().map((spread) => spread.roll).sort());
		for (const columns of Object.values(sentences)) expect(Object.keys(columns)).toEqual(["1", "2"]);
	});

	it("is read for every column, a joining one not lost for being written as two forms", () => {
		const joining = [];
		for (const [roll, columns] of Object.entries(sentences)) {
			for (const [column, pattern] of Object.entries(columns)) {
				expect(asPattern(pattern), `${roll}.${column}`).toBe(pattern);
				if (typeof pattern !== "string") joining.push(`${roll}.${column}`);
			}
		}
		// At least one is written that way, so the reader is asked the question.
		expect(joining.length).toBeGreaterThan(0);
	});

	it("gives each exactly one place for the entry, a joining column in both its forms", () => {
		for (const [roll, columns] of Object.entries(sentences)) {
			for (const column of Object.values(columns)) {
				for (const pattern of typeof column === "string" ? [column] : [column.line, column.join]) {
					expect(pattern.match(/\{(?:(?:a|the) )?(?:entry|Entry)\}/g), `${roll}: ${pattern}`).toHaveLength(1);
					expect(tableSentence(pattern, "Something"), `${roll}: ${pattern}`).not.toBeNull();
				}
			}
		}
	});
});
