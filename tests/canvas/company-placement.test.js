import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REALM_FLAG } from "../../module/rules/realm.js";
import { hexCentre, hexTopLeft, realmGeometry } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const g = realmGeometry();

/** The picture the Company is carried as: square, so it fits the hex's height. */
const TEXTURE = { width: 100, height: 100 };

/** Just enough of a PIXI display object to be drawn into and thrown away. */
class FakeDisplay {
	children = [];
	visible = true;
	alpha = 1;
	eventMode = "auto";
	x = 0;
	y = 0;
	destroyed = false;
	position = { set: (x, y) => { this.x = x; this.y = y; } };
	addChild(child) {
		this.children.push(child);
		return child;
	}
	destroy() {
		this.destroyed = true;
	}
}

class FakeSprite extends FakeDisplay {
	anchor = { set: vi.fn() };
	constructor(texture) {
		super();
		this.texture = texture;
		this.width = texture.width;
		this.height = texture.height;
	}
}

class FakeGraphics extends FakeDisplay {
	drawn = 0;
	clear() {
		this.drawn = 0;
	}
	lineStyle() {}
	moveTo() {
		this.drawn += 1;
	}
	lineTo() {
		this.drawn += 1;
	}
	closePath() {}
}

globalThis.PIXI = { Container: FakeDisplay, Graphics: FakeGraphics, Sprite: FakeSprite, LINE_JOIN: { ROUND: "round" } };
globalThis.foundry = {
	applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (Base) => class extends Base {} } },
	utils: { deepClone: structuredClone },
	canvas: { loadTexture: async () => TEXTURE }
};

const { cancelCompanyPlacement, isPlacingCompany, startCompanyPlacement } = await import("../../module/canvas/company-placement.js");

/** @type {Record<string, Function[]>} */
let listeners;
/** @type {Function[]} */
let pointerMoves;
let scene;
let controls;
let note;

/** The canvas element clicks land on. */
class Element {}
const board = Object.assign(new Element(), { id: "board" });
const sidebar = Object.assign(new Element(), { id: "sidebar" });

/** Put the pointer in the middle of a hex, or past the edge of the Realm. */
function pointAt(hex) {
	canvas.mousePosition = hex ? hexCentre(g, hex) : { x: -100, y: -100 };
	pointerMoves.forEach((handler) => handler());
}

/** @returns {object} A pointer event as it reaches a window listener. */
const pointerEvent = (button, { target = board, x = 0, y = 0 } = {}) => ({
	button,
	target,
	clientX: x,
	clientY: y,
	preventDefault: vi.fn(),
	stopImmediatePropagation: vi.fn()
});

const fire = (type, event) => (listeners[type] ?? []).forEach((handler) => handler(event));

