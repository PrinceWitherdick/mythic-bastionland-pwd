import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posted = [];
vi.mock("../../module/chat/cards.js", () => ({
	t: (key, data) => (data ? `${key}:${Object.values(data).join("|")}` : key),
	postCard: async (_actor, _template, data) => posted.push(data)
}));
vi.mock("../../module/actions/actor-updates.js", () => import("../mocks/actor-updates.js"));
vi.mock("../../module/actions/virtue-loss.js", () => ({ rollVirtueLosses: async () => ({ update: {}, taken: [] }) }));

const { afflictTargets } = await import("../../module/actions/afflictions.js");

const plague = { id: "p", name: "The Plague", loss: "1d6", virtue: "vig", when: "daily" };

const victim = (name) => ({ name, isOwner: true, system: { afflictions: [] }, update: vi.fn(async () => {}) });

beforeEach(() => {
	posted.length = 0;
	let next = 0;
	globalThis.foundry = { utils: { randomID: () => `a${next++}` } };
	globalThis.ui = { notifications: { warn: vi.fn() } };
});

afterEach(() => {
	for (const name of ["foundry", "ui", "game"]) delete globalThis[name];
});

describe("afflictTargets", () => {
	it("afflicts a linked actor targeted through two of its Tokens once", async () => {
		const ada = victim("Ada");
		const bram = victim("Bram");
		globalThis.game = { user: { targets: new Set([{ actor: ada }, { actor: ada }, { actor: bram }]) } };
		const took = await afflictTargets({ system: { inflicts: [plague] } });
		expect(ada.update).toHaveBeenCalledTimes(1);
		expect(ada.update.mock.calls[0][0]["system.afflictions"]).toHaveLength(1);
		expect(bram.update).toHaveBeenCalledTimes(1);
		expect(took).toHaveLength(2);
	});
});
