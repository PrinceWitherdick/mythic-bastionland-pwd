import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { forgetNavigationFloor, hotbarFloor, navigationFloor, panelScreen } from "../../module/apps/map-screen.js";

/**
 * The parts of Foundry's interface the panels held at the sides of the screen
 * are measured against. Each is a rectangle, or null where that part isn't on
 * screen at all.
 * @type {Record<string, object|null>}
 */
let parts;

/** The scene navigation's menus of scenes, each of which collapses to nothing when it's empty or folded away. */
let menus;

/** Which of the parts Foundry hands over on `ui`, rather than only by element id. */
let onUi;

const rect = (part) => ({ left: 0, right: 0, top: 0, bottom: 0, ...part });

/** @returns {object|null} Just enough of an element to be measured, and to be asked for the navigation's menus. */
function partElement(name) {
	const part = parts[name];
	if (!part) return null;
	return {
		getBoundingClientRect: () => rect(part),
		querySelectorAll: () => (menus ?? []).map((menu) => ({ getBoundingClientRect: () => rect(menu) }))
	};
}

beforeEach(() => {
	menus = [{ bottom: 56, height: 36 }, { bottom: 0, height: 0 }];
	onUi = ["controls", "sidebar", "hotbar", "nav"];
	parts = {
		controls: { left: 0, right: 120, width: 120, height: 400 },
		sidebar: { left: 1600, right: 1920, width: 320, height: 900 },
		hotbar: { top: 1000, bottom: 1060, width: 700, height: 60 },
		nav: { top: 0, bottom: 540, width: 800, height: 540 }
	};
	/** The element ids each part has gone by, so a lookup that skips `ui` still finds it. */
	const byId = { "scene-controls": "controls", sidebar: "sidebar", hotbar: "hotbar", "scene-navigation": "nav" };

	globalThis.window = { innerWidth: 1920, innerHeight: 1080 };
	globalThis.ui = Object.fromEntries(onUi.map((name) => [name, { get element() { return onUi.includes(name) ? partElement(name) : null; } }]));
	globalThis.document = {
		body: { style: { getPropertyValue: () => "" } },
		getElementById: (id) => (id in byId ? partElement(byId[id]) : null)
	};
	forgetNavigationFloor();
});

afterEach(() => {
	forgetNavigationFloor();
	for (const key of ["window", "ui", "document"]) delete globalThis[key];
});

describe("navigationFloor", () => {
	it("measures the navigation by its scenes, not by its element, which is stretched down half the screen", () => {
		expect(navigationFloor()).toBe(56);
	});

	it("holds nothing back with no scenes shown, or no navigation at all", () => {
		menus = [{ bottom: 0, height: 0 }];
		forgetNavigationFloor();
		expect(navigationFloor()).toBe(0);

		parts.nav = null;
		forgetNavigationFloor();
		expect(navigationFloor()).toBe(0);
	});

	it("keeps what it measured until the navigation itself has changed", () => {
		expect(navigationFloor()).toBe(56);
		menus = [{ bottom: 200, height: 40 }];
		expect(navigationFloor()).toBe(56);
		forgetNavigationFloor();
		expect(navigationFloor()).toBe(200);
	});
});

describe("panelScreen", () => {
	it("leaves the tool palette, the sidebar, the navigation and the hotbar their room", () => {
		expect(panelScreen()).toEqual({ left: 120, top: 56, right: 1600, bottom: 1000 });
	});

	it("finds each part by its element id where this Foundry doesn't hand it over on ui", () => {
		onUi = [];
		expect(panelScreen()).toEqual({ left: 120, top: 56, right: 1600, bottom: 1000 });
	});

	it("leaves a panel somewhere it can be seen where a part of the interface can't be found at all", () => {
		parts.controls = null;
		parts.sidebar = null;
		parts.hotbar = null;
		expect(panelScreen()).toMatchObject({ left: 0, right: 1920, bottom: 1080 });
	});

	it("never lets one edge claim more than a fifth of the screen, however it measures", () => {
		// Wrappers stretched across the page rather than down the sides of it, and a
		// navigation whose menus reach halfway down: none of them may hide a panel.
		parts.controls = { left: 0, right: 1400, width: 1400, height: 900 };
		parts.sidebar = { left: 600, right: 1920, width: 1320, height: 900 };
		parts.hotbar = { top: 200, bottom: 1080, width: 700, height: 880 };
		menus = [{ bottom: 700, height: 40 }];
		forgetNavigationFloor();
		expect(panelScreen()).toEqual({ left: 384, top: 216, right: 1536, bottom: 864 });
	});
});

describe("hotbarFloor", () => {
	it("leaves the foot of the window where the hotbar is hidden away", () => {
		parts.hotbar = { top: 1000, bottom: 1060, width: 700, height: 0 };
		expect(hotbarFloor()).toBe(1080);
	});
});