beforeEach(() => {
	listeners = {};
	pointerMoves = [];
	note = { id: "note" };
	controls = new FakeDisplay();
	scene = {
		id: "realm1",
		flags: { [SYSTEM_ID]: { [REALM_FLAG]: { size: g.size, cols: g.cols, rows: g.rows } } },
		tokens: [],
		getFlag: () => undefined,
		createEmbeddedDocuments: vi.fn(async (_type, [data]) => [data])
	};

	globalThis.Element = Element;
	globalThis.CONST = { TOKEN_DISPOSITIONS: { FRIENDLY: 1 } };
	globalThis.game = { user: { isGM: true }, i18n: { localize: (key) => key, format: (key) => key } };
	globalThis.ui = { notifications: { info: vi.fn(() => note), warn: vi.fn(), remove: vi.fn() } };
	globalThis.Hooks = { on: vi.fn(() => 7), off: vi.fn(), callAll: vi.fn() };
	globalThis.canvas = {
		ready: true,
		scene,
		controls,
		mousePosition: { x: 0, y: 0 },
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
	cancelCompanyPlacement({ quiet: true });
	for (const key of ["Element", "CONST", "game", "ui", "Hooks", "canvas", "window"]) delete globalThis[key];
});

describe("carrying the Company to a hex", () => {
	const hex = { col: 4, row: 3 };

	it("hands the GM a half-there Company that follows the pointer from hex to hex", async () => {
		await expect(startCompanyPlacement(scene, { start: "wanderer" })).resolves.toBe(true);
		const [marks] = controls.children;
		const [ring, ghost] = marks.children;

		pointAt(hex);
		expect(marks.visible).toBe(true);
		expect(ghost).toMatchObject(hexCentre(g, hex));
		expect(ghost.alpha).toBeLessThan(1);
		// Drawn as the Token will sit: the picture contained in the box around the hex.
		expect(ghost.height).toBe(g.hexHeight);
		expect(ring.drawn).toBe(6);

		// Past the edge of the Realm there's no hex to stand in, so nothing is shown.
		pointAt(null);
		expect(marks.visible).toBe(false);
	});

	it("stands the Company in the hex clicked, and takes the click from the tool in hand", async () => {
		await startCompanyPlacement(scene, { start: "wanderer" });
		pointAt(hex);
		const click = pointerEvent(0);
		fire("pointerdown", click);
		await vi.waitFor(() => expect(scene.createEmbeddedDocuments).toHaveBeenCalled());

		const corner = hexTopLeft(g, hex);
		expect(scene.createEmbeddedDocuments).toHaveBeenCalledWith("Token", [expect.objectContaining({ x: Math.round(corner.x), y: Math.round(corner.y) })]);
		expect(click.stopImmediatePropagation).toHaveBeenCalled();
		expect(isPlacingCompany()).toBe(false);
		expect(ui.notifications.remove).toHaveBeenCalledWith(note);
		expect(controls.children[0].destroyed).toBe(true);
	});

	it("leaves a click past the edge of the Realm, or one on a window, to whatever it was meant for", async () => {
		await startCompanyPlacement(scene, { start: "wanderer" });
		pointAt(null);
		const wide = pointerEvent(0);
		fire("pointerdown", wide);
		expect(wide.stopImmediatePropagation).not.toHaveBeenCalled();

		pointAt(hex);
		fire("pointerdown", pointerEvent(0, { target: sidebar }));
		expect(scene.createEmbeddedDocuments).not.toHaveBeenCalled();
		expect(isPlacingCompany()).toBe(true);
	});

	it("gives the Company up on Escape, leaving the map as it was", async () => {
		await startCompanyPlacement(scene, { start: "wanderer" });
		const escape = { key: "Escape", preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
		fire("keydown", escape);

		expect(escape.stopImmediatePropagation).toHaveBeenCalled();
		expect(scene.createEmbeddedDocuments).not.toHaveBeenCalled();
		expect(isPlacingCompany()).toBe(false);
		expect(ui.notifications.info).toHaveBeenLastCalledWith("bastionland.company.placing.later");
	});

	it("gives it up on a right click, but keeps it in hand through a right drag that pans the map", async () => {
		await startCompanyPlacement(scene, { start: "wanderer" });
		fire("pointerdown", pointerEvent(2, { x: 100, y: 100 }));
		fire("pointerup", pointerEvent(2, { x: 400, y: 260 }));
		expect(isPlacingCompany()).toBe(true);

		fire("pointerdown", pointerEvent(2, { x: 100, y: 100 }));
		fire("pointerup", pointerEvent(2, { x: 102, y: 101 }));
		expect(isPlacingCompany()).toBe(false);
	});

	it("is only carried by a GM, over the Realm they're looking at", async () => {
		globalThis.game.user.isGM = false;
		await expect(startCompanyPlacement(scene, { start: "wanderer" })).resolves.toBe(false);

		globalThis.game.user.isGM = true;
		await expect(startCompanyPlacement({ flags: {} }, { start: "wanderer" })).resolves.toBe(false);

		canvas.scene = { id: "elsewhere" };
		await expect(startCompanyPlacement(scene, { start: "wanderer" })).resolves.toBe(false);
		expect(controls.children).toHaveLength(0);
	});
});
