import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

let settings;
let opened;
let welcome;
let worldSetup;

/**
 * A world as the Welcome sees it at load.
 * @param {object} [options]
 * @param {boolean} [options.isGM]
 * @param {object} [options.done]     Setup steps done on earlier loads.
 * @param {number} [options.actors]
 * @param {number} [options.scenes]
 * @param {number} [options.journal]
 */
function installWorld({ isGM = true, done = {}, actors = 0, scenes = 0, journal = 0 } = {}) {
	const user = { isGM, isSelf: true };
	settings = {};
	globalThis.game = {
		user,
		users: { activeGM: user },
		actors: { size: actors },
		scenes: { size: scenes },
		journal: { size: journal },
		settings: {
			register: (_namespace, key, config) => { settings[key] = config.default; },
			registerMenu: vi.fn(),
			get: (namespace, key) => (namespace === SYSTEM_ID ? settings[key] : undefined),
			set: vi.fn(async (_namespace, key, value) => { settings[key] = value; })
		}
	};
	worldSetup.registerWorldSetup();
	welcome.registerWelcome();
	settings.worldSetupDone = { ...done };
}

/** The ready hook's part: world setup with the Welcome's step first, then the greeting. */
async function load() {
	await worldSetup.runWorldSetup([
		{ key: welcome.WELCOME_STEP, run: welcome.welcomeOnlyNewWorlds },
		{ key: "rulebookMacro", run: async () => true }
	]);
	welcome.greetGM();
}

beforeAll(async () => {
	globalThis.foundry = {
		applications: {
			api: {
				ApplicationV2: class {
					render() {
						opened.push(this);
						return this;
					}

					_onClose() {}
				},
				HandlebarsApplicationMixin: (Base) => class extends Base {}
			}
		}
	};
	worldSetup = await import("../../module/world-setup.js");
	welcome = await import("../../module/apps/Welcome.js");
});

beforeEach(() => {
	opened = [];
	installWorld();
});

afterEach(() => {
	delete globalThis.game;
});

describe("the Welcome", () => {
	it("greets the GM of a brand-new world, and again next load until it's been closed once", async () => {
		await load();
		expect(opened).toHaveLength(1);
		expect(settings.showWelcome).toBe(true);

		await load();
		expect(opened).toHaveLength(2);

		opened.at(-1)._onClose({});
		expect(settings.showWelcome).toBe(false);
		await load();
		expect(opened).toHaveLength(2);

		// Opened again by hand and closed, it writes nothing more.
		game.settings.set.mockClear();
		welcome.openWelcome()._onClose({});
		expect(game.settings.set).not.toHaveBeenCalled();
	});

	it("stays away from a world that was in play before it existed", async () => {
		for (const world of [{ done: { rulebookMacro: true } }, { actors: 3 }, { scenes: 1 }, { journal: 2 }]) {
			opened = [];
			installWorld(world);
			await load();
			expect(settings.showWelcome, JSON.stringify(world)).toBe(false);
			expect(opened, JSON.stringify(world)).toHaveLength(0);
		}
	});

	it("never greets a player", async () => {
		installWorld({ isGM: false, done: { welcome: true } });
		welcome.greetGM();
		expect(opened).toHaveLength(0);
		expect(welcome.openWelcome()).toBeNull();
	});

	it("waits for world setup to decide before greeting anyone", () => {
		welcome.greetGM();
		expect(opened).toHaveLength(0);
	});

	it("is offered among the system's settings to GMs only", () => {
		expect(game.settings.registerMenu).toHaveBeenCalledWith(SYSTEM_ID, "welcome", expect.objectContaining({
			type: welcome.Welcome,
			restricted: true
		}));
	});
});
