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
	globalThis.game = {
		user: { isGM },
		scenes,
		tours: {
			register: vi.fn((namespace, id, tour) => { registered = { namespace, id, tour }; }),
			get: (key) => (registered && key === `${registered.namespace}.${registered.id}` ? registered.tour : undefined)
		}
	};
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
