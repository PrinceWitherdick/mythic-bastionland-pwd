import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indulgePassion } from "../../module/actions/recovery.js";
import { withBookText } from "../../module/rules/book-text.js";

const root = join(import.meta.dirname, "../..");
const lang = withBookText(JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8")));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);
const format = (key, data) => String(lookup(key) ?? key).replace(/\{(\w+)\}/g, (_match, name) => data?.[name] ?? "");

/** Every card posted: the template it was rendered from, and the context. */
let cards;
let notices;

const knight = (value, max = 12) => ({
	name: "The Gilded Knight",
	system: { virtues: { spi: { value, max } } },
	update: vi.fn(async () => {})
});
const passion = { name: "A song well sung" };

beforeEach(() => {
	cards = [];
	notices = [];
	globalThis.game = {
		i18n: { localize: (key) => lookup(key) ?? key, format },
		settings: { get: () => "public" },
		user: { name: "Referee", isGM: true }
	};
	globalThis.ui = { notifications: { info: (text) => notices.push(text) } };
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
});

afterEach(() => {
	for (const key of ["game", "ui", "foundry", "ChatMessage"]) delete globalThis[key];
});

describe("indulgePassion", () => {
	it("restores SPI to its maximum and says which Passion did it (p7)", async () => {
		const actor = knight(4);
		expect(await indulgePassion(actor, passion)).toBe(true);
		expect(actor.update).toHaveBeenCalledWith({ "system.virtues.spi.value": 12 }, expect.anything());
		expect(cards[0].context.text).toBe(format("bastionland.passion.indulged", { name: actor.name, passion: passion.name, value: 12 }));
		expect(cards[0].context.text).toContain("A song well sung");
	});

	it("restores nothing when SPI is already full, and says so", async () => {
		const actor = knight(12);
		expect(await indulgePassion(actor, passion)).toBe(false);
		expect(actor.update).not.toHaveBeenCalled();
		expect(cards).toHaveLength(0);
		expect(notices).toEqual([format("bastionland.passion.full", { name: actor.name })]);
	});

	it("does nothing for somebody without SPI", async () => {
		const actor = { name: "A wall", system: { virtues: {} }, update: vi.fn() };
		expect(await indulgePassion(actor, passion)).toBe(false);
		expect(actor.update).not.toHaveBeenCalled();
	});
});
