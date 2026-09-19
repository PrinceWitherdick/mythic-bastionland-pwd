import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../module/system-id.js";

let weather;
let values;

beforeEach(async () => {
	vi.resetModules();
	values = {};
	globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (Base) => class extends Base {}, DialogV2: {} } } };
	globalThis.Hooks = { callAll: vi.fn() };
	globalThis.game = {
		modules: new Map([["fxmaster", { active: true }]]),
		settings: {
			register: vi.fn(),
			get: vi.fn((_namespace, key) => {
				if (!(key in values)) throw new Error(`${key} is not registered`);
				return values[key];
			})
		}
	};
	weather = await import("../module/actions/weather.js");
});

afterEach(() => {
	delete globalThis.foundry;
	delete globalThis.Hooks;
	delete globalThis.game;
});

describe("the weather button", () => {
	it("is a setting of each GM's own, shown until they hide it", () => {
		weather.registerWeatherSetting();
		const [, , config] = game.settings.register.mock.calls.find(([namespace, key]) => namespace === SYSTEM_ID && key === "weatherButton");
		expect(config).toMatchObject({ scope: "client", config: true, type: Boolean, default: true });
	});

	it("shows with FXMaster on, whether or not the setting can be read yet", () => {
		expect(weather.weatherButtonShown()).toBe(true);
		values.weatherButton = true;
		expect(weather.weatherButtonShown()).toBe(true);
	});

	it("hides when the GM says so, though FXMaster is on", () => {
		values.weatherButton = false;
		expect(weather.weatherShown()).toBe(true);
		expect(weather.weatherButtonShown()).toBe(false);
	});

	it("never shows without FXMaster", () => {
		game.modules = new Map();
		values.weatherButton = true;
		expect(weather.weatherButtonShown()).toBe(false);
	});

	it("draws the banner again when it's changed", () => {
		values.weather = "rain";
		weather.registerWeatherSetting();
		const [, , config] = game.settings.register.mock.calls.find(([, key]) => key === "weatherButton");
		config.onChange(false);
		expect(Hooks.callAll).toHaveBeenCalledWith(weather.WEATHER_HOOK, "rain");
	});
});
