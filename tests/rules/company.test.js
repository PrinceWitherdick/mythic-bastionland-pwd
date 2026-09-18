import { describe, expect, it } from "vitest";
import { COMPANY_STARTS, companyStart } from "../../module/rules/company.js";

const realm = (holdings) => ({ holdings });
const at = (col, row, seat = false) => ({ hex: { col, row }, seat });

describe("COMPANY_STARTS", () => {
	it("is the book's three Starts, in its order", () => {
		expect(COMPANY_STARTS).toEqual(["wanderer", "courtier", "ruler"]);
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
