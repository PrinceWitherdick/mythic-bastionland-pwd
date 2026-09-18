import { describe, expect, it } from "vitest";
import { COMPANY_STARTS, companyStart, edgeHexes, middleHex } from "../../module/rules/company.js";
import { createRandom } from "../../module/rules/random.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";

const g = realmGeometry();
const random = () => createRandom("test12");

const realm = (holdings) => ({ holdings });
const at = (col, row, seat = false) => ({ hex: { col, row }, seat });

describe("COMPANY_STARTS", () => {
	it("is the book's three Starts, in its order", () => {
		expect(COMPANY_STARTS).toEqual(["wanderer", "courtier", "ruler"]);
	});
});

describe("edgeHexes", () => {
	it("is the rim of the map and nothing inside it", () => {
		const rim = edgeHexes(g);
		expect(rim).toHaveLength(2 * g.cols + 2 * g.rows - 4);
		expect(rim.every(({ col, row }) => col === 1 || col === g.cols || row === 1 || row === g.rows)).toBe(true);
		expect(rim.some(({ col, row }) => col === 6 && row === 6)).toBe(false);
	});
});

describe("companyStart", () => {
	const full = realm([at(3, 4, true), at(8, 2), at(5, 9), at(11, 6)]);

	it("brings a Wanderer in over the edge", () => {
		const { hex, place } = companyStart(full, g, "wanderer", random());
		expect(place).toBe("edge");
		expect(edgeHexes(g)).toContainEqual(hex);
	});

	it("seats a Courtier at the Seat of Power", () => {
		expect(companyStart(full, g, "courtier", random())).toEqual({ hex: { col: 3, row: 4 }, place: "seat" });
	});

	it("gives a Ruler a Holding of their own, never the Seat under a wicked influence", () => {
		const { hex, place } = companyStart(full, g, "ruler", random());
		expect(place).toBe("holding");
		expect(hex).not.toEqual({ col: 3, row: 4 });
		expect([{ col: 8, row: 2 }, { col: 5, row: 9 }, { col: 11, row: 6 }]).toContainEqual(hex);
	});

	it("gives the same Realm the same start every time", () => {
		const once = companyStart(full, g, "wanderer", random());
		expect(companyStart(full, g, "wanderer", random())).toEqual(once);
	});

	it("falls back to the Seat for a Ruler when every Holding is the Seat", () => {
		expect(companyStart(realm([at(3, 4, true)]), g, "ruler", random())).toEqual({ hex: { col: 3, row: 4 }, place: "seat" });
	});

	it("falls back to any Holding when the Seat has gone", () => {
		expect(companyStart(realm([at(8, 2)]), g, "courtier", random())).toEqual({ hex: { col: 8, row: 2 }, place: "holding" });
	});

	it("falls back to the middle of a Realm with nothing to stand on", () => {
		for (const start of COMPANY_STARTS) {
			const { hex, place } = companyStart(realm([]), g, start, random());
			if (start === "wanderer") continue;
			expect(place).toBe("middle");
			expect(hex).toEqual(middleHex(g));
		}
	});

	it("reads a Realm that isn't there as having nothing to stand on", () => {
		expect(companyStart(null, g, "courtier", random())).toEqual({ hex: middleHex(g), place: "middle" });
	});
});
