import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CALENDAR_HOOK } from "../../module/actions/calendar.js";
import { COMPANY_MOVED_HOOK } from "../../module/actions/journey.js";
import { refreshAbilities, watchRestocks } from "../../module/actions/restock.js";
import { itemTags } from "../../module/actions/items.js";
import { SYSTEM_ID } from "../../module/system-id.js";
import { withBookText } from "../../module/rules/book-text.js";

const root = join(import.meta.dirname, "../..");
const lang = withBookText(JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8")));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);
const format = (key, data) => String(lookup(key) ?? key).replace(/\{(\w+)\}/g, (_match, name) => data?.[name] ?? "");

/** Handlers registered, by hook name. */
let hooks;
let notices;

/** The option a fight's end or a move writes with, so owners are told. */
const REFRESHED = { [SYSTEM_ID]: { refreshed: true } };

const ability = (id, restock, value, max = 1) => ({ id, name: id, type: "ability", system: { restock, quantity: { value, max } } });

/** A Knight with these items, who writes what's asked of them. */
function knight(items, type = "knight") {
	return {
		name: "Sir Test",
		type,
		isOwner: true,
		items: { contents: items, get: (id) => items.find((item) => item.id === id) },
		updateEmbeddedDocuments: vi.fn(async () => {})
	};
}

const at = (day, phase) => ({ age: 1, year: 1, season: "spring", day, phase });

beforeEach(() => {
	hooks = {};
	notices = [];
	const gm = { isGM: true };
	globalThis.Hooks = { on: (name, fn) => { (hooks[name] ??= []).push(fn); } };
	globalThis.game = {
		i18n: { localize: (key) => lookup(key) ?? key, format },
		user: gm,
		users: { activeGM: gm },
		actors: { contents: [] },
		scenes: { contents: [] }
	};
	globalThis.ui = { notifications: { info: (text) => notices.push(text) } };
});

afterEach(() => {
	for (const key of ["Hooks", "game", "ui"]) delete globalThis[key];
});

const fire = (name, ...args) => Promise.all((hooks[name] ?? []).map((fn) => fn(...args)));

describe("refreshAbilities", () => {
	it("brings back only Abilities on the cadences named, never possessions", async () => {
		const actor = knight([
			ability("rally", "attack", 0),
			ability("ward", "day", 0),
			{ id: "beads", name: "beads", type: "gear", system: { restock: "attack", quantity: { value: 0, max: 3 } } }
		]);
		await refreshAbilities(actor, ["attack"]);
		expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ _id: "rally", "system.quantity.value": 1 }], REFRESHED);
	});

	it("writes nothing when nothing is spent", async () => {
		const actor = knight([ability("rally", "attack", 1)]);
		expect(await refreshAbilities(actor, ["attack"])).toEqual([]);
		expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("says nothing was made when the write fails", async () => {
		const actor = knight([ability("rally", "attack", 0)]);
		actor.updateEmbeddedDocuments.mockRejectedValue(new Error("refused"));
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(await refreshAbilities(actor, ["attack"])).toEqual([]);
	});
});

describe("watchRestocks and Abilities", () => {
	it("brings a Phase's uses back with any step forward, and says they're ready", async () => {
		const actor = knight([ability("sigil", "phase", 0, 2)]);
		game.actors.contents = [actor];
		watchRestocks();
		await fire(CALENDAR_HOOK, at(3, "afternoon"), at(3, "morning"), ["phase"]);
		expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ _id: "sigil", "system.quantity.value": 2 }]);
		expect(notices).toEqual([format("bastionland.ability.refreshed", { name: actor.name, items: "sigil" })]);
	});

	it("brings nothing back for a calendar set back", async () => {
		const actor = knight([ability("sigil", "phase", 0, 2)]);
		game.actors.contents = [actor];
		watchRestocks();
		await fire(CALENDAR_HOOK, at(3, "morning"), at(3, "afternoon"), []);
		expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("readies a fight's uses for everybody in it once the Combat is deleted", async () => {
		const actor = knight([ability("frenzy", "combat", 0)]);
		watchRestocks();
		await fire("deleteCombat", { combatants: { contents: [{ actor }, { actor }, { actor: null }] } });
		expect(actor.updateEmbeddedDocuments).toHaveBeenCalledTimes(1);
		expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ _id: "frenzy", "system.quantity.value": 1 }], REFRESHED);
	});

	it("leaves the fight's end to the active GM", async () => {
		const actor = knight([ability("frenzy", "combat", 0)]);
		game.user = { isGM: false };
		watchRestocks();
		await fire("deleteCombat", { combatants: { contents: [{ actor }] } });
		expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("readies Knights' once-a-place uses when the Company comes into a new hex", async () => {
		const sir = knight([ability("omen", "location", 0)]);
		const beast = knight([ability("omen", "location", 0)], "npc");
		game.actors.contents = [sir, beast];
		watchRestocks();
		await fire(COMPANY_MOVED_HOOK, {}, { entered: [], ended: true });
		expect(sir.updateEmbeddedDocuments).not.toHaveBeenCalled();
		await fire(COMPANY_MOVED_HOOK, {}, { entered: [{ col: 1, row: 2 }], ended: true });
		expect(sir.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ _id: "omen", "system.quantity.value": 1 }], REFRESHED);
		expect(beast.updateEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("tells an owner of the uses readied in one write, together", async () => {
		const actor = knight([]);
		game.user = { isGM: false };
		watchRestocks();
		// Foundry calls the hook for each item of one write in turn, before anything else runs.
		for (const fn of hooks.updateItem) {
			fn({ name: "frenzy", type: "ability", parent: actor }, {}, REFRESHED);
			fn({ name: "omen", type: "ability", parent: actor }, {}, REFRESHED);
			fn({ name: "ward", type: "ability", parent: actor }, {}, {});
		}
		await Promise.resolve();
		expect(notices).toEqual([format("bastionland.ability.refreshed", { name: actor.name, items: "frenzy, omen" })]);
	});
});

describe("an Ability's row", () => {
	it("says when a limited Ability's uses come back", () => {
		expect(itemTags(ability("ward", "day", 1), { counted: false })).toEqual([lookup("bastionland.ability.per.day")]);
		expect(itemTags({ type: "ability", system: { restock: "", quantity: { value: null, max: null } } })).toEqual([]);
	});
});
