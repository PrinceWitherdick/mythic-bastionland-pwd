import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateActors } from "../../module/actions/actor-updates.js";

const actor = (id, extra = {}) => ({ id, isOwner: true, update: vi.fn(async () => {}), ...extra });

beforeEach(() => {
	globalThis.Actor = { implementation: { updateDocuments: vi.fn(async () => []) } };
});

afterEach(() => {
	delete globalThis.Actor;
});

describe("updateActors", () => {
	it("writes every world actor in one update, each with its own changes", async () => {
		const [ada, bram] = [actor("a"), actor("b")];
		await updateActors([[ada, { "system.glory": 1 }], [bram, { "system.glory": 2 }]], { ledgerCause: "Season" });
		expect(Actor.implementation.updateDocuments).toHaveBeenCalledTimes(1);
		expect(Actor.implementation.updateDocuments).toHaveBeenCalledWith([{ "system.glory": 1, _id: "a" }, { "system.glory": 2, _id: "b" }], { ledgerCause: "Season" });
		expect(ada.update).not.toHaveBeenCalled();
	});

	it("writes a Token's own copy on its own, each write with options of its own", async () => {
		const options = { ledgerCause: "Rest" };
		const [token, other] = [actor("t", { isToken: true }), actor("u", { isToken: true })];
		await updateActors([[token, { "system.guard.value": 3 }], [other, { "system.guard.value": 4 }]], options);
		expect(Actor.implementation.updateDocuments).not.toHaveBeenCalled();
		expect(token.update).toHaveBeenCalledWith({ "system.guard.value": 3 }, options);
		expect(token.update.mock.calls[0][1]).not.toBe(other.update.mock.calls[0][1]);
	});

	it("writes an actor this user may not change on its own, so its refusal takes nobody else's changes with it", async () => {
		const [own, theirs] = [actor("a"), actor("b", { isOwner: false, update: vi.fn(async () => { throw new Error("refused"); }) })];
		await expect(updateActors([[own, { "system.glory": 1 }], [theirs, { "system.glory": 2 }]])).rejects.toThrow("refused");
		expect(Actor.implementation.updateDocuments).toHaveBeenCalledWith([{ "system.glory": 1, _id: "a" }], {});
		expect(theirs.update).toHaveBeenCalledWith({ "system.glory": 2 }, {});
	});

	it("writes nothing when nobody is given", async () => {
		await updateActors([]);
		expect(Actor.implementation.updateDocuments).not.toHaveBeenCalled();
	});
});
