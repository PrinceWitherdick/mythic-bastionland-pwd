import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerKnightTokenNames, showExistingKnightNames } from "../../module/actions/knight-token-names.js";

const NONE = 0;
const OWNER = 20;
const HOVER = 30;

/** An Actor as far as the name setting looks at one, whose updateSource writes to it as Foundry's does. */
function fakeActor(type, displayName = NONE) {
	const actor = { id: type, type, prototypeToken: { displayName } };
	actor.updateSource = vi.fn((changes) => (actor.prototypeToken.displayName = changes["prototypeToken.displayName"]));
	return actor;
}

const hasProperty = (object, path) => path.split(".").reduce((value, key) => value?.[key], object) !== undefined;

let hooks;
beforeEach(() => {
	hooks = {};
	globalThis.Hooks = { on: (name, fn) => (hooks[name] = fn) };
	globalThis.CONST = { TOKEN_DISPLAY_MODES: { NONE, OWNER, HOVER } };
	globalThis.foundry = { utils: { hasProperty } };
	globalThis.Actor = { implementation: { updateDocuments: vi.fn(async () => []) } };
	registerKnightTokenNames();
});

afterEach(() => {
	for (const name of ["Hooks", "CONST", "foundry", "Actor", "game"]) delete globalThis[name];
});

describe("new Knights", () => {
	it("show their name on hover to everyone", () => {
		const knight = fakeActor("knight");
		hooks.preCreateActor(knight, {});
		expect(knight.prototypeToken.displayName).toBe(HOVER);
	});

	it("keep a name setting they were made with", () => {
		const knight = fakeActor("knight", OWNER);
		hooks.preCreateActor(knight, { prototypeToken: { displayName: OWNER } });
		expect(knight.updateSource).not.toHaveBeenCalled();
	});

	it("leave other actors alone", () => {
		const foe = fakeActor("npc");
		hooks.preCreateActor(foe, {});
		expect(foe.updateSource).not.toHaveBeenCalled();
	});
});

describe("Knights already in the world", () => {
	it("show their name where it was shown to no one, on their prototype and on Scenes", async () => {
		const knight = { ...fakeActor("knight"), id: "k" };
		const chosen = { ...fakeActor("knight", OWNER), id: "c" };
		const foe = { ...fakeActor("npc"), id: "n" };
		const scene = {
			tokens: [
				{ id: "t1", actor: knight, displayName: NONE },
				{ id: "t2", actor: chosen, displayName: OWNER },
				{ id: "t3", actor: foe, displayName: NONE }
			],
			updateEmbeddedDocuments: vi.fn(async () => [])
		};
		globalThis.game = { actors: [knight, chosen, foe], scenes: [scene] };
		await showExistingKnightNames();
		expect(Actor.implementation.updateDocuments).toHaveBeenCalledWith([{ _id: "k", "prototypeToken.displayName": HOVER }]);
		expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith("Token", [{ _id: "t1", displayName: HOVER }]);
	});
});
