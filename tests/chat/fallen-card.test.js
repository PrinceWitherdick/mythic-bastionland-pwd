import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/chat/cards.js", () => ({ registerCardButtons: vi.fn() }));
vi.mock("../../module/actions/npc-knights.js", () => ({ registerNpcKnightQueries: vi.fn() }));
vi.mock("../../module/actions/fallen.js", () => ({ carryOnFrom: vi.fn(async () => null) }));

const { registerCardButtons } = await import("../../module/chat/cards.js");
const { carryOnFrom } = await import("../../module/actions/fallen.js");
const { mayCarryOn, pressFallenPath, registerFallenCards } = await import("../../module/chat/fallen-card.js");

/** A fallen Knight's card button for one way on. */
const pathButton = (path) => ({ dataset: { fallenPath: path, fallenKnight: "Actor.ose" } });

afterEach(() => {
	for (const key of ["fromUuid", "fromUuidSync"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("the fallen Knight's card (players' audit)", () => {
	it("takes one way on, once, so a second press makes no second Knight", () => {
		registerFallenCards();
		expect(registerCardButtons).toHaveBeenCalledWith(expect.objectContaining({ selector: "[data-fallen-path]", once: true, oneChoice: true, mayPress: mayCarryOn, handler: pressFallenPath }));
	});

	it("lets the fallen Knight's player press it through the Referee, and nobody else", () => {
		globalThis.fromUuidSync = (uuid) => (uuid === "Actor.ose" ? { testUserPermission: (user, level) => level === "OWNER" && user.id === "ose-player" } : null);
		expect(mayCarryOn({}, { id: "ose-player" }, pathButton("newKnight"))).toBe(true);
		expect(mayCarryOn({}, { id: "someone" }, pathButton("newKnight"))).toBe(false);
		expect(mayCarryOn({}, { id: "ose-player" }, null)).toBe(false);
	});

	it("is spent only by a way on that worked", async () => {
		const ose = { name: "Sir Ose" };
		globalThis.fromUuid = vi.fn(async () => ose);
		expect(await pressFallenPath(pathButton("newKnight"))).toBe(false);
		carryOnFrom.mockResolvedValueOnce({ name: "Sir New" });
		expect(await pressFallenPath(pathButton("newKnight"))).toBe(true);
		expect(carryOnFrom).toHaveBeenLastCalledWith("newKnight", ose);
		expect(await pressFallenPath(pathButton("nonsense"))).toBe(false);
	});
});
