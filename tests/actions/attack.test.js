import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

// Only what reaches past the Attack itself is stubbed: the dialog, the chat, the
// memory of past choices, and the effects on the map.
vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn(async () => null) }));
vi.mock("../../module/chat/cards.js", async (importOriginal) => ({
	...(await importOriginal()),
	postCard: vi.fn(async () => ({ id: "message-1" }))
}));
vi.mock("../../module/chat/gambit-marks.js", () => ({ combatPlace: () => null, marksOn: vi.fn(() => []) }));
vi.mock("../../module/actions/attack-fx.js", () => ({ chatIsPublic: () => true, playBlowFx: vi.fn() }));
vi.mock("../../module/actions/items.js", () => ({ alternateText: () => "" }));
vi.mock("../../module/actions/attack-memory.js", async (importOriginal) => ({
	...(await importOriginal()),
	recallAttack: () => null,
	rememberAttack: vi.fn(async () => {})
}));
vi.mock("../../module/actions/duel.js", () => ({ openDuelFor: vi.fn(() => null), saveDuelChange: vi.fn() }));
vi.mock("../../module/actions/feats.js", () => ({ canDenyAttack: () => false, featContext: vi.fn(), payFeat: vi.fn(async () => {}), rollFeat: vi.fn(async () => null) }));
vi.mock("../../module/actions/leading.js", () => ({ leaderCandidates: vi.fn(() => []) }));

const { inputDialog } = await import("../../module/apps/ui.js");
const { rememberAttack } = await import("../../module/actions/attack-memory.js");
const { playBlowFx } = await import("../../module/actions/attack-fx.js");
const { postCard } = await import("../../module/chat/cards.js");
const { marksOn } = await import("../../module/chat/gambit-marks.js");
const { openDuelFor } = await import("../../module/actions/duel.js");
const { leaderCandidates } = await import("../../module/actions/leading.js");
const { attack, attackCardContext, joinAttack } = await import("../../module/actions/attack.js");

/** A weapon as the Attack dialog reads one off a sheet. */
const weapon = (id, name, damage, extra = {}) => ({ id, name, type: "weapon", system: { equipped: true, damage, ...extra } });

/** Somebody who attacks, or is attacked. */
function combatant({ uuid, name, type = "npc", scale = "individual", items = [] }) {
	return {
		uuid,
		name,
		type,
		isOwner: true,
		items,
		getActiveTokens: () => [],
		update: vi.fn(async () => {}),
		system: { scale, wields: "", conditions: {}, knowsFeat: () => false }
	};
}

let tokens;

/** Target Tokens for this user, each standing for an actor. */
function target(...actors) {
	game.user.targets = new Set(actors.map((each) => {
		const uuid = `Scene.s.Token.${each.name}`;
		tokens[uuid] = { actor: each };
		return { document: { uuid, name: each.name } };
	}));
}

beforeEach(() => {
	tokens = {};
	inputDialog.mockResolvedValue(null);
	marksOn.mockReturnValue([]);
	openDuelFor.mockReturnValue(null);
	leaderCandidates.mockReturnValue([]);
	globalThis.fromUuidSync = (uuid) => tokens[uuid] ?? null;
	globalThis.game = {
		user: { targets: new Set() },
		users: [],
		i18n: { localize: (key) => key, format: (key) => key }
	};
	globalThis.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
	globalThis.foundry = {
		utils: {
			randomID: () => "attack-1",
			expandObject: (flat) => {
				const out = {};
				for (const [key, value] of Object.entries(flat)) {
					const parts = key.split(".");
					const last = parts.pop();
					parts.reduce((node, part) => (node[part] ??= {}), out)[last] = value;
				}
				return out;
			}
		}
	};
	// Every die shows its highest face, so the cards can be read without luck.
	globalThis.Roll = class {
		constructor(formula) {
			this.formula = formula;
		}

		async evaluate() {
			this.dice = this.formula.split(" + ").map((term) => ({ total: Number(term.slice(2)) }));
			return this;
		}

		toJSON() {
			return { class: "Roll", formula: this.formula, evaluated: true };
		}
	};
});

afterEach(() => {
	for (const key of ["fromUuidSync", "game", "ui", "foundry", "Roll"]) delete globalThis[key];
	vi.clearAllMocks();
});

/** @returns {object} What the Attack dialog opened on. */
const opened = () => inputDialog.mock.calls[0][0].context;

