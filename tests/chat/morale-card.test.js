import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

vi.mock("../../module/actions/saves.js", () => ({
	rollMorale: vi.fn(async () => ({ passed: false })),
	// An NPC, or a Knight the Referee plays, keeps the mark (actions/saves.js).
	keepsMoraleMark: (actor) => actor?.type === "npc" || actor?.type === "npcKnight"
}));
vi.mock("../../module/actions/scars.js", () => ({ offerRevenge: vi.fn(async () => []) }));
vi.mock("../../module/actions/leading.js", () => ({ letGoOf: vi.fn(async () => {}) }));
vi.mock("../../module/ask-gm.js", () => ({ askActiveGM: vi.fn(async () => true) }));
vi.mock("../../module/chat/cards.js", async (importOriginal) => ({
	...(await importOriginal()),
	postCard: vi.fn(async () => ({ id: "message-1" }))
}));

const { postCard } = await import("../../module/chat/cards.js");
const { offerRevenge } = await import("../../module/actions/scars.js");
const { letGoOf } = await import("../../module/actions/leading.js");
const { askActiveGM } = await import("../../module/ask-gm.js");
const { breakMorale, clearMoraleBreak, onGroupMoraleQuery, promptGroupMorale, registerMoraleCards } = await import("../../module/chat/morale-card.js");

let hooks;
let warnings;

