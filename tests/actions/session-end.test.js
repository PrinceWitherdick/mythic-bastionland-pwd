import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The calendar the world stands at, which turns were carried out, and what each answers with. */
let calendar;
let turns;
let turned;
/** The Season notes written, by Season key, and what each Season holds now. */
let written;
let notes;
vi.mock("../../module/actions/calendar.js", () => ({
	getCalendar: () => calendar,
	calendarLabel: () => "Morning, 1st of Spring"
}));
vi.mock("../../module/actions/time.js", () => ({
	weeksPass: vi.fn(async () => {
		turns.push("weeks");
		return turned;
	}),
	turnSeason: vi.fn(async () => {
		turns.push("season");
		return turned;
	}),
	turnAge: vi.fn(async () => {
		turns.push("age");
		return turned;
	})
}));
vi.mock("../../module/actions/season-log.js", () => ({
	seasonRecord: (key) => ({ notes: notes[key] ?? "" }),
	writeSeasonNotes: vi.fn(async (key, value) => {
		written.push([key, value]);
		notes[key] = value;
	})
}));

const { endTheSession, getSessionEnd, registerSessionEndSetting } =
	await import("../../module/actions/session-end.js");

const root = join(import.meta.dirname, "../..");
const lang = JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8"));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);
const format = (key, data) => String(lookup(key) ?? key).replace(/\{(\w+)\}/g, (_match, name) => data?.[name] ?? "");

/** The world's settings and the cards posted. */
let settings;
let cards;

beforeEach(() => {
	calendar = { age: 1, season: "spring", day: 1, phase: "morning" };
	turns = [];
	turned = { ...calendar, season: "harvest" };
	written = [];
	notes = {};
	settings = new Map();
	cards = [];
	globalThis.game = {
		i18n: { localize: (key) => lookup(key) ?? key, format },
		settings: {
			register: vi.fn((namespace, key, { default: value }) => settings.set(`${namespace}.${key}`, value)),
			get: (namespace, key) => settings.get(`${namespace}.${key}`),
			set: vi.fn(async (namespace, key, value) => settings.set(`${namespace}.${key}`, value))
		},
		user: { name: "Referee", isGM: true }
	};
	globalThis.Hooks = { callAll: vi.fn() };
	globalThis.foundry = {
		applications: {
			handlebars: {
				renderTemplate: vi.fn(async (path, context) => {
					cards.push({ path, context });
					return "<section></section>";
				})
			}
		}
	};
	globalThis.ChatMessage = {
		implementation: { getSpeaker: () => ({ alias: "Referee" }), applyMode: () => {}, create: vi.fn(async (data) => data) }
	};
	globalThis.CONFIG = { sounds: { dice: "dice.wav" } };
	registerSessionEndSetting();
});

afterEach(() => {
	for (const key of ["game", "Hooks", "foundry", "ChatMessage", "CONFIG"]) delete globalThis[key];
});

describe("registerSessionEndSetting", () => {
	it("starts a world with no turn promised", () => {
		expect(getSessionEnd()).toEqual({ promised: null });
	});
});

describe("endTheSession", () => {
	it("passes no time for the None step", async () => {
		expect(await endTheSession({ step: "none" })).toBe(true);
		expect(turns).toEqual([]);
	});

	it("turns the Season for Months, the Age for Years, and reaches the next event for Weeks", async () => {
		await endTheSession({ step: "months" });
		await endTheSession({ step: "years" });
		await endTheSession({ step: "weeks" });
		expect(turns).toEqual(["season", "age", "weeks"]);
	});

	it("leaves the session unended where the Referee turns away from the turn", async () => {
		turned = null;
		expect(await endTheSession({ step: "months", recap: "The ford was held." })).toBe(false);
		expect(cards).toHaveLength(0);
		expect(written).toEqual([]);
	});

	it("ends on no step it doesn't know", async () => {
		expect(await endTheSession({ step: "decades" })).toBe(false);
	});

	it("is the Referee's to do", async () => {
		game.user.isGM = false;
		expect(await endTheSession({ step: "none" })).toBe(false);
		expect(cards).toHaveLength(0);
	});

	it("writes the recap into the notes of the Season that was played, not the one turned to", async () => {
		await endTheSession({ step: "months", recap: "The ford was held." });
		expect(written).toEqual([["1-spring", `${format("bastionland.sessionEnd.recapHeading", { when: "Morning, 1st of Spring" })}\nThe ford was held.`]]);
	});

	it("writes the players' plans into the Season's notes under the recap", async () => {
		await endTheSession({ step: "none", recap: "The ford was held.", plans: "Ride for the coast." });
		const heading = format("bastionland.sessionEnd.recapHeading", { when: "Morning, 1st of Spring" });
		expect(written).toEqual([["1-spring", `${heading}\nThe ford was held.\n${lookup("bastionland.sessionEnd.card.plans")}: Ride for the coast.`]]);
	});

	it("writes nothing where the Referee wrote nothing about the session", async () => {
		await endTheSession({ step: "none", recap: "  " });
		expect(written).toEqual([]);
	});

	it("remembers a turn a roll put at the end of the next session", async () => {
		await endTheSession({ step: "none", promised: "season" });
		expect(getSessionEnd()).toEqual({ promised: "season" });
	});

	it("forgets the promise once the turn it promised has been taken up", async () => {
		settings.set("mythic-bastionland-pwd.sessionEnd", { promised: "season" });
		await endTheSession({ step: "months" });
		expect(getSessionEnd()).toEqual({ promised: null });
	});

	it("tells the table what the session came to, a heading for each part of it", async () => {
		await endTheSession({
			step: "months",
			passed: lookup("bastionland.sessionEnd.time.steps.months.card"),
			situations: [{ name: "The steward's accusation", d6: 2, result: "worse" }],
			glory: ["Myth Resolved: Sir Cai"],
			plans: "Ride for the coast.",
			recap: "The ford was held."
		});
		const [card] = cards;
		expect(card.path).toContain("report");
		expect(card.context.title).toBe(lookup("bastionland.sessionEnd.title"));
		expect(card.context.tagline).toBe("Morning, 1st of Spring");
		expect(card.context.entries.map(({ name }) => name)).toEqual([
			lookup("bastionland.sessionEnd.card.time"),
			lookup("bastionland.sessionEnd.card.unresolved"),
			lookup("bastionland.sessionEnd.card.glory"),
			lookup("bastionland.sessionEnd.card.plans")
		]);
		expect(card.context.entries[1].lines).toEqual([format("bastionland.sessionEnd.card.situation", {
			situation: "The steward's accusation",
			d6: 2,
			result: lookup("bastionland.refereeRolls.tables.unresolved.results.worse")
		})]);
	});

	it("leaves out the headings with nothing to say", async () => {
		await endTheSession({ step: "none", passed: "No time passes." });
		const [card] = cards;
		expect(card.context.entries).toEqual([{ name: lookup("bastionland.sessionEnd.card.time"), lines: ["No time passes."] }]);
	});

	it("names a situation nobody wrote down, so its roll still reads", async () => {
		await endTheSession({ step: "months", situations: [{ name: "  ", d6: 1, result: "worst" }] });
		expect(cards[0].context.entries[1].lines[0]).toContain(lookup("bastionland.sessionEnd.situations.unnamed"));
	});

	it("leaves a situation nobody rolled for off the card", async () => {
		await endTheSession({ step: "months", situations: [{ name: "The siege", d6: null, result: null }] });
		expect(cards[0].context.entries).toHaveLength(1);
	});
});
