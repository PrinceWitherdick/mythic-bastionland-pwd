import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyJourney, recordVisits } from "../../module/rules/journey.js";
import { hexCentre, realmGeometry } from "../../module/rules/realm-geometry.js";

const g = realmGeometry({ cols: 12, rows: 12 });
const hex = (col, row) => ({ col, row });

/** Just enough of a PIXI display object to be drawn into and thrown away. */
class FakeDisplay {
	children = [];
	destroyed = false;
	eventMode = "auto";
	zIndex = 0;
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
	strokes = 0;
	lineStyle() {}
	moveTo() {}
	lineTo() {
		this.strokes++;
	}
}

globalThis.PIXI = { Container: FakeDisplay, Graphics: FakeGraphics };

let isRealm;
let journey;
let shown;

vi.mock("../../module/actions/realm.js", () => ({
	isRealmScene: () => isRealm,
	sceneGeometry: () => g
}));
vi.mock("../../module/actions/journey.js", () => ({ getJourney: () => journey }));
vi.mock("../../module/canvas/travels-controls.js", () => ({ refreshTravelsButtons: () => {} }));

const { drawVisitedMarks, setVisitedMarksShown, visitedMarkDashes, visitedMarksShown } = await import("../../module/canvas/visited-marks.js");

beforeEach(() => {
	isRealm = true;
	shown = true;
	journey = recordVisits(emptyJourney(), [hex(2, 2), hex(3, 3)]);
	globalThis.game = { settings: { get: () => shown, set: vi.fn(async (_scope, _key, value) => { shown = value; }) } };
	globalThis.canvas = { ready: true, interface: new FakeDisplay(), scene: { id: "realm" } };
});

/** @returns {FakeGraphics[]} What's drawn on the canvas now. */
const marks = () => canvas.interface.children.flatMap((layer) => layer.children);

describe("visitedMarkDashes", () => {
	it("goes round inside the hex, never near its middle", () => {
		const centre = hexCentre(g, hex(4, 4));
		const dashes = visitedMarkDashes(g, hex(4, 4));
		expect(dashes.length).toBeGreaterThanOrEqual(6);
		for (const { from, to } of dashes) {
			for (const point of [from, to]) {
				const away = Math.hypot(point.x - centre.x, point.y - centre.y);
				expect(away).toBeLessThan(g.radius);
				expect(away).toBeGreaterThan(g.radius * 0.6);
			}
		}
	});
});

describe("drawVisitedMarks", () => {
	it("marks every hex the Company has come into, under the marks of things seen from afar", () => {
		drawVisitedMarks();
		const [layer] = canvas.interface.children;
		expect(layer).toMatchObject({ eventMode: "none", zIndex: 955 });
		expect(marks()).toHaveLength(1);
		expect(marks()[0].strokes).toBe(visitedMarkDashes(g, hex(2, 2)).length + visitedMarkDashes(g, hex(3, 3)).length);
	});

	it("draws nothing again while the hexes are the same, and again once the Company moves", () => {
		drawVisitedMarks();
		const first = marks()[0];
		drawVisitedMarks();
		expect(marks()[0]).toBe(first);
		journey = recordVisits(journey, [hex(4, 4)]);
		drawVisitedMarks();
		expect(first.destroyed).toBe(true);
		expect(marks()[0]).not.toBe(first);
	});

	it("draws none where the marks are hidden, or off a Realm", () => {
		shown = false;
		drawVisitedMarks();
		expect(marks()).toHaveLength(0);
		shown = true;
		isRealm = false;
		drawVisitedMarks();
		expect(marks()).toHaveLength(0);
	});
});

describe("the setting", () => {
	it("is only written when it changes", async () => {
		expect(visitedMarksShown()).toBe(true);
		await setVisitedMarksShown(true);
		expect(game.settings.set).not.toHaveBeenCalled();
		await setVisitedMarksShown(false);
		expect(game.settings.set).toHaveBeenCalledWith(expect.any(String), "visitedMarksShown", false);
	});
});
