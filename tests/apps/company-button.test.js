import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REALM_FLAG } from "../../module/rules/realm.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";

/** Where the map is on screen, so the button has somewhere to be held. Put back before each test. */
const MAP = Object.freeze({ left: 200, top: 300, right: 800, bottom: 900 });
const map = { ...MAP };

vi.mock("../../module/apps/map-screen.js", () => ({
	mapPanelScale: () => 1,
	mapOnScreen: () => map
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
/** The scene navigation, stretched down half the screen however thin its bar of scenes is. */
let navigation;
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
	navigation = {
		menus: [{ bottom: 56, height: 36 }, { bottom: 0, height: 0 }],
		getBoundingClientRect: () => ({ top: 0, bottom: 540, height: 540 }),
		querySelectorAll: () => navigation.menus.map((menu) => ({ getBoundingClientRect: () => menu }))
	};
	globalThis.document = {
		createElement: element,
		getElementById: (id) => ({ interface: interfaceElement, "scene-navigation": navigation }[id] ?? null)
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

	it("follows the map as the canvas pans, without making a button of its own", () => {
		registerCompanyButton();
		hooks.canvasPan.forEach((fn) => fn());
		expect(shown()).toBeUndefined();

		showCompanyButton();
		shown().style.left = "";
		hooks.canvasPan.forEach((fn) => fn());
		expect(shown().style.left).toBe(`${Math.round(500 - 80)}px`);
	});
});

describe("keeping out of the way", () => {
	it("measures the scene navigation by its scenes, not by its element, which is stretched down half the screen", () => {
		// The map panned up under the navigation: the button drops below the bar of scenes, not below the whole element.
		map.top = 20;
		showCompanyButton();
		expect(shown().style.top).toBe(`${56 + 12}px`);

		// With no scenes shown, the navigation holds nothing back.
		navigation.menus = [{ bottom: 0, height: 0 }];
		closeCompanyButton();
		showCompanyButton();
		expect(shown().style.top).toBe(`${12}px`);
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
