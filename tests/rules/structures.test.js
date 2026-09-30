import { describe, expect, it } from "vitest";
import { STRUCTURE_KINDS, carriesFrom, collisionFaces, harmsStructure, isStructureNpc, structureFromNpc, structureHarm, structureKind } from "../../module/rules/structures.js";

const virtues = (value = 10, max = value) => ({ vig: { value, max }, cla: { value, max }, spi: { value, max } });

describe("structureKind", () => {
	it("knows siege engines, ships by what they carry or their name, and structures otherwise", () => {
		expect(structureKind({ name: "Belfry", siege: true })).toBe("siege");
		expect(structureKind({ name: "Punt", carries: "3 passengers" })).toBe("ship");
		expect(structureKind({ name: "Longship" })).toBe("ship");
		expect(structureKind({ name: "Rowboat" })).toBe("ship");
		expect(structureKind({ name: "River Barge" })).toBe("ship");
		expect(structureKind({ name: "Rampart" })).toBe("structure");
		expect(structureKind()).toBe("structure");
		expect(STRUCTURE_KINDS).toContain(structureKind({ name: "Anything" }));
	});
});

describe("carriesFrom", () => {
	it("splits what a ship carries from the rest of its note", () => {
		expect(carriesFrom("carries 4 passengers")).toEqual({ carries: "4 passengers", rest: "" });
		expect(carriesFrom("carries a Warband, slow to turn")).toEqual({ carries: "a Warband", rest: "slow to turn" });
		expect(carriesFrom("slow to turn")).toEqual({ carries: "", rest: "slow to turn" });
		expect(carriesFrom(undefined)).toEqual({ carries: "", rest: "" });
	});
});

describe("collisionFaces", () => {
	it("is a d12, or a d6 for the much larger ship (p11)", () => {
		expect(collisionFaces(false)).toBe(12);
		expect(collisionFaces(true)).toBe(6);
	});
});

describe("isStructureNpc", () => {
	const structure = { type: "npc", system: { structure: true, scale: "individual", virtues: virtues() } };

	it("takes a structure NPC whose Virtues were never set", () => {
		expect(isStructureNpc(structure)).toBe(true);
	});

	it("leaves creatures that count as structures, Warbands, unmarked NPCs and other actors", () => {
		expect(isStructureNpc({ ...structure, system: { ...structure.system, virtues: { ...virtues(), vig: { value: 18, max: 18 } } } })).toBe(false);
		expect(isStructureNpc({ ...structure, system: { ...structure.system, virtues: virtues(10, 12) } })).toBe(false);
		expect(isStructureNpc({ ...structure, system: { ...structure.system, scale: "warband" } })).toBe(false);
		expect(isStructureNpc({ ...structure, system: { ...structure.system, structure: false } })).toBe(false);
		expect(isStructureNpc({ ...structure, type: "structure" })).toBe(false);
		expect(isStructureNpc({ type: "knight", system: {} })).toBe(false);
	});
});

describe("structureFromNpc", () => {
	it("keeps GD, Armour, epithet and notes, and moves what a ship carries into its own field", () => {
		expect(structureFromNpc("Punt", {
			epithet: "Of the Marsh",
			guard: { value: 2, max: 3 },
			armour: 1,
			armourNote: "tarred planks",
			notes: "<p>Carries 3 passengers</p><p>Leaks.</p>",
			virtues: virtues(),
			feats: { smite: false }
		})).toEqual({
			kind: "ship",
			epithet: "Of the Marsh",
			guard: { value: 2, max: 3 },
			armour: 1,
			armourNote: "tarred planks",
			carries: "3 passengers",
			notes: "<p>Leaks.</p>"
		});
	});

	it("fills in what an NPC left out", () => {
		expect(structureFromNpc("Rampart", {})).toEqual({
			kind: "structure",
			epithet: "",
			guard: { value: 0, max: 0 },
			armour: 0,
			armourNote: "",
			carries: "",
			notes: ""
		});
	});
});

describe("structureHarm", () => {
	it("reads siege engines and fire from what the Attack is made with", () => {
		expect(structureHarm({ texts: ["Trebuchet 3d12 blast, immobile"] })).toEqual({ siege: true, fire: false, large: false });
		expect(structureHarm({ texts: ["3 oil pots (d6 blast, leave the ground burning)"] })).toEqual({ siege: false, fire: true, large: false });
		expect(structureHarm({ texts: ["Mace"] })).toEqual({ siege: false, fire: false, large: false });
		expect(structureHarm({ fromSiege: true, large: true })).toEqual({ siege: true, fire: false, large: true });
	});
	it("doesn't take a rampart for a ram", () => {
		expect(structureHarm({ texts: ["Rampart stone"] }).siege).toBe(false);
	});
});

describe("harmsStructure", () => {
	it("lets fire, siege weapons and large creatures harm wood", () => {
		expect(harmsStructure({ fire: true })).toBe(true);
		expect(harmsStructure({ large: true })).toBe(true);
		expect(harmsStructure({ siege: true })).toBe(true);
		expect(harmsStructure({})).toBe(false);
		expect(harmsStructure(null)).toBe(false);
	});
	it("lets only siege weapons breach stone", () => {
		expect(harmsStructure({ siege: true }, true)).toBe(true);
		expect(harmsStructure({ fire: true, large: true }, true)).toBe(false);
	});
});
