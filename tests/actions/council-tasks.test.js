import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { councilActor, settleTask, tasksBySeat, tasksDueNotices } from "../../module/actions/council-tasks.js";

const root = join(import.meta.dirname, "../..");
const lang = JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8"));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);
const format = (key, data) => String(lookup(key) ?? key).replace(/\{(\w+)\}/g, (_match, name) => data?.[name] ?? "");

/** The d6s and d20s the next rolls give, in order. */
let rolled;
/** Every card posted, as the context it was rendered with. */
let cards;

const calendar = { age: 1, season: "spring", day: 2, phase: "morning" };

/**
 * A Domain as the actions read and write it. Updates are applied as Foundry
 * applies them, so a test can read back what settling a task left behind.
 * @param {object} options
 */
function fakeDomain({ tasks = {}, council = {}, crises = [] } = {}) {
	const domain = {
		name: "Bramblewatch",
		isOwner: true,
		system: { tasks, council: { steward: "", marshal: "", sheriff: "", envoy: "", circle: "", ...council }, crises, misruleDue: false },
		update: vi.fn(async (changes) => {
			for (const [path, value] of Object.entries(changes)) {
				const gone = /^system\.tasks\.-=(.+)$/.exec(path);
				if (gone) delete domain.system.tasks[gone[1]];
				else if (path === "system.crises") domain.system.crises = value;
				else if (path.startsWith("system.tasks.")) domain.system.tasks[path.slice("system.tasks.".length)] = value;
			}
		})
	};
	return domain;
}

const task = (seat, extra = {}) => ({ seat, what: "Restock the treasury", scope: "phase", risk: "none", started: { ...calendar }, at: 1, ...extra });

beforeEach(() => {
	rolled = [];
	cards = [];
	globalThis.Roll = class {
		constructor(formula) {
			this.formula = formula;
		}

		async evaluate() {
			this.total = rolled.shift();
			return this;
		}
	};
	globalThis.game = {
		i18n: { localize: (key) => lookup(key) ?? key, format },
		actors: [],
		settings: { get: (_scope, key) => (key === "calendar" ? calendar : "public") },
		user: { name: "Referee", isGM: true }
	};
	globalThis.foundry = {
		applications: { handlebars: { renderTemplate: vi.fn(async (_path, context) => { cards.push(context); return "<section></section>"; }) } },
		utils: { escapeHTML: (text) => text }
	};
	globalThis.ChatMessage = {
		implementation: {
			getSpeaker: ({ actor }) => ({ alias: actor.name }),
			applyMode: () => {},
			create: vi.fn(async (data) => data)
		}
	};
	globalThis.CONFIG = { sounds: { dice: "dice.wav" } };
});

afterEach(() => {
	delete globalThis.Roll;
	delete globalThis.game;
	delete globalThis.foundry;
	delete globalThis.ChatMessage;
	delete globalThis.CONFIG;
});

describe("councilActor", () => {
	it("finds whoever holds the seat by the name written there", () => {
		const alda = { name: "  alda the grey ", system: { virtues: { cla: { value: 12 } } } };
		game.actors = [{ name: "Sir Ose", system: { virtues: {} } }, alda];
		expect(councilActor(fakeDomain({ council: { steward: "Alda the Grey" } }), "steward")).toBe(alda);
	});

	it("finds nobody for an empty seat, or one held by somebody with no sheet", () => {
		game.actors = [{ name: "Alda", system: { virtues: {} } }];
		expect(councilActor(fakeDomain(), "steward")).toBeNull();
		expect(councilActor(fakeDomain({ council: { steward: "Hulde" } }), "steward")).toBeNull();
	});
});

