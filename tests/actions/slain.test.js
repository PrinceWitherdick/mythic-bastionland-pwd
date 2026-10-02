import { afterEach, describe, expect, it, vi } from "vitest";
import { markTheSlain } from "../../module/actions/slain.js";

const someone = (id, vig, slain = false) => ({ id, system: { slain, virtues: { vig: { value: vig } } }, update: vi.fn(async () => {}) });

afterEach(() => {
	delete globalThis.game;
	delete globalThis.Actor;
});

describe("markTheSlain", () => {
	it("marks everybody a world has at VIG 0 Slain, as VIG 0 alone used to tell the dead", async () => {
		const updateDocuments = vi.fn(async () => []);
		globalThis.Actor = { implementation: { updateDocuments } };
		const loose = someone("bandit", 0);
		const linked = someone("tal", 0);
		globalThis.game = {
			actors: [someone("tal", 0), someone("moss", 6), someone("eve", 0, true), { id: "gate", system: { guard: { value: 0 } } }],
			scenes: { contents: [{ tokens: [{ actorLink: false, actor: loose }, { actorLink: false, actor: someone("fine", 4) }, { actorLink: true, actor: linked }] }] }
		};
		await markTheSlain();
		expect(updateDocuments).toHaveBeenCalledWith([{ _id: "tal", "system.slain": true }]);
		expect(loose.update).toHaveBeenCalledWith({ "system.slain": true });
		// A linked Token is its world Actor, marked with the rest.
		expect(linked.update).not.toHaveBeenCalled();
	});

	it("leaves a Knight's steed at VIG 0 Exhausted, as a Gallop always left it", async () => {
		const updateDocuments = vi.fn(async () => []);
		globalThis.Actor = { implementation: { updateDocuments } };
		const knight = { id: "tal", system: { slain: false, steed: "Actor.dun", virtues: { vig: { value: 5 } } } };
		const steed = { ...someone("dun", 0), uuid: "Actor.dun" };
		globalThis.game = { actors: [knight, steed, { ...someone("bandit", 0), uuid: "Actor.bandit" }], scenes: { contents: [] } };
		await markTheSlain();
		expect(updateDocuments).toHaveBeenCalledWith([{ _id: "bandit", "system.slain": true }]);
	});

	it("writes nothing to a world with nobody at VIG 0", async () => {
		const updateDocuments = vi.fn();
		globalThis.Actor = { implementation: { updateDocuments } };
		globalThis.game = { actors: [someone("moss", 6)], scenes: { contents: [] } };
		await markTheSlain();
		expect(updateDocuments).not.toHaveBeenCalled();
	});
});
