import { beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

/** The art index, the Realm, the hex lore kept on the Scene, and the d12s the next Spark rolls land on. */
let index;
let realm;
let lore;
let dice;
let settings;

vi.mock("../../module/chat/cards.js", () => ({
	postCard: vi.fn(async () => ({})),
	warn: vi.fn(),
	t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key)
}));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({ age: 1, year: 1, season: "spring", day: 1, phase: "morning" }) }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => index, sparkPageOf: (index, key) => index?.spark?.find((page) => page.key === key) ?? null }));
vi.mock("../../module/actions/realm.js", () => ({
	getRealm: () => ({ realm, problems: [] }),
	isRealmScene: (scene) => Boolean(scene?.realm),
	hexHiddenByHand: () => ({}),
	sceneGeometry: () => ({})
}));
vi.mock("../../module/actions/hex-shared.js", () => ({ recordToldHex: vi.fn() }));
vi.mock("../../module/actions/referee-rolls.js", () => ({
	rollSpark: vi.fn(async (table) => {
		const rolls = dice.shift();
		const results = table.columns.map((column, at) => ({ column, roll: rolls[at], entry: table.rows[rolls[at] - 1]?.[at] ?? null }));
		return { roll: { rolls }, results, prompt: results.map(({ entry }) => entry).join(" ") };
	})
}));

const { rollFirstArrival } = await import("../../module/actions/hex-lore.js");
const { postCard, warn } = await import("../../module/chat/cards.js");
const { rollSpark } = await import("../../module/actions/referee-rolls.js");

/** Twelve rows of a two-column table, each entry naming its table, column and row. Invented, so no book text lives here. */
const table = (name) => ({ name, columns: ["A", "B"], rows: Array.from({ length: 12 }, (_, row) => [`${name}A${row + 1}`, `${name}B${row + 1}`]) });

/** The Nature page with all nine of its tables read, each named for where it stands. */
const naturePage = (count = 9) => ({ key: "nature", name: "Nature", page: 22, tables: Array.from({ length: count }, (_, at) => table(`T${at}`)) });

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
	index = { spark: [naturePage()] };
	realm = { holdings: [], myths: [], landmarks: [] };
	lore = { version: 1, hexes: {} };
	dice = [[2, 5], [7, 9]];
	settings = new Map([["hexLoreFirstArrival", true]]);
	scene.update.mockClear();
	vi.mocked(postCard).mockClear();
	vi.mocked(rollSpark).mockClear();
	globalThis.game = {
		user: { isGM: true },
		users: { activeGM: { isSelf: true } },
		settings: { get: (scope, key) => (scope === SYSTEM_ID ? settings.get(key) ?? null : null) }
	};
	globalThis.foundry = { utils: { randomID: () => Math.random().toString(36).slice(2) } };
});

describe("rolling a hex the Company first rests in", () => {
	it("rolls its land and one feature, keeps them in the hex, and whispers them to the GM", async () => {
		const made = await rollFirstArrival({ scene, hex: here });
		expect(made.map(({ prompt }) => prompt)).toEqual(["T0A2 T0B5", "T6A7 T6B9"]);
		expect(lore.hexes["4,3"].sparks.map(({ table }) => table)).toEqual(["T0", "T6"]);
		expect(postCard).toHaveBeenCalledWith(null, "hex-sparks", expect.anything(), expect.objectContaining({ mode: "gm" }));
	});

	it("rolls nothing on coming back, once the hex holds what was found there", async () => {
		await rollFirstArrival({ scene, hex: here });
		await rollFirstArrival({ scene, hex: here });
		expect(rollSpark).toHaveBeenCalledTimes(2);
	});

	it("leaves a hex the GM has already written in", async () => {
		lore.hexes["4,3"] = { note: "A ford", sparks: [] };
		expect(await rollFirstArrival({ scene, hex: here })).toEqual([]);
		expect(scene.update).not.toHaveBeenCalled();
	});

	it("leaves a Holding, which isn't Wilderness", async () => {
		realm.holdings = [{ hex: { ...here }, name: "Keep" }];
		expect(await rollFirstArrival({ scene, hex: here })).toEqual([]);
		expect(rollSpark).not.toHaveBeenCalled();
	});

	it("is the active GM's to roll, and only while the world asks for it", async () => {
		game.users.activeGM = { isSelf: false };
		expect(await rollFirstArrival({ scene, hex: here })).toEqual([]);
		game.users.activeGM = { isSelf: true };
		settings.set("hexLoreFirstArrival", false);
		expect(await rollFirstArrival({ scene, hex: here })).toEqual([]);
		game.user.isGM = false;
		settings.set("hexLoreFirstArrival", true);
		expect(await rollFirstArrival({ scene, hex: here })).toEqual([]);
		expect(rollSpark).not.toHaveBeenCalled();
	});

	it("says once, not at every hex, that the Nature page wasn't read whole", async () => {
		index = { spark: [naturePage(8)] };
		await rollFirstArrival({ scene, hex: here });
		await rollFirstArrival({ scene, hex: { col: 5, row: 3 } });
		expect(warn).toHaveBeenCalledOnce();
		expect(warn).toHaveBeenCalledWith("hexLore.setMissing");
		expect(rollSpark).not.toHaveBeenCalled();
	});
});
