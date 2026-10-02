import { beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

/** The world's calendar, its settings, the art index, and the d12s the next Spark rolls land on. */
let calendar;
let settings;
let index;
let dice;
/** The card buttons registered, by selector. */
const buttons = new Map();

vi.mock("../../module/chat/cards.js", () => ({
	postCard: vi.fn(async () => ({})),
	registerCardButtons: ({ selector, handler }) => buttons.set(selector, handler),
	warn: vi.fn(),
	t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key)
}));
vi.mock("../../module/actions/calendar.js", () => ({
	getCalendar: () => ({ ...calendar }),
	calendarLabel: () => "now"
}));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => index, sparkPageOf: (index, key) => index?.spark?.find((page) => page.key === key) ?? null }));
vi.mock("../../module/actions/referee-rolls.js", () => ({
	rollSpark: vi.fn(async (table) => {
		const rolls = dice.shift();
		const results = table.columns.map((column, at) => ({ column, roll: rolls[at], entry: table.rows[rolls[at] - 1]?.[at] ?? null }));
		return { roll: { rolls }, results, prompt: results.map(({ entry }) => entry).join(" ") };
	})
}));

/** Whether FXMaster is on, for the line saying what the map shows. */
let fxOn;
/** Whether the GM has taken the weather off the map. */
let paused;
vi.mock("../../module/actions/weather.js", () => ({
	setWeather: vi.fn(async () => {}),
	weatherPaused: () => paused,
	weatherShown: () => fxOn,
	weatherView: (sky) => ({ label: `weather.skies.${sky}` })
}));

const { fogHidesTheWay, registerSkyAndWeather, rollSkyAndWeather, setFog } = await import("../../module/actions/sky-weather.js");
const { postCard, warn } = await import("../../module/chat/cards.js");
const { setWeather } = await import("../../module/actions/weather.js");

/** Twelve rows of a two-column table, each entry naming its column and row. */
const table = (name, columns) => ({ name, columns, rows: Array.from({ length: 12 }, (_, row) => columns.map((column) => `${column} ${row + 1}`)) });

/** The Nature page as Import PDF reads it: Sky in the middle of the top row, Weather first on the middle one. */
function naturePage() {
	const tables = Array.from({ length: 9 }, (_, at) => table(`T${at}`, ["A", "B"]));
	tables[1] = table("Sky", ["Tone", "Texture"]);
	tables[3] = table("Weather", ["Description", "Element"]);
	return { key: "nature", name: "Nature", page: 22, tables };
}

beforeEach(() => {
	calendar = { age: 1, year: 1, season: "spring", day: 2, phase: "morning" };
	settings = new Map();
	index = { spark: [naturePage()] };
	dice = [];
	vi.mocked(postCard).mockClear();
	vi.mocked(setWeather).mockClear();
	fxOn = false;
	paused = false;
	globalThis.game = {
		user: { isGM: true },
		settings: {
			register: vi.fn(),
			get: (scope, key) => (scope === SYSTEM_ID ? settings.get(key) ?? null : null),
			set: vi.fn(async (_scope, key, value) => settings.set(key, value))
		}
	};
	globalThis.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
});