describe("a Warband's Attack against individuals (p11)", () => {
	const raiders = () => combatant({ uuid: "Actor.raiders", name: "Raiders", scale: "warband", items: [weapon("spear", "Spears", "d8")] });

	it("opens ticked when everybody targeted is an individual, as Tal and Moss are (p189)", async () => {
		target(combatant({ uuid: "Actor.tal", name: "Tal", type: "knight" }), combatant({ uuid: "Actor.moss", name: "Moss", type: "knight" }));
		await attack(raiders());
		expect(opened().againstIndividuals).toBe(true);
		expect(opened().againstIndividualsTip).toBe("bastionland.attack.individualsAll");
	});

	it("opens unticked at another Warband, a swarm or a structure", async () => {
		for (const foe of [
			combatant({ uuid: "Actor.militia", name: "Militia", scale: "warband" }),
			combatant({ uuid: "Actor.bats", name: "Bats", scale: "swarm" }),
			combatant({ uuid: "Actor.gate", name: "Gate", type: "structure" })
		]) {
			inputDialog.mockClear();
			target(combatant({ uuid: "Actor.tal", name: "Tal", type: "knight" }), foe);
			await attack(raiders());
			expect(opened().againstIndividuals).toBe(false);
			expect(opened().againstIndividualsTip).toBe("bastionland.attack.individualsNot");
		}
	});

	it("adds its +d12 only to the cards at individuals when the targets are mixed (p11, p189)", async () => {
		target(combatant({ uuid: "Actor.tal", name: "Tal", type: "knight" }), combatant({ uuid: "Actor.militia", name: "Militia", scale: "warband" }));
		inputDialog.mockResolvedValue({ "source.spear": true, againstIndividuals: true });
		await attack(raiders());
		const cards = postCard.mock.calls.map((call) => call[3].flags[SYSTEM_ID].attack);
		expect(cards.map((card) => card.targets[0].name)).toEqual(["Tal", "Militia"]);
		expect(cards.map((card) => card.dice.map((die) => die.faces))).toEqual([[12, 8], [8]]);
		expect(cards.every((card) => card.blast)).toBe(true);
	});

	it("opens as it always did with nobody targeted", async () => {
		await attack(raiders());
		expect(opened().againstIndividuals).toBe(true);
		expect(opened().againstIndividualsTip).toBeNull();
	});
});

describe("an Attack under an Impair that named one weapon (p186)", () => {
	const croc = () => combatant({ uuid: "Actor.croc", name: "Crocodile", items: [weapon("jaw", "Jaws", "d10"), weapon("tail", "Tail", "d6")] });

	beforeEach(() => {
		marksOn.mockReturnValue([{ key: "impair", weapon: { id: "jaw", name: "Jaws", actor: "Actor.croc" }, hint: "Jaws Impaired" }]);
		target(combatant({ uuid: "Actor.moss", name: "Moss", type: "knight" }));
	});

	it("opens with that weapon unticked, and the rest free to fight", async () => {
		await attack(croc());
		expect(opened().sources.map(({ name, checked }) => `${name}:${checked}`)).toEqual(["Jaws:false", "Tail:true"]);
		expect(opened().impaired).toBe(false);
		expect(opened().marks).toEqual(["Jaws Impaired"]);
	});

	it("rolls a single d4 for an Attack made with it, and says why", async () => {
		inputDialog.mockResolvedValue({ "source.jaw": true, "source.tail": true });
		await attack(croc());
		const state = postCard.mock.calls[0][3].flags[SYSTEM_ID].attack;
		expect(state.dice.map((die) => die.faces)).toEqual([4]);
		expect(state).toMatchObject({ impaired: true, impairedWeapon: "Jaws" });
	});

	it("leaves an Attack with its other weapons whole", async () => {
		inputDialog.mockResolvedValue({ "source.tail": true });
		await attack(croc());
		const state = postCard.mock.calls[0][3].flags[SYSTEM_ID].attack;
		expect(state.dice.map((die) => die.faces)).toEqual([6]);
		expect(state).toMatchObject({ impaired: false, impairedWeapon: null });
	});

	it("names the weapon each die was rolled for, so a foe can Impair what it has seen", async () => {
		inputDialog.mockResolvedValue({ "source.tail": true });
		await attack(croc());
		expect(postCard.mock.calls[0][3].flags[SYSTEM_ID].attack.dice).toEqual([expect.objectContaining({ label: "Tail", item: "tail" })]);
	});

	it("still holds the whole next Attack for an Impair that named none", async () => {
		marksOn.mockReturnValue([{ key: "impair", weapon: null, hint: "Impaired" }]);
		inputDialog.mockResolvedValue({ "source.tail": true });
		await attack(croc());
		expect(opened().impaired).toBe(true);
		expect(postCard.mock.calls[0][3].flags[SYSTEM_ID].attack.dice.map((die) => die.faces)).toEqual([4]);
	});
});

