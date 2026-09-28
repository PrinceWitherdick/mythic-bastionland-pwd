import { describe, expect, it } from "vitest";
import { COMPANY_STARTS, companyButtonPlacement, companyStart, realmStart } from "../../module/rules/company.js";

const realm = (holdings) => ({ holdings });
const at = (col, row, seat = false) => ({ hex: { col, row }, seat });

describe("COMPANY_STARTS", () => {
	it("is the book's three Starts, in its order", () => {
		expect(COMPANY_STARTS).toEqual(["wanderer", "courtier", "ruler"]);
	});
});

describe("realmStart", () => {
	it("gives the Start the only Realm remembers", () => {
		expect(realmStart([{ start: "courtier" }])).toBe("courtier");
	});

	it("asks the Realm in view first, then the active one, then the one made last", () => {
		const older = { start: "ruler" };
		const active = { start: "courtier", active: true };
		const viewed = { start: "wanderer", viewed: true };
		expect(realmStart([older, active, viewed])).toBe("wanderer");
		expect(realmStart([older, active, { start: "ruler" }])).toBe("courtier");
		expect(realmStart([{ start: "courtier" }, older])).toBe("ruler");
	});

	it("passes over a Realm in view that remembers no Start", () => {
		expect(realmStart([{ start: "courtier" }, { viewed: true }])).toBe("courtier");
	});

	it("gives null where no Realm remembers one, or only one that isn't a Start", () => {
		expect(realmStart([])).toBeNull();
		expect(realmStart([{}, { start: "pilgrim", viewed: true }])).toBeNull();
		expect(realmStart(null)).toBeNull();
	});
});

describe("companyStart", () => {
	const full = realm([at(8, 2), at(3, 4, true), at(5, 9)]);

	it("seats a Courtier at the Seat of Power", () => {
		expect(companyStart(full, "courtier")).toEqual({ col: 3, row: 4 });
	});

	it("leaves a Wanderer and a Ruler for the Referee to place, as the book names no hex for them", () => {
		expect(companyStart(full, "wanderer")).toBeNull();
		expect(companyStart(full, "ruler")).toBeNull();
	});

	it("leaves a Courtier for the Referee to place when the Realm has no Seat", () => {
		expect(companyStart(realm([at(8, 2)]), "courtier")).toBeNull();
		expect(companyStart(null, "courtier")).toBeNull();
	});
});

describe("companyButtonPlacement", () => {
	const map = { left: 200, right: 800, top: 300, bottom: 900 };
	const button = { width: 160, height: 32 };

	it("centres the button over the map, above its top edge", () => {
		expect(companyButtonPlacement(map, button)).toEqual({ left: 420, top: 300 - 12 - 32 });
	});

	it("drops below the scene navigation when the map is panned up under it", () => {
		expect(companyButtonPlacement({ ...map, top: 20 }, { ...button, ceiling: 60 })).toEqual({ left: 420, top: 72 });
	});

	it("never leaves the button adrift below the map, whatever stands at the top of the screen", () => {
		// A tall thing at the top of the screen would otherwise push it past the foot of a small map.
		const small = { left: 200, right: 800, top: 100, bottom: 240 };
		expect(companyButtonPlacement(small, { ...button, ceiling: 540 }).top).toBe(240 - 12 - 32);
		// And a map wholly under it keeps the button over its top edge rather than anywhere else.
		expect(companyButtonPlacement({ ...small, top: 700, bottom: 900 }, { ...button, ceiling: 540 }).top).toBe(700 - 12 - 32);
	});

	it("grows the gap and the button with the interface scale", () => {
		const { left, top } = companyButtonPlacement(map, { ...button, scale: 1.5 });
		expect(left).toBe(Math.round(500 - (160 * 1.5 / 2)));
		expect(top).toBe(300 - (12 * 1.5) - (32 * 1.5));
	});
});
