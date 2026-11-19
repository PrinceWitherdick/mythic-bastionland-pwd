import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { linkExistingKnightTokens, registerKnightTokenLink } from "../../module/actions/knight-token-link.js";

/** An Actor as far as the link looks at one, whose updateSource writes to it as Foundry's does. */
function fakeActor(type, id = type, actorLink = false) {
	const actor = { id, type, prototypeToken: { actorLink } };
	actor.updateSource = vi.fn((changes) => (actor.prototypeToken.actorLink = changes["prototypeToken.actorLink"]));
	return actor;
}

const getProperty = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);

let hooks;
beforeEach(() => {
	hooks = {};
	globalThis.Hooks = { on: (name, fn) => (hooks[name] = fn) };
	globalThis.foundry = { utils: { getProperty } };
	globalThis.Actor = { implementation: { updateDocuments: vi.fn(async () => []) } };
	globalThis.ui = { notifications: { warn: vi.fn() } };
	registerKnightTokenLink();
});

afterEach(() => {
	for (const name of ["Hooks", "foundry", "Actor", "game", "ui"]) delete globalThis[name];
});

describe("new Knights", () => {
	it("get Tokens linked to their sheet, the Referee's NPC Knights too", () => {
		const knight = fakeActor("knight");
		const rival = fakeActor("npcKnight");
		hooks.preCreateActor(knight, {});
		hooks.preCreateActor(rival, {});
		expect(knight.prototypeToken.actorLink).toBe(true);
		expect(rival.prototypeToken.actorLink).toBe(true);
	});

	it("are linked though copied, imported or taken from a compendium, whose data always says unlinked", () => {
		const knight = fakeActor("knight");
		hooks.preCreateActor(knight, { prototypeToken: { actorLink: false } });
		expect(knight.prototypeToken.actorLink).toBe(true);
	});

	it("need nothing written where the copy is linked already", () => {
		const knight = fakeActor("knight", "knight", true);
		hooks.preCreateActor(knight, { prototypeToken: { actorLink: true } });
		expect(knight.updateSource).not.toHaveBeenCalled();
	});

	it("leave other actors alone", () => {
		const foe = fakeActor("npc");
		hooks.preCreateActor(foe, {});
		expect(foe.updateSource).not.toHaveBeenCalled();
	});
});

describe("Knights already in the world", () => {
	/** A world of one unlinked Knight, one linked, and a sentry, each with a Token on one Scene. */
	function world(knightDelta = {}) {
		const knight = fakeActor("knight", "k");
		const linked = fakeActor("knight", "l", true);
		const foe = fakeActor("npc", "n");
		const scene = {
			tokens: [
				{ id: "t1", name: "Sir Corvin", actorId: "k", actorLink: false, delta: knightDelta },
				{ id: "t2", name: "Dame Isolde", actorId: "l", actorLink: true, delta: {} },
				{ id: "t3", name: "Sentry", actorId: "n", actorLink: false, delta: { system: { guard: { value: 0 } } } }
			],
			updateEmbeddedDocuments: vi.fn(async () => [])
		};
		const actors = [knight, linked, foe];
		actors.get = (id) => actors.find((actor) => actor.id === id);
		globalThis.game = { actors, scenes: [scene], i18n: { format: (key) => key, localize: (key) => key } };
		return scene;
	}

	it("have their prototype and their Tokens on Scenes linked, and nobody else's", async () => {
		const scene = world();
		expect(await linkExistingKnightTokens()).toEqual([]);
		expect(Actor.implementation.updateDocuments).toHaveBeenCalledWith([{ _id: "k", "prototypeToken.actorLink": true }]);
		expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith("Token", [{ _id: "t1", actorLink: true }]);
		expect(ui.notifications.warn).not.toHaveBeenCalled();
	});

	it("tell the Referee whose Token had gone its own way", async () => {
		const scene = world({ system: { virtues: { vig: { value: 0 } } }, items: [] });
		expect(await linkExistingKnightTokens()).toEqual(["Sir Corvin"]);
		expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith("Token", [{ _id: "t1", actorLink: true }]);
		expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
	});
});
