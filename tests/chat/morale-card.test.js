import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

vi.mock("../../module/actions/saves.js", () => ({ rollMorale: vi.fn(async () => ({ passed: false })) }));
vi.mock("../../module/actions/scars.js", () => ({ offerRevenge: vi.fn(async () => []) }));
vi.mock("../../module/chat/cards.js", async (importOriginal) => ({
	...(await importOriginal()),
	postCard: vi.fn(async () => ({ id: "message-1" }))
}));

const { postCard } = await import("../../module/chat/cards.js");
const { offerRevenge } = await import("../../module/actions/scars.js");
const { breakMorale, clearMoraleBreak, registerMoraleCards } = await import("../../module/chat/morale-card.js");

let hooks;
let warnings;

/** An NPC as the Morale card reads and writes them. */
function fakeNpc(uuid, { vig = 10, mortalWound = false, moraleBroken = "", isOwner = true, type = "npc" } = {}) {
	const actor = {
		uuid,
		name: uuid.split(".").at(-1),
		type,
		isOwner,
		system: { virtues: { vig: { value: vig } }, mortalWound, moraleBroken, structure: false },
		update: vi.fn(async (changes) => {
			if ("system.moraleBroken" in changes) actor.system.moraleBroken = changes["system.moraleBroken"];
		})
	};
	return actor;
}

/** A Combatant for one of them, on the hostile side. */
function fakeCombatant(id, actor, { defeated = false, flags = {} } = {}) {
	return {
		id,
		actor,
		name: actor.name,
		isOwner: true,
		defeated,
		flags: { [SYSTEM_ID]: { ...flags } },
		token: { disposition: -1 },
		get isDefeated() {
			return this.defeated;
		},
		getFlag(scope, key) {
			return this.flags[scope]?.[key];
		}
	};
}

/** A started Combat holding them, which applies Combatant updates as Foundry would. */
function fakeCombat(combatants, { turn = 0 } = {}) {
	const flags = {};
	return {
		combatants,
		turns: combatants,
		started: true,
		turn,
		getFlag: (_scope, key) => flags[key],
		setFlag: vi.fn(async (_scope, key, value) => { flags[key] = value; }),
		nextTurn: vi.fn(async () => {}),
		updateEmbeddedDocuments: vi.fn(async (_type, updates) => {
			for (const { _id, ...changes } of updates) {
				const combatant = combatants.find((each) => each.id === _id);
				for (const [path, value] of Object.entries(changes)) {
					if (path === "defeated") combatant.defeated = value;
					else combatant.flags[SYSTEM_ID][path.split(".").at(-1)] = value;
				}
			}
		})
	};
}

beforeEach(() => {
	hooks = {};
	warnings = [];
	globalThis.Hooks = { on: (name, fn) => { hooks[name] = fn; } };
	globalThis.ui = { notifications: { warn: (text) => warnings.push(text), info: (text) => warnings.push(text) } };
	globalThis.game = {
		combats: [],
		user: { isGM: true },
		users: { activeGM: { isSelf: true } },
		i18n: { localize: (key) => key, format: (key) => key }
	};
});

