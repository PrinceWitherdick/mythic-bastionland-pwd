import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRealm } from "../../module/rules/realm.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const g = realmGeometry({ cols: 4, rows: 4 });

/** The hex lore kept on the Scene, and whether its Realm has the Fog of War on. */
let lore;

vi.mock("../../module/chat/cards.js", () => ({
	postCard: vi.fn(async () => ({ id: "m1" })),
	warn: vi.fn(),
	t: (key) => key
}));
vi.mock("../../module/chat/hex-target.js", () => ({ hexTarget: () => ({ label: "(2, 2)" }) }));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({ age: 1, year: 1, season: "spring", day: 1, phase: "morning" }) }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => null, sparkPageOf: () => null }));
vi.mock("../../module/actions/realm.js", () => ({
	getRealm: () => ({ realm: emptyRealm(g) }),
	isRealmScene: (scene) => Boolean(scene?.realm),
	hexHiddenByHand: () => ({}),
	sceneGeometry: () => g
}));
vi.mock("../../module/actions/hex-shared.js", () => ({ recordToldHex: vi.fn(async () => {}) }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollSpark: vi.fn() }));
const liftRealmFog = vi.fn(async () => true);
vi.mock("../../module/actions/realm-fog.js", () => ({ liftRealmFog: (...args) => liftRealmFog(...args) }));

const { tellPlayersAboutHex } = await import("../../module/actions/hex-lore.js");

const hex = { col: 2, row: 2 };
const scene = {
	id: "realm1",
	realm: true,
	getFlag: (scope, key) => (scope === SYSTEM_ID && key === "hexLore" ? lore : null),
	update: vi.fn(async () => {})
};

beforeEach(() => {
	lore = { version: 1, hexes: { "2,2": { note: "A ford", sparks: [] } } };
	liftRealmFog.mockClear();
	globalThis.game = { user: { isGM: true } };
	globalThis.ui = { notifications: { info: vi.fn() } };
});

describe("telling the players of a hex in the Fog of War", () => {
	it("lifts the fog from it, once, where the Referee ticked the box", async () => {
		await tellPlayersAboutHex({ scene, hex, liftFog: true });
		expect(liftRealmFog).toHaveBeenCalledOnce();
		expect(liftRealmFog).toHaveBeenCalledWith(scene, [hex], "told");
	});

	it("leaves the fog where it lies otherwise", async () => {
		await tellPlayersAboutHex({ scene, hex });
		await tellPlayersAboutHex({ scene, hex, liftFog: false });
		expect(liftRealmFog).not.toHaveBeenCalled();
	});

	it("lifts nothing where there was nothing to tell", async () => {
		lore.hexes["2,2"].note = "";
		await tellPlayersAboutHex({ scene, hex, liftFog: true });
		expect(liftRealmFog).not.toHaveBeenCalled();
	});
});