describe("an Attack in a sparring bout", () => {
	it("says in the dialog that the duel is a sparring bout (p188)", async () => {
		openDuelFor.mockReturnValue({ message: { id: "duel-1" }, duel: { kind: "duel", sparring: true }, opponent: { token: "Scene.s.Token.Kay", name: "Ser Kay" } });
		await attack(combatant({ uuid: "Actor.tal", name: "Tal", type: "knight" }));
		expect(opened().duel).toBe("bastionland.duel.attackInSparring");

		inputDialog.mockClear();
		openDuelFor.mockReturnValue({ message: { id: "duel-1" }, duel: { kind: "duel", sparring: false }, opponent: { token: "Scene.s.Token.Kay", name: "Ser Kay" } });
		await attack(combatant({ uuid: "Actor.tal", name: "Tal", type: "knight" }));
		expect(opened().duel).toBe("bastionland.duel.attackIn");
	});
});

describe("an Attack by somebody down or Exhausted (p8, p9)", () => {
	const tal = (system = {}) => {
		const knight = combatant({ uuid: "Actor.tal", name: "Tal", type: "knight", items: [weapon("mace", "Mace", "d8")] });
		Object.assign(knight.system, system);
		return knight;
	};

	it("isn't made at all by somebody Mortally Wounded, who is down and dying", async () => {
		expect(await attack(tal({ mortalWound: true }))).toBeNull();
		expect(inputDialog).not.toHaveBeenCalled();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.conditions.mortalWound.down");
	});

	it("isn't made by the Slain either", async () => {
		expect(await attack(tal({ slain: true }))).toBeNull();
		expect(inputDialog).not.toHaveBeenCalled();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.conditions.slain.down");
	});

	it("counts a charge as moving, which an Exhausted rider can't Attack after", async () => {
		inputDialog.mockResolvedValue({ "source.mace": true, charge: true });
		expect(await attack(tal({ conditions: { exhausted: true } }))).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.attack.refusals.exhausted");
		expect(postCard).not.toHaveBeenCalled();
	});

	it("lets an Exhausted Knight who stood their ground Attack", async () => {
		inputDialog.mockResolvedValue({ "source.mace": true });
		await attack(tal({ conditions: { exhausted: true } }));
		expect(postCard).toHaveBeenCalled();
	});
});

