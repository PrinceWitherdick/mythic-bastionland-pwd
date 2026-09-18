import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hexCentre, realmGeometry } from "../../module/rules/realm-geometry.js";
import { REALM_FLAG } from "../../module/rules/realm.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// The prompt reaches the Hex Lore window, and every window reads `foundry` as
// it loads, so the stub has to stand before the module does.
globalThis.foundry = {
	applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (Base) => class extends Base {} } },
	utils: { deepClone: structuredClone }
};
const { forgetHexArrivals, registerHexPrompt } = await import("../../module/canvas/hex-prompt.js");

const g = realmGeometry();

/** How long arrivals are gathered for before they're offered, so a Company arrives once. */
const GATHER = 250;

/** @type {(token: object, movement: object) => void} */
let moveToken;

const scene = {
	id: "realm1",
	name: "The Realm",
	flags: { [SYSTEM_ID]: { [REALM_FLAG]: { size: g.size, cols: g.cols, rows: g.rows } } },
	tokens: [],
	getFlag: () => null
};

/** A player's Token standing in the middle of a hex. */
const tokenIn = (hex) => ({
	id: "t1",
	parent: scene,
	actor: { hasPlayerOwner: true },
	getCenterPoint: () => hexCentre(g, hex)
});

/** A leg of a movement, as Foundry hands a long walk over one leg at a time. */
const leg = (pending = []) => ({ method: "dragging", constrained: false, pending: { waypoints: pending } });

beforeEach(() => {
	vi.useFakeTimers();
	globalThis.game = { user: { isGM: true }, settings: { get: () => "notify" }, i18n: { localize: (key) => key, format: (key) => key } };
	globalThis.ui = { notifications: { info: vi.fn() } };
	globalThis.canvas = { scene: null };
	globalThis.Hooks = { on: (name, fn) => { if (name === "moveToken") moveToken = fn; } };
	registerHexPrompt();
});

afterEach(() => {
	forgetHexArrivals(scene.id);
	vi.useRealTimers();
	for (const key of ["game", "ui", "canvas", "Hooks"]) delete globalThis[key];
});

describe("the hex arrival prompt", () => {
	it("offers a hex once the Token has walked the last of its waypoints", () => {
		moveToken(tokenIn({ col: 4, row: 3 }), leg());
		vi.advanceTimersByTime(GATHER);
		expect(ui.notifications.info).toHaveBeenCalledOnce();
	});

	it("says nothing while there are waypoints still to walk", () => {
		moveToken(tokenIn({ col: 4, row: 3 }), leg([{ x: 1, y: 1 }]));
		vi.advanceTimersByTime(GATHER);
		expect(ui.notifications.info).not.toHaveBeenCalled();
	});

	it("counts a walk a wall cut short as an arrival, because the Token stops there", () => {
		moveToken(tokenIn({ col: 4, row: 3 }), { ...leg([{ x: 1, y: 1 }]), constrained: true });
		vi.advanceTimersByTime(GATHER);
		expect(ui.notifications.info).toHaveBeenCalledOnce();
	});

	it("offers a hex only once, and never for a move taken back", () => {
		moveToken(tokenIn({ col: 4, row: 3 }), leg());
		vi.advanceTimersByTime(GATHER);
		moveToken(tokenIn({ col: 4, row: 3 }), leg());
		moveToken(tokenIn({ col: 5, row: 3 }), { ...leg(), method: "undo" });
		vi.advanceTimersByTime(GATHER);
		expect(ui.notifications.info).toHaveBeenCalledOnce();
	});

	it("leaves alone Scenes that aren't Realms, Tokens no player owns, and GMs who asked for no prompt", () => {
		moveToken({ ...tokenIn({ col: 4, row: 3 }), parent: { id: "x", flags: {} } }, leg());
		moveToken({ ...tokenIn({ col: 6, row: 3 }), actor: { hasPlayerOwner: false } }, leg());
		game.settings.get = () => "never";
		moveToken(tokenIn({ col: 7, row: 3 }), leg());
		vi.advanceTimersByTime(GATHER);
		expect(ui.notifications.info).not.toHaveBeenCalled();
	});
});
