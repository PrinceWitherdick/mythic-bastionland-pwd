import { describe, expect, it } from "vitest";
import {
	awayFromHome,
	cameHome,
	collectionsResult,
	CRISES,
	crisesDrawn,
	crisisFor,
	crisisResult,
	domainRuledBy,
	dramaResult,
	emptySeats,
	findDomainHolding,
	holdingRef,
	isMisruleDue,
	musterFor,
	namesItsDomain,
	parseHoldingRef
} from "../../module/rules/dominion.js";

describe("namesItsDomain", () => {
	it("knows a name that already ends with Domain, so the title doesn't say it twice", () => {
		expect(namesItsDomain("Tal’s Domain", "Domain")).toBe(true);
		expect(namesItsDomain("  the old domain ", "Domain")).toBe(true);
		expect(namesItsDomain("Mill", "Domain")).toBe(false);
		expect(namesItsDomain("Domainsend", "Domain")).toBe(false);
	});
});

describe("emptySeats", () => {
	it("names the seats that must be filled and stand empty, leaving the Circle to be offered (p20, p204)", () => {
		expect(emptySeats({ steward: "Medryn", marshal: "Moss", sheriff: "  ", envoy: "", circle: "" })).toEqual(["sheriff", "envoy"]);
		expect(emptySeats({ steward: "a", marshal: "b", sheriff: "c", envoy: "d", circle: "" })).toEqual([]);
		expect(emptySeats(null)).toEqual(["steward", "marshal", "sheriff", "envoy"]);
	});
});

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
	it("falls into misrule once it carries 3 Crises or more", () => {
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

describe("a Domain's Holding", () => {
	const hollowmere = { id: "t1", hex: { col: 3, row: 2 }, name: "Hollowmere", style: "castle", seat: false };
	const tower = { id: "t2", hex: { col: 5, row: 5 }, name: "", style: "tower", seat: false };
	const realms = [{ sceneId: "s1", holdings: [hollowmere, tower] }];
	const domain = (name, holding = "") => ({ name, system: { holding } });

	it("names a Holding by its Tile's uuid", () => {
		expect(holdingRef("s1", "t2")).toBe("Scene.s1.Tile.t2");
		expect(parseHoldingRef("Scene.s1.Tile.t2")).toEqual({ sceneId: "s1", holdingId: "t2" });
		expect(parseHoldingRef("Actor.x")).toBeNull();
		expect(parseHoldingRef("")).toBeNull();
	});

	it("finds the Holding it was given, or else the one bearing its name", () => {
		expect(findDomainHolding(realms, domain("Anywhere", "Scene.s1.Tile.t2"))).toEqual({ sceneId: "s1", holding: tower });
		expect(findDomainHolding(realms, domain(" hollowmere "))).toEqual({ sceneId: "s1", holding: hollowmere });
		expect(findDomainHolding(realms, domain("Elsewhere"))).toBeNull();
		// A Holding given but since taken off the map isn't found by name instead.
		expect(findDomainHolding(realms, domain("Hollowmere", "Scene.s1.Tile.gone"))).toBeNull();
	});

	it("finds nothing by a name two Holdings share", () => {
		const twice = [...realms, { sceneId: "s2", holdings: [{ ...hollowmere, id: "t9" }] }];
		expect(findDomainHolding(twice, domain("Hollowmere"))).toBeNull();
	});

	it("knows the Company is away from home, or has come home", () => {
		expect(awayFromHome({ col: 3, row: 2 }, { col: 3, row: 2 })).toBe(false);
		expect(awayFromHome({ col: 3, row: 2 }, { col: 4, row: 2 })).toBe(true);
		expect(awayFromHome({ col: 3, row: 2 }, null)).toBe(true);
		expect(cameHome({ col: 3, row: 2 }, [{ col: 4, row: 2 }, { col: 3, row: 2 }])).toBe(true);
		expect(cameHome({ col: 3, row: 2 }, [{ col: 4, row: 2 }])).toBe(false);
	});
});
