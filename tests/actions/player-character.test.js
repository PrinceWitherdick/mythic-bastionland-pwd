import { beforeEach, describe, expect, it } from "vitest";
import { playerCharacter } from "../../module/actions/knights.js";

/** Whether the world is set to solo play. */
let solo;

beforeEach(() => {
	solo = false;
	globalThis.game = { settings: { get: (_scope, key) => (key === "soloPlay" ? solo : undefined) } };
});

describe("playerCharacter", () => {
	const knight = (system = {}, hasPlayerOwner = false) => ({ type: "knight", hasPlayerOwner, system });

	it("counts a Knight a player owns, and any Squire", () => {
		expect(playerCharacter(knight({}, true))).toBe(true);
		expect(playerCharacter(knight({ isSquire: true }))).toBe(true);
	});

	it("leaves the Referee's own Knights to waver as NPCs do (p10)", () => {
		expect(playerCharacter(knight())).toBe(false);
		expect(playerCharacter({ type: "npc", hasPlayerOwner: true, system: {} })).toBe(false);
	});

	it("counts every Knight in solo play, where the Referee plays the Company", () => {
		solo = true;
		expect(playerCharacter(knight())).toBe(true);
	});
});
