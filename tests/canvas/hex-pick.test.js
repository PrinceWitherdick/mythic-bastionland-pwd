import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REALM_FLAG } from "../../module/rules/realm.js";
import { hexCentre, realmGeometry } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const g = realmGeometry();

/** Just enough of a PIXI display object to be drawn into and thrown away. */
class FakeDisplay {
	children = [];
	visible = true;
	alpha = 1;
	eventMode = "auto";
	x = 0;
	y = 0;
	destroyed = false;
	anchor = { set: vi.fn() };
	position = { set: (x, y) => { this.x = x; this.y = y; } };
	addChild(child) {
		this.children.push(child);
		return child;
	}
	destroy() {
		this.destroyed = true;
	}
}

class FakeGraphics extends FakeDisplay {
	corners = 0;
	filled = 0;
	clear() {
		this.corners = 0;
		this.filled = 0;
	}
	lineStyle() {}
	beginFill() {}
	endFill() {}
	drawPolygon(points) {
		this.filled = points.length;
	}
	moveTo() {
		this.corners += 1;
	}
	lineTo() {
		this.corners += 1;
	}
	closePath() {}
}

class FakeText extends FakeDisplay {
	constructor(text, style) {
		super();
		this.text = text;
		this.style = style;
	}
}

globalThis.PIXI = { Container: FakeDisplay, Graphics: FakeGraphics, LINE_JOIN: { ROUND: "round" } };
globalThis.foundry = {
	applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (Base) => class extends Base {} } },
	utils: { deepClone: structuredClone },
	canvas: { loadTexture: async () => null, containers: { PreciseText: Object.assign(FakeText, { getTextStyle: (style) => style }) } }
};

const { cancelHexPick, isPickingHex, pickHex } = await import("../../module/canvas/hex-pick.js");

/** @type {Record<string, Function[]>} */
let listeners;
/** @type {Function[]} */
let pointerMoves;
/** @type {Function[]} */
let ticks;
let scene;
let controls;
let note;

class Element {}
const board = Object.assign(new Element(), { id: "board" });
const sidebar = Object.assign(new Element(), { id: "sidebar" });

/** Put the pointer in the middle of a hex, or past the edge of the Realm. */
function pointAt(hex) {
	canvas.mousePosition = hex ? hexCentre(g, hex) : { x: -100, y: -100 };
	pointerMoves.forEach((handler) => handler());
}

const pointerEvent = (button, { target = board, x = 0, y = 0 } = {}) => ({
	button,
	target,
	clientX: x,
	clientY: y,
	preventDefault: vi.fn(),
	stopImmediatePropagation: vi.fn()
});

const fire = (type, event) => (listeners[type] ?? []).forEach((handler) => handler(event));

const label = (hex) => `Save to (${hex.col}, ${hex.row})`;

beforeEach(() => {
	listeners = {};
	pointerMoves = [];
	ticks = [];
	note = { id: "note" };
	controls = new FakeDisplay();
	scene = {
		id: "realm1",
		flags: { [SYSTEM_ID]: { [REALM_FLAG]: { size: g.size, cols: g.cols, rows: g.rows } } },
		tokens: [],
		getFlag: () => undefined
	};

	globalThis.Element = Element;
	globalThis.game = { user: { isGM: true }, i18n: { localize: (key) => key, format: (key) => key } };
	globalThis.ui = { notifications: { info: vi.fn(() => note), warn: vi.fn(), remove: vi.fn() } };
	globalThis.Hooks = { on: vi.fn(() => 7), off: vi.fn(), callAll: vi.fn() };
	globalThis.canvas = {
		ready: true,
		scene,
		controls,
		mousePosition: { x: -100, y: -100 },
		app: { ticker: { add: (tick) => ticks.push(tick), remove: (tick) => { ticks = ticks.filter((each) => each !== tick); } } },
		stage: {
			on: (type, handler) => { if (type === "pointermove") pointerMoves.push(handler); },
			off: (type, handler) => { if (type === "pointermove") pointerMoves = pointerMoves.filter((each) => each !== handler); }
		}
	};
	globalThis.window = {
		addEventListener: (type, handler) => (listeners[type] ??= []).push(handler),
		removeEventListener: (type, handler) => { listeners[type] = (listeners[type] ?? []).filter((each) => each !== handler); }
	};
});

afterEach(() => {
	cancelHexPick();
	for (const key of ["Element", "game", "ui", "Hooks", "canvas", "window"]) delete globalThis[key];
});

