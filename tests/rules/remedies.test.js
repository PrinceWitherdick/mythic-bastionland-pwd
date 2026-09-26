import { describe, expect, it } from "vitest";
import { bearsRemedies, overRemedyLimit, remedyCount, remedyLoad } from "../../module/rules/remedies.js";

const gear = (id, system = {}) => ({ id, type: "gear", system });
const broth = (id, quantity) => gear(id, { remedy: "vig", ...(quantity === undefined ? {} : { quantity }) });

describe("remedyCount", () => {
	it("counts a Remedy as one, or as many as its count, and anything else as none", () => {
		expect(remedyCount({ remedy: "" })).toBe(0);
		expect(remedyCount({ remedy: "cla" })).toBe(1);
		expect(remedyCount({ remedy: "cla", quantity: { value: null, max: null } })).toBe(1);
		expect(remedyCount({ remedy: "cla", quantity: { value: 0, max: 1 } })).toBe(0);
		expect(remedyCount({ remedy: "cla", quantity: { value: 2, max: 2 } })).toBe(2);
	});
});

describe("bearsRemedies", () => {
	it("limits Knights and single NPCs, not Warbands or structures", () => {
		expect(bearsRemedies({ type: "knight", system: {} })).toBe(true);
		expect(bearsRemedies({ type: "npc", system: { scale: "individual" } })).toBe(true);
		expect(bearsRemedies({ type: "npc", system: { scale: "warband" } })).toBe(false);
		expect(bearsRemedies({ type: "structure", system: {} })).toBe(false);
	});
});

describe("overRemedyLimit", () => {
	const rope = gear("rope");

	it("lets somebody with none take one", () => {
		expect(overRemedyLimit([rope], { id: null, system: { remedy: "spi" } })).toBe(false);
	});

	it("refuses a second, or a count of two", () => {
		expect(overRemedyLimit([rope, broth("broth")], { id: null, system: { remedy: "spi" } })).toBe(true);
		expect(overRemedyLimit([broth("broth", { value: 1, max: null })], { id: "broth", system: { remedy: "vig", quantity: { value: 2, max: null } } })).toBe(true);
	});

	it("refuses turning gear into a Remedy beside one already carried", () => {
		expect(overRemedyLimit([rope, broth("broth")], { id: "rope", system: { remedy: "cla" } })).toBe(true);
	});

	it("lets a used-up Remedy be restocked, and a Remedy be changed in place", () => {
		expect(overRemedyLimit([broth("broth", { value: 0, max: 1 })], { id: "broth", system: { remedy: "vig", quantity: { value: 1, max: 1 } } })).toBe(false);
		expect(overRemedyLimit([broth("broth")], { id: "broth", system: { remedy: "spi" } })).toBe(false);
	});

	it("lets a load already too heavy lighten", () => {
		const heavy = [broth("a"), broth("b")];
		expect(remedyLoad(heavy, { id: "a", system: { remedy: "" } })).toBe(1);
		expect(overRemedyLimit(heavy, { id: "a", system: { remedy: "cla" } })).toBe(false);
		expect(overRemedyLimit(heavy, { id: null, system: { remedy: "cla" } })).toBe(true);
	});
});
