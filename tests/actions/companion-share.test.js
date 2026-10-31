import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

/**
 * Companions made from a Knight's gear, such as a steed carried as a line of
 * Property: a player who makes them owns them alone, so the Referee is asked
 * to share them as the Knight is shared.
 */

vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => null }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(), t: (key) => key }));
vi.mock("../../module/ask-gm.js", () => ({ askActiveGM: vi.fn(async () => true) }));
// One companion carried, the Knight's steed.
vi.mock("../../module/rules/property.js", async (importOriginal) => ({
	...(await importOriginal()),
	knightCompanions: () => [{ companion: { name: "Charger" }, steed: true, itemId: 0, keepLine: false }],
	companionActorData: (companion) => ({ type: "npc", name: companion.name, system: {} })
}));

const { makeCompanions } = await import("../../module/actions/property.js");
const { askActiveGM } = await import("../../module/ask-gm.js");

/** The Knight whose gear it is, shared between two players. */
const knight = { id: "k1", uuid: "Actor.k1", type: "knight", name: "Sir Tal", ownership: { alys: 3, ben: 3 }, system: { steed: "" } };

beforeEach(() => {
	globalThis.game = {
		user: { id: "alys", isGM: false, can: () => true },
		users: { activeGM: {} },
		actors: Object.assign([knight], { get: (id) => (id === knight.id ? knight : undefined) })
	};
	globalThis.Actor = {
		implementation: {
			create: vi.fn(async (list) => list.map((data, index) => ({
				...data,
				id: `n${index}`,
				uuid: `Actor.n${index}`,
				ownership: { alys: 3 },
				getFlag: (scope, key) => data.flags?.[scope]?.[key]
			})))
		}
	};
	globalThis.foundry = { utils: { deepClone: (value) => structuredClone(value) } };
	globalThis.ui = { notifications: { warn: vi.fn() } };
});

afterEach(() => {
	for (const key of ["game", "Actor", "foundry", "ui"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("makeCompanions", () => {
	it("has a player ask the Referee to share what they made with the Knight's other players", async () => {
		const { made } = await makeCompanions([{ type: "misc", name: "Charger" }], { folder: null, ownership: knight.ownership, id: knight.id });
		expect(made[0].flags[SYSTEM_ID].companionOf).toBe("k1");
		expect(made[0].ownership).toEqual({ alys: 3 });
		expect(askActiveGM).toHaveBeenCalledWith(`${SYSTEM_ID}.shareOwnership`, { fromId: "k1", actorIds: ["n0"] }, expect.any(String));
	});

	it("gives the Knight's ownership straight away when the Referee makes them, asking nobody", async () => {
		game.user.isGM = true;
		await makeCompanions([{ type: "misc", name: "Charger" }], { folder: null, ownership: knight.ownership, id: knight.id });
		expect(Actor.implementation.create.mock.calls[0][0][0].ownership).toEqual({ alys: 3, ben: 3 });
		expect(askActiveGM).not.toHaveBeenCalled();
	});
});
