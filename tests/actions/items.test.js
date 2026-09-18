import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { itemContext, itemTags, postItem } from "../../module/actions/items.js";

const root = join(import.meta.dirname, "../..");
const lang = JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8"));
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
		expect(itemContext(mace)).toEqual({ name: "Polished mace", kind: "Weapon", tags: "d8, Hefty", description: "<p>Heavy.</p>" });
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
