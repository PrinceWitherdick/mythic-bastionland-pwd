import { describe, expect, it } from "vitest";
import { changesKept, keptWith, wantsOwnFolder } from "../../module/rules/knight-folders.js";

describe("wantsOwnFolder", () => {
	it("gives a Knight made at the top of the directory a folder", () => {
		expect(wantsOwnFolder({ type: "knight", folder: null, system: {} })).toBe(true);
		expect(wantsOwnFolder({ type: "knight" })).toBe(true);
	});

	it("leaves Squires, other actors and Knights made in a chosen folder alone", () => {
		expect(wantsOwnFolder({ type: "knight", system: { isSquire: true } })).toBe(false);
		expect(wantsOwnFolder({ type: "npc" })).toBe(false);
		expect(wantsOwnFolder({ type: "knight", folder: "abc" })).toBe(false);
	});
});

describe("keptWith", () => {
	it("keeps a Knight's steed and Squire", () => {
		expect(keptWith({ steed: "Actor.a", squire: "Actor.b" })).toEqual(["Actor.a", "Actor.b"]);
	});

	it("keeps only a Squire's steed, and skips what's missing", () => {
		expect(keptWith({ steed: "Actor.p", squire: "Actor.k", isSquire: true })).toEqual(["Actor.p"]);
		expect(keptWith({ steed: "", squire: "" })).toEqual([]);
	});
});

describe("changesKept", () => {
	it("notices a new steed or Squire, not a cleared one or other changes", () => {
		expect(changesKept({ system: { steed: "Actor.a" } })).toBe(true);
		expect(changesKept({ system: { squire: "Actor.b" } })).toBe(true);
		expect(changesKept({ system: { steed: "" } })).toBe(false);
		expect(changesKept({ name: "Bardolf" })).toBe(false);
	});
});
