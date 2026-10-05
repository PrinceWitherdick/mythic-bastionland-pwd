import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import { withBookText } from "../../module/rules/book-text.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const lang = withBookText(JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8")));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);

let tours;
let registered;
/** Every Tour registered, by its key in game.tours. */
let registry;

/** Foundry's Tour, as far as the Realm's reaches into it. */
class Tour {
	static tourInProgress = false;

	constructor(config) {
		this.config = config;
		this.stepIndex = 0;
	}

	get currentStep() {
		return this.config.steps[this.stepIndex] ?? null;
	}

	async _preStep() {}
}

/**
 * A sidebar and its Scenes tab.
 * @param {object} [options]
 * @param {boolean} [options.expanded] Whether the sidebar is open.
 * @param {boolean} [options.rendered] Whether the Scenes tab has been drawn yet.
 */
function installSidebar({ expanded = true, rendered = true } = {}) {
	const sidebar = { expanded };
	const scenes = {
		rendered,
		activate: vi.fn(() => { sidebar.expanded = true; }),
		render: vi.fn(async () => { scenes.rendered = true; })
	};
	globalThis.ui = { sidebar, scenes };
	return scenes;
}

/**
 * A world as the Tour sees it.
 * @param {object} [options]
 * @param {boolean} [options.isGM]
 * @param {object[]} [options.scenes]
 */
function installWorld({ isGM = true, scenes = [] } = {}) {
	registered = null;
	registry = new Map();
	globalThis.game = {
		user: { isGM },
		scenes,
		tours: {
			register: vi.fn((namespace, id, tour) => {
				registry.set(`${namespace}.${id}`, tour);
				// The first, where Realms are made, is the one most of these tests walk.
				if (id === "newRealm") registered = { namespace, id, tour };
			}),
			get: (key) => registry.get(key)
		}
	};
}

/**
 * The column of buttons beside the sidebar, as the Tour looks for it.
 * @param {boolean|null} hidden Whether it's hidden, or null for none drawn.
 */
function installButtons(hidden) {
	const column = hidden === null ? null : { hidden };
	globalThis.document = { querySelector: (selector) => (selector === "#bastionland-travels-buttons" ? column : null) };
}

beforeAll(async () => {
	globalThis.foundry = { nue: { Tour } };
	tours = await import("../../module/apps/realm-tour.js");
});

beforeEach(() => {
	Tour.tourInProgress = false;
	installWorld();
	installSidebar();
});

afterEach(() => {
	vi.useRealTimers();
	delete globalThis.game;
	delete globalThis.ui;
	delete globalThis.document;
});

describe("where Realms are made", () => {
	it("is a Foundry Tour under the system's name, for GMs, listed to be played again", () => {
		tours.registerRealmTour();
		expect(game.tours.register).toHaveBeenCalledWith(SYSTEM_ID, tours.REALM_TOUR, expect.any(Tour));
		expect(registered.tour.config).toMatchObject({ restricted: true, display: true });
	});

	it("points at the Scenes tab, then at its New Realm button", () => {
		const [scenes, newRealm] = tours.REALM_TOUR_CONFIG.steps;
		expect(scenes.selector).toBe("#sidebar-tabs [data-tab='scenes']");
		expect(newRealm.selector).toBe("#scenes .bastionland-new-realm");
		expect(tours.REALM_TOUR_CONFIG.steps.every((step) => step.sidebarTab === "scenes")).toBe(true);
		// The class the Scenes directory's button is given.
		const realm = readFileSync(join(root, "module/actions/realm.js"), "utf8");
		expect(realm).toContain(`className: "bastionland-new-realm"`);
	});

	it("says every word from the language file", () => {
		const { title, description, steps } = tours.REALM_TOUR_CONFIG;
		const keys = [title, description, ...steps.flatMap((step) => [step.title, step.content])];
		for (const key of keys) expect(typeof lookup(key), key).toBe("string");
	});

	it("opens the step's sidebar tab before drawing it", async () => {
		const scenes = installSidebar();
		tours.registerRealmTour();
		await registered.tour._preStep();
		expect(scenes.activate).toHaveBeenCalled();
		expect(scenes.render).not.toHaveBeenCalled();
	});

	it("draws a tab that hasn't been drawn yet", async () => {
		const scenes = installSidebar({ rendered: false });
		await tours.showSidebarTab("scenes");
		expect(scenes.render).toHaveBeenCalledWith({ force: true });
	});

	it("waits for a closed sidebar to slide open before its step is measured", async () => {
		vi.useFakeTimers();
		installSidebar({ expanded: false });
		let shown = false;
		tours.showSidebarTab("scenes").then(() => { shown = true; });
		await vi.advanceTimersByTimeAsync(100);
		expect(shown).toBe(false);
		await vi.advanceTimersByTimeAsync(300);
		expect(shown).toBe(true);
	});

	it("walks a GM through it", async () => {
		tours.registerRealmTour();
		registered.tour.start = vi.fn(async () => {});
		await tours.showWhereRealmsAreMade();
		expect(registered.tour.start).toHaveBeenCalledTimes(1);
	});

	it("leaves players, worlds with a Realm, and other Tours alone", async () => {
		const realmScene = { flags: { [SYSTEM_ID]: { realm: { cols: 12 } } } };
		const cases = [
			["a player", () => installWorld({ isGM: false })],
			["a Realm made", () => installWorld({ scenes: [{ flags: {} }, realmScene] })],
			["another Tour on screen", () => { installWorld(); Tour.tourInProgress = true; }]
		];
		for (const [name, install] of cases) {
			Tour.tourInProgress = false;
			install();
			tours.registerRealmTour();
			registered.tour.start = vi.fn(async () => {});
			await tours.showWhereRealmsAreMade();
			expect(registered.tour.start, name).not.toHaveBeenCalled();
		}
	});

	it("says in the console when the Tour can't be shown, and goes on", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		tours.registerRealmTour();
		registered.tour.start = vi.fn(async () => { throw new Error("The expected targetElement does not exist"); });
		await expect(tours.showWhereRealmsAreMade()).resolves.toBeUndefined();
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});
});

