import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REALM_FLAG } from "../../module/rules/realm.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";

/** Where the map is on screen, so the button has somewhere to be held. Put back before each test. */
const MAP = Object.freeze({ left: 200, top: 300, right: 800, bottom: 900 });
const map = { ...MAP };

/** The foot of the scene navigation, which map-screen measures for the button and map-screen's own tests cover. */
const nav = { floor: 56, forgotten: 0 };

vi.mock("../../module/apps/map-screen.js", () => ({
	mapPanelScale: () => 1,
	mapOnScreen: () => map,
	navigationFloor: () => nav.floor,
	forgetNavigationFloor: () => (nav.forgotten += 1),
	// Just the hooks of map-screen's own follower, which its own tests cover, taken off again as it stops.
	followMap: (place) => {
		const remeasure = () => {
			nav.forgotten += 1;
			place();
		};
		const followed = [["canvasPan", place], ["renderSceneNavigation", remeasure], ["collapseSceneNavigation", remeasure]];
		for (const [name, fn] of followed) Hooks.on(name, fn);
		return () => {
			for (const [name, fn] of followed) hooks[name] = hooks[name].filter((hook) => hook !== fn);
		};
	}
}));

const placement = { placing: false, started: 0, takes: true };
vi.mock("../../module/canvas/company-placement.js", () => ({
	COMPANY_PLACING_HOOK: "test.companyPlacing",
	isPlacingCompany: () => placement.placing,
	startCompanyPlacement: async () => {
		placement.started += 1;
		// A Company that can’t be picked up — no picture to carry, a GM who moved on
		// while it loaded — is refused without ever reaching the placing hook.
		if (!placement.takes) return false;
		placement.placing = true;
		return true;
	}
}));

const { closeCompanyButton, registerCompanyButton, showCompanyButton } = await import("../../module/apps/CompanyButton.js");

const g = realmGeometry();

/** Just enough of an element for a button held over the map. */
function element(tag) {
	return {
		tag,
		dataset: {},
		style: {},
		innerHTML: "",
		offsetWidth: 160,
		offsetHeight: 32,
		listeners: {},
		addEventListener(type, handler) {
			this.listeners[type] = handler;
		},
		remove() {
			interfaceElement.children = interfaceElement.children.filter((child) => child !== this);
		}
	};
}

let interfaceElement;
let scene;
/** @type {Record<string, Function[]>} */
let hooks;

/** @returns {object|undefined} The button, while it's up. */
const shown = () => interfaceElement.children[0];

/** The Company's own Token, as the Scene keeps it. */
const companyToken = { parent: { id: "realm1" }, getFlag: (scope, key) => scope === SYSTEM_ID && key === "company" };

beforeEach(() => {
	placement.placing = false;
	placement.started = 0;
	placement.takes = true;
	Object.assign(map, MAP);
	nav.floor = 56;
	nav.forgotten = 0;
	interfaceElement = { children: [], append(child) { this.children.push(child); } };
	scene = {
		id: "realm1",
		flags: { [SYSTEM_ID]: { [REALM_FLAG]: { size: g.size, cols: g.cols, rows: g.rows } } },
		tokens: [],
		getFlag: () => undefined
	};
	hooks = {};

	globalThis.game = { user: { isGM: true }, i18n: { localize: (key) => key, format: (key) => key } };
	globalThis.canvas = { ready: true, scene };
	globalThis.foundry = { utils: { escapeHTML: (text) => text } };
	globalThis.Hooks = { on: (name, fn) => (hooks[name] ??= []).push(fn), off: vi.fn(), callAll: vi.fn() };
	globalThis.document = {
		createElement: element,
		getElementById: (id) => (id === "interface" ? interfaceElement : null)
	};
});

afterEach(() => {
	closeCompanyButton();
	for (const key of ["game", "canvas", "foundry", "Hooks", "document"]) delete globalThis[key];
	vi.useRealTimers();
});