describe("asking the GM for a hex", () => {
	const hex = { col: 4, row: 3 };

	it("washes the hex under the pointer and says over it what a click there does", async () => {
		const picked = pickHex(scene, { message: "Click the hex.", label });
		expect(isPickingHex()).toBe(true);
		const [marks] = controls.children;
		const [wash, ring, word] = marks.children;
		expect(marks.eventMode).toBe("none");
		// Nothing shows until the pointer is over the Realm.
		expect(marks.visible).toBe(false);

		pointAt(hex);
		expect(marks.visible).toBe(true);
		expect(wash.filled).toBe(6);
		expect(ring.corners).toBe(6);
		expect(word.text).toBe("Save to (4, 3)");
		expect(word).toMatchObject(hexCentre(g, hex));

		pointAt({ col: 5, row: 3 });
		expect(word.text).toBe("Save to (5, 3)");

		pointAt(null);
		expect(marks.visible).toBe(false);

		cancelHexPick();
		await expect(picked).resolves.toBeNull();
	});

	it("breathes the wash while it waits, and stops when it's done", async () => {
		const picked = pickHex(scene, { message: "Click the hex.", label });
		const [wash, ring] = controls.children[0].children;
		expect(ticks).toHaveLength(1);
		ticks[0]();
		expect(wash.alpha).toBeGreaterThan(0);
		expect(wash.alpha).toBeLessThan(1);
		// The edge is held steady, so the hex stays marked at the wash's faintest.
		expect(ring.alpha).toBe(1);
		cancelHexPick();
		await picked;
		expect(ticks).toHaveLength(0);
	});

	it("holds the wash still for those who want less motion", async () => {
		globalThis.game.settings = { get: (_system, key) => key === "reduceMotion" };
		pickHex(scene, { message: "Click the hex.", label });
		expect(ticks).toHaveLength(0);
	});

	it("answers with the hex clicked, taking the click from the tool in hand and clearing the map", async () => {
		const picked = pickHex(scene, { message: "Click the hex.", label });
		const [marks] = controls.children;
		pointAt(hex);
		const click = pointerEvent(0);
		fire("pointerdown", click);

		await expect(picked).resolves.toEqual(hex);
		expect(click.stopImmediatePropagation).toHaveBeenCalled();
		expect(isPickingHex()).toBe(false);
		expect(marks.destroyed).toBe(true);
		expect(ui.notifications.remove).toHaveBeenCalledWith(note);
		expect(pointerMoves).toHaveLength(0);
		expect(listeners.pointerdown).toHaveLength(0);
	});

	it("leaves a click past the edge of the Realm, or one on a window, to whatever it was meant for", async () => {
		pickHex(scene, { message: "Click the hex.", label });
		pointAt(null);
		const offMap = pointerEvent(0);
		fire("pointerdown", offMap);
		pointAt(hex);
		const onWindow = pointerEvent(0, { target: sidebar });
		fire("pointerdown", onWindow);

		expect(offMap.stopImmediatePropagation).not.toHaveBeenCalled();
		expect(onWindow.stopImmediatePropagation).not.toHaveBeenCalled();
		expect(isPickingHex()).toBe(true);
	});

	it("gives up on Escape or a right click, but keeps asking through a right drag that pans the map", async () => {
		let picked = pickHex(scene, { message: "Click the hex.", label });
		const escape = { key: "Escape", preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
		fire("keydown", escape);
		await expect(picked).resolves.toBeNull();
		expect(escape.stopImmediatePropagation).toHaveBeenCalled();

		picked = pickHex(scene, { message: "Click the hex.", label });
		fire("pointerdown", pointerEvent(2, { x: 10, y: 10 }));
		fire("pointerup", pointerEvent(2, { x: 60, y: 10 }));
		expect(isPickingHex()).toBe(true);
		fire("pointerdown", pointerEvent(2, { x: 10, y: 10 }));
		fire("pointerup", pointerEvent(2, { x: 12, y: 11 }));
		await expect(picked).resolves.toBeNull();
	});

	it("tells the GM what to click and how to stop, until they have", async () => {
		pickHex(scene, { message: "Click the hex.", label });
		expect(ui.notifications.info).toHaveBeenCalledWith("Click the hex. bastionland.hexPick.stop", { permanent: true });
	});

	it("answers a second ask and gives the first up", async () => {
		const first = pickHex(scene, { message: "One.", label });
		const second = pickHex(scene, { message: "Two.", label });
		await expect(first).resolves.toBeNull();
		pointAt(hex);
		fire("pointerdown", pointerEvent(0));
		await expect(second).resolves.toEqual(hex);
	});

	it("only asks a GM, over the Realm they're looking at", async () => {
		game.user.isGM = false;
		await expect(pickHex(scene, { message: "", label })).resolves.toBeNull();
		game.user.isGM = true;
		canvas.scene = { id: "elsewhere" };
		await expect(pickHex(scene, { message: "", label })).resolves.toBeNull();
		expect(isPickingHex()).toBe(false);
		expect(controls.children).toHaveLength(0);
	});
});