afterEach(() => {
	for (const key of ["Hooks", "ui", "game"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("breakMorale", () => {
	it("marks them fled, takes them out of the turn order, and says so (p10)", async () => {
		const guard = fakeNpc("Actor.guard");
		const combatant = fakeCombatant("c1", guard);
		game.combats = [fakeCombat([combatant, fakeCombatant("c2", fakeNpc("Actor.other"))])];

		expect(await breakMorale([guard], "fled")).toEqual([guard]);
		expect(guard.system.moraleBroken).toBe("fled");
		expect(combatant.defeated).toBe(true);
		expect(combatant.flags[SYSTEM_ID].moraleBroke).toBe(true);
		expect(postCard).toHaveBeenCalledWith(guard, "note", expect.objectContaining({ text: "bastionland.morale.broke.fled.didOne" }));
		// Brought low, which may be the revenge a Humiliation waits on.
		expect(offerRevenge).toHaveBeenCalledWith(guard);
	});

	it("marks a whole organised group at once, on one card", async () => {
		const group = [fakeNpc("Actor.captain"), fakeNpc("Actor.ann")];
		await breakMorale(group, "surrendered");
		expect(group.map((actor) => actor.system.moraleBroken)).toEqual(["surrendered", "surrendered"]);
		expect(postCard).toHaveBeenCalledOnce();
		expect(postCard.mock.calls[0][0]).toBeNull();
		expect(postCard.mock.calls[0][2].text).toBe("bastionland.morale.broke.surrendered.did");
	});

	it("counts those who broke as down, so their side may be asked for its Morale", async () => {
		const [ann, bo] = [fakeNpc("Actor.ann"), fakeNpc("Actor.bo")];
		const cole = fakeNpc("Actor.cole", { vig: 0 });
		const dee = fakeNpc("Actor.dee");
		game.combats = [fakeCombat([ann, bo, cole, dee].map((actor, index) => fakeCombatant(`c${index}`, actor)))];
		// One of four down isn't half; Ann fleeing makes it two.
		await breakMorale([ann], "fled");
		const group = postCard.mock.calls.find(([, template]) => template === "morale-group");
		expect(group[3].flags[SYSTEM_ID].moraleGroup.actors).toEqual(["Actor.bo", "Actor.dee"]);
	});

	it("leaves a Combatant already marked defeated by hand as it was", async () => {
		const guard = fakeNpc("Actor.guard");
		const combatant = fakeCombatant("c1", guard, { defeated: true });
		game.combats = [fakeCombat([combatant])];
		await breakMorale([guard], "fled");
		expect(combatant.flags[SYSTEM_ID].moraleBroke).toBeUndefined();
		await clearMoraleBreak(guard);
		expect(combatant.defeated).toBe(true);
	});

	it("does nothing twice, and nothing for anybody but an NPC this user owns", async () => {
		expect(await breakMorale([fakeNpc("Actor.guard", { moraleBroken: "fled" })], "fled")).toEqual([]);
		expect(warnings).toEqual(["bastionland.morale.broke.already"]);
		expect(await breakMorale([fakeNpc("Actor.guard", { isOwner: false })], "fled")).toEqual([]);
		expect(warnings.at(-1)).toBe("bastionland.morale.broke.notOwner");
		expect(await breakMorale([fakeNpc("Actor.kay", { type: "knight" })], "fled")).toEqual([]);
		expect(await breakMorale([fakeNpc("Actor.guard")], "sulked")).toEqual([]);
		expect(postCard).not.toHaveBeenCalled();
	});
});

describe("clearMoraleBreak", () => {
	it("clears the mark and puts them back in the turn order", async () => {
		const guard = fakeNpc("Actor.guard");
		const combatant = fakeCombatant("c1", guard);
		game.combats = [fakeCombat([combatant])];
		await breakMorale([guard], "surrendered");

		expect(await clearMoraleBreak(guard)).toBe(true);
		expect(guard.system.moraleBroken).toBe("");
		expect(combatant.defeated).toBe(false);
		expect(await clearMoraleBreak(guard)).toBe(false);
	});

	it("keeps them defeated if they've gone down some other way meanwhile", async () => {
		const guard = fakeNpc("Actor.guard");
		const combatant = fakeCombatant("c1", guard);
		game.combats = [fakeCombat([combatant])];
		await breakMorale([guard], "fled");
		guard.system.mortalWound = true;
		await clearMoraleBreak(guard);
		expect(combatant.defeated).toBe(true);
	});
});

describe("the turn order", () => {
	it("passes over somebody whose Morale broke, as the tracker lands on them", async () => {
		registerMoraleCards();
		const combat = fakeCombat([fakeCombatant("c1", fakeNpc("Actor.ann")), fakeCombatant("c2", fakeNpc("Actor.bo", { moraleBroken: "fled" }))], { turn: 1 });
		await hooks.combatTurnChange(combat);
		expect(combat.nextTurn).toHaveBeenCalledOnce();

		combat.turn = 0;
		await hooks.combatTurnChange(combat);
		expect(combat.nextTurn).toHaveBeenCalledOnce();
	});

	it("is moved on by the active GM alone", async () => {
		registerMoraleCards();
		game.users.activeGM = { isSelf: false };
		const combat = fakeCombat([fakeCombatant("c1", fakeNpc("Actor.ann")), fakeCombatant("c2", fakeNpc("Actor.bo", { moraleBroken: "fled" }))], { turn: 1 });
		await hooks.combatTurnChange(combat);
		expect(combat.nextTurn).not.toHaveBeenCalled();
	});
});
