import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../module/system-id.js";
import { isSetupDone, markSetupDone, registerWorldSetup, runWorldSetup } from "../module/world-setup.js";

let settings;

function installWorld({ isGM = true, activeGM = true, done = {} } = {}) {
	const user = { isGM, isSelf: true };
	settings = {};
	globalThis.game = {
		user,
		users: { activeGM: activeGM ? user : { isSelf: false } },
		settings: {
			register: (_namespace, key, config) => { settings[key] = config.default; },
			get: (namespace, key) => (namespace === SYSTEM_ID ? settings[key] : undefined),
			set: vi.fn(async (_namespace, key, value) => { settings[key] = value; })
		}
	};
	registerWorldSetup();
	settings.worldSetupDone = done;
}

beforeEach(() => installWorld());

afterEach(() => {
	delete globalThis.game;
});

describe("runWorldSetup", () => {
	it("runs each step not yet done, in order, and remembers it", async () => {
		const order = [];
		installWorld({ done: { old: true } });
		await runWorldSetup([
			{ key: "old", run: async () => order.push("old") },
			{ key: "first", run: async () => { order.push("first"); } },
			{ key: "second", run: async () => { order.push("second"); } }
		]);
		expect(order).toEqual(["first", "second"]);
		expect(settings.worldSetupDone).toEqual({ old: true, first: true, second: true });
	});

	it("tries a step again next load when it can't be done yet or fails", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		await runWorldSetup([
			{ key: "waiting", run: async () => false },
			{ key: "broken", run: async () => { throw new Error("no"); } },
			{ key: "fine", run: async () => true }
		]);
		expect(isSetupDone("waiting")).toBe(false);
		expect(isSetupDone("broken")).toBe(false);
		expect(isSetupDone("fine")).toBe(true);
		expect(error).toHaveBeenCalledOnce();
		error.mockRestore();
	});

	it("does nothing for players or a GM who isn't the active GM", async () => {
		for (const options of [{ isGM: false }, { activeGM: false }]) {
			installWorld(options);
			const run = vi.fn();
			await runWorldSetup([{ key: "step", run }]);
			expect(run).not.toHaveBeenCalled();
		}
	});
});

describe("markSetupDone", () => {
	it("keeps the other steps, and writes nothing for a step already done", async () => {
		installWorld({ done: { other: true } });
		await markSetupDone("step");
		expect(settings.worldSetupDone).toEqual({ other: true, step: true });
		await markSetupDone("step");
		expect(game.settings.set).toHaveBeenCalledOnce();
	});
});
