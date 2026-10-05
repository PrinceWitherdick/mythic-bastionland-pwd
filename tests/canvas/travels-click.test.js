import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hexCentre, realmGeometry } from "../../module/rules/realm-geometry.js";

const g = realmGeometry({ cols: 12, rows: 12 });
const hex = (col, row) => ({ col, row });

let openable;
let drawing;
let taking;

vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));
vi.mock("../../module/actions/realm.js", () => ({
	isRealmScene: (scene) => Boolean(scene?.isRealm),
	isDrawingRealm: () => drawing,
	sceneGeometry: () => g
}));
vi.mock("../../module/actions/hex-shared.js", () => ({ hexOpenable: () => openable }));
vi.mock("../../module/apps/TravelsPlaces.js", () => ({ openPlaces: vi.fn(() => "opened") }));
vi.mock("../../module/canvas/map-click.js", () => ({ takingMapClick: () => taking }));

const { openPlaces } = await import("../../module/apps/TravelsPlaces.js");
const { onCompanyDoubleClick, onTravelsDoubleClick } = await import("../../module/canvas/travels-click.js");

/** A double-click on the board, or on something over it. */
const click = (id = "board") => {
	const target = new globalThis.Element();
	target.id = id;
	return { target };
};

beforeEach(() => {
	openable = true;
	drawing = false;
	taking = false;
	globalThis.Element = class Element {};
	globalThis.ui = { notifications: { info: vi.fn() } };
	const tokens = { hover: null, placeables: [] };
	globalThis.canvas = {
		ready: true,
		scene: { id: "realm", isRealm: true },
		mousePosition: hexCentre(g, hex(4, 5)),
		realm: { name: "realm" },
		tokens,
		activeLayer: tokens
	};
});

afterEach(() => {
	for (const key of ["Element", "ui", "canvas"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("onCompanyDoubleClick", () => {
	const company = (at) => ({ center: hexCentre(g, at), document: { parent: canvas.scene } });

	it("opens the hex the Company's Token stands in", () => {
		expect(onCompanyDoubleClick(company(hex(7, 2)))).toBe("opened");
		expect(openPlaces).toHaveBeenCalledWith({ sceneId: canvas.scene.id, hex: hex(7, 2) });
	});

	it("says the Company knows nothing of a hex it can't open", () => {
		openable = false;
		expect(onCompanyDoubleClick(company(hex(7, 2)))).toBeNull();
		expect(ui.notifications.info).toHaveBeenCalledWith(expect.stringContaining("travels.notVisited"));
	});

	it("does nothing while a Realm is drawn, or a hex is being asked for", () => {
		drawing = true;
		expect(onCompanyDoubleClick(company(hex(7, 2)))).toBeNull();
		drawing = false;
		taking = true;
		expect(onCompanyDoubleClick(company(hex(7, 2)))).toBeNull();
		expect(openPlaces).not.toHaveBeenCalled();
	});
});

describe("onTravelsDoubleClick", () => {
	it("opens the hex under the pointer on open ground", () => {
		expect(onTravelsDoubleClick(click())).toBe("opened");
		expect(openPlaces).toHaveBeenCalledWith({ sceneId: canvas.scene.id, hex: hex(4, 5) });
	});

	it("says the Company knows nothing of a hex it can't open", () => {
		openable = false;
		expect(onTravelsDoubleClick(click())).toBeNull();
		expect(ui.notifications.info).toHaveBeenCalledWith(expect.stringContaining("travels.notVisited"));
		expect(openPlaces).not.toHaveBeenCalled();
	});

	it("leaves a Token's own double-click alone", () => {
		const point = canvas.mousePosition;
		canvas.tokens.placeables = [{ visible: true, bounds: { contains: (x, y) => x === point.x && y === point.y } }];
		expect(onTravelsDoubleClick(click())).toBeNull();
		canvas.tokens.placeables = [];
		canvas.tokens.hover = {};
		expect(onTravelsDoubleClick(click())).toBeNull();
		expect(openPlaces).not.toHaveBeenCalled();
	});

	it("leaves the Company's Token to its own double-click", () => {
		const point = canvas.mousePosition;
		canvas.tokens.placeables = [{ isCompany: true, visible: true, bounds: { contains: (x, y) => x === point.x && y === point.y } }];
		expect(onTravelsDoubleClick(click())).toBeNull();
		expect(openPlaces).not.toHaveBeenCalled();
	});

	it("leaves other layers, the GM's Realm tools, a hex being asked for, a Realm being drawn, a window and the edge alone", () => {
		for (const layer of [canvas.realm, { name: "notes" }]) {
			canvas.activeLayer = layer;
			expect(onTravelsDoubleClick(click())).toBeNull();
		}
		canvas.activeLayer = canvas.tokens;
		taking = true;
		expect(onTravelsDoubleClick(click())).toBeNull();
		taking = false;
		drawing = true;
		expect(onTravelsDoubleClick(click())).toBeNull();
		drawing = false;
		expect(onTravelsDoubleClick(click("sidebar"))).toBeNull();
		canvas.mousePosition = { x: -500, y: -500 };
		expect(onTravelsDoubleClick(click())).toBeNull();
		canvas.scene = { id: "town" };
		expect(onTravelsDoubleClick(click())).toBeNull();
		expect(openPlaces).not.toHaveBeenCalled();
		expect(ui.notifications.info).not.toHaveBeenCalled();
	});
});