describe("settleTask", () => {
	it("finishes an action with no risk without a roll, and takes it out of the Council's hands", async () => {
		const domain = fakeDomain({ tasks: { one: task("steward") } });
		expect(await settleTask(domain, "one")).toBe("success");
		expect(domain.system.tasks).toEqual({});
		expect(domain.system.crises).toEqual([]);
		expect(cards[0].outcome).toBe(lookup("bastionland.domain.tasks.outcomes.success.label"));
	});

	it("brings a Crisis where the seat's Save fails (p20)", async () => {
		game.actors = [{ name: "Alda", system: { virtues: { cla: { value: 10 } } } }];
		const domain = fakeDomain({ council: { steward: "Alda" }, tasks: { one: task("steward", { risk: "cla" }) } });
		// The d20 beats the Virtue, so the Save fails; the d6 then draws the Crisis.
		rolled = [17, 3];
		expect(await settleTask(domain, "one")).toBe("crisis");
		expect(domain.system.crises).toEqual(["famine"]);
		expect(cards[0].save.passed).toBe(false);
		expect(cards[0].crisis.name).toBe(lookup("bastionland.domain.crises.famine.name"));
	});

	it("leaves the Domain alone where the Save passes", async () => {
		game.actors = [{ name: "Alda", system: { virtues: { cla: { value: 14 } } } }];
		const domain = fakeDomain({ council: { steward: "Alda" }, tasks: { one: task("steward", { risk: "cla" }) } });
		rolled = [9];
		expect(await settleTask(domain, "one")).toBe("success");
		expect(domain.system.crises).toEqual([]);
		expect(cards[0].crisis).toBeNull();
	});

	it("falls back to the Luck Roll where the seat's holder has no sheet, and says so", async () => {
		const domain = fakeDomain({ council: { marshal: "Hulde" }, tasks: { one: task("marshal", { risk: "vig" }) } });
		rolled = [5];
		expect(await settleTask(domain, "one")).toBe("success");
		expect(cards[0].save).toBeNull();
		expect(cards[0].luck.d6).toBe(5);
		expect(cards[0].hint).toContain(format("bastionland.domain.tasks.noSheet", { name: "Hulde" }));
	});

	it("reads the Luck Roll's own bands, so a 1 is the Crisis and a 2 only a Problem", async () => {
		const bad = fakeDomain({ tasks: { one: task("sheriff", { risk: "luck" }) } });
		rolled = [1, 2];
		expect(await settleTask(bad, "one")).toBe("crisis");
		expect(bad.system.crises).toEqual(["debt"]);

		const middling = fakeDomain({ tasks: { one: task("sheriff", { risk: "luck" }) } });
		rolled = [2];
		expect(await settleTask(middling, "one")).toBe("problem");
		expect(middling.system.crises).toEqual([]);
	});

	it("says the Referee decides where the Domain already faces every Crisis", async () => {
		const every = ["chaos", "debt", "famine", "misery", "panic", "doubt"];
		const domain = fakeDomain({ crises: every, tasks: { one: task("envoy", { risk: "luck" }) } });
		rolled = [1, 4];
		expect(await settleTask(domain, "one")).toBe("crisis");
		expect(domain.system.crises).toEqual(every);
		expect(cards[0].crisis).toBeNull();
		expect(cards[0].hint).toContain(lookup("bastionland.domain.tasks.everyCrisis"));
	});

	it("settles nothing that isn't in hand", async () => {
		expect(await settleTask(fakeDomain(), "gone")).toBeNull();
	});
});

describe("tasksBySeat", () => {
	it("marks a task whose Phase is up, and says when one still running is due", () => {
		const domain = fakeDomain({
			tasks: {
				now: task("steward", { scope: "phase", at: 1 }),
				later: task("steward", { scope: "season", at: 2 })
			}
		});
		const [due, waiting] = tasksBySeat(domain, { ...calendar, phase: "afternoon" }).steward;
		expect(due.due).toBe(true);
		expect(due.gloss).toContain(lookup("bastionland.domain.tasks.dueNow"));
		expect(waiting.due).toBe(false);
		expect(waiting.gloss).toContain(lookup("bastionland.time.seasons.harvest"));
	});

	it("names the Virtue a Save is rolled in, and whoever rolls it", () => {
		game.actors = [{ name: "Alda", system: { virtues: { cla: { value: 10 } } } }];
		const domain = fakeDomain({ council: { steward: "Alda" }, tasks: { one: task("steward", { risk: "cla" }) } });
		expect(tasksBySeat(domain, calendar).steward[0].gloss)
			.toContain(format("bastionland.domain.tasks.risks.save", { virtue: lookup("bastionland.virtues.cla.abbr"), name: "Alda" }));
	});
});

describe("tasksDueNotices", () => {
	it("names each Domain with work waiting, and counts it", () => {
		const waiting = fakeDomain({ tasks: { a: task("steward"), b: task("marshal") } });
		const one = { ...fakeDomain({ tasks: { a: task("envoy") } }), name: "Stonewell" };
		const none = { ...fakeDomain({ tasks: { a: task("circle", { scope: "season" }) } }), name: "Ashford" };
		game.actors = [waiting, one, none].map((domain) => ({ ...domain, type: "domain" }));

		expect(tasksDueNotices({ ...calendar, phase: "afternoon" })).toEqual([
			format("bastionland.domain.tasks.dueNotice", { name: "Bramblewatch", count: 2 }),
			format("bastionland.domain.tasks.dueNoticeOne", { name: "Stonewell" })
		]);
	});
});
