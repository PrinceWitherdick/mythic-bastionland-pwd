import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import { WEATHER_PARTS } from "../../module/rules/weather.js";

/** The world's settings, the Scenes, and the button the picker is answered with. */
let values;
let scenes;
let answer;

vi.mock("../../module/apps/ui.js", () => ({ chooseDialog: vi.fn(async () => answer) }));
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));

const weather = await import("../../module/actions/weather.js");
const { chooseDialog } = await import("../../module/apps/ui.js");

/** A Scene keeping its FXMaster effects, and writing updates to them as Foundry would. */
function scene(name, effects = {}) {
	return {
		name,
		effects: { ...effects },
		getFlag(_scope, key) {
			return key === "effects" ? this.effects : undefined;
		},
		update: vi.fn(async function (changes) {
			for (const [path, value] of Object.entries(changes)) {
				const key = path.split(".").pop();
				if (key.startsWith("-=")) delete this.effects[key.slice(2)];
				else this.effects[key] = value;
			}
		})
	};
}

/** The keys of ours on a Scene. */
const ours = (target) => Object.keys(target.effects).filter((key) => key.startsWith("bastionland-weather-")).sort();

beforeEach(() => {
	values = { weather: "storm" };
	answer = null;
	vi.mocked(chooseDialog).mockClear();
	const active = scene("Realm");
	scenes = [active, scene("Site", { "bastionland-weather-rain-rain": { type: "rain", options: {} }, core_embers: { type: "embers", options: {} } })];
	scenes.active = active;
	globalThis.foundry = { utils: { debounce: (fn) => fn } };
	globalThis.Hooks = { callAll: vi.fn() };
	globalThis.game = {
		user: { isGM: true },
		users: { activeGM: { isSelf: true } },
		modules: new Map([["fxmaster", { active: true }]]),
		scenes,
		settings: {
			register: vi.fn(),
			get: vi.fn((_namespace, key) => values[key]),
			set: vi.fn(async (_namespace, key, value) => {
				values[key] = value;
			})
		}
	};
});

afterEach(() => {
	delete globalThis.foundry;
	delete globalThis.Hooks;
	delete globalThis.game;
});

describe("drawing the weather", () => {
	it("puts it on the active Scene, and takes ours off the rest", async () => {
		await weather.drawWeather();
		expect(ours(scenes[0])).toEqual(["bastionland-weather-storm-clouds-tint", "bastionland-weather-storm-hail", "bastionland-weather-storm-rain"]);
		expect(ours(scenes[1])).toEqual([]);
		expect(scenes[1].effects.core_embers).toBeDefined();
	});

	it("leaves out the parts the world switched off", async () => {
		values.weatherFxHail = false;
		values.weatherFxStormTint = false;
		await weather.drawWeather();
		expect(ours(scenes[0])).toEqual(["bastionland-weather-storm-clouds", "bastionland-weather-storm-rain"]);
		expect(scenes[0].effects["bastionland-weather-storm-clouds"].options.tint).toBeUndefined();
	});

	it("takes it off every Scene when it's off the map, and keeps it set", async () => {
		await weather.drawWeather();
		values.weatherOnMap = false;
		await weather.drawWeather();
		expect(ours(scenes[0])).toEqual([]);
		expect(weather.getWeather()).toBe("storm");
	});

	it("draws nothing without FXMaster", async () => {
		game.modules = new Map();
		await weather.drawWeather();
		expect(scenes[0].update).not.toHaveBeenCalled();
	});
});

describe("taking the weather off the map", () => {
	it("is a world setting, on until the GM takes it off", () => {
		weather.registerWeatherSetting();
		const [, , config] = game.settings.register.mock.calls.find(([namespace, key]) => namespace === SYSTEM_ID && key === "weatherOnMap");
		expect(config).toMatchObject({ scope: "world", type: Boolean, default: true });
		expect(weather.weatherPaused()).toBe(false);
	});

	it("redraws the map and the banner when it changes", async () => {
		weather.registerWeatherSetting();
		const [, , config] = game.settings.register.mock.calls.find(([, key]) => key === "weatherOnMap");
		values.weatherOnMap = false;
		config.onChange(false);
		await vi.waitFor(() => expect(scenes[1].update).toHaveBeenCalled());
		expect(Hooks.callAll).toHaveBeenCalledWith(weather.WEATHER_HOOK, "storm");
	});

	it("shows on the banner", () => {
		expect(weather.weatherView().paused).toBe(false);
		values.weatherOnMap = false;
		expect(weather.weatherView()).toMatchObject({ key: "storm", paused: true });
	});

	it("is for GMs alone", async () => {
		game.user.isGM = false;
		await weather.setWeatherPaused(true);
		expect(game.settings.set).not.toHaveBeenCalled();
	});
});

describe("the parts of the sky", () => {
	it("are world settings, each on until switched off, that redraw the map", async () => {
		weather.registerWeatherSetting();
		for (const { setting } of WEATHER_PARTS) {
			const [, , config] = game.settings.register.mock.calls.find(([, key]) => key === setting);
			expect(config).toMatchObject({ scope: "world", type: Boolean, default: true });
		}
		const [, , hail] = game.settings.register.mock.calls.find(([, key]) => key === "weatherFxHail");
		hail.onChange(false);
		await vi.waitFor(() => expect(scenes[0].update).toHaveBeenCalled());
	});

	it("are redrawn by the active GM alone", () => {
		game.users.activeGM.isSelf = false;
		weather.registerWeatherSetting();
		const [, , hail] = game.settings.register.mock.calls.find(([, key]) => key === "weatherFxHail");
		hail.onChange(false);
		expect(scenes[0].update).not.toHaveBeenCalled();
	});
});

describe("the weather picker", () => {
	const actions = () => vi.mocked(chooseDialog).mock.calls[0][0].buttons.map((button) => button.action);

	it("offers to take the weather off the map with FXMaster on", async () => {
		await weather.pickWeather();
		expect(actions()).toContain("pause");
	});

	it("offers to put it back once it's off", async () => {
		values.weatherOnMap = false;
		await weather.pickWeather();
		expect(actions()).toContain("resume");
		expect(actions()).not.toContain("pause");
	});

	it("offers neither without FXMaster", async () => {
		game.modules = new Map();
		await weather.pickWeather();
		expect(actions()).not.toContain("pause");
		expect(actions()).not.toContain("resume");
	});

	it("takes the weather off the map, and keeps it", async () => {
		answer = "pause";
		expect(await weather.pickWeather()).toBeNull();
		expect(values.weatherOnMap).toBe(false);
		expect(values.weather).toBe("storm");
		answer = "resume";
		await weather.pickWeather();
		expect(values.weatherOnMap).toBe(true);
	});

	it("sets a sky picked", async () => {
		answer = "fog";
		expect(await weather.pickWeather()).toBe("fog");
		expect(values.weather).toBe("fog");
		expect(ours(scenes[0])).toEqual(["bastionland-weather-fog-fog"]);
	});
});