/** An NPC as the Morale card reads and writes them. */
function fakeNpc(uuid, { vig = 10, mortalWound = false, slain = false, moraleBroken = "", isOwner = true, type = "npc" } = {}) {
	const actor = {
		uuid,
		name: uuid.split(".").at(-1),
		type,
		isOwner,
		system: { virtues: { vig: { value: vig } }, mortalWound, slain, moraleBroken, structure: false },
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
	const combat = {
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
	for (const combatant of combatants) combatant.parent = combat;
	return combat;
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
	globalThis.CONFIG = { queries: {} };
	globalThis.foundry = { utils: { hasProperty: (object, path) => path.split(".").reduce((at, key) => (at && typeof at === "object" ? at[key] : undefined), object) !== undefined } };
});

afterEach(() => {
	for (const key of ["Hooks", "ui", "game", "CONFIG", "foundry"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("promptGroupMorale", () => {
	it("asks for the side's Morale when a Knight the Referee plays goes down, as for an NPC (p10)", async () => {
		const ruler = Object.assign(fakeNpc("Actor.ruler", { type: "knight", vig: 0, slain: true }), { hasPlayerOwner: false });
		const guard = fakeNpc("Actor.guard");
		game.combats = [fakeCombat([fakeCombatant("c1", ruler), fakeCombatant("c2", guard)])];
		await promptGroupMorale(ruler);
		const group = postCard.mock.calls.find(([, template]) => template === "morale-group");
		expect(group[3].flags[SYSTEM_ID].moraleGroup.actors).toEqual(["Actor.guard"]);
	});

	it("asks nothing when a player's Knight goes down", async () => {
		const kay = Object.assign(fakeNpc("Actor.kay", { type: "knight", vig: 0, slain: true }), { hasPlayerOwner: true });
		game.combats = [fakeCombat([fakeCombatant("c1", kay), fakeCombatant("c2", fakeNpc("Actor.guard"))])];
		expect(await promptGroupMorale(kay)).toBeNull();
		expect(postCard).not.toHaveBeenCalled();
	});
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
		const cole = fakeNpc("Actor.cole", { vig: 0, slain: true });
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

	it("marks a Knight the Referee plays as any NPC (p10)", async () => {
		const lord = fakeNpc("Actor.lord", { type: "npcKnight" });
		expect(await breakMorale([lord], "surrendered")).toEqual([lord]);
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

describe("the Morale buttons on a card", () => {
	/** Draw a card holding these buttons for this user, as the chat log does. */
	function render(buttons) {
		registerMoraleCards();
		const html = {
			querySelector: () => buttons[0],
			querySelectorAll: () => buttons,
			addEventListener: () => {}
		};
		hooks.renderChatMessageHTML({ id: "message-1" }, html);
		return buttons;
	}

	const button = (dataset) => ({ dataset, hidden: false });

	it("hides a roll or a broken mark from somebody who doesn't own the NPC", () => {
		const boar = fakeNpc("Actor.boar", { isOwner: false });
		const wolf = fakeNpc("Actor.wolf");
		globalThis.fromUuidSync = (uuid) => ({ "Actor.boar": boar, "Actor.wolf": wolf })[uuid] ?? null;
		const [roll, broken, mine, group] = render([
			button({ moraleRoll: "Actor.boar" }),
			button({ moraleBreak: "fled", actors: "Actor.boar" }),
			button({ moraleBreak: "fled", actors: "Actor.boar,Actor.wolf" }),
			button({ moraleGroup: "each" })
		]);
		expect(roll.hidden).toBe(true);
		expect(broken.hidden).toBe(true);
		expect(mine.hidden).toBe(false);
		expect(group.hidden).toBe(false);
		delete globalThis.fromUuidSync;
	});

	it("keeps the Referee's button for characters who are gone, so its click can say so", () => {
		globalThis.fromUuidSync = () => null;
		const [roll, broken] = render([button({ moraleRoll: "Actor.gone" }), button({ moraleBreak: "fled", actors: "Actor.gone" })]);
		expect(roll.hidden).toBe(false);
		expect(broken.hidden).toBe(false);
		game.user.isGM = false;
		const [theirs] = render([button({ moraleRoll: "Actor.gone" })]);
		expect(theirs.hidden).toBe(true);
		game.user.isGM = true;
		delete globalThis.fromUuidSync;
	});
});

describe("who counts toward a side's Morale", () => {
	it("counts a Warband broken at SPI 0 as down when its side's number is weighed (p11)", async () => {
		const broken = Object.assign(fakeNpc("Actor.militia"), {});
		Object.assign(broken.system, { scale: "warband", virtues: { vig: { value: 10 }, spi: { value: 0 } } });
		const ann = fakeNpc("Actor.ann");
		const bo = fakeNpc("Actor.bo", { vig: 0, slain: true });
		const cole = fakeNpc("Actor.cole");
		game.combats = [fakeCombat([broken, ann, bo, cole].map((actor, index) => fakeCombatant(`c${index}`, actor)))];
		// Bo alone is one of four; the broken Warband makes it half.
		await promptGroupMorale(bo);
		const group = postCard.mock.calls.find(([, template]) => template === "morale-group");
		expect(group[3].flags[SYSTEM_ID].moraleGroup.actors).toEqual(["Actor.ann", "Actor.cole"]);
	});

	it("counts a creature that counts as a structure as one of its side, down once destroyed (p11)", async () => {
		const colossus = fakeNpc("Actor.colossus");
		Object.assign(colossus.system, { structure: true, destroyed: true });
		const ann = fakeNpc("Actor.ann");
		game.combats = [fakeCombat([fakeCombatant("c1", colossus), fakeCombatant("c2", ann)])];
		await promptGroupMorale(colossus);
		const group = postCard.mock.calls.find(([, template]) => template === "morale-group");
		expect(group[3].flags[SYSTEM_ID].moraleGroup.actors).toEqual(["Actor.ann"]);
	});

	it("doesn't count one of the Cast that fights on through a Mortal Wound as down", async () => {
		const corpse = fakeNpc("Actor.corpse", { mortalWound: true });
		corpse.system.fightsOn = true;
		game.combats = [fakeCombat([fakeCombatant("c1", corpse), fakeCombatant("c2", fakeNpc("Actor.ann"))])];
		expect(await promptGroupMorale(corpse)).toBeNull();
	});
});

describe("a player who brings down one of their own", () => {
	it("asks the active GM to weigh the side's Morale, since only a GM can mark the Combat", async () => {
		game.user.isGM = false;
		const follower = fakeNpc("Actor.follower", { vig: 0, slain: true });
		game.combats = [fakeCombat([fakeCombatant("c1", follower), fakeCombatant("c2", fakeNpc("Actor.ann"))])];
		expect(await promptGroupMorale(follower)).toBeNull();
		expect(askActiveGM).toHaveBeenCalledWith(`${SYSTEM_ID}.groupMorale`, { uuid: "Actor.follower" }, expect.any(String));
		expect(postCard).not.toHaveBeenCalled();
	});

	it("asks nobody outside a Combat, or with no GM here", async () => {
		game.user.isGM = false;
		await promptGroupMorale(fakeNpc("Actor.follower", { slain: true }));
		game.users.activeGM = null;
		game.combats = [fakeCombat([fakeCombatant("c1", fakeNpc("Actor.x"))])];
		await promptGroupMorale(game.combats[0].combatants[0].actor);
		expect(askActiveGM).not.toHaveBeenCalled();
	});

	it("is answered by the GM only for somebody the asker owns", async () => {
		const follower = fakeNpc("Actor.follower", { vig: 0, slain: true });
		follower.testUserPermission = (user) => user.id === "player";
		game.combats = [fakeCombat([fakeCombatant("c1", follower), fakeCombatant("c2", fakeNpc("Actor.ann"))])];
		globalThis.fromUuidSync = (uuid) => (uuid === "Actor.follower" ? follower : null);
		expect(await onGroupMoraleQuery({ uuid: "Actor.follower" }, { user: { id: "stranger" } })).toBe(false);
		expect(await onGroupMoraleQuery({ uuid: "Actor.follower" }, { user: { id: "player" } })).toBe(true);
		expect(postCard).toHaveBeenCalledWith(null, "morale-group", expect.anything(), expect.anything());
		delete globalThis.fromUuidSync;
	});
});

describe("going down for good", () => {
	/** Fire the updateActor hook as Foundry would once an update lands. */
	async function landed(actor, changed) {
		registerMoraleCards();
		await hooks.updateActor(actor, changed);
	}

	it("takes a Slain or Mortally Wounded NPC out of the turn order, and lets go of what they led", async () => {
		const guard = fakeNpc("Actor.guard", { mortalWound: true });
		const combatant = fakeCombatant("c1", guard);
		game.combats = [fakeCombat([combatant])];
		await landed(guard, { system: { mortalWound: true } });
		expect(combatant.defeated).toBe(true);
		expect(combatant.flags[SYSTEM_ID].downed).toBe(true);
		expect(letGoOf).toHaveBeenCalledWith(guard);
	});

	it("stands them up again once patched up or healed", async () => {
		const guard = fakeNpc("Actor.guard", { mortalWound: true });
		const combatant = fakeCombatant("c1", guard);
		game.combats = [fakeCombat([combatant])];
		await landed(guard, { system: { mortalWound: true } });
		guard.system.mortalWound = false;
		await landed(guard, { system: { mortalWound: false } });
		expect(combatant.defeated).toBe(false);
		expect(combatant.flags[SYSTEM_ID].downed).toBe(false);
	});

	it("keeps them out once up again if their Morale broke meanwhile, until that's cleared", async () => {
		const guard = fakeNpc("Actor.guard", { vig: 0, slain: true });
		const combatant = fakeCombatant("c1", guard);
		game.combats = [fakeCombat([combatant])];
		await landed(guard, { system: { slain: true } });
		guard.system.moraleBroken = "fled";
		Object.assign(guard.system, { slain: false, virtues: { vig: { value: 4 } } });
		await landed(guard, { system: { slain: false } });
		expect(combatant.defeated).toBe(true);
		await clearMoraleBreak(guard);
		expect(combatant.defeated).toBe(false);
	});

	it("takes out a creature destroyed at 0GD, and a Warband wiped out by Virtue Loss (p11)", async () => {
		const colossus = fakeNpc("Actor.colossus");
		colossus.system.destroyed = true;
		const militia = fakeNpc("Actor.militia", { vig: 0 });
		militia.system.scale = "warband";
		const combatants = [fakeCombatant("c1", colossus), fakeCombatant("c2", militia)];
		game.combats = [fakeCombat(combatants)];
		await landed(colossus, { system: { guard: { value: 0 } } });
		await landed(militia, { system: { virtues: { vig: { value: 0 } } } });
		expect(combatants.map((each) => each.defeated)).toEqual([true, true]);
	});

	it("leaves a player's Knight their turns, and one the Referee marked defeated by hand", async () => {
		const kay = Object.assign(fakeNpc("Actor.kay", { type: "knight", vig: 0, slain: true }), { hasPlayerOwner: true });
		const guard = fakeNpc("Actor.guard", { mortalWound: true });
		const [theirs, byHand] = [fakeCombatant("c1", kay), fakeCombatant("c2", guard, { defeated: true })];
		game.combats = [fakeCombat([theirs, byHand])];
		await landed(kay, { system: { slain: true } });
		await landed(guard, { system: { mortalWound: true } });
		expect(theirs.defeated).toBe(false);
		guard.system.mortalWound = false;
		await landed(guard, { system: { mortalWound: false } });
		expect(byHand.defeated).toBe(true);
		// A Knight going down still lets go of a Warband they led.
		expect(letGoOf).toHaveBeenCalledWith(kay);
	});

	it("ignores updates that change nothing about it, and is done by the active GM alone", async () => {
		const guard = fakeNpc("Actor.guard", { mortalWound: true });
		const combatant = fakeCombatant("c1", guard);
		game.combats = [fakeCombat([combatant])];
		await landed(guard, { name: "Renamed" });
		game.users.activeGM = { isSelf: false };
		await landed(guard, { system: { mortalWound: true } });
		expect(combatant.defeated).toBe(false);
	});

	it("passes over a turn that falls to somebody taken out that way", async () => {
		registerMoraleCards();
		const combat = fakeCombat([fakeCombatant("c1", fakeNpc("Actor.ann")), fakeCombatant("c2", fakeNpc("Actor.bo"), { defeated: true, flags: { downed: true } })], { turn: 1 });
		await hooks.combatTurnChange(combat);
		expect(combat.nextTurn).toHaveBeenCalledOnce();
	});
});
