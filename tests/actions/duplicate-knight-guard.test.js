import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDuplicateKnightGuard } from "../../module/actions/knights.js";

const getProperty = (object, path) => (path in object ? object[path] : path.split(".").reduce((value, key) => value?.[key], object));

/** A Knight as the guard looks at one, whose updateSource writes to it as Foundry's does. */
function fakeKnight(id, name, knightType, { slain = false, isSquire = false, type = "knight" } = {}) {
	const actor = { id, name, type, system: { knightType, slain, isSquire } };
	actor.updateSource = vi.fn((changes) => (actor.system.knightType = changes["system.knightType"]));
	return actor;
}

let hooks;
let allowed;
let warn;
beforeEach(() => {
	hooks = {};
	allowed = false;
	warn = vi.fn();
	globalThis.Hooks = { on: (name, fn) => (hooks[name] = fn) };
	globalThis.foundry = { utils: { getProperty } };
	globalThis.ui = { notifications: { warn } };
	globalThis.game = {
		user: { id: "me" },
		settings: { get: () => allowed },
		i18n: { format: (key) => key, localize: (key) => key },
		actors: { contents: [fakeKnight("a", "Hamo", "Lantern"), fakeKnight("b", "Odo", "Gull", { slain: true })] }
	};
	registerDuplicateKnightGuard();
});

afterEach(() => {
	for (const name of ["Hooks", "foundry", "ui", "game"]) delete globalThis[name];
});

describe("a Knight's type written by any way but the sheet", () => {
	it("keeps another living character's Knight off, and lets the rest of the change through", () => {
		const knight = fakeKnight("c", "Wat", "");
		const changes = { name: "Walter", system: { knightType: "The Lantern Knight" } };
		hooks.preUpdateActor(knight, changes, {}, "me");
		expect(changes).toEqual({ name: "Walter", system: {} });
		expect(warn).toHaveBeenCalledOnce();
	});

	it("keeps it off in a change written with dotted keys", () => {
		const changes = { "system.knightType": "Lantern" };
		hooks.preUpdateActor(fakeKnight("c", "Wat", ""), changes, {}, "me");
		expect(changes).toEqual({});
	});

	it("lets a slain Knight's Knight, a free one, or one's own be taken", () => {
		for (const knightType of ["Gull", "Heron", "lantern"]) {
			const changes = { system: { knightType } };
			hooks.preUpdateActor(fakeKnight(knightType === "lantern" ? "a" : "c", "Wat", "Lantern"), changes, {}, "me");
			expect(changes.system.knightType).toBe(knightType);
		}
		expect(warn).not.toHaveBeenCalled();
	});

	it("leaves Squires, the slain, other users' changes and a Referee who allows it alone", () => {
		const squire = { system: { knightType: "Lantern", isSquire: true } };
		hooks.preUpdateActor(fakeKnight("c", "Wat", ""), squire, {}, "me");
		const slain = { system: { knightType: "Lantern", slain: true } };
		hooks.preUpdateActor(fakeKnight("c", "Wat", ""), slain, {}, "me");
		const theirs = { system: { knightType: "Lantern" } };
		hooks.preUpdateActor(fakeKnight("c", "Wat", ""), theirs, {}, "them");
		allowed = true;
		const allowedChange = { system: { knightType: "Lantern" } };
		hooks.preUpdateActor(fakeKnight("c", "Wat", ""), allowedChange, {}, "me");
		for (const changes of [squire, slain, theirs, allowedChange]) expect(changes.system.knightType).toBe("Lantern");
		expect(warn).not.toHaveBeenCalled();
	});

	it("clears the Knight from a living character made as one another already is", () => {
		const copy = fakeKnight(null, "Hamo (Copy)", "Lantern");
		hooks.preCreateActor(copy, {}, {}, "me");
		expect(copy.system.knightType).toBe("");
		expect(warn).toHaveBeenCalledOnce();
		const free = fakeKnight(null, "Wat", "Heron");
		hooks.preCreateActor(free, {}, {}, "me");
		expect(free.updateSource).not.toHaveBeenCalled();
	});
});
