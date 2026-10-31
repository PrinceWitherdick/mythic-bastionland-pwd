import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

/** The Dire Weather table as it's rolled and kept (p18): what a run of Looming needs, and what breaks one. */

let calendar;
let settings;
let die;

vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn() }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => ({})), t: (key) => key }));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({ ...calendar }) }));

const { forgetWeatherRun, rollRefereeTable, weatherIn } = await import("../../module/actions/referee-rolls.js");

const at = (phase, day = 1) => ({ age: 1, year: 1, season: "winter", day, phase });

beforeEach(() => {
	calendar = at("morning");
	settings = new Map();
	die = 2;
	globalThis.Roll = class {
		async evaluate() {
			this.total = die;
			return this;
		}
	};
	globalThis.game = {
		user: { isGM: true },
		settings: {
			get: (scope, key) => (scope === SYSTEM_ID ? settings.get(key) ?? null : null),
			set: vi.fn(async (_scope, key, value) => settings.set(key, value))
		}
	};
});

afterEach(() => {
	delete globalThis.Roll;
	delete globalThis.game;
});

describe("the Dire Weather table's run", () => {
	it("reads a Looming in the Phase straight after another as dire, and says so for that Phase", async () => {
		await rollRefereeTable("weather");
		calendar = at("afternoon");
		expect((await rollRefereeTable("weather")).result).toBe("dire");
		expect(weatherIn(at("afternoon"))).toBe("dire");
		expect(settings.get("weatherNow")).toMatchObject({ rolled: "looming", before: { when: at("morning"), rolled: "looming" } });
	});

	it("doesn't count a Looming two Phases back", async () => {
		await rollRefereeTable("weather");
		calendar = at("night");
		expect((await rollRefereeTable("weather")).result).toBe("looming");
	});

	it("doesn't make a run of two rolls in the one Phase", async () => {
		await rollRefereeTable("weather");
		expect((await rollRefereeTable("weather")).result).toBe("looming");
	});

	it("starts again once forgotten, as weeks go by", async () => {
		await rollRefereeTable("weather");
		await forgetWeatherRun();
		expect(settings.get("weatherNow")).toBeNull();
		calendar = at("afternoon");
		expect((await rollRefereeTable("weather")).result).toBe("looming");
	});

	it("writes nothing to forget when nothing was rolled", async () => {
		await forgetWeatherRun();
		expect(game.settings.set).not.toHaveBeenCalled();
	});
});
