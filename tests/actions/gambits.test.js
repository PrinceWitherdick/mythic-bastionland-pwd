import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gambitContext, postGambit } from "../../module/actions/gambits.js";
import { GAMBITS } from "../../module/config.js";
import { withBookText } from "../../module/rules/book-text.js";

const root = join(import.meta.dirname, "../..");
const lang = withBookText(JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8")));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);

beforeEach(() => {
	globalThis.game = { i18n: { localize: (key) => lookup(key) ?? key } };
});

afterEach(() => {
	delete globalThis.game;
	delete globalThis.foundry;
	delete globalThis.ChatMessage;
});

describe("gambitContext", () => {
	it("prints the sheet's line for every Gambit", () => {
		for (const key of GAMBITS) expect(gambitContext(key).effect).toBe(lookup(`bastionland.gambits.${key}`));
	});

	it("grants the target a VIG Save against all but Bolster and Move (p10)", () => {
		const saved = GAMBITS.filter((key) => gambitContext(key).save === lookup("bastionland.gambits.card.save"));
		expect(saved).toEqual(["repel", "stop", "impair", "trap", "dismount", "other"]);
		expect(gambitContext("bolster").save).toBe(lookup("bastionland.gambits.card.noSave"));
		expect(gambitContext("move").save).toBe(lookup("bastionland.gambits.card.noSave"));
	});

	it("adds the rules the sheet's short lines leave out", () => {
		expect(gambitContext("move").detail).toMatch(/after moving/);
		expect(gambitContext("dismount").detail).toMatch(/d6 Damage/);
		expect(gambitContext("repel").detail).toBeNull();
	});
});

describe("postGambit", () => {
	it("posts the Gambit card spoken by the actor", async () => {
		const renderTemplate = vi.fn(async () => "<section></section>");
		const create = vi.fn(async (data) => data);
		globalThis.foundry = { applications: { handlebars: { renderTemplate } } };
		globalThis.ChatMessage = { implementation: { getSpeaker: ({ actor }) => ({ alias: actor.name }), applyMode: () => {}, create } };
		game.settings = { get: () => "public" };

		await postGambit({ name: "Sir Ose" }, "trap");
		expect(renderTemplate).toHaveBeenCalledWith(expect.stringMatching(/templates\/chat\/gambit\.hbs$/), { gambit: gambitContext("trap") });
		expect(create.mock.calls[0][0].speaker).toEqual({ alias: "Sir Ose" });
	});

	it("posts nothing for a key that isn't a Gambit", () => {
		expect(postGambit({ name: "Sir Ose" }, "smite")).toBeNull();
	});
});
