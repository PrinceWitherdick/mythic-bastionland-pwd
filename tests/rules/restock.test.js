import { describe, expect, it } from "vitest";
import { countAfter, isAtHand, isCounted, isUsedUp, restockUpdates } from "../../module/rules/restock.js";

const stock = (value, max) => ({ quantity: { value, max } });

describe("counts", () => {
	it("knows what nobody counts, what's used up, and what's at hand", () => {
		expect(isCounted(stock(null, null))).toBe(false);
		expect(isUsedUp(stock(null, null))).toBe(false);
		expect(isUsedUp(stock(0, 3))).toBe(true);
		expect(isAtHand(stock(0, 3))).toBe(false);
		expect(isAtHand({ ...stock(2, 3), broken: true })).toBe(false);
		expect(isAtHand(stock(2, 3))).toBe(true);
	});

	it("moves a count between none and a full stock", () => {
		expect(countAfter({ value: 1, max: 3 }, -1)).toBe(0);
		expect(countAfter({ value: 0, max: 3 }, -1)).toBe(0);
		expect(countAfter({ value: 3, max: 3 }, 1)).toBe(3);
		expect(countAfter({ value: 3, max: null }, 1)).toBe(4);
	});
});

describe("restockUpdates", () => {
	const items = [
		{ id: "beads", system: { restock: "season", ...stock(1, 3) } },
		{ id: "salve", system: { restock: "day", ...stock(0, 1) } },
		{ id: "flask", system: { restock: "season", broken: true, ...stock(1, 1) } },
		{ id: "javelins", system: { restock: "", ...stock(0, 3) } },
		{ id: "wax", system: { restock: "season", ...stock(1, 1) } }
	];

	it("fills a Season's stock back up and mends what was smashed", () => {
		expect(restockUpdates(items, ["season", "day"])).toEqual([
			{ _id: "beads", "system.quantity.value": 3 },
			{ _id: "salve", "system.quantity.value": 1 },
			{ _id: "flask", "system.broken": false }
		]);
	});

	it("leaves what a new day doesn't bring round", () => {
		expect(restockUpdates(items, ["day"])).toEqual([{ _id: "salve", "system.quantity.value": 1 }]);
		expect(restockUpdates(items, [])).toEqual([]);
	});
});
