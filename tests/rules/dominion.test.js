import { describe, expect, it } from "vitest";
import {
	collectionsResult,
	CRISES,
	crisesDrawn,
	crisisFor,
	crisisResult,
	domainRuledBy,
	dramaResult,
	isMisruleDue,
	musterFor
} from "../../module/rules/dominion.js";

describe("the Domain's rolls", () => {
	it("reads the Crisis Roll", () => {
		expect([1, 2, 3, 4, 6].map(crisisResult)).toEqual(["calamity", "dilemma", "dilemma", "prosperity", "prosperity"]);
		expect(crisesDrawn("calamity")).toBe(2);
		expect(crisesDrawn("dilemma")).toBe(2);
		expect(crisesDrawn("prosperity")).toBe(0);
	});

	it("reads Increased Collections and Drama in Court", () => {
		expect([1, 3, 5].map(collectionsResult)).toEqual(["misrule", "crisis", "willing"]);
		expect([1, 2, 4].map(dramaResult)).toEqual(["personal", "association", "uninvolved"]);
	});
});

describe("crisisFor", () => {
	it("names the Crisis a d6 rolls", () => {
		expect(CRISES.map((_crisis, index) => crisisFor(index + 1))).toEqual([...CRISES]);
	});

	it("passes a Crisis already taken to the next down the list, wrapping round", () => {
		expect(crisisFor(3, ["famine"])).toBe("misery");
		expect(crisisFor(6, ["doubt", "chaos"])).toBe("debt");
		expect(crisisFor(2, [...CRISES])).toBeNull();
	});
});

describe("Authority", () => {
	it("falls into misrule with 3 or more unresolved Crises", () => {
		expect(isMisruleDue(["chaos", "debt"])).toBe(false);
		expect(isMisruleDue(["chaos", "debt", "panic"])).toBe(true);
	});

	it("musters 3 Warbands from a Seat of Power and 2 from any other Holding", () => {
		expect(musterFor(true)).toBe(3);
		expect(musterFor(false)).toBe(2);
	});
});

describe("domainRuledBy", () => {
	const domains = [{ name: "Hollowmere", system: { ruler: "" } }, { name: "Ashford", system: { ruler: " Sir Brand " } }];

	it("finds the Domain whose ruler is written as the Knight's name, ignoring case and space", () => {
		expect(domainRuledBy(domains, "sir brand")?.name).toBe("Ashford");
	});

	it("finds nothing for a Knight nobody names, or a Knight with no name", () => {
		expect(domainRuledBy(domains, "Dame Wren")).toBeNull();
		expect(domainRuledBy(domains, "  ")).toBeNull();
	});
});