describe("the Realm's buttons", () => {
	const realmScene = { flags: { [SYSTEM_ID]: { realm: { cols: 12 } } } };
	const buttonsTour = () => registry.get(`${SYSTEM_ID}.${tours.REALM_BUTTONS_TOUR}`);

	it("is a second Foundry Tour under the system's name, for GMs, listed to be played again", () => {
		tours.registerRealmTour();
		expect(game.tours.register).toHaveBeenCalledWith(SYSTEM_ID, tours.REALM_BUTTONS_TOUR, expect.any(Tour));
		expect(buttonsTour().config).toMatchObject({ restricted: true, display: true });
	});

	it("points at Mark the Hexes Visited, then at Places, in the column beside the sidebar", () => {
		const [marks, places] = tours.REALM_BUTTONS_TOUR_CONFIG.steps;
		expect(marks.selector).toBe("#bastionland-travels-buttons [data-action='visitedMarks']");
		expect(places.selector).toBe("#bastionland-travels-buttons [data-action='places']");
		// The id and actions the column's buttons are given.
		const controls = readFileSync(join(root, "module/canvas/travels-controls.js"), "utf8");
		expect(controls).toContain(`TRAVELS_BUTTONS_ID = "bastionland-travels-buttons"`);
		expect(controls).toContain(`{ marks: "visitedMarks", places: "places" }`);
	});

	it("says every word from the language file", () => {
		const { title, description, steps } = tours.REALM_BUTTONS_TOUR_CONFIG;
		const keys = [title, description, ...steps.flatMap((step) => [step.title, step.content])];
		for (const key of keys) expect(typeof lookup(key), key).toBe("string");
	});

	it("walks a GM through them once the world's first Realm is in view", async () => {
		installWorld({ scenes: [{ flags: {} }, realmScene] });
		installButtons(false);
		tours.registerRealmTour();
		buttonsTour().start = vi.fn(async () => {});
		await tours.showRealmButtons();
		expect(buttonsTour().start).toHaveBeenCalledTimes(1);
	});

	it("leaves players, second Realms, hidden buttons and other Tours alone", async () => {
		const cases = [
			["a player", () => { installWorld({ isGM: false, scenes: [realmScene] }); installButtons(false); }],
			["a second Realm", () => { installWorld({ scenes: [realmScene, realmScene] }); installButtons(false); }],
			["buttons hidden", () => { installWorld({ scenes: [realmScene] }); installButtons(true); }],
			["no buttons drawn", () => { installWorld({ scenes: [realmScene] }); installButtons(null); }],
			["another Tour on screen", () => { installWorld({ scenes: [realmScene] }); installButtons(false); Tour.tourInProgress = true; }]
		];
		for (const [name, install] of cases) {
			Tour.tourInProgress = false;
			install();
			tours.registerRealmTour();
			buttonsTour().start = vi.fn(async () => {});
			await tours.showRealmButtons();
			expect(buttonsTour().start, name).not.toHaveBeenCalled();
		}
	});

	it("says in the console when the Tour can't be shown, and goes on", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		installWorld({ scenes: [realmScene] });
		installButtons(false);
		tours.registerRealmTour();
		buttonsTour().start = vi.fn(async () => { throw new Error("The expected targetElement does not exist"); });
		await expect(tours.showRealmButtons()).resolves.toBeUndefined();
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});
});
