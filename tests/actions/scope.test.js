import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The calendar the world stands at, and which turns were carried out. */
let calendar;
let turns;
/** What a turn answers with: the new calendar, or null where the Referee closed its window. */
let turned;
/** The Knights the chooser was opened on. */
let chosen;

vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => calendar }));
vi.mock("../../module/actions/time.js", () => ({
	turnSeason: vi.fn(async () => {
		turns.push("season");
		return turned;
	}),
	turnAge: vi.fn(async () => {
		turns.push("age");
		return turned;
	})
}));
vi.mock("../../module/apps/KnightChooser.js", () => ({ openKnightChooser: vi.fn((actor) => chosen.push(actor)) }));

const { SCOPE_HOOK, countSession, getScope, makeKnightAhead, registerScopeSetting, scopeView, setScope, setScopePlan } =
	await import("../../module/actions/scope.js");

const root = join(import.meta.dirname, "../..");
const lang = JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8"));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);
const format = (key, data) => String(lookup(key) ?? key).replace(/\{(\w+)\}/g, (_match, name) => data?.[name] ?? "");

/** The world's settings, the cards posted, and the hooks called. */
let settings;
let cards;
let called;

beforeEach(() => {
	calendar = { age: 1, season: "spring", day: 1, phase: "morning" };
	turns = [];
	turned = { ...calendar, season: "harvest" };
	chosen = [];
	settings = new Map();
	cards = [];
	called = [];
	globalThis.game = {
		i18n: { localize: (key) => lookup(key) ?? key, format },
		settings: {
			register: vi.fn((scope, key, { default: value }) => settings.set(`${scope}.${key}`, value)),
			get: (scope, key) => settings.get(`${scope}.${key}`),
			set: vi.fn(async (scope, key, value) => {
				settings.set(`${scope}.${key}`, value);
				Hooks.callAll(SCOPE_HOOK, value);
			})
		},
		user: { name: "Referee", isGM: true }
	};
	globalThis.Hooks = { callAll: (hook, ...args) => called.push([hook, ...args]) };
	globalThis.foundry = {
		applications: { handlebars: { renderTemplate: vi.fn(async (path, context) => { cards.push({ path, context }); return "<section></section>"; }) } }
	};
	globalThis.ChatMessage = {
		implementation: { getSpeaker: () => ({ alias: "Referee" }), applyMode: () => {}, create: vi.fn(async (data) => data) }
	};
	globalThis.Actor = { implementation: { create: vi.fn(async (data) => ({ ...data, id: "k1" })) } };
	globalThis.CONFIG = { sounds: { dice: "dice.wav" } };
	registerScopeSetting();
});

afterEach(() => {
	for (const key of ["game", "Hooks", "foundry", "ChatMessage", "Actor", "CONFIG"]) delete globalThis[key];
});

describe("registerScopeSetting", () => {
	it("starts a world with no Scope settled on", () => {
		expect(getScope()).toMatchObject({ scope: "", sessions: 6, session: 1, turnEvery: 1 });
	});
});

describe("setScope", () => {
	it("settles the Scope and tells the table what the book says it is", async () => {
		expect(await setScope("saga")).toMatchObject({ scope: "saga" });
		expect(cards[0].context.text).toContain(lookup("bastionland.scope.kinds.saga.text"));
	});

	it("says a Chronicle's plan on the card as well", async () => {
		await setScope("chronicle");
		expect(cards[0].context.text).toContain(format("bastionland.scope.sessionsPlanned", { count: 6 }));
		expect(cards[0].context.text).toContain(lookup("bastionland.scope.turnEveryLineOne"));
	});

	it("leaves a Scope it doesn't know, and one already settled on, alone", async () => {
		expect(await setScope("epic")).toBeNull();
		await setScope("saga");
		cards = [];
		expect(await setScope("saga")).toBeNull();
		expect(cards).toEqual([]);
	});

	it("is the Referee's to settle", async () => {
		game.user.isGM = false;
		expect(await setScope("saga")).toBeNull();
		expect(getScope().scope).toBe("");
	});
});

describe("setScopePlan", () => {
	it("writes the parts of the plan handed to it, reading text as a number field sends it", async () => {
		expect(await setScopePlan({ sessions: "12", turnEvery: "2" })).toMatchObject({ sessions: 12, turnEvery: 2, session: 1 });
	});

	it("writes nothing where nothing was handed to it", async () => {
		expect(await setScopePlan({})).toBeNull();
	});
});

describe("countSession", () => {
	it("counts the session played, so the next one begins", async () => {
		await setScope("chronicle");
		expect(await countSession()).toMatchObject({ session: 2 });
	});

	it("turns nothing itself: what falls at a session's end is the Ending a Session window's", async () => {
		await setScope("chronicle");
		await countSession();
		expect(turns).toEqual([]);
	});

	it("is only for the Scope that plans its sessions", async () => {
		await setScope("saga");
		expect(await countSession()).toBeNull();
	});

	it("is the Referee's to do", async () => {
		await setScope("chronicle");
		game.user.isGM = false;
		expect(await countSession()).toBeNull();
		expect(getScope().session).toBe(1);
	});
});

describe("makeKnightAhead", () => {
	it("makes a Knight and opens the chooser on them, for the players to choose between (p6)", async () => {
		const knight = await makeKnightAhead();
		expect(knight).toMatchObject({ type: "knight", name: lookup("bastionland.scope.knightName") });
		expect(chosen).toEqual([knight]);
	});

	it("is the Referee's to do", async () => {
		game.user.isGM = false;
		expect(await makeKnightAhead()).toBeNull();
		expect(chosen).toEqual([]);
	});
});

describe("scopeView", () => {
	it("offers the three to choose between, with the chosen one marked", async () => {
		await setScope("chronicle");
		const view = scopeView();
		expect(view.choices.map(({ key }) => key)).toEqual(["adventure", "chronicle", "saga"]);
		expect(view.choices.filter(({ active }) => active).map(({ key }) => key)).toEqual(["chronicle"]);
		expect(view.text).toBe(lookup("bastionland.scope.kinds.chronicle.text"));
	});

	it("says where a Chronicle stands and what falls at this session's end", async () => {
		await setScope("chronicle");
		await setScopePlan({ session: 6 });
		const view = scopeView();
		expect(view.chronicle).toBe(true);
		expect(view.standing).toBe(format("bastionland.scope.standing", { session: 6, sessions: 6 }));
		expect(view.left).toBe(lookup("bastionland.scope.lastSession"));
		expect(view.due).toBe(lookup("bastionland.scope.due.season"));
	});

	it("says when the sessions planned have all been played", async () => {
		await setScope("chronicle");
		await setScopePlan({ session: 7 });
		expect(scopeView().left).toBe(lookup("bastionland.scope.spent"));
	});

	it("counts no sessions for the Scopes that keep no plan", async () => {
		await setScope("adventure");
		expect(scopeView()).toMatchObject({ chronicle: false, adventure: true });
	});
});
