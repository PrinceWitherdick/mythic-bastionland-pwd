import { describe, expect, it } from "vitest";
import { DESIGN_SCALES, designDone, designReady, grandDesigns, newDesign, normalizeDesign } from "../../module/rules/grand-designs.js";

const at = (season, day = 1, phase = "morning", { age = 1, year = 1 } = {}) => ({ age, year, season, day, phase });

describe("designReady", () => {
	it("finishes work on what stands by the next Season (p21)", () => {
		expect(designReady({ scale: "works", started: at("spring", 5, "night") })).toMatchObject({ age: 1, season: "harvest", day: 1, phase: "morning" });
	});

	it("gives a new building a whole Season, the next one if begun as a Season begins", () => {
		expect(designReady({ scale: "building", started: at("spring") })).toMatchObject({ season: "harvest" });
		expect(designReady({ scale: "building", started: at("spring", 2) })).toMatchObject({ season: "winter" });
		expect(designReady({ scale: "building", started: at("harvest", 1, "afternoon") })).toMatchObject({ season: "spring", year: 2 });
	});

	it("gives a grand project an entire Age, the next one if begun as an Age begins", () => {
		expect(designReady({ scale: "grand", started: at("spring") })).toMatchObject({ age: 2, season: "spring" });
		expect(designReady({ scale: "grand", started: at("harvest") })).toMatchObject({ age: 3, season: "spring" });
	});
});

describe("designDone", () => {
	const castle = { scale: "grand", started: at("winter", 3) };

	it("holds until its time has come", () => {
		expect(designDone(castle, at("spring", 1, "morning", { age: 2, year: 2 }))).toBe(false);
		expect(designDone(castle, at("spring", 1, "morning", { age: 3, year: 3 }))).toBe(true);
		expect(designDone({ scale: "works", started: at("spring") }, at("spring", 9, "night"))).toBe(false);
		expect(designDone({ scale: "works", started: at("spring") }, at("harvest"))).toBe(true);
	});
});

describe("grandDesigns", () => {
	it("keeps only works of a scale the book gives, in the order begun", () => {
		const designs = {
			b: { what: " Mill ", scale: "building", started: at("harvest"), at: 2 },
			a: { what: "Walls", scale: "works", started: at("spring"), at: 5 },
			c: { what: "Tower", scale: "palace", started: at("spring") },
			d: null
		};
		expect(grandDesigns(designs).map(({ id, what }) => [id, what])).toEqual([["a", "Walls"], ["b", "Mill"]]);
		expect(grandDesigns(null)).toEqual([]);
	});

	it("starts a new work blank, and refuses a scale the book doesn't give", () => {
		expect(newDesign("grand", at("winter"), 7)).toEqual({ what: "", scale: "grand", started: at("winter"), at: 7 });
		expect(newDesign("palace", at("winter"), 7)).toBeNull();
		expect(normalizeDesign({ scale: "works" }).started).toMatchObject({ age: 1, season: "spring" });
		expect(DESIGN_SCALES).toEqual(["works", "building", "grand"]);
	});
});
