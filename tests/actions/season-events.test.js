import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	announceSeasonEvent,
	collectionEntry,
	eventLabel,
	markCollection,
	markSeasonEvent,
	seasonEventsNow,
	stageLabel
} from "../../module/actions/season-events.js";
import { GM_TOOLKIT_TYPE } from "../../module/actions/gm-toolkit.js";
import { MIDPOINT_STAGE, findEvent } from "../../module/rules/season-events.js";

/**
 * The seasonal events (p17) as the actions carry them out: what a Season has
 * behind it is read from the GM Toolkit and written back to it, so these run
 * the real record through the real toolkit rather than mocking it away.
 */

const root = join(import.meta.dirname, "../..");
const lang = JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8"));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);
const format = (key, data) => String(lookup(key) ?? key).replace(/\{(\w+)\}/g, (_match, name) => data?.[name] ?? "");

/** Every card posted, as the context it was rendered with. */
let cards;
/** The world's calendar, which the settings hand back. */
let calendar;

/** A GM Toolkit as season-log.js reads and writes one: its Seasons, set by dotted path. */
function fakeToolkit(seasons = {}) {
	const toolkit = {
		id: "toolkit",
		type: GM_TOOLKIT_TYPE,
		pack: null,
		system: { seasons },
		update: vi.fn(async (changes) => {
			for (const [path, value] of Object.entries(changes)) {
				const [, , key, field] = path.split(".");
				toolkit.system.seasons[key] ??= {};
				toolkit.system.seasons[key][field] = value;
			}
			return toolkit;
		})
	};
	return toolkit;
}

/** A Domain, which a collection is gathered from. */
const fakeDomain = (name) => ({ id: name, type: "domain", name });

/** What the world's one toolkit keeps about a Season, or undefined with no toolkit at all. */
const kept = (key) => game.actors.find((actor) => actor.type === GM_TOOLKIT_TYPE)?.system.seasons[key];

const lastCard = () => cards.at(-1);

beforeEach(() => {
	cards = [];
	calendar = { age: 2, season: "winter", day: 3, phase: "morning" };
	globalThis.game = {
		user: { name: "Referee", isGM: true },
		users: { activeGM: { isSelf: true } },
		actors: [],
		documentTypes: { Actor: ["knight", "npc", "domain", GM_TOOLKIT_TYPE] },
		i18n: { localize: (key) => lookup(key) ?? key, format },
		settings: { get: (scope, key) => (scope === "core" ? "public" : key === "calendar" ? calendar : undefined) }
	};
	globalThis.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
	globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0 } };
	globalThis.CONFIG = { sounds: { dice: "dice.wav" } };
	globalThis.foundry = {
		applications: { handlebars: { renderTemplate: vi.fn(async (_path, context) => { cards.push(context); return "<section></section>"; }) } },
		utils: {
			escapeHTML: (text) => text,
			getDocumentClass: () => ({
				create: vi.fn(async (data) => {
					const made = Object.assign(fakeToolkit(), { type: data.type });
					game.actors.push(made);
					return made;
				})
			})
		}
	};
	globalThis.ChatMessage = {
		implementation: {
			getSpeaker: ({ actor }) => ({ alias: actor.name }),
			applyMode: () => {},
			create: vi.fn(async (data) => data)
		}
	};
});

afterEach(() => {
	for (const name of ["game", "ui", "CONST", "CONFIG", "foundry", "ChatMessage"]) delete globalThis[name];
	vi.clearAllMocks();
});

describe("seasonEventsNow", () => {
	it("reads what the Season has behind it off the toolkit, and names what's next", () => {
		game.actors = [fakeToolkit({ "2-winter": { events: ["feastOfTheMoon"] } })];
		const now = seasonEventsNow();

		expect(now).toMatchObject({ season: "winter", key: "2-winter", passed: ["feastOfTheMoon"] });
		expect(now.next.key).toBe("kindlemass");
		expect(now.events.map(({ key, passed }) => [key, passed]))
			.toEqual([["feastOfTheMoon", true], ["kindlemass", false], ["levy", false]]);
	});

	it("reads a world with no toolkit as a Season nothing has come to pass in", () => {
		expect(seasonEventsNow()).toMatchObject({ key: "2-winter", passed: [] });
	});
});