describe("joining an Attack (p8)", () => {
	const boar = combatant({ uuid: "Actor.boar", name: "Boar" });
	const card = () => ({
		attackId: "attack-0",
		attacker: "Actor.moss",
		attackerName: "Moss",
		targets: [{ uuid: "Scene.s.Token.Boar", name: "Boar" }],
		dice: [{ faces: 4, result: 4, label: "Shield", deniedBy: null }],
		melee: true,
		impaired: false,
		gambits: [],
		feats: [],
		appliedTo: []
	});
	const tal = () => combatant({ uuid: "Actor.tal", name: "Tal", type: "knight", items: [weapon("hammer", "Hookhammer", "d8", { hefty: true })] });

	beforeEach(() => {
		tokens["Scene.s.Token.Boar"] = { actor: boar };
		// Whoever this user targets now is beside the point: the card's target is struck.
		target(combatant({ uuid: "Actor.other", name: "Other" }));
	});

	it("asks in the joiner's own Attack dialog, aimed at the card's targets", async () => {
		await joinAttack(tal(), card());
		expect(inputDialog.mock.calls[0][0].title).toBe("bastionland.attack.joinTitle");
		expect(inputDialog.mock.calls[0][0].ok.label).toBe("bastionland.attack.joinRoll");
		expect(opened().duel).toBeFalsy();
	});

	it("rolls their dice for the card without posting one of their own", async () => {
		inputDialog.mockResolvedValue({ "source.hammer": true });
		const { change } = await joinAttack(tal(), card());
		expect(postCard).not.toHaveBeenCalled();
		expect(change).toMatchObject({
			type: "join",
			actor: "Actor.tal",
			name: "Tal",
			melee: true,
			impaired: false,
			dice: [{ faces: 8, result: 8, label: "Hookhammer", deniedBy: null }],
			// Kept on the card's message, for the roll's tooltip.
			rolls: [{ formula: "1d8", evaluated: true }],
			leader: null
		});
	});

	it("names whoever leads a joining Warband from the front, whose dice join too (p11)", async () => {
		const aldric = combatant({ uuid: "Actor.aldric", name: "Aldric", type: "knight", items: [weapon("sword", "Longsword", "d10")] });
		leaderCandidates.mockReturnValue([aldric]);
		const raiders = combatant({ uuid: "Actor.raiders", name: "Raiders", scale: "warband", items: [weapon("spear", "Spears", "d8")] });
		inputDialog.mockResolvedValue({ "source.spear": true, leader: "Actor.aldric" });
		const { change } = await joinAttack(raiders, card());
		expect(change.leader).toEqual({ uuid: "Actor.aldric", name: "Aldric" });
		expect(change.dice.map((die) => die.label)).toContain("Aldric");
		// Only the Warband's own weapon is named on its dice; the leader's are not its to show.
		expect(change.dice.map((die) => die.item ?? null).sort()).toEqual([null, "spear"]);
	});

	it("adds no second die for a weakness the card already has (p188)", async () => {
		tokens["Scene.s.Token.Boar"] = { actor: { ...boar, system: { ...boar.system, weakness: { text: "fire", die: "d10", known: true } } } };
		await joinAttack(tal(), card());
		expect(opened().weaknesses).toHaveLength(1);

		inputDialog.mockClear();
		const weakened = card();
		weakened.dice.push({ faces: 10, result: 7, label: "Weakness, fire", deniedBy: null, weakness: true });
		await joinAttack(tal(), weakened);
		expect(opened().weaknesses).toHaveLength(0);
	});

	it("spends nothing until the card takes the join", async () => {
		const javelins = weapon("jav", "Javelins", "d6", { usedUp: true, quantity: { value: 3, max: 3 } });
		javelins.isOwner = true;
		javelins.update = vi.fn(async () => {});
		const thrower = combatant({ uuid: "Actor.tal", name: "Tal", type: "knight", items: [javelins] });
		inputDialog.mockResolvedValue({ "source.jav": true });
		const joined = await joinAttack(thrower, card());
		expect(joined.change.dice.map((die) => die.faces)).toEqual([6]);
		expect(javelins.update).not.toHaveBeenCalled();
		expect(rememberAttack).not.toHaveBeenCalled();
		expect(playBlowFx).not.toHaveBeenCalled();

		await joined.settle();
		expect(javelins.update).toHaveBeenCalledOnce();
		expect(rememberAttack).toHaveBeenCalledOnce();
		expect(playBlowFx).toHaveBeenCalledOnce();
	});

	it("turns away a Blast joining a card at several targets, since a Blast rolls for each (p8)", async () => {
		tokens["Scene.s.Token.Wolf"] = { actor: combatant({ uuid: "Actor.wolf", name: "Wolf" }) };
		const two = { ...card(), targets: [...card().targets, { uuid: "Scene.s.Token.Wolf", name: "Wolf" }] };
		const firepot = combatant({ uuid: "Actor.tal", name: "Tal", type: "knight", items: [weapon("pot", "Firepot", "d6", { blast: true })] });
		inputDialog.mockResolvedValue({ "source.pot": true });
		expect(await joinAttack(firepot, two)).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.attack.joinBlastSeveral");

		// At one target, a Blast is that target's roll, and joins.
		expect(await joinAttack(firepot, card())).not.toBeNull();
	});

	it("joins nothing when the dialog is closed", async () => {
		expect(await joinAttack(tal(), card())).toBeNull();
	});
});

describe("the card of a joint Attack", () => {
	const state = (extra = {}) => ({
		attacker: "Actor.moss",
		attackerName: "Moss",
		targets: [],
		dice: [{ faces: 8, result: 6, label: "Cudgel", deniedBy: null, by: "Moss" }],
		melee: true,
		impaired: false,
		gambits: [],
		feats: [],
		appliedTo: [],
		joined: [{ actor: "Actor.raiders", name: "Raiders", impaired: false, setAside: [], leader: { uuid: "Actor.aldric", name: "Aldric" } }],
		...extra
	});

	it("names whoever leads a joining Warband from the front (p11)", () => {
		expect(attackCardContext(state()).joined[0].leader).toBe("bastionland.attack.ledBy");
		expect(attackCardContext(state({ joined: [{ actor: "Actor.tal", name: "Tal", impaired: false, setAside: [] }] })).joined[0].leader).toBeNull();
	});

	it("offers Join only until a Deny, Gambit or Focus is declared (p8)", () => {
		expect(attackCardContext(state()).joinable).toBe(true);
		expect(attackCardContext(state({ declared: true })).joinable).toBe(false);
	});
});

