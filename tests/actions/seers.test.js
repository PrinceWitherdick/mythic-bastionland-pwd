import { beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

/** The art index Import PDF wrote. */
let index;

vi.mock("../../module/book-art/art-index.js", () => ({
	loadArtIndex: async () => index,
	findByRoll: (list, roll) => list?.find((entry) => entry.roll === roll) ?? null
}));
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key, warn: vi.fn() }));
vi.mock("../../module/actions/npc-knights.js", () => ({ npcFolder: async () => ({ id: "npcs" }) }));

const { SEER_FLAG, makeSeer, seerFor } = await import("../../module/actions/seers.js");
const { warn } = await import("../../module/chat/cards.js");

const stats = { vig: 10, cla: 15, spi: 12, guard: 3, armour: 0, attacks: [] };
const created = [];

beforeEach(() => {
	created.length = 0;
	vi.mocked(warn).mockClear();
	index = {
		seers: [{ roll: "3-07", d6: 3, d12: 7, name: "The Weaver", page: 80, stats, lines: [] }, { roll: "1-01", d6: 1, d12: 1, name: "The Absent", page: 28 }],
		knights: [{ roll: "3-07", name: "The Loom Knight" }]
	};
	const render = vi.fn();
	globalThis.game = { user: { isGM: true }, actors: [] };
	globalThis.Actor = {
		implementation: {
			create: vi.fn(async (data) => {
				const actor = { ...data, sheet: { render }, getFlag: (_scope, key) => data.flags[SYSTEM_ID]?.[key] };
				created.push(actor);
				game.actors.push(actor);
				return actor;
			})
		}
	};
});

describe("seerFor", () => {
	it("finds a Seer by roll, or as a Knight's sheet names them", () => {
		expect(seerFor(index, { roll: "3-07" }).name).toBe("The Weaver");
		expect(seerFor(index, { knight: { seer: "weaver" } }).roll).toBe("3-07");
		expect(seerFor(index, { knight: { seer: "", knightType: "The Loom Knight" } }).roll).toBe("3-07");
		expect(seerFor(index, { knight: { seer: "Nobody" } })).toBeNull();
	});
});

describe("makeSeer", () => {
	it("makes the Seer once, filed with the NPCs and marked by their roll", async () => {
		const seer = await makeSeer({ roll: "3-07" });
		expect(seer).toMatchObject({ name: "The Weaver", folder: "npcs" });
		expect(seer.getFlag(SYSTEM_ID, SEER_FLAG)).toBe("3-07");
		expect(seer).not.toHaveProperty("sort");
		expect(await makeSeer({ knight: { seer: "The Weaver" } })).toBe(seer);
		expect(created).toHaveLength(1);
	});

	it("says so of a Seer the book gives no stat block, and lets players make none", async () => {
		expect(await makeSeer({ roll: "1-01" })).toBeNull();
		expect(warn).toHaveBeenCalledWith("seer.noStatBlock");
		game.user.isGM = false;
		expect(await makeSeer({ roll: "3-07" })).toBeNull();
		expect(created).toHaveLength(0);
	});
});
