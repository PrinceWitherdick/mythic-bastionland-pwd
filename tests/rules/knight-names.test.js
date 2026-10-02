import { describe, expect, it } from "vitest";
import { KNIGHT_NAMES, rollFreeName, rollKnightName, startingName } from "../../module/rules/knight-names.js";
import { createRandom } from "../../module/rules/random.js";

describe("KNIGHT_NAMES", () => {
	it("holds plenty of single given names, each once", () => {
		expect(KNIGHT_NAMES.length).toBeGreaterThanOrEqual(150);
		expect(new Set(KNIGHT_NAMES.map((name) => name.toLowerCase())).size).toBe(KNIGHT_NAMES.length);
		for (const name of KNIGHT_NAMES) expect(name).toMatch(/^[A-Z][a-z]+$/);
	});
});

describe("rollKnightName", () => {
	it("rolls every name in the list and nothing else", () => {
		const random = createRandom("names");
		const seen = new Set(Array.from({ length: 5000 }, () => rollKnightName(random.float)));
		expect([...seen].sort()).toEqual([...KNIGHT_NAMES].sort());
	});

	it("never rolls a name to avoid, whatever its case or spacing", () => {
		const avoid = KNIGHT_NAMES.slice(1).map((name, index) => (index % 2 ? ` ${name.toUpperCase()} ` : name));
		expect(rollKnightName(() => 0.99, avoid)).toBe(KNIGHT_NAMES[0]);
		expect(rollKnightName(() => 0, ["Adalbert"])).toBe(KNIGHT_NAMES[1]);
	});

	it("still rolls a name once every one is taken", () => {
		expect(KNIGHT_NAMES).toContain(rollKnightName(() => 0.5, KNIGHT_NAMES));
	});

	it("stays in the list at the very top of the source's range", () => {
		expect(rollKnightName(() => 1)).toBe(KNIGHT_NAMES.at(-1));
	});
});

describe("startingName", () => {
	it("keeps a name the Knight was given", () => {
		expect(startingName("  Hawise ", "Knight")).toBe("Hawise");
		expect(startingName("The Lantern Knight", "Knight")).toBe("The Lantern Knight");
		expect(startingName("Knightly Ivo", "Knight")).toBe("Knightly Ivo");
	});

	it("drops the stand-in Create Actor gives when no name is typed", () => {
		expect(startingName("Knight", "Knight")).toBe("");
		expect(startingName("Knight (2)", "Knight")).toBe("");
		expect(startingName("knight (12)", "Knight")).toBe("");
		expect(startingName(null, "Knight")).toBe("");
		expect(startingName(undefined, "Knight")).toBe("");
	});
});

describe("rollFreeName", () => {
	it("rolls from the list it's given, passing over the names to avoid", () => {
		expect(rollFreeName(["Odo", "Wenna"], () => 0, [" odo "])).toBe("Wenna");
		expect(rollFreeName(["Odo", "Wenna"], () => 0.99, ["Odo", "Wenna"])).toBe("Wenna");
	});

	it("gives null for an empty list", () => {
		expect(rollFreeName([], () => 0.5)).toBeNull();
	});
});