describe("a joint Attack card's Damage against its target (p8, p11)", () => {
	const militia = combatant({ uuid: "Actor.militia", name: "Militia", scale: "warband" });
	// Moss's 8 is an individual's blow; Tal's 5 is a Blast; Tal's 3 Bolsters nothing yet.
	const joint = (extra = {}) => ({
		attacker: "Actor.moss",
		attackerName: "Moss",
		targets: [{ uuid: "Scene.s.Token.Militia", name: "Militia" }],
		dice: [
			{ faces: 8, result: 8, label: "Cudgel", deniedBy: null, actor: "Actor.moss", by: "Moss", blast: false, largeScale: false },
			{ faces: 6, result: 5, label: "Firepot", deniedBy: null, actor: "Actor.tal", by: "Tal", blast: true, largeScale: false }
		],
		melee: true,
		impaired: false,
		blast: true,
		gambits: [],
		feats: [],
		appliedTo: [],
		joined: [{ actor: "Actor.tal", name: "Tal", impaired: false, setAside: [] }],
		...extra
	});

	beforeEach(() => {
		tokens["Scene.s.Token.Militia"] = { actor: militia };
	});

	it("takes the highest die of those that can harm it, and strikes through the rest", () => {
		const context = attackCardContext(joint());
		expect(context.damage).toBe(5);
		expect(context.unharmed).toBeNull();
		expect(context.barredNote).toBe("bastionland.attack.barredNote");
		expect(context.dice.map(({ barred, isHighest }) => [barred, isHighest])).toEqual([
			["bastionland.attack.barred.warband", false],
			[null, true]
		]);
	});

	it("adds Bolster to that die, not to one that can't harm it", () => {
		const bolstered = joint({ gambits: [{ key: "bolster", die: 0, save: null }] });
		expect(attackCardContext(bolstered)).toMatchObject({ damage: 6, breakdown: "bastionland.attack.breakdown" });
	});

	it("says so, with no number, when nobody's blow can harm it", () => {
		const context = attackCardContext(joint({ dice: [joint().dice[0]], blast: false }));
		expect(context.unharmed).toBe("bastionland.attack.cantHarm");
		expect(context.barredNote).toBeNull();
	});

	it("reads an individual target as it always did", () => {
		tokens["Scene.s.Token.Militia"] = { actor: combatant({ uuid: "Actor.boar", name: "Boar" }) };
		const context = attackCardContext(joint());
		expect(context.damage).toBe(8);
		expect(context.dice.every(({ barred }) => barred === null)).toBe(true);
		expect(context.barredNote).toBeNull();
	});

	it("leaves a lone attacker's card at a Warband exactly as before", () => {
		const alone = joint({ joined: undefined, blast: false, dice: [{ faces: 8, result: 8, label: "Cudgel", deniedBy: null }] });
		const context = attackCardContext(alone);
		expect(context.damage).toBe(8);
		expect(context.unharmed).toBeNull();
		expect(context.dice[0].barred).toBeNull();
	});
});

