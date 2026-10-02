import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyJourney, recordVisits } from "../../module/rules/journey.js";
import { emptyRealm } from "../../module/rules/realm.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const g = realmGeometry({ cols: 12, rows: 12 });
const hex = (col, row) => ({ col, row });
const visited = hex(3, 4);
const when = { age: 1, season: "spring", day: 2, phase: "morning" };

let journey;

vi.mock("../../module/chat/cards.js", () => ({
	t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key),
	warn: vi.fn()
}));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => when, calendarLabel: () => "spring day 2" }));
vi.mock("../../module/actions/journey.js", () => ({ getJourney: () => journey }));
vi.mock("../../module/actions/sighted.js", () => ({ getSighted: () => ({}) }));
vi.mock("../../module/actions/realm.js", () => ({
	isRealmScene: (scene) => Boolean(scene?.isRealm),
	sceneGeometry: () => g,
	getRealm: (scene) => (scene?.isRealm ? { realm: emptyRealm(g) } : null),
	hexHiddenByHand: () => ({})
}));

const { warn } = await import("../../module/chat/cards.js");
const {
	forgetHexPartyNote,
	forgetHexShared,
	getHexShared,
	onPartyNoteQuery,
	recordToldHex,
	registerHexSharedQuery,
	writePartyNote
} = await import("../../module/actions/hex-shared.js");

/** A Realm Scene whose flag writes land on it, the way v13's `==` and `-=` keys do. */
function fakeScene() {
	const scene = {
		id: "realm",
		isRealm: true,
		flags: { [SYSTEM_ID]: { hexShared: { version: 1, hexes: {} } } },
		getFlag: (scope, key) => scene.flags[scope]?.[key],
		update: vi.fn(async (changes) => {
			const store = scene.flags[SYSTEM_ID].hexShared;
			for (const [path, value] of Object.entries(changes)) {
				const key = path.split(".").at(-1);
				if (key === "version") store.version = value;
				else if (key.startsWith("-=")) delete store.hexes[key.slice(2)];
				else if (key.startsWith("==")) store.hexes[key.slice(2)] = structuredClone(value);
				else throw new Error(`Unexpected path ${path}`);
			}
		})
	};
	return scene;
}

let scene;

beforeEach(() => {
	scene = fakeScene();
	journey = recordVisits(emptyJourney(), [visited], when);
	globalThis.foundry = { utils: { randomID: () => "rand1" } };
	globalThis.CONFIG = { queries: {} };
	globalThis.game = {
		user: { id: "gm", name: "Referee", isGM: true },
		users: { activeGM: null },
		scenes: { get: (id) => (id === scene.id ? scene : null) }
	};
});

afterEach(() => {
	delete globalThis.foundry;
	delete globalThis.CONFIG;
	delete globalThis.game;
	vi.clearAllMocks();
});

describe("recordToldHex", () => {
	it("keeps what was told, with the calendar and the card", async () => {
		expect(await recordToldHex(scene, visited, { note: "A ford.", messageId: "m1" })).toBe(true);
		expect(getHexShared(scene).hexes["3,4"].told).toEqual([{ id: "rand1", note: "A ford.", when, at: expect.any(Number), messageId: "m1" }]);
	});

	it("is a GM's to write", async () => {
		game.user.isGM = false;
		expect(await recordToldHex(scene, visited, { note: "A ford." })).toBe(false);
		expect(scene.update).not.toHaveBeenCalled();
	});
});

describe("forgetting", () => {
	it("takes the hex's key out once nothing is left", async () => {
		await recordToldHex(scene, visited, { note: "A ford." });
		await writePartyNote(scene, visited, "Camp here");
		await forgetHexPartyNote(scene, visited);
		expect(getHexShared(scene).hexes["3,4"].party).toBeUndefined();
		await forgetHexShared(scene, visited);
		expect(scene.flags[SYSTEM_ID].hexShared.hexes).toEqual({});
	});
});

describe("writePartyNote", () => {
	it("is written at once by a GM, signed by them", async () => {
		expect(await writePartyNote(scene, visited, " Camp here ")).toBe(true);
		expect(getHexShared(scene).hexes["3,4"].party).toMatchObject({ text: "Camp here", by: "gm", byName: "Referee", when });
	});

	it("asks the active GM for a player", async () => {
		game.user = { id: "p1", name: "Ada", isGM: false };
		const query = vi.fn(async () => true);
		game.users.activeGM = { query };
		expect(await writePartyNote(scene, visited, "Camp here")).toBe(true);
		expect(query).toHaveBeenCalledWith(`${SYSTEM_ID}.writePartyNote`, { sceneId: "realm", hex: visited, text: "Camp here" }, { timeout: 10000 });
		expect(scene.update).not.toHaveBeenCalled();
	});

	it("warns and writes nothing with no GM to ask", async () => {
		game.user = { id: "p1", name: "Ada", isGM: false };
		expect(await writePartyNote(scene, visited, "Camp here")).toBe(false);
		expect(warn).toHaveBeenCalledWith("travels.party.needsGM");
	});

	it("warns when the GM refuses or can't be reached", async () => {
		game.user = { id: "p1", name: "Ada", isGM: false };
		vi.spyOn(console, "warn").mockImplementation(() => {});
		for (const query of [vi.fn(async () => false), vi.fn(async () => { throw new Error("timed out"); })]) {
			game.users.activeGM = { query };
			expect(await writePartyNote(scene, visited, "Camp here")).toBe(false);
		}
		expect(warn).toHaveBeenCalledTimes(2);
		expect(warn).toHaveBeenCalledWith("travels.party.refused");
	});
});

describe("onPartyNoteQuery", () => {
	const ada = { id: "p1", name: "Ada", isGM: false };
	const ask = (data, user = ada) => onPartyNoteQuery(data, { user });

	it("is registered for the GM to answer", () => {
		registerHexSharedQuery();
		expect(CONFIG.queries[`${SYSTEM_ID}.writePartyNote`]).toBe(onPartyNoteQuery);
	});

	it("writes a player's note on a hex they may open, signed by who asked", async () => {
		expect(await ask({ sceneId: "realm", hex: visited, text: "Camp here" })).toBe(true);
		expect(getHexShared(scene).hexes["3,4"].party).toMatchObject({ text: "Camp here", by: "p1", byName: "Ada" });
	});

	it("refuses with no asker, on a player's client, or for anything that isn't a hex they may open", async () => {
		expect(await onPartyNoteQuery({ sceneId: "realm", hex: visited, text: "x" }, {})).toBe(false);
		const cases = [
			{ sceneId: "elsewhere", hex: visited, text: "x" },
			{ sceneId: "realm", hex: visited, text: 7 },
			{ sceneId: "realm", hex: { col: 1.5, row: 2 }, text: "x" },
			{ sceneId: "realm", hex: hex(40, 40), text: "x" },
			{ sceneId: "realm", hex: hex(9, 9), text: "x" },
			{ sceneId: "realm", text: "x" }
		];
		for (const data of cases) expect(await ask(data)).toBe(false);
		game.user.isGM = false;
		expect(await ask({ sceneId: "realm", hex: visited, text: "x" })).toBe(false);
		expect(scene.update).not.toHaveBeenCalled();
	});
});
