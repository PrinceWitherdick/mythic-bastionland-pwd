import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { realmGeometry, hexCentre, hexKey } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const g = realmGeometry();
const hex = (col, row) => ({ col, row });

/** A Tile of the Realm, centred on its hex as centredTiles gives them. */
const tile = (id, kind, at, hidden = true) => ({ _id: id, hidden, ...hexCentre(g, at), flags: { [SYSTEM_ID]: { realm: { kind } } } });

let tiles;
let journey;

vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));
vi.mock("../../module/actions/realm.js", () => ({
	centredTiles: () => tiles,
	getRealm: () => ({ realm: { myths: tiles.filter((each) => each.flags[SYSTEM_ID].realm.kind === "myth").map((each, index) => ({ id: each._id, number: index + 1 })) } }),
	isDrawingRealm: (scene) => scene?.getFlag?.(SYSTEM_ID, "drawing") === true,
	isRealmScene: (scene) => Boolean(scene?.realm),
	sceneGeometry: () => g
}));
vi.mock("../../module/actions/journey.js", () => ({ COMPANY_PLACED_HOOK: "placed", getJourney: () => journey }));
// What turning solo play on asks of the hotbar and the readout is theirs to test.
vi.mock("../../module/canvas/hex-readout.js", () => ({ updateHexReadout: vi.fn() }));
vi.mock("../../module/actions/places-macro.js", () => ({ ensurePlacesHotbar: vi.fn(async () => {}) }));
vi.mock("../../module/actions/timeline-macro.js", () => ({ ensureTimelineHotbar: vi.fn(async () => {}) }));

const { SOLO_CHANGED_HOOK, brushLockedOn, brushRefused, isSolo, keptFromMe, mythKeptFromMe, registerSolo, revealMythsReached, secretsKeptOn, secretsToSettle } = await import("../../module/actions/solo.js");

/** A Realm Scene whose Tiles can be shown. */
const realmScene = (id = "realm") => ({
	id,
	realm: true,
	updateEmbeddedDocuments: vi.fn(async (_type, updates) => {
		for (const { _id, hidden } of updates) tiles.find((each) => each._id === _id).hidden = hidden;
	})
});

let solo;
let hooks;
let registered;

beforeEach(() => {
	solo = true;
	tiles = [tile("m1", "myth", hex(3, 3)), tile("m2", "myth", hex(8, 8)), tile("l1", "landmark", hex(3, 3))];
	journey = { hexes: {} };
	hooks = new Map();
	registered = null;
	globalThis.Hooks = { on: (name, fn) => hooks.set(name, fn), callAll: vi.fn() };
	globalThis.ui = { notifications: { info: vi.fn() } };
	globalThis.game = {
		user: { isGM: true },
		users: { activeGM: { isSelf: true } },
		scenes: [],
		settings: {
			get: (_scope, key) => (key === "soloPlay" ? solo : undefined),
			register: vi.fn((_scope, _key, options) => {
				registered = options;
			})
		}
	};
});

afterEach(() => {
	for (const key of ["Hooks", "ui", "game", "canvas", "foundry"]) delete globalThis[key];
});

describe("revealMythsReached", () => {
	it("shows the hidden Myth of a hex the Company came into, and says so", async () => {
		const scene = realmScene();
		const found = await revealMythsReached(scene, [hex(3, 3)]);
		expect(found.map((myth) => myth.id)).toEqual(["m1"]);
		expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith("Tile", [{ _id: "m1", hidden: false }]);
		// A Landmark is found by the Wilderness Roll (p14), not by coming into its hex.
		expect(tiles.find((each) => each._id === "l1").hidden).toBe(true);
		expect(ui.notifications.info).toHaveBeenCalledOnce();
	});

	it("finds nothing with others at the table, nor on a GM who isn't the active one", async () => {
		const scene = realmScene();
		solo = false;
		expect(await revealMythsReached(scene, [hex(3, 3)])).toEqual([]);
		solo = true;
		game.users.activeGM.isSelf = false;
		expect(await revealMythsReached(scene, [hex(3, 3)])).toEqual([]);
		expect(scene.updateEmbeddedDocuments).not.toHaveBeenCalled();
	});
});

