import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import { POSTED_AT_FLAG } from "../../module/chat/posted-at.js";
import { REALM_GROWTH_FLAG, loggedGrowth } from "../../module/rules/realm-growth.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";

vi.mock("../../module/actions/realm.js", () => ({
	isRealmScene: (scene) => Boolean(scene?.realm),
	sceneGeometry: (scene) => scene.g
}));
vi.mock("../../module/actions/exploration.js", () => ({ markOnPlayersMap: vi.fn(async () => {}) }));
vi.mock("../../module/chat/cards.js", () => ({ registerCardButtons: vi.fn() }));

const { cardHexes } = await import("../../module/chat/card-hexes.js");
const { markOnPlayersMap } = await import("../../module/actions/exploration.js");
const { registerCardButtons } = await import("../../module/chat/cards.js");
const { registerExplorationCards } = await import("../../module/chat/exploration-card.js");

/** A Realm of 15 by 13 that grew 2 to the west and 1 to the north at 1000, so it's 17 by 14 now. */
const grown = () => ({
	id: "vale",
	realm: true,
	g: realmGeometry({ cols: 17, rows: 14 }),
	flags: { [SYSTEM_ID]: { [REALM_GROWTH_FLAG]: loggedGrowth(null, { west: 2, north: 1, east: 0, south: 0 }, { when: 1000, keepNumbers: true }) } }
});
const posted = (at) => ({ flags: { [SYSTEM_ID]: { [POSTED_AT_FLAG]: at } } });

describe("cardHexes", () => {
	it("moves the hexes of a card posted before the map grew, and leaves a later card's as they are", () => {
		const scene = grown();
		expect(cardHexes(posted(500), scene).hex("4,5")).toEqual({ col: 6, row: 6 });
		expect(cardHexes(posted(1500), scene).hex("4,5")).toEqual({ col: 4, row: 5 });
		expect(cardHexes(posted(500), scene).shift({ col: 1, row: 1 })).toEqual({ col: 3, row: 2 });
		expect(cardHexes(posted(500), scene).offset).toEqual({ cols: 2, rows: 1 });
	});

	it("reads nothing from a key naming no hex, or a hex beyond the map", () => {
		const scene = grown();
		expect(cardHexes(posted(1500), scene).hex("")).toBeNull();
		expect(cardHexes(posted(1500), scene).hex(undefined)).toBeNull();
		expect(cardHexes(posted(1500), scene).hex("18,1")).toBeNull();
	});
});

describe("a Survey card's Fog of War", () => {
	let handler;

	beforeEach(() => {
		registerExplorationCards();
		handler = registerCardButtons.mock.calls.at(-1)[0].handler;
	});

	afterEach(() => {
		delete globalThis.game;
		vi.clearAllMocks();
	});

	it("lifts the fog from the hexes it took in as they're numbered now, after the map grew", async () => {
		const scene = grown();
		globalThis.game = { scenes: { get: (id) => (id === scene.id ? scene : undefined) } };
		const button = { dataset: { exploreMark: "t1", exploreLift: "4,5;5,5", exploreScene: "vale" } };
		await handler(button, posted(500));
		expect(markOnPlayersMap).toHaveBeenCalledWith(scene, ["t1"], { lift: [{ col: 6, row: 6 }, { col: 7, row: 6 }] });
	});
});
