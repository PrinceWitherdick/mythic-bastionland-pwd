import { describe, expect, it } from "vitest";
import {
	MARKDOWN_FORMAT,
	OWNERSHIP,
	block,
	entryOwnership,
	entrySort,
	inline,
	journalPlan,
	knownMarkdown,
	rolledMarkdown
} from "../../module/rules/hex-journal.js";
import { emptyJourney, recordVisits } from "../../module/rules/journey.js";
import { emptyShared } from "../../module/rules/hex-shared.js";
import { emptyRealm, TERRAIN } from "../../module/rules/realm.js";
import { hexIndex, realmGeometry } from "../../module/rules/realm-geometry.js";
import { playerHexView, viewWords } from "../../module/rules/travels.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// Invented words throughout, so no book text lives in the repository.
const SECRET_LANDMARK = "Gallows of the Grey Wife";
const labels = { rolls: "Rolled Here", note: "What’s here", nothingKept: "Nothing kept.", told: "Told", party: "Company’s Note" };

const rolledWords = (overrides = {}) => ({
	terrain: "Forest",
	features: ["Ashford, Seat of Power", "Bog of Teeth (hidden)"],
	visits: "Visited twice",
	told: "",
	sparks: [
		{ table: "Land", rolls: [4, 9], prompt: "Mossy Hollow", when: "rolled in Spring" },
		{ table: "Sky", rolls: [], prompt: "Low *clouds*", when: null }
	],
	note: "A well.\nSomeone lives in it.",
	kept: true,
	labels,
	...overrides
});

const wanted = (overrides = {}) => ({
	key: "5,7",
	hex: { col: 5, row: 7 },
	name: "Column 5, Row 7",
	open: false,
	pages: {
		rolled: { name: "Rolled", markdown: "rolled\n" },
		known: { name: "What the Company Knows", markdown: "known\n" },
		notes: { name: "Notes", markdown: "" }
	},
	...overrides
});

const snapshot = (overrides = {}) => ({
	id: "e1",
	name: "Column 5, Row 7",
	sort: entrySort({ col: 5, row: 7 }),
	ownership: OWNERSHIP.NONE,
	open: false,
	pages: { rolled: { id: "p1", markdown: "rolled\n" }, known: { id: "p2", markdown: "known\n" }, notes: { id: "p3", markdown: "mine" } },
	...overrides
});

describe("inline and block", () => {
	it("escapes what markdown would read, and the start of a tag", () => {
		expect(inline("a *b* _c_ [d] <script> #e")).toBe("a \\*b\\* \\_c\\_ \\[d\\] &lt;script> \\#e");
	});

	it("keeps someone's lines as lines", () => {
		expect(block("one\ntwo\n")).toBe("one  \ntwo");
	});
});

describe("rolledMarkdown", () => {
	it("sets out what stands there, the visits, each roll and the note", () => {
		const markdown = rolledMarkdown(rolledWords());
		expect(markdown).toContain("Forest · Ashford, Seat of Power · Bog of Teeth (hidden)");
		expect(markdown).toContain("### Rolled Here");
		expect(markdown).toContain("- **Land** (4, 9): Mossy Hollow — *rolled in Spring*");
		expect(markdown).toContain("- **Sky**: Low \\*clouds\\*");
		expect(markdown).toContain("A well.  \nSomeone lives in it.");
		expect(markdown).not.toContain("Nothing kept.");
	});

	it("says so when nothing is kept any more, and leaves out empty sections", () => {
		const markdown = rolledMarkdown(rolledWords({ sparks: [], note: "", kept: false }));
		expect(markdown).toContain("*Nothing kept.*");
		expect(markdown).not.toContain("###");
	});
});

