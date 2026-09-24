import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hexCentre, realmGeometry } from "../../module/rules/realm-geometry.js";
import { REALM_FLAG } from "../../module/rules/realm.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// The window itself is another test's business: here it stands for the offer,
// so the prompt is watched by what it opens.
const openHexLore = vi.fn();
vi.mock("../../module/apps/HexLore.js", () => ({ openHexLore: (...args) => openHexLore(...args) }));

const { forgetHexArrivals, offerWaitingArrival, registerHexPrompt } = await import("../../module/canvas/hex-prompt.js");

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
	openHexLore.mockClear();
	globalThis.game = { user: { isGM: true }, settings: { get: () => "open" }, i18n: { localize: (key) => key, format: (key) => key } };
	globalThis.ui = { notifications: { info: vi.fn(), warn: vi.fn() } };
	// The GM is looking at the Realm the Company walks across.
	globalThis.canvas = { scene };
	globalThis.Hooks = { on: (name, fn) => { if (name === "moveToken") moveToken = fn; } };
	registerHexPrompt();
});

afterEach(() => {
	forgetHexArrivals(scene.id);
	vi.useRealTimers();
	for (const key of ["game", "ui", "canvas", "Hooks"]) delete globalThis[key];
});

describe("the hex arrival prompt", () => {
	it("opens the Lay of the Land on the hex once the Token has walked the last of its waypoints", () => {
		moveToken(tokenIn({ col: 4, row: 3 }), leg());
		vi.advanceTimersByTime(GATHER);
		expect(openHexLore).toHaveBeenCalledWith({ scene, hex: { col: 4, row: 3 } });
	});

	it("opens nothing while there are waypoints still to walk", () => {
		moveToken(tokenIn({ col: 4, row: 3 }), leg([{ x: 1, y: 1 }]));
		vi.advanceTimersByTime(GATHER);
		expect(openHexLore).not.toHaveBeenCalled();
	});

	it("counts a walk a wall cut short as an arrival, because the Token stops there", () => {
		moveToken(tokenIn({ col: 4, row: 3 }), { ...leg([{ x: 1, y: 1 }]), constrained: true });
		vi.advanceTimersByTime(GATHER);
		expect(openHexLore).toHaveBeenCalledOnce();
	});

	it("opens once for a whole Company, and never for a shuffle within the hex or a move taken back", () => {
		moveToken(tokenIn({ col: 4, row: 3 }), leg());
		moveToken({ ...tokenIn({ col: 4, row: 3 }), id: "t2" }, leg());
		vi.advanceTimersByTime(GATHER);
		moveToken(tokenIn({ col: 4, row: 3 }), leg());
		moveToken(tokenIn({ col: 5, row: 3 }), { ...leg(), method: "undo" });
		vi.advanceTimersByTime(GATHER);
		expect(openHexLore).toHaveBeenCalledOnce();
	});

	it("opens again for the hex the Company left, once they walk back into it", () => {
		moveToken(tokenIn({ col: 4, row: 3 }), leg());
		vi.advanceTimersByTime(GATHER);
		moveToken(tokenIn({ col: 5, row: 3 }), leg());
		vi.advanceTimersByTime(GATHER);
		moveToken(tokenIn({ col: 4, row: 3 }), leg());
		vi.advanceTimersByTime(GATHER);
		expect(openHexLore).toHaveBeenCalledTimes(3);
	});

	it("leaves the window shut over a Realm the GM isn't looking at, and opens it when they look", () => {
		canvas.scene = { id: "elsewhere" };
		moveToken(tokenIn({ col: 4, row: 3 }), leg());
		vi.advanceTimersByTime(GATHER);
		// They walk on while the GM is away, so what waits is where they stand now.
		moveToken(tokenIn({ col: 5, row: 3 }), leg());
		vi.advanceTimersByTime(GATHER);
		expect(openHexLore).not.toHaveBeenCalled();

		canvas.scene = scene;
		offerWaitingArrival();
		expect(openHexLore).toHaveBeenCalledOnce();
		expect(openHexLore).toHaveBeenCalledWith({ scene, hex: { col: 5, row: 3 } });
		// Once it's been shown, looking at the Realm again opens nothing.
		offerWaitingArrival();
		expect(openHexLore).toHaveBeenCalledOnce();
	});

	it("opens nothing on looking at a Realm the Company hasn't moved on, or when the GM asked for no prompt", () => {
		offerWaitingArrival();
		canvas.scene = { id: "elsewhere" };
		moveToken(tokenIn({ col: 4, row: 3 }), leg());
		vi.advanceTimersByTime(GATHER);
		canvas.scene = scene;
		game.settings.get = () => "never";
		offerWaitingArrival();
		expect(openHexLore).not.toHaveBeenCalled();
	});

	it("opens nothing for a Company that walked away and back while the GM was elsewhere", () => {
		moveToken(tokenIn({ col: 4, row: 3 }), leg());
		vi.advanceTimersByTime(GATHER);
		openHexLore.mockClear();

		canvas.scene = { id: "elsewhere" };
		moveToken(tokenIn({ col: 5, row: 3 }), leg());
		vi.advanceTimersByTime(GATHER);
		moveToken(tokenIn({ col: 4, row: 3 }), leg());
		vi.advanceTimersByTime(GATHER);

		canvas.scene = scene;
		offerWaitingArrival();
		expect(openHexLore).not.toHaveBeenCalled();
	});

	it("leaves alone Scenes that aren't Realms, Tokens no player owns, and GMs who asked for no prompt", () => {
		moveToken({ ...tokenIn({ col: 4, row: 3 }), parent: { id: "x", flags: {} } }, leg());
		moveToken({ ...tokenIn({ col: 6, row: 3 }), actor: { hasPlayerOwner: false } }, leg());
		game.settings.get = () => "never";
		moveToken(tokenIn({ col: 7, row: 3 }), leg());
		vi.advanceTimersByTime(GATHER);
		expect(openHexLore).not.toHaveBeenCalled();
	});
});
