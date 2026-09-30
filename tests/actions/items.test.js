import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { itemContext, itemTags, postItem } from "../../module/actions/items.js";
import { withBookText } from "../../module/rules/book-text.js";

const root = join(import.meta.dirname, "../..");
const lang = withBookText(JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8")));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);

const mace = { name: "Polished mace", type: "weapon", system: { damage: "d8", hefty: true, description: "<p>Heavy.</p>" } };

beforeEach(() => {
	globalThis.game = { i18n: { localize: (key) => lookup(key) ?? key, format: (key) => lookup(key) ?? key } };
});

afterEach(() => {
	delete globalThis.game;
	delete globalThis.foundry;
	delete globalThis.ChatMessage;
});

describe("itemContext", () => {
	it("gives the item's name, kind, tags and description", () => {
		expect(itemTags(mace)).toEqual(["d8", "Hefty"]);
		expect(itemContext(mace)).toEqual({ name: "Polished mace", gloss: "", kind: "Weapon", tags: "d8, Hefty", description: "<p>Heavy.</p>" });
	});

	it("keeps the name's gloss off the title, brackets dropped when they wrap it all", () => {
		const steed = { name: "Patient mare (VIG 11, CLA 8, SPI 6, 2GD, bought at a fair)", type: "gear", system: {} };
		expect(itemContext(steed)).toMatchObject({ name: "Patient mare", gloss: "VIG 11, CLA 8, SPI 6, 2GD, bought at a fair" });
		const hand = { name: "Iron hand (see below), hidden under a glove (A1)", type: "gear", system: {} };
		expect(itemContext(hand)).toMatchObject({ name: "Iron hand", gloss: "(see below), hidden under a glove (A1)" });
		expect(itemContext(hand, { showsTable: true })).toMatchObject({ name: "Iron hand", gloss: "hidden under a glove (A1)" });
		const coat = { name: "Coat, patched", type: "gear", system: {} };
		expect(itemContext(coat)).toMatchObject({ name: "Coat", gloss: "patched" });
	});
});

describe("postItem", () => {
	it("posts the item card spoken by the actor", async () => {
		const renderTemplate = vi.fn(async () => "<section></section>");
		const create = vi.fn(async (data) => data);
		globalThis.foundry = { applications: { handlebars: { renderTemplate } } };
		globalThis.ChatMessage = { implementation: { getSpeaker: ({ actor }) => ({ alias: actor.name }), applyMode: () => {}, create } };
		game.settings = { get: () => "public" };

		await postItem({ name: "Sir Ose" }, mace);
		expect(renderTemplate).toHaveBeenCalledWith(expect.stringMatching(/templates\/chat\/item\.hbs$/), { item: itemContext(mace) });
		expect(create.mock.calls[0][0].speaker).toEqual({ alias: "Sir Ose" });
	});

	it("posts nothing without an item", () => {
		expect(postItem({ name: "Sir Ose" }, undefined)).toBeNull();
	});
});