describe("knownMarkdown", () => {
	it("sets out what was told and the Company's note", () => {
		const markdown = knownMarkdown({
			terrain: "Forest",
			features: [],
			sighted: "",
			visits: "Visited once",
			told: [{ note: "Crows nest there.", when: "told in Spring" }],
			party: { text: "Rumoured ford", by: "Last written by Ada." },
			labels
		});
		expect(markdown).toContain("Forest\n\nVisited once");
		expect(markdown).toContain("### Told\n\n- Crows nest there. — *told in Spring*");
		expect(markdown).toContain("### Company’s Note\n\nRumoured ford\n\n*Last written by Ada.*");
	});

	it("never carries a Landmark the players haven't found, nor names the entry by it", () => {
		const g = realmGeometry({ cols: 12, rows: 12 });
		const at = { col: 3, row: 3 };
		const realm = emptyRealm(g);
		realm.terrain[hexIndex(g, at)] = TERRAIN.indexOf("forest") + 1;
		realm.landmarks = [{ id: "l0", hex: at, type: "ruin", name: SECRET_LANDMARK, seer: null, revealed: false }];
		const journey = recordVisits(emptyJourney(), [at], { age: 1, season: "spring", day: 1, phase: "morning" });
		const view = playerHexView({ realm, g, journey, shared: emptyShared(), marks: [], handHidden: () => ({}) }, at);
		const words = viewWords(view, (key, data) => `${key} ${JSON.stringify(data ?? {})}`);
		const markdown = knownMarkdown({ ...words, visits: "", told: view.told, party: view.party, labels });
		expect(markdown + words.title).not.toContain(SECRET_LANDMARK);
		expect(view.openable).toBe(true);
	});
});

describe("entryOwnership", () => {
	it("lets players in when the hex opens to them, and out again only as far as it let them in", () => {
		expect(entryOwnership(OWNERSHIP.NONE, false, true)).toBe(OWNERSHIP.LIMITED);
		expect(entryOwnership(OWNERSHIP.OBSERVER, false, true)).toBe(OWNERSHIP.OBSERVER);
		expect(entryOwnership(OWNERSHIP.LIMITED, true, false)).toBe(OWNERSHIP.NONE);
		expect(entryOwnership(OWNERSHIP.OBSERVER, true, false)).toBe(OWNERSHIP.OBSERVER);
		expect(entryOwnership(OWNERSHIP.OBSERVER, true, true)).toBe(OWNERSHIP.OBSERVER);
	});
});

describe("journalPlan", () => {
	it("makes a new entry with all three pages in markdown, the Company's alone open to players", () => {
		const plan = journalPlan(null, wanted({ open: true }));
		expect(plan.open).toBe(true);
		expect(plan.create).toMatchObject({ name: "Column 5, Row 7", sort: entrySort({ col: 5, row: 7 }), ownership: { default: OWNERSHIP.LIMITED } });
		const pages = plan.create.pages;
		expect(pages.map((page) => page.flags[SYSTEM_ID].role)).toEqual(["rolled", "known", "notes"]);
		expect(pages.map((page) => page.ownership.default)).toEqual([OWNERSHIP.NONE, OWNERSHIP.OBSERVER, OWNERSHIP.NONE]);
		expect(pages.every((page) => page.type === "text" && page.text.format === MARKDOWN_FORMAT)).toBe(true);
		expect(pages[0].sort).toBeLessThan(pages[1].sort);
	});

	it("writes nothing when nothing changed", () => {
		expect(journalPlan(snapshot(), wanted())).toEqual({ create: null, update: null, open: null, pages: { create: [], update: [] } });
	});

	it("rewrites only the pages that changed, and never the GM's Notes", () => {
		const plan = journalPlan(snapshot(), wanted({ pages: { ...wanted().pages, rolled: { name: "Rolled", markdown: "new\n" }, notes: { name: "Notes", markdown: "" } } }));
		expect(plan.pages.update).toEqual([{ _id: "p1", text: { format: MARKDOWN_FORMAT, markdown: "new\n" } }]);
		expect(plan.update).toBeNull();
	});

	it("makes a written page again if it was deleted, but not the Notes page", () => {
		const plan = journalPlan(snapshot({ pages: { known: { id: "p2", markdown: "known\n" } } }), wanted());
		expect(plan.pages.create.map((page) => page.flags[SYSTEM_ID].role)).toEqual(["rolled"]);
	});

	it("renames the entry and opens it to players once they could open the hex", () => {
		const plan = journalPlan(snapshot(), wanted({ name: "Ashford (Column 5, Row 7)", open: true }));
		expect(plan.update).toEqual({ name: "Ashford (Column 5, Row 7)", "ownership.default": OWNERSHIP.LIMITED });
		expect(plan.open).toBe(true);
	});
});