describe("markSeasonEvent", () => {
	it("keeps the event on the Season's record and tells the table, in the Season's colours", async () => {
		game.actors = [fakeToolkit()];
		expect(await markSeasonEvent("feastOfTheMoon")).toMatchObject({ key: "feastOfTheMoon", stage: "begins" });

		expect(kept("2-winter").events).toEqual(["feastOfTheMoon"]);
		expect(lastCard()).toMatchObject({ tone: "winter", title: lookup("bastionland.time.events.kinds.feastOfTheMoon.label") });
	});

	it("makes the world its toolkit, since the record has nowhere else to live", async () => {
		expect(await markSeasonEvent("feastOfTheMoon")).toBeTruthy();
		expect(kept("2-winter").events).toEqual(["feastOfTheMoon"]);
	});

	it("says so on the card when weeks passed to reach it", async () => {
		game.actors = [fakeToolkit()];
		await markSeasonEvent("kindlemass", { weeks: true });
		expect(lastCard().hint).toContain(lookup("bastionland.time.events.weeksPassed"));
	});

	it("marks nothing that isn't this Season's, or has already come to pass", async () => {
		game.actors = [fakeToolkit({ "2-winter": { events: ["feastOfTheMoon"] } })];
		expect(await markSeasonEvent("feastOfTheSun")).toBeNull();
		expect(await markSeasonEvent("feastOfTheMoon")).toBeNull();

		expect(ui.notifications.warn).toHaveBeenCalledTimes(2);
		expect(kept("2-winter").events).toEqual(["feastOfTheMoon"]);
		expect(cards).toHaveLength(0);
	});

	it("is the Referee's alone", async () => {
		game.user.isGM = false;
		game.actors = [fakeToolkit()];
		expect(await markSeasonEvent("feastOfTheMoon")).toBeNull();
		expect(kept("2-winter")).toBeUndefined();
	});

	it("keeps the event without a card where the caller asks for none", async () => {
		game.actors = [fakeToolkit()];
		await markSeasonEvent("feastOfTheMoon", { announce: false });
		expect(kept("2-winter").events).toEqual(["feastOfTheMoon"]);
		expect(cards).toHaveLength(0);
	});
});

describe("markCollection", () => {
	it("keeps the Season's collection on its record, and posts nothing: the Season's own card names it", async () => {
		game.actors = [fakeToolkit({ "2-winter": { events: ["feastOfTheMoon", "kindlemass"] } })];
		expect(await markCollection("2-winter", "winter")).toMatchObject({ key: "levy", collection: true });

		expect(kept("2-winter").events).toEqual(["feastOfTheMoon", "kindlemass", "levy"]);
		expect(cards).toHaveLength(0);
	});

	it("makes the world its toolkit, so the collection isn't reported and then dropped", async () => {
		// A world that has never made a toolkit turns its Season: without one, the write
		// would go nowhere while the Season's card still said the Levy was gathered.
		expect(await markCollection("2-winter", "winter")).toMatchObject({ key: "levy" });
		expect(kept("2-winter").events).toEqual(["levy"]);
	});

	it("gathers nothing for a Season the book doesn't keep, and nothing for a player", async () => {
		game.actors = [fakeToolkit()];
		expect(await markCollection("2-winter", "nonsense")).toBeNull();

		game.user.isGM = false;
		expect(await markCollection("2-winter", "winter")).toBeNull();
		expect(kept("2-winter")).toBeUndefined();
	});
});

describe("announceSeasonEvent and collectionEntry", () => {
	it("names the Domains a collection is gathered from, on the card and in the Season's entry", async () => {
		game.actors = [fakeDomain("Bramblewatch"), fakeDomain("Stonewell")];
		await announceSeasonEvent(findEvent("levy"), "winter");

		expect(lastCard().due).toEqual([format("bastionland.time.events.collected", { domains: "Bramblewatch, Stonewell" })]);
		expect(collectionEntry(findEvent("levy"))).toEqual({
			name: lookup("bastionland.time.events.kinds.levy.label"),
			lines: [
				lookup("bastionland.time.events.kinds.levy.text"),
				format("bastionland.time.events.collected", { domains: "Bramblewatch, Stonewell" })
			]
		});
	});

	it("leaves a Realm with no Domain nobody to gather from, and a Feast gathers nothing anywhere", async () => {
		expect(collectionEntry(findEvent("levy")).lines).toHaveLength(1);

		game.actors = [fakeDomain("Bramblewatch")];
		await announceSeasonEvent(findEvent("feastOfTheMoon"), "winter");
		expect(lastCard().due).toEqual([]);
	});
});

describe("the words an event is printed under", () => {
	it("puts the book's own midpoint at a Season's middle, and says the Season at either end", () => {
		expect(stageLabel("begins", "winter")).toBe(format("bastionland.time.events.stages.begins", { season: lookup("bastionland.time.seasons.winter") }));
		expect(stageLabel(MIDPOINT_STAGE, "winter")).toBe(lookup("bastionland.time.seasonMidpoints.winter"));
		expect(stageLabel("ends", "spring")).toBe(format("bastionland.time.events.stages.ends", { season: lookup("bastionland.time.seasons.spring") }));
	});

	it("names each event as the book prints it", () => {
		expect(eventLabel("levy")).toBe(lookup("bastionland.time.events.kinds.levy.label"));
	});
});
