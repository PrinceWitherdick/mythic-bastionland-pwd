import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { moraleBreakButtons, rollMorale } from "../../module/actions/saves.js";
import { withBookText } from "../../module/rules/book-text.js";

const root = join(import.meta.dirname, "../..");
const lang = withBookText(JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8")));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);
const format = (key, data) => String(lookup(key) ?? key).replace(/\{(\w+)\}/g, (_match, name) => data?.[name] ?? "");

/** The d20s the next rolls give, in order. */
let rolled;
/** Every card posted: the template it was rendered from, and the context. */
let cards;

const npc = (uuid, spi = 10) => ({ uuid, type: "npc", name: uuid, system: { virtues: { spi: { value: spi, max: spi } } } });

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
		settings: { get: () => "public" },
		user: { name: "Referee", isGM: true }
	};
	globalThis.foundry = {
		applications: { handlebars: { renderTemplate: vi.fn(async (path, context) => { cards.push({ path, context }); return "<section></section>"; }) } }
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
	for (const key of ["Roll", "game", "foundry", "ChatMessage", "CONFIG"]) delete globalThis[key];
});

describe("rollMorale", () => {
	it("holds firm on a pass, and offers nothing more", async () => {
		rolled = [8];
		expect((await rollMorale(npc("Actor.guard"))).passed).toBe(true);
		expect(cards[0].context.outcome).toBe(lookup("bastionland.morale.holds"));
		expect(cards[0].context.breaks).toBeUndefined();
	});

	it("asks whether they fled or surrendered on a failure (p10)", async () => {
		rolled = [15];
		expect((await rollMorale(npc("Actor.guard"))).passed).toBe(false);
		const { breaks, outcome } = cards[0].context;
		expect(outcome).toBe(lookup("bastionland.morale.breaks"));
		expect(breaks.actors).toBe("Actor.guard");
		expect(breaks.choices.map(({ key, label }) => [key, label])).toEqual([["fled", "Fled"], ["surrendered", "Surrendered"]]);
		expect(breaks.choices[0].hint).toBe(lookup("bastionland.morale.broke.fled.hintOne"));
	});

	it("offers to break the whole of an organised group on its leader's roll", async () => {
		rolled = [15];
		const captain = npc("Actor.captain");
		await rollMorale(captain, { group: [captain, npc("Actor.ann"), npc("Actor.bo")] });
		expect(cards[0].context.breaks.actors).toBe("Actor.captain,Actor.ann,Actor.bo");
		expect(cards[0].context.breaks.choices[1].hint).toBe(lookup("bastionland.morale.broke.surrendered.hint"));
	});
});

describe("moraleBreakButtons", () => {
	it("marks only NPCs, since Morale doesn't affect player characters", () => {
		expect(moraleBreakButtons([{ uuid: "Actor.k", type: "knight" }])).toBeNull();
		expect(moraleBreakButtons([{ uuid: "Actor.k", type: "knight" }, npc("Actor.guard")]).actors).toBe("Actor.guard");
	});
});