describe("a Realm drawn alone", () => {
	/** A Realm Scene with flags of the system's own. */
	const drawn = (flags) => ({ getFlag: (scope, key) => (scope === SYSTEM_ID ? flags[key] : undefined) });

	it("keeps in view the secrets the Referee places by hand, only until it's first finished", () => {
		expect(secretsKeptOn(drawn({ drawing: true, soloSecrets: "hide" }))).toBe(false);
		expect(secretsKeptOn(drawn({ drawing: true, soloSecrets: "show" }))).toBe(false);
		// The dice place them unseen, so there's nothing to see while drawing.
		expect(secretsKeptOn(drawn({ drawing: true, soloSecrets: "dice" }))).toBe(true);
		// Drawn again after it was finished, what's still to be found stays hidden.
		expect(secretsKeptOn(drawn({ drawing: true, soloSecrets: null }))).toBe(true);
		expect(secretsKeptOn(drawn({ drawing: false, soloSecrets: "hide" }))).toBe(true);
		expect(secretsKeptOn(drawn({ drawing: true }))).toBe(true);
		expect(secretsKeptOn(null)).toBe(true);
		// Whether the Referee plays alone doesn't hang on the Realm in view.
		expect(keptFromMe()).toBe(true);
	});

	it("lets the brush lay Holdings, Landmarks and Barriers only while none are hidden yet", () => {
		const locked = (flags) => ["holding", "landmark", "barrier", "terrain"].filter((brush) => brushLockedOn(brush, drawn(flags)));
		// Placed by hand and seen: nothing hidden for a refusal to point at.
		expect(locked({ drawing: true, soloSecrets: "hide" })).toEqual([]);
		// Waiting for the dice, Holdings are drawn as any other's; Landmarks and Barriers are the dice's to place.
		expect(locked({ drawing: true, soloSecrets: "dice" })).toEqual(["landmark", "barrier"]);
		// Settled, or drawn again after it was finished: the brush leaves them as they are.
		expect(locked({ drawing: false, soloSecrets: null })).toEqual(["holding", "landmark", "barrier"]);
		expect(locked({ drawing: true, soloSecrets: null })).toEqual(["holding", "landmark", "barrier"]);
	});

	it("says why a brush lays nothing, as it refuses", () => {
		expect(brushRefused("landmark", drawn({ drawing: true, soloSecrets: "dice" }))).toBe(true);
		expect(ui.notifications.info).toHaveBeenLastCalledWith("solo.brushDice");
		expect(brushRefused("landmark", drawn({ drawing: false, soloSecrets: null }))).toBe(true);
		expect(ui.notifications.info).toHaveBeenLastCalledWith("solo.brushLocked");
		expect(brushRefused("holding", drawn({ drawing: true, soloSecrets: "dice" }))).toBe(false);
		expect(ui.notifications.info).toHaveBeenCalledTimes(2);
	});

	it("names a Myth not yet met while the Referee places it by hand, and not once it's kept", () => {
		const unmet = { number: 1, omen: 0, revealed: false };
		expect(mythKeptFromMe(unmet, drawn({ drawing: true, soloSecrets: "hide" }))).toBe(false);
		expect(mythKeptFromMe(unmet, drawn({ drawing: false, soloSecrets: null }))).toBe(true);
		expect(mythKeptFromMe(null, drawn({ drawing: false, soloSecrets: null }))).toBe(false);
	});

	it("says how its secrets are to be settled, until they are", () => {
		expect(secretsToSettle(drawn({ soloSecrets: "dice" }))).toBe("dice");
		expect(secretsToSettle(drawn({ soloSecrets: "nonsense" }))).toBeNull();
		expect(secretsToSettle(null)).toBeNull();
	});
});

describe("registerSolo", () => {
	beforeEach(() => registerSolo());

	it("finds the Myth where the Company was set down", async () => {
		const scene = realmScene();
		hooks.get("placed")(scene, [hex(8, 8)]);
		await vi.waitFor(() => expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith("Tile", [{ _id: "m2", hidden: false }]));
	});

	it("sets the Realm Key aside in the chat log for a Referee playing alone", () => {
		const replaced = vi.fn();
		const card = { replaceChildren: replaced };
		const html = { ownerDocument: { createElement: () => ({}) }, querySelector: (selector) => (selector === ".bastionland-card--realm-key" ? card : null) };
		hooks.get("renderChatMessageHTML")({}, html);
		expect(replaced).toHaveBeenCalledWith(expect.objectContaining({ textContent: "solo.realmKeyKept" }));

		replaced.mockClear();
		solo = false;
		hooks.get("renderChatMessageHTML")({}, html);
		expect(replaced).not.toHaveBeenCalled();
	});

	it("finds, quietly, the Myths of hexes already visited when solo play is turned on partway", async () => {
		const scene = realmScene();
		game.scenes = [scene];
		journey = { hexes: { [hexKey(hex(8, 8))]: { count: 1, last: { order: 1 } } } };
		globalThis.foundry = { applications: { instances: new Map() } };
		globalThis.canvas = {};
		registered.onChange(true);
		await vi.waitFor(() => expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith("Tile", [{ _id: "m2", hidden: false }]));
		expect(ui.notifications.info).not.toHaveBeenCalled();
		expect(Hooks.callAll).toHaveBeenCalledWith(SOLO_CHANGED_HOOK, true);
	});

	it("reads the setting once the world is ready, and again as it changes", () => {
		globalThis.foundry = { applications: { instances: new Map() } };
		globalThis.canvas = {};
		game.ready = true;
		expect(isSolo()).toBe(true);
		solo = false;
		expect(isSolo()).toBe(true);
		registered.onChange(false);
		expect(isSolo()).toBe(false);
		// Left as it found it, for whatever runs next.
		game.ready = false;
		registered.onChange(false);
	});
});
