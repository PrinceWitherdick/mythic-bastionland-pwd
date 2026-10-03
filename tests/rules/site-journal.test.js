import { describe, expect, it } from "vitest";
import { OWNERSHIP, journalPlan } from "../../module/rules/hex-journal.js";
import { SITE_LAYOUT, foundMarkdown, siteMarkdown } from "../../module/rules/site-journal.js";
import { emptySite, normaliseSite, revealRoute } from "../../module/rules/sites.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// Invented words, so no book text lives in the repository.
const words = {
	point: (number, kind) => `Point ${number}, ${kind}`,
	entrance: (kind, number) => `${kind} at ${number}`,
	entranceAway: (kind) => `${kind} to somewhere unexplored`,
	routeTo: (kind, to) => `${kind} path to ${to}`,
	route: (kind, from, to) => `${kind} route between ${from} and ${to}`,
	routeOut: (kind, from) => `${kind} route from ${from} to somewhere unexplored`,
	routeAway: (kind) => `${kind} route between unexplored places`,
	glimpsed: (count) => `Glimpsed: ${count}`,
	labels: {
		place: "What is this place?",
		points: "Points",
		entrances: "Entrances",
		routes: "Ways Known",
		found: "found",
		notFound: "not found",
		noPoints: "No points yet.",
		nothingFound: "Nothing found yet."
	}
};

/** A chapel over a crypt: the bell found, the crypt and its ring not yet. */
const chapel = () => normaliseSite({
	notes: "A drowned chapel",
	points: {
		top: { kind: "feature", number: 1, text: "A cracked bell", found: true, entrance: "open", entranceText: "Through the lychgate" },
		centre: { kind: "danger", number: 2, text: "Eels in the nave" },
		bottom: { kind: "treasure", number: 3, text: "A tin ring", entrance: "hidden", entranceText: "Up the sluice" }
	},
	routes: {
		"centre-top": { kind: "open", text: "A narrow stair" },
		"centre-bottom": { kind: "hidden", text: "Behind the font" }
	}
});

const GM_WORDS = ["A drowned chapel", "A cracked bell", "lychgate", "Eels", "A tin ring", "sluice", "narrow stair", "Behind the font"];

describe("siteMarkdown", () => {
	it("writes out every point, route and entrance, with what's found", () => {
		const markdown = siteMarkdown(chapel(), words);
		for (const text of GM_WORDS) expect(markdown).toContain(text);
		expect(markdown).toContain("### What is this place?");
		expect(markdown).toContain("- **Point 1, feature** · *found*: A cracked bell");
		expect(markdown).toContain("- **Point 2, danger** · *not found*: Eels in the nave");
		expect(markdown).toContain("  - hidden path to 3 · *not found*: Behind the font");
		expect(markdown).toContain("- **hidden at 3** · *not found*: Up the sluice");
	});

	it("says so when no point is marked", () => {
		expect(siteMarkdown(emptySite(), words)).toBe("*No points yet.*\n");
	});
});

describe("foundMarkdown", () => {
	it("shows only what the players' map shows, and none of the GM's words", () => {
		const markdown = foundMarkdown(chapel(), words);
		for (const text of GM_WORDS) expect(markdown).not.toContain(text);
		expect(markdown).toContain("- Point 1, feature");
		expect(markdown).not.toContain("Point 2");
		expect(markdown).toContain("- open route from 1 to somewhere unexplored");
		expect(markdown).not.toContain("hidden route");
		expect(markdown).toContain("- open at 1");
		expect(markdown).not.toContain("hidden at");
		expect(markdown).toContain("*Glimpsed: 1*");
	});

	it("names a hidden route once it's found", () => {
		const markdown = foundMarkdown(revealRoute(chapel(), "centre-bottom", true), words);
		expect(markdown).toContain("- hidden route between unexplored places");
	});

	it("says so when nothing is found", () => {
		const site = normaliseSite({ points: { top: { kind: "feature", number: 1, text: "Secret" } } });
		expect(foundMarkdown(site, words)).toBe("*Nothing found yet.*\n");
	});
});

describe("journalPlan with the Site layout", () => {
	const wanted = (site = "site words") => ({
		name: "The Chapel",
		open: false,
		pages: { site: { name: "The Site", markdown: site }, found: { name: "Found", markdown: "found words" }, notes: { name: "Notes", markdown: "" } }
	});
	const existing = (ownership) => ({
		id: "e1",
		name: "The Chapel",
		sort: 0,
		ownership,
		open: false,
		pages: { site: { id: "p0", markdown: "site words" }, found: { id: "p1", markdown: "found words" }, notes: { id: "p2", markdown: "The GM's own" } }
	});

	it("makes the entry hidden, and only the Found page one players could see", () => {
		const { create } = journalPlan(null, wanted(), SITE_LAYOUT);
		expect(create.ownership.default).toBe(OWNERSHIP.NONE);
		expect(create).not.toHaveProperty("sort");
		expect(create.pages.map((page) => [page.flags[SYSTEM_ID].role, page.ownership.default]))
			.toEqual([["site", OWNERSHIP.NONE], ["found", OWNERSHIP.OBSERVER], ["notes", OWNERSHIP.NONE]]);
	});

	it("writes only the changed page, never Notes, and leaves a GM's sharing alone", () => {
		const plan = journalPlan(existing(OWNERSHIP.OBSERVER), wanted("new words"), SITE_LAYOUT);
		expect(plan.update).toBeNull();
		expect(plan.open).toBeNull();
		expect(plan.pages.create).toEqual([]);
		expect(plan.pages.update.map((update) => update._id)).toEqual(["p0"]);
	});
});
