import { beforeEach, describe, expect, it } from "vitest";
import { COMPANY_KNIGHT_FLAG, inCompany, playerCharacter } from "../../module/actions/knights.js";

/** Whether the world is set to solo play. */
let solo;

beforeEach(() => {
	solo = false;
	globalThis.game = { settings: { get: (_scope, key) => (key === "soloPlay" ? solo : undefined) } };
});

/** A Knight, with the flags a solo Referee may have set on them. */
const knight = (system = {}, hasPlayerOwner = false, flags = {}) => ({
	type: "knight",
	hasPlayerOwner,
	system,
	getFlag: (_scope, key) => flags[key]
});

describe("inCompany", () => {
	it("counts a Knight a player owns, and none of the Referee's, with others at the table", () => {
		expect(inCompany(knight({}, true))).toBe(true);
		expect(inCompany(knight())).toBe(false);
		expect(inCompany({ type: "npc", hasPlayerOwner: true, system: {} })).toBe(false);
		expect(inCompany(null)).toBe(false);
	});

	it("counts the Referee's Knights in solo play, unless marked as one of their own", () => {
		solo = true;
		expect(inCompany(knight())).toBe(true);
		expect(inCompany(knight({}, false, { [COMPANY_KNIGHT_FLAG]: true }))).toBe(true);
		expect(inCompany(knight({}, false, { [COMPANY_KNIGHT_FLAG]: false }))).toBe(false);
		// A Knight a player holds rides with the Company whatever the mark says.
		expect(inCompany(knight({}, true, { [COMPANY_KNIGHT_FLAG]: false }))).toBe(true);
	});
});

describe("playerCharacter", () => {

	it("counts a Knight a player owns, and any Squire", () => {
		expect(playerCharacter(knight({}, true))).toBe(true);
		expect(playerCharacter(knight({ isSquire: true }))).toBe(true);
	});

	it("leaves the Referee's own Knights to waver as NPCs do (p10)", () => {
		expect(playerCharacter(knight())).toBe(false);
		expect(playerCharacter({ type: "npc", hasPlayerOwner: true, system: {} })).toBe(false);
	});

	it("counts a Knight riding with the Company in solo play, where the Referee plays it", () => {
		solo = true;
		expect(playerCharacter(knight())).toBe(true);
	});

	it("leaves a Holding's ruler the solo Referee marked as theirs to waver as NPCs do", () => {
		solo = true;
		expect(playerCharacter(knight({}, false, { [COMPANY_KNIGHT_FLAG]: false }))).toBe(false);
		expect(playerCharacter(knight({ isSquire: true }, false, { [COMPANY_KNIGHT_FLAG]: false }))).toBe(true);
	});
});
