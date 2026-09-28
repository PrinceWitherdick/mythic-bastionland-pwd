import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRealm } from "../../module/rules/realm.js";
import { hexCentre, hexKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const g = realmGeometry({ cols: 12, rows: 12 });
const hex = (col, row) => ({ col, row });

/** Just enough of a PIXI display object to be drawn into and thrown away. */
class FakeDisplay {
	children = [];
	destroyed = false;
	eventMode = "auto";
	zIndex = 0;
	x = 0;
	y = 0;
	anchor = { set: vi.fn() };
	position = { set: (x, y) => { this.x = x; this.y = y; } };
	addChild(child) {
		this.children.push(child);
		child.parent = this;
		return child;
	}
	removeChildren() {
		return this.children.splice(0);
	}
	destroy() {
		this.destroyed = true;
	}
}

class FakeGraphics extends FakeDisplay {
	lineStyle() {}
	beginFill() {}
	endFill() {}
	drawCircle() {}
}

class FakeText extends FakeDisplay {
	constructor(text) {
		super();
		this.text = text;
	}
}

globalThis.PIXI = { Container: FakeDisplay, Graphics: FakeGraphics };
globalThis.foundry = { canvas: { containers: { PreciseText: Object.assign(FakeText, { getTextStyle: (style) => style }) } } };

/** The Realm on the canvas, and whether a Scene is a Realm. */
let realm;
let isRealm;

vi.mock("../../module/actions/realm.js", () => ({
	isRealmScene: () => isRealm,
	getRealm: () => ({ realm }),
	sceneGeometry: () => g,
	hexHiddenByHand: () => ({ terrain: false, holding: false, seat: false })
}));
vi.mock("../../module/actions/sighted.js", async () => {
	const { normaliseSighted } = await import("../../module/rules/sighted.js");
	return { getSighted: (scene) => normaliseSighted(scene.flags?.[SYSTEM_ID]?.sighted) };
});

const { drawSightedMarks } = await import("../../module/canvas/sighted-marks.js");

beforeEach(() => {
	isRealm = true;
	realm = emptyRealm(g);
	realm.landmarks = [
		{ id: "l0", hex: hex(3, 3), type: "ruin", name: "", seer: null, revealed: false },
		{ id: "l1", hex: hex(5, 5), type: "monument", name: "", seer: null, revealed: true }
	];
	globalThis.canvas = {
		ready: true,
		interface: new FakeDisplay(),
		scene: { flags: { [SYSTEM_ID]: { sighted: { [hexKey(hex(3, 3))]: { note: "a bridge" }, [hexKey(hex(5, 5))]: { note: "" } } } } }
	};
});

describe("drawSightedMarks", () => {
	it("stands an unnamed mark in each hex seen from afar where something is still hidden", () => {
		drawSightedMarks();
		const [layer] = canvas.interface.children;
		expect(layer.eventMode).toBe("none");
		expect(layer.children).toHaveLength(1);
		const [mark] = layer.children;
		expect({ x: mark.x, y: mark.y }).toEqual(hexCentre(g, hex(3, 3)));
		expect(mark.children.at(-1).text).toBe("?");
	});

	it("draws the marks again rather than on top, and none off a Realm", () => {
		drawSightedMarks();
		drawSightedMarks();
		const [layer] = canvas.interface.children;
		expect(canvas.interface.children).toHaveLength(1);
		expect(layer.children).toHaveLength(1);
		isRealm = false;
		drawSightedMarks();
		expect(layer.children).toHaveLength(0);
	});

	it("makes its layer again for a canvas drawn afresh", () => {
		drawSightedMarks();
		canvas.interface.children[0].destroy();
		canvas.interface = new FakeDisplay();
		drawSightedMarks();
		expect(canvas.interface.children[0].children).toHaveLength(1);
	});
});
