import { describe, expect, it } from "vitest";
import { bookSteeds, gallopBlocked, steedBreedShown, steedStatLine, vigAfterGallop } from "../../module/rules/steeds.js";

const track = (value) => ({ value, max: value });

describe("bookSteeds", () => {
	it("keeps the beasts a Knight could ride, in the book's order", () => {
		const beasts = ["Hound", "Pony", "Mule", "Ox", "Hawk", "Riding Steed", "Heavy Steed", "Charger"].map((name) => ({ name }));
		expect(bookSteeds(beasts).map((beast) => beast.name)).toEqual(["Pony", "Riding Steed", "Heavy Steed", "Charger"]);
	});
});

describe("steedStatLine", () => {
	it("prints Virtues, Guard and trample as the book does", () => {
		const system = { virtues: { vig: track(10), cla: track(5), spi: track(5) }, guard: track(5) };
		const items = [{ type: "weapon", system: { damage: "d8", trample: true } }, { type: "weapon", system: { damage: "d6" } }];
		expect(steedStatLine(system, items)).toBe("VIG 10, CLA 5, SPI 5, 5GD, d8 trample");
	});

	it("leaves out a steed's missing trample", () => {
		expect(steedStatLine({ virtues: { vig: track(15), cla: track(5), spi: track(5) }, guard: track(2) })).toBe("VIG 15, CLA 5, SPI 5, 2GD");
	});
});

describe("gallopBlocked", () => {
	it("stops riders without a steed, or on an Exhausted one", () => {
		expect(gallopBlocked([
			{ name: "Ser A", steed: { name: "Charger", vig: 4 } },
			{ name: "Ser B", steed: null },
			{ name: "Ser C", steed: { name: "Pony", vig: 0 } }
		])).toEqual([{ name: "Ser B", reason: "noSteed" }, { name: "Ser C", reason: "exhausted", steed: "Pony" }]);
	});

	it("lets a Company of fresh steeds go", () => {
		expect(gallopBlocked([{ name: "Ser A", steed: { name: "Charger", vig: 1 } }])).toEqual([]);
	});
});

describe("vigAfterGallop", () => {
	it("takes the d6 from VIG, down to 0", () => {
		expect(vigAfterGallop(10, 4)).toBe(6);
		expect(vigAfterGallop(3, 5)).toBe(0);
	});
});

describe("steedBreedShown", () => {
	it("shows the book steed under a name of the Knight's own", () => {
		expect(steedBreedShown("Bucephalus", "Majestic charger")).toBe("Majestic charger");
	});

	it("shows nothing when the name says it already, or there is none", () => {
		expect(steedBreedShown("Majestic charger (Bardolf)", "Majestic charger")).toBe("");
		expect(steedBreedShown("Bucephalus", undefined)).toBe("");
	});
});