describe("rollSkyAndWeather", () => {
	it("rolls the day's Sky and Weather onto one card for the Referee", async () => {
		dice = [[4, 2], [9, 6]];
		const rolled = await rollSkyAndWeather();
		expect(rolled.fog).toBeNull();
		const [[, template, context, options]] = vi.mocked(postCard).mock.calls;
		expect(template).toBe("sky-weather");
		expect(context.tables.map(({ name, prompt }) => [name, prompt])).toEqual([["Sky", "Tone 4 Texture 2"], ["Weather", "Description 9 Element 6"]]);
		expect(context.fog).toBeNull();
		expect(options).toMatchObject({ mode: "gm" });
		expect(options.rolls).toHaveLength(2);
		expect(fogHidesTheWay()).toBe(false);
	});

	it("sets the map's weather from the roll, and says so on the card with FXMaster on", async () => {
		fxOn = true;
		dice = [[4, 2], [12, 1]];
		expect((await rollSkyAndWeather()).drawn).toBe("downpour");
		expect(setWeather).toHaveBeenCalledWith("downpour");
		expect(vi.mocked(postCard).mock.calls[0][2].drawn).toBe('skyWeather.drawn {"sky":"weather.skies.downpour"}');
	});

	it("says nothing of a map while the GM has the weather paused", async () => {
		fxOn = true;
		paused = true;
		dice = [[4, 2], [12, 1]];
		expect((await rollSkyAndWeather()).drawn).toBe("downpour");
		expect(setWeather).toHaveBeenCalledWith("downpour");
		expect(vi.mocked(postCard).mock.calls[0][2].drawn).toBeNull();
	});

	it("still sets the weather without FXMaster, but says nothing of a map", async () => {
		dice = [[4, 2], [1, 7]];
		expect((await rollSkyAndWeather()).drawn).toBe("storm");
		expect(setWeather).toHaveBeenCalledWith("storm");
		expect(vi.mocked(postCard).mock.calls[0][2].drawn).toBeNull();
	});

	it("brings Solid Fog down for the rest of the day, with a button to lift it", async () => {
		dice = [[1, 1], [8, 12]];
		expect((await rollSkyAndWeather()).fog).toBe("solid");
		expect(setWeather).toHaveBeenCalledWith("fog");
		expect(fogHidesTheWay()).toBe(true);
		expect(fogHidesTheWay({ ...calendar, phase: "afternoon" })).toBe(true);
		expect(fogHidesTheWay({ ...calendar, day: 3 })).toBe(false);
		expect(vi.mocked(postCard).mock.calls[0][2].fog).toMatchObject({ action: "lift", text: "skyWeather.fog.solid" });
	});

	it("leaves other fog for the Referee to bring down from the card", async () => {
		dice = [[1, 1], [3, 12]];
		expect((await rollSkyAndWeather()).fog).toBe("fog");
		expect(fogHidesTheWay()).toBe(false);
		expect(vi.mocked(postCard).mock.calls[0][2].fog).toMatchObject({ action: "down" });
	});

	it("says so, and rolls nothing, where Import PDF hasn't read the tables", async () => {
		index = null;
		expect(await rollSkyAndWeather()).toBeNull();
		index = { spark: [{ ...naturePage(), tables: naturePage().tables.slice(0, 8) }] };
		expect(await rollSkyAndWeather()).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledTimes(2);
		expect(postCard).not.toHaveBeenCalled();
	});

	it("rolls nothing for a player", async () => {
		game.user.isGM = false;
		expect(await rollSkyAndWeather()).toBeNull();
		expect(await setFog(true)).toBe(false);
	});
});

describe("the card's fog button", () => {
	it("brings the fog down or lifts it", async () => {
		registerSkyAndWeather();
		const press = buttons.get("[data-sky-fog]");
		await press({ dataset: { skyFog: "down" } });
		expect(fogHidesTheWay()).toBe(true);
		expect(ui.notifications.info).toHaveBeenLastCalledWith("skyWeather.fog.fell");
		await press({ dataset: { skyFog: "lift" } });
		expect(fogHidesTheWay()).toBe(false);
		expect(ui.notifications.info).toHaveBeenLastCalledWith("skyWeather.fog.lifted");
	});

	it("does nothing from a card rolled for another day", async () => {
		dice = [[1, 1], [3, 12]];
		await rollSkyAndWeather();
		const { flags } = vi.mocked(postCard).mock.calls[0][3];
		expect(flags[SYSTEM_ID].skyWeather.when).toEqual(calendar);
		registerSkyAndWeather();
		const press = buttons.get("[data-sky-fog]");

		calendar = { ...calendar, day: (calendar.day ?? 1) + 1 };
		await press({ dataset: { skyFog: "down" } }, { flags });
		expect(fogHidesTheWay()).toBe(false);
		expect(warn).toHaveBeenCalledWith("skyWeather.fog.pastDay");

		await press({ dataset: { skyFog: "down" } }, { flags: { [SYSTEM_ID]: { skyWeather: { when: { ...calendar } } } } });
		expect(fogHidesTheWay()).toBe(true);
	});
});
