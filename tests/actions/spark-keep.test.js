import { beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

/** The hex lore kept on the Scene. */
let lore;

vi.mock("../../module/chat/cards.js", () => ({
	postCard: vi.fn(async () => ({})),
	warn: vi.fn(),
	t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key)
}));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({ age: 1, year: 1, season: "spring", day: 1, phase: "morning" }) }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => null, sparkPageOf: () => null }));
vi.mock("../../module/actions/realm.js", () => ({
	getRealm: () => null,
	isRealmScene: (scene) => Boolean(scene?.realm),
	hexHiddenByHand: () => ({}),
	sceneGeometry: () => ({})
}));
vi.mock("../../module/actions/hex-shared.js", () => ({ recordToldHex: vi.fn() }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollSpark: vi.fn() }));

const { keepTableRoll } = await import("../../module/actions/hex-lore.js");
const { postCard } = await import("../../module/chat/cards.js");

// Invented, so no book text lives in the repository.
const page = { key: "civilisation", name: "Civilisation", page: 23 };
const table = { name: "Wares", columns: ["A", "B"] };
const here = { col: 4, row: 3 };

/** A Realm Scene that keeps its hex lore the way the flag's update paths write it. */
const scene = {
	id: "realm1",
	realm: true,
	getFlag: (scope, key) => (scope === SYSTEM_ID && key === "hexLore" ? lore : null),
	update: vi.fn(async (changes) => {
		for (const [path, value] of Object.entries(changes)) {
			const key = path.split(`flags.${SYSTEM_ID}.hexLore.hexes.`)[1];
			if (key) lore.hexes[key] = value;
		}
	})
};

beforeEach(() => {
	lore = { version: 1, hexes: {} };
	scene.update.mockClear();
	vi.mocked(postCard).mockClear();
	globalThis.game = { user: { isGM: true } };
	globalThis.foundry = { utils: { randomID: () => "r1" }, data: { operators: { ForcedReplacement: { create: (value) => value } } } };
});

describe("keeping a roll from the Spark Tables window in a hex", () => {
	it("keeps it beside what's already there, in one write and with no card", async () => {
		lore.hexes["4,3"] = { note: "A ford", sparks: [] };
		const results = [{ column: "A", roll: 2, entry: "Salt" }, { column: "B", roll: 11, entry: "Rope" }];
		expect(await keepTableRoll({ scene, hex: here, page, table, results })).toBe(true);
		expect(scene.update).toHaveBeenCalledOnce();
		expect(lore.hexes["4,3"]).toMatchObject({
			note: "A ford",
			sparks: [{ id: "r1", page: "civilisation", table: "Wares", rolls: [2, 11], prompt: "Salt Rope", when: { season: "spring" } }]
		});
		expect(postCard).not.toHaveBeenCalled();
	});

	it("keeps nothing from a roll that gave nothing", async () => {
		expect(await keepTableRoll({ scene, hex: here, page, table, results: [{ column: "A", roll: 2, entry: null }] })).toBe(false);
		expect(scene.update).not.toHaveBeenCalled();
	});

	it("is the GM's alone, and only on a Realm", async () => {
		const results = [{ column: "A", roll: 2, entry: "Salt" }];
		expect(await keepTableRoll({ scene: { id: "plain" }, hex: here, page, table, results })).toBe(false);
		game.user.isGM = false;
		expect(await keepTableRoll({ scene, hex: here, page, table, results })).toBe(false);
		expect(scene.update).not.toHaveBeenCalled();
	});
});