describe("what's declared for one blow, by an Ability or by hand", () => {
	const ability = (id, name, grants, quantity = { value: null, max: null }, restock = "") => ({ id, name, type: "ability", system: { grants, quantity, restock } });
	function knight(items) {
		const actor = combatant({ uuid: "Actor.tal", name: "Tal", type: "knight", items: [weapon("hammer", "Hookhammer", "d8"), ...items] });
		actor.updateEmbeddedDocuments = vi.fn(async () => {});
		return actor;
	}
	const state = (call = 0) => postCard.mock.calls[call][3].flags[SYSTEM_ID].attack;

	beforeEach(() => target(combatant({ uuid: "Actor.boar", name: "Boar" }), combatant({ uuid: "Actor.wolf", name: "Wolf" })));

	it("offers each grant by hand, and Abilities that lend one: ticked with no limit, unticked with uses", async () => {
		await attack(knight([
			ability("thunder", "Thunder Strike", { blast: true }, { value: 1, max: 1 }, "day"),
			ability("pierce", "Piercing Gaze", { ignoresArmour: true }),
			ability("spent", "Spent Already", { blast: true }, { value: 0, max: 1 }, "day"),
			ability("song", "Song", {})
		]));
		expect(opened().declarations.map(({ key }) => key)).toEqual(["blast", "ignoresArmour", "strongGambits"]);
		expect(opened().abilityOffers.map(({ id, checked }) => [id, checked])).toEqual([["thunder", false], ["pierce", true]]);
	});

	it("makes a Blast declared by hand strike each target on a card of its own", async () => {
		inputDialog.mockResolvedValue({ "source.hammer": true, "declare.blast": true });
		await attack(knight([]));
		expect(postCard).toHaveBeenCalledTimes(2);
		expect(state(0)).toMatchObject({ blast: true, ignoresArmour: false, strongGambits: false });
	});

	it("carries an Ability's grants to the card, and spends one of its uses", async () => {
		const actor = knight([ability("thunder", "Thunder Strike", { blast: true, ignoresArmour: true }, { value: 2, max: 2 }, "day")]);
		inputDialog.mockResolvedValue({ "source.hammer": true, "ability.thunder": true });
		await attack(actor);
		expect(state(0)).toMatchObject({ blast: true, ignoresArmour: true });
		expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ _id: "thunder", "system.quantity.value": 1 }]);
	});

	it("readies an Ability good once an Attack for this one, then spends it if used", async () => {
		const actor = knight([
			ability("rally", "Rally", { strongGambits: true }, { value: 0, max: 1 }, "attack"),
			ability("roar", "Roar", { strongGambits: true }, { value: 0, max: 1 }, "attack")
		]);
		inputDialog.mockResolvedValue({ "source.hammer": true, "ability.roar": true });
		await attack(actor);
		// Both were spent on the last Attack and are offered again for this one.
		expect(opened().abilityOffers.map(({ id }) => id)).toEqual(["rally", "roar"]);
		expect(state(0).strongGambits).toBe(true);
		expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [
			{ _id: "rally", "system.quantity.value": 1 },
			{ _id: "roar", "system.quantity.value": 0 }
		]);
	});

	it("keeps a declared Blast when the Attack is Impaired, since it isn't a Feat", async () => {
		marksOn.mockReturnValue([{ key: "impair", weapon: null, hint: "Impaired" }]);
		inputDialog.mockResolvedValue({ "source.hammer": true, "declare.blast": true });
		await attack(knight([]));
		expect(state(0)).toMatchObject({ impaired: true, blast: true });
	});
});

describe("dice kept for the rest of the fight", () => {
	let flag;
	let entry;
	const tal = () => combatant({ uuid: "Actor.tal", name: "Tal", type: "knight", items: [weapon("hammer", "Hookhammer", "d8")] });

	beforeEach(() => {
		flag = [{ faces: 10, label: "Fury" }];
		target(combatant({ uuid: "Actor.boar", name: "Boar" }));
	});

	function inCombat(actor) {
		entry = {
			actor,
			getFlag: () => flag,
			setFlag: vi.fn(async (_scope, _key, value) => { flag = value; })
		};
		game.combats = [{ started: true, combatants: [entry] }];
		return actor;
	}

	it("offers each one ticked, and rolls those left ticked", async () => {
		const actor = inCombat(tal());
		inputDialog.mockResolvedValue({ "source.hammer": true, "lasting.0": true });
		await attack(actor);
		expect(opened().lasting).toEqual([{ index: 0, label: "bastionland.attack.lastingDie" }]);
		expect(opened().canKeep).toBe(true);
		expect(postCard.mock.calls[0][3].flags[SYSTEM_ID].attack.dice.map((die) => die.label)).toEqual(["Fury", "Hookhammer"]);
	});

	it("leaves one out of this blow alone when unticked", async () => {
		const actor = inCombat(tal());
		inputDialog.mockResolvedValue({ "source.hammer": true });
		await attack(actor);
		expect(postCard.mock.calls[0][3].flags[SYSTEM_ID].attack.dice.map((die) => die.label)).toEqual(["Hookhammer"]);
		expect(flag).toEqual([{ faces: 10, label: "Fury" }]);
	});

	it("keeps the bonus dice for the rest of the fight when asked", async () => {
		const actor = inCombat(tal());
		inputDialog.mockResolvedValue({ "source.hammer": true, bonus: "d8", keepBonus: true });
		await attack(actor);
		expect(entry.setFlag).toHaveBeenCalledWith(SYSTEM_ID, "lastingDice", [{ faces: 10, label: "Fury" }, { faces: 8, label: "bastionland.attack.bonus" }]);
	});

	it("can't keep any outside a Combat", async () => {
		await attack(tal());
		expect(opened().canKeep).toBe(false);
		expect(opened().lasting).toEqual([]);
	});
});
