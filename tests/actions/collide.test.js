import { beforeEach, describe, expect, it, vi } from "vitest";

/** What the size question answers. */
let answer;

vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn(async () => (answer ? { size: answer } : null)) }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => null), registerCardButtons: vi.fn(), t: (key) => key, warn: vi.fn() }));
vi.mock("../../module/actions/damage.js", () => ({ takeDamage: vi.fn(async (actor, preset) => ({ actor: actor.name, ...preset })) }));

const { collide } = await import("../../module/actions/structures.js");
const { takeDamage } = await import("../../module/actions/damage.js");
const { inputDialog } = await import("../../module/apps/ui.js");
const { postCard } = await import("../../module/chat/cards.js");
const { SYSTEM_ID } = await import("../../module/system-id.js");

const ship = (name, isOwner = true) => ({ name, type: "structure", isOwner });

/** The faces of each die rolled, in order. */
let faces;

beforeEach(() => {
	vi.clearAllMocks();
	faces = [];
	globalThis.Roll = class {
		constructor(formula) {
			this.formula = formula;
			faces.push(Number(formula.split("d")[1]));
		}

		async evaluate() {
			this.total = 3;
			return this;
		}
	};
	globalThis.game = { user: { targets: new Set() } };
});

describe("collide", () => {
	it("harms only this ship with nothing targeted", async () => {
		answer = "similar";
		await collide(ship("Cog"));
		expect(faces).toEqual([12]);
		expect(takeDamage).toHaveBeenCalledTimes(1);
		expect(vi.mocked(inputDialog).mock.calls[0][0].context.intro).toBe("structure.collide.intro");
	});

	it("harms the targeted ship too, each by its size (p11)", async () => {
		const cog = ship("Cog");
		const warship = ship("Warship");
		game.user.targets = new Set([{ actor: warship }]);
		answer = "smaller";
		await collide(cog);
		expect(faces).toEqual([12, 6]);
		expect(vi.mocked(takeDamage).mock.calls.map(([actor]) => actor.name)).toEqual(["Cog", "Warship"]);
		expect(vi.mocked(takeDamage).mock.calls[1][1]).toMatchObject({ damage: 3, harm: { structure: true } });
	});

	it("offers a ship this user can't change its Damage on a card", async () => {
		game.user.targets = new Set([{ actor: { ...ship("Theirs", false), uuid: "Actor.theirs" } }]);
		answer = "larger";
		await collide(ship("Cog"));
		expect(faces).toEqual([6, 12]);
		expect(takeDamage).toHaveBeenCalledTimes(1);
		const [, , context, options] = vi.mocked(postCard).mock.calls[1];
		expect(context.action).toMatchObject({ data: "collision" });
		expect(options.flags[SYSTEM_ID].collision).toEqual({ ship: "Actor.theirs", damage: 3 });
	});

	it("rolls nothing when the question is closed", async () => {
		answer = null;
		expect(await collide(ship("Cog"))).toBeNull();
		expect(faces).toEqual([]);
	});
});

describe("the collision card's button", () => {
	it("is kept pressed only for whoever may change the ship", async () => {
		const { registerCollisions } = await import("../../module/actions/structures.js");
		const { registerCardButtons } = await import("../../module/chat/cards.js");
		registerCollisions();
		const { mayPress } = registerCardButtons.mock.calls.at(-1)[0];
		globalThis.fromUuidSync = (uuid) => (uuid === "Actor.cog" ? { testUserPermission: (user, level) => level === "OWNER" && user.id === "captain" } : null);
		try {
			const card = { flags: { [SYSTEM_ID]: { collision: { ship: "Actor.cog", damage: 3 } } } };
			expect(mayPress(card, { id: "captain" })).toBe(true);
			expect(mayPress(card, { id: "stowaway" })).toBe(false);
			expect(mayPress({ flags: {} }, { id: "captain" })).toBe(false);
		} finally {
			delete globalThis.fromUuidSync;
		}
	});
});
