import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rollReaction } from "../../module/actions/saves.js";

const root = join(import.meta.dirname, "../..");
const lang = JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8"));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);
const format = (key, data) => String(lookup(key) ?? key).replace(/\{(\w+)\}/g, (_match, name) => data?.[name] ?? "");

/** The d20s the next rolls give, in order. */
let rolled;
/** Every card posted: the template it was rendered from, and the context. */
let cards;

const envoy = (spi = 12) => ({ name: "The King’s Envoy", system: { virtues: { spi: { value: spi, max: spi } } } });

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

describe("rollReaction", () => {
	it("rolls SPI against the character's own score (p8)", async () => {
		rolled = [9];
		const save = await rollReaction(envoy(12));
		expect(save).toMatchObject({ virtue: "spi", value: 12, passed: true });
		expect(cards[0].path).toContain("save");
		expect(cards[0].context.save.label).toBe(lookup("bastionland.reaction.title"));
	});

	it("says nothing unfavourable came of it where the Save passes", async () => {
		rolled = [12];
		expect((await rollReaction(envoy(12))).passed).toBe(true);
		expect(cards[0].context.outcome).toBe(lookup("bastionland.reaction.favourable"));
	});

	it("takes it badly where the Save fails", async () => {
		rolled = [13];
		expect((await rollReaction(envoy(12))).passed).toBe(false);
		expect(cards[0].context.outcome).toBe(lookup("bastionland.reaction.unfavourable"));
	});
});
