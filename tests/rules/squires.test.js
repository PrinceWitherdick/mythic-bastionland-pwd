import { describe, expect, it } from "vitest";
import {
	SQUIRE_EQUIPMENT,
	knightedVirtues,
	mayTakeSquires,
	ponySystem,
	squireEquipment,
	squireItems,
	squireSystem
} from "../../module/rules/squires.js";

const names = { dagger: "Dagger", cudgel: "Cudgel", axe: "Axe", hatchet: "Hatchet", shortbow: "Shortbow", shield: "Shield", javelins: "Three javelins" };

describe("mayTakeSquires", () => {
	it("allows Squires for a Company of 2 Knights or fewer", () => {
		expect(mayTakeSquires(1)).toBe(true);
		expect(mayTakeSquires(2)).toBe(true);
		expect(mayTakeSquires(3)).toBe(false);
	});
});

describe("squireEquipment", () => {
	it("has one entry for each face of the d6", () => {
		expect(SQUIRE_EQUIPMENT).toHaveLength(6);
		expect(squireEquipment(4)).toMatchObject({ key: "shortbow", system: { damage: "d6", long: true, ranged: true } });
		expect(squireEquipment(7)).toBeNull();
	});
});

describe("squireItems", () => {
	it("gives every Squire a dagger and what they rolled, worn or wielded", () => {
		expect(squireItems(1, names)).toEqual([
			{ type: "weapon", name: "Dagger", system: { damage: "d6", equipped: true } },
			{ type: "weapon", name: "Cudgel", system: { damage: "d8", hefty: true, equipped: true } }
		]);
		expect(squireItems(5, names)[1]).toEqual({ type: "armour", name: "Shield", system: { kind: "shield", armour: 1, damage: "d4", equipped: true } });
	});
});

describe("squireSystem", () => {
	it("sets the rolled Virtues, 1GD, and no Glory", () => {
		expect(squireSystem({ vig: 7, cla: 12, spi: 2 })).toEqual({
			isSquire: true,
			virtues: { vig: { value: 7, max: 7 }, cla: { value: 12, max: 12 }, spi: { value: 2, max: 2 } },
			guard: { value: 1, max: 1 },
			glory: 0
		});
	});
});

describe("ponySystem", () => {
	it("is the pony the book gives Squires", () => {
		expect(ponySystem()).toEqual({
			virtues: { vig: { value: 7, max: 7 }, cla: { value: 7, max: 7 }, spi: { value: 2, max: 2 } },
			guard: { value: 2, max: 2 }
		});
	});
});

describe("knightedVirtues", () => {
	it("raises each Virtue by its d6, current and maximum, up to 19", () => {
		const virtues = { vig: { value: 4, max: 8 }, cla: { value: 12, max: 12 }, spi: { value: 16, max: 17 } };
		expect(knightedVirtues(virtues, { vig: 3, cla: 6, spi: 5 })).toEqual({
			vig: { value: 7, max: 11 },
			cla: { value: 18, max: 18 },
			spi: { value: 19, max: 19 }
		});
	});
});
