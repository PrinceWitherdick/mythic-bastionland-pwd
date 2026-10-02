import { describe, expect, it } from "vitest";
import { MYTH_COUNT } from "../../module/rules/realm.js";
import { BOOK_SETUP, OWN_SIZE_LIMITS, SETUP_LIMITS, SETUP_PARTS, isBookSetup, normaliseRealmSetup, ownSideLimits, setupBarriers, withinOwnSize } from "../../module/rules/realm-setup.js";

describe("BOOK_SETUP", () => {
	it("is a typical Realm (p14)", () => {
		expect(BOOK_SETUP).toMatchObject({ cols: 12, rows: 12, cluster: 12, lakes: 3, holdings: 4, myths: 6, landmarks: { min: 3, max: 4 }, barriers: null });
		expect(SETUP_PARTS.every((part) => BOOK_SETUP.roll[part])).toBe(true);
		expect(setupBarriers(BOOK_SETUP)).toBe(24);
	});
});

describe("normaliseRealmSetup", () => {
	it("gives the book's setup when there's none", () => {
		expect(normaliseRealmSetup()).toEqual({ ...BOOK_SETUP, roll: { ...BOOK_SETUP.roll }, landmarks: { ...BOOK_SETUP.landmarks } });
		expect(isBookSetup(null)).toBe(true);
	});

	it("keeps the book's numbers unless the rules are ignored", () => {
		const setup = normaliseRealmSetup({ cols: 20, holdings: 9, myths: 2, barriers: 3 });
		expect(setup).toMatchObject({ ignoreRules: false, cols: 12, holdings: 4, myths: 6, barriers: null });
		expect(isBookSetup(setup)).toBe(true);
		expect(setup).not.toHaveProperty("ownSize");
	});

	it("takes the GM's own size alone for a map with no hexes on it, without ignoring the rules", () => {
		const setup = normaliseRealmSetup({ ownSize: true, cols: 17, rows: "8", holdings: 9, myths: 2 });
		expect(setup).toMatchObject({ ignoreRules: false, ownSize: true, cols: 17, rows: 8, holdings: 4, myths: 6, barriers: null });
		// Made twice over, as a new Realm's setup is, it's still the same size.
		expect(normaliseRealmSetup(setup)).toEqual(setup);
		expect(normaliseRealmSetup({ ownSize: true, cols: 99, rows: 1 })).toMatchObject({ cols: 60, rows: 3 });
	});

	it("lets a map with no hexes on it run further than the rules ignored, but to no more hexes in all", () => {
		expect(OWN_SIZE_LIMITS.cols.max).toBeGreaterThan(SETUP_LIMITS.cols.max);
		expect(OWN_SIZE_LIMITS.hexes).toBe(SETUP_LIMITS.cols.max * SETUP_LIMITS.rows.max);
		expect(normaliseRealmSetup({ ownSize: true, cols: 60, rows: 3 })).toMatchObject({ cols: 60, rows: 3 });
		expect(normaliseRealmSetup({ ownSize: true, cols: 3, rows: 60 })).toMatchObject({ cols: 3, rows: 60 });
		// The side named first keeps what it may have, and the other is held to the hexes left.
		expect(normaliseRealmSetup({ ownSize: true, cols: 60, rows: 60 })).toMatchObject({ cols: 60, rows: 15 });
		expect(withinOwnSize(60, 60, "rows")).toEqual({ cols: 15, rows: 60 });
		expect(ownSideLimits("rows", 45)).toEqual({ min: 3, max: 20 });
		// With the rules ignored, a side still goes no further than before.
		expect(normaliseRealmSetup({ ignoreRules: true, cols: 60, rows: 3 })).toMatchObject({ cols: 30, rows: 3 });
	});

	it("leaves parts to draw by hand whether or not the rules are ignored", () => {
		const setup = normaliseRealmSetup({ roll: { terrain: false, myths: false } });
		expect(setup.roll).toEqual({ terrain: false, rivers: true, holdings: true, myths: false, landmarks: true, barriers: true });
		expect(isBookSetup(setup)).toBe(false);
	});

	it("takes the GM's own numbers when the rules are ignored", () => {
		const setup = normaliseRealmSetup({ ignoreRules: true, cols: 20, rows: "8", cluster: 6, lakes: 0, holdings: 7, myths: 3, landmarks: { min: 1, max: 2 }, barriers: 10 });
		expect(setup).toMatchObject({ ignoreRules: true, cols: 20, rows: 8, cluster: 6, lakes: 0, holdings: 7, myths: 3, landmarks: { min: 1, max: 2 }, barriers: 10 });
		expect(isBookSetup(setup)).toBe(false);
	});

	it("keeps the numbers within what a Scene and the Myth pictures can hold", () => {
		const setup = normaliseRealmSetup({ ignoreRules: true, cols: 500, rows: 0, holdings: -2, myths: 12, landmarks: { min: 5, max: 2 }, barriers: 1e6 });
		expect(setup).toMatchObject({
			cols: SETUP_LIMITS.cols.max,
			rows: SETUP_LIMITS.rows.min,
			holdings: 0,
			myths: MYTH_COUNT,
			landmarks: { min: 2, max: 5 },
			barriers: SETUP_LIMITS.barriers.max
		});
	});

	it("falls back to the book's number where one is missing, and to one sixth of the hexes for Barriers", () => {
		const setup = normaliseRealmSetup({ ignoreRules: true, cols: 18, rows: 6, holdings: "", myths: null, barriers: "" });
		expect(setup).toMatchObject({ holdings: 4, myths: 6, barriers: null });
		expect(setupBarriers(setup)).toBe(18);
	});

	it("keeps a count of their own only for the types given one, within the limits", () => {
		const setup = normaliseRealmSetup({ ignoreRules: true, landmarks: { min: 1, max: 1, types: { hazard: "2", curse: 500, ruin: "", dwelling: "lots", palace: 3 } } });
		expect(setup.landmarks.types).toEqual({ hazard: 2, curse: SETUP_LIMITS.landmarks.max });
		expect(isBookSetup({ ignoreRules: true, landmarks: { types: { hazard: 4 } } })).toBe(false);
		expect(normaliseRealmSetup({ landmarks: { types: { hazard: 9 } } }).landmarks.types).toEqual({});
	});

	it("counts ignoring the rules with the book's numbers as the book's setup", () => {
		expect(isBookSetup({ ignoreRules: true })).toBe(true);
		expect(isBookSetup({ ignoreRules: true, barriers: 24 })).toBe(true);
		expect(isBookSetup({ ignoreRules: true, barriers: 25 })).toBe(false);
	});
});