describe("the Place the Company button", () => {
	it("stands over the middle of the map's top edge, for a Realm with no Company on it", () => {
		showCompanyButton();
		expect(shown()).toBeTruthy();
		expect(shown().dataset.tooltip).toBe("bastionland.company.placing.hint");
		// Centred over the map, above its top edge.
		expect(shown().style.left).toBe(`${Math.round(500 - 80)}px`);
		expect(shown().style.top).toBe(`${300 - 12 - 32}px`);
	});

	it("keeps out of the way of a Realm whose Company is already on the map", () => {
		scene.tokens = [companyToken];
		showCompanyButton();
		expect(shown()).toBeUndefined();
	});

	it("is the Referee's alone, and only over a Realm", () => {
		game.user.isGM = false;
		showCompanyButton();
		expect(shown()).toBeUndefined();

		game.user.isGM = true;
		canvas.scene = { id: "other", flags: {}, tokens: [], getFlag: () => undefined };
		showCompanyButton();
		expect(shown()).toBeUndefined();
	});

	it("waits while Creating a Realm is open over a Realm being drawn, whose last page places the Company", () => {
		const drawing = { ...scene.flags[SYSTEM_ID], drawing: true };
		scene.flags[SYSTEM_ID] = drawing;
		scene.getFlag = (scope, key) => (scope === SYSTEM_ID ? drawing[key] : undefined);
		const instances = new Map([["bastionland-realm-drawing", {}]]);
		foundry.applications = { instances };
		showCompanyButton();
		expect(shown()).toBeUndefined();

		// Closed early, the button takes the Company up instead.
		instances.clear();
		showCompanyButton();
		expect(shown()).toBeTruthy();

		// Once the Realm is finished, the window has nothing to do with it.
		drawing.drawing = false;
		instances.set("bastionland-realm-drawing", {});
		showCompanyButton();
		expect(shown()).toBeTruthy();
	});

	it("hands the Company over on a click, and stands down while it's carried", async () => {
		showCompanyButton();
		await shown().listeners.click();
		expect(placement.started).toBe(1);
		expect(interfaceElement.children).toHaveLength(0);

		// Asked again while it's in hand, it stays down.
		showCompanyButton();
		expect(shown()).toBeUndefined();
	});

	it("stands back up where the Company can't be picked up after all", async () => {
		placement.takes = false;
		showCompanyButton();
		await shown().listeners.click();
		expect(placement.started).toBe(1);
		// Nothing was taken up and no hook fired, so the way back onto the map is still there.
		expect(shown()).toBeTruthy();
	});

	it("comes back when the Company is given up, and goes as its Token arrives", () => {
		vi.useFakeTimers();
		registerCompanyButton();
		showCompanyButton();
		expect(shown()).toBeTruthy();

		// Carried off, then given up again: the placing hook is what it watches.
		placement.placing = true;
		hooks["test.companyPlacing"].forEach((fn) => fn());
		expect(shown()).toBeUndefined();
		placement.placing = false;
		hooks["test.companyPlacing"].forEach((fn) => fn());
		expect(shown()).toBeTruthy();

		// A Token standing for the Company takes the button away, and deleting it brings it back.
		scene.tokens = [companyToken];
		hooks.createToken.forEach((fn) => fn(companyToken));
		vi.runAllTimers();
		expect(shown()).toBeUndefined();

		scene.tokens = [];
		hooks.deleteToken.forEach((fn) => fn(companyToken));
		vi.runAllTimers();
		expect(shown()).toBeTruthy();
	});

	it("follows the map as the canvas pans only while it's up, without making a button of its own", () => {
		registerCompanyButton();
		expect(hooks.canvasPan ?? []).toHaveLength(0);
		expect(shown()).toBeUndefined();

		showCompanyButton();
		shown().style.left = "";
		hooks.canvasPan.forEach((fn) => fn());
		expect(shown().style.left).toBe(`${Math.round(500 - 80)}px`);
	});
});

describe("keeping out of the way", () => {
	it("drops below the scene navigation where the map has panned up under it", () => {
		map.top = 20;
		showCompanyButton();
		expect(shown().style.top).toBe(`${56 + 12}px`);

		// With no scenes shown, the navigation holds nothing back.
		nav.floor = 0;
		closeCompanyButton();
		showCompanyButton();
		expect(shown().style.top).toBe(`${12}px`);
	});

	it("measures the navigation again once it has been drawn, folded away or rescaled", () => {
		registerCompanyButton();
		showCompanyButton();
		nav.forgotten = 0;
		for (const name of ["renderSceneNavigation", "collapseSceneNavigation"]) hooks[name].forEach((fn) => fn());
		expect(nav.forgotten).toBe(2);
	});
});

describe("a button not yet laid out", () => {
	it("is still held over the map, and measured again on the next pan", () => {
		registerCompanyButton();
		const laidOut = element;
		globalThis.document.createElement = (tag) => Object.assign(laidOut(tag), { offsetWidth: 0, offsetHeight: 0 });
		showCompanyButton();
		// Taken for a button of about the right size rather than left where the interface would drop it.
		expect(shown().style.top).toBe(`${300 - 12 - 34}px`);

		Object.assign(shown(), { offsetWidth: 160, offsetHeight: 32 });
		hooks.canvasPan.forEach((fn) => fn());
		expect(shown().style.top).toBe(`${300 - 12 - 32}px`);
		expect(shown().style.left).toBe(`${Math.round(500 - 80)}px`);
	});
});
