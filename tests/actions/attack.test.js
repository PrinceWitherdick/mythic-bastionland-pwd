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
	recallAttack: vi.fn(() => null),
	rememberAttack: vi.fn(async () => {})
}));
vi.mock("../../module/actions/duel.js", () => ({ knockedDownIn: vi.fn(() => null), openDuelFor: vi.fn(() => null), saveDuelChange: vi.fn() }));
vi.mock("../../module/actions/feats.js", () => ({ canDenyAttack: () => false, featContext: vi.fn(), payFeat: vi.fn(async () => {}), rollFeat: vi.fn(async () => null) }));
vi.mock("../../module/actions/leading.js", () => ({ leaderCandidates: vi.fn(() => []) }));

const { inputDialog } = await import("../../module/apps/ui.js");
const { recallAttack, rememberAttack } = await import("../../module/actions/attack-memory.js");
const { playBlowFx } = await import("../../module/actions/attack-fx.js");
const { postCard } = await import("../../module/chat/cards.js");
const { marksOn } = await import("../../module/chat/gambit-marks.js");
const { knockedDownIn, openDuelFor } = await import("../../module/actions/duel.js");
const { leaderCandidates } = await import("../../module/actions/leading.js");
const { askPackGroups, attack, attackCardContext, joinAttack, joinPack, packRolled, rollPack, spendAttack, tellUsedUp } = await import("../../module/actions/attack.js");
const { changePack } = await import("../../module/rules/pack.js");

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
		updateEmbeddedDocuments: vi.fn(async () => []),
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

describe("an improvised weapon (p10, p194)", () => {
	// Two d6 weapons, as the brute of the user's report who smashed a barrel over somebody's head.
	const brute = (conditions = {}) => {
		const npc = combatant({ uuid: "Actor.brute", name: "Brute", items: [weapon("club", "Club", "d6"), weapon("axe", "Axe", "d6")] });
		npc.system.conditions = conditions;
		return npc;
	};
	const rolled = () => postCard.mock.calls[0][3].flags[SYSTEM_ID].attack;
	const faces = () => rolled().dice.map((die) => die.faces).sort((a, b) => a - b);

	beforeEach(() => target(combatant({ uuid: "Actor.moss", name: "Moss", type: "knight" })));

	it("is a weapon, so the barrel's d8 rolls in place of an unarmed d4", async () => {
		inputDialog.mockResolvedValue({ improvised: "d8" });
		await attack(brute());
		expect(rolled().dice).toEqual([expect.objectContaining({ faces: 8, label: "bastionland.attack.improvised" })]);
		expect(rolled().impaired).toBe(false);
	});

	it("takes bonus dice on top, as any weapon does", async () => {
		inputDialog.mockResolvedValue({ improvised: "d8", bonus: "d6" });
		await attack(brute());
		expect(faces()).toEqual([6, 8]);
	});

	it("rolls beside the weapons ticked", async () => {
		inputDialog.mockResolvedValue({ "source.club": true, improvised: "d4" });
		await attack(brute());
		expect(faces()).toEqual([4, 6]);
	});

	it("is drawn on the map as a blow", async () => {
		inputDialog.mockResolvedValue({ improvised: "d8" });
		await attack(brute());
		expect(playBlowFx.mock.calls[0][0].weapons).toEqual([{ name: "bastionland.attack.improvised", damage: "d8", ranged: false }]);
	});

	it("is still Impaired to a single d4 when the attacker is", async () => {
		inputDialog.mockResolvedValue({ improvised: "d8", bonus: "d6" });
		await attack(brute({ impaired: true }));
		expect(faces()).toEqual([4]);
		expect(rolled().impaired).toBe(true);
	});

	it("leaves an Attack with nothing ticked or typed unarmed, a single Impaired d4", async () => {
		inputDialog.mockResolvedValue({ improvised: "", bonus: "d8" });
		await attack(brute());
		expect(rolled().dice).toEqual([expect.objectContaining({ faces: 4, label: "bastionland.attack.unarmed" })]);
		expect(rolled().impaired).toBe(true);
	});

	it("isn't rolled, quietly unarmed, from text that names no die", async () => {
		for (const improvised of ["barrel", "8", "d 8"]) {
			postCard.mockClear();
			inputDialog.mockResolvedValue({ improvised });
			expect(await attack(brute())).toBeNull();
			expect(ui.notifications.warn).toHaveBeenLastCalledWith("bastionland.attack.improvisedUnread");
			expect(postCard).not.toHaveBeenCalled();
		}
	});

	it("isn't rolled with bonus dice that can't all be read, so none is quietly dropped", async () => {
		for (const bonus of ["8", "d8+2", "d6, x"]) {
			postCard.mockClear();
			inputDialog.mockResolvedValue({ "source.club": true, bonus });
			expect(await attack(brute())).toBeNull();
			expect(ui.notifications.warn).toHaveBeenLastCalledWith("bastionland.attack.bonusUnread");
			expect(postCard).not.toHaveBeenCalled();
		}
	});

	it("is named on the card and the map by the words typed beside its die, either side", async () => {
		for (const improvised of ["barrel d8", "d8 barrel"]) {
			postCard.mockClear();
			playBlowFx.mockClear();
			inputDialog.mockResolvedValue({ improvised });
			await attack(brute());
			expect(rolled().dice).toEqual([expect.objectContaining({ faces: 8, label: "Barrel" })]);
			expect(playBlowFx.mock.calls[0][0].weapons).toEqual([{ name: "Barrel", damage: "d8", ranged: false }]);
		}
	});

	it("isn't rolled from a name with no die, or with a slip beside it", async () => {
		for (const improvised of ["barrel", "barrel d8+2", "d 8"]) {
			postCard.mockClear();
			inputDialog.mockResolvedValue({ improvised });
			expect(await attack(brute())).toBeNull();
			expect(ui.notifications.warn).toHaveBeenLastCalledWith("bastionland.attack.improvisedUnread");
			expect(postCard).not.toHaveBeenCalled();
		}
	});

	it("takes an empty or blank box as no improvised weapon", async () => {
		inputDialog.mockResolvedValue({ "source.club": true, improvised: "  " });
		await attack(brute());
		expect(faces()).toEqual([6]);
	});

	describe("in the dialog, as it's typed", () => {
		let form;
		let list;
		let roll;
		let typed;
		const listeners = {};
		// Typing reads only the box typed in, over the form as it was last read whole.
		const type = (improvised, name = "improvised") => {
			for (const listener of listeners.input) listener({ target: { name, value: improvised } });
		};

		beforeEach(() => {
			for (const key of Object.keys(listeners)) delete listeners[key];
			typed = {};
			list = { hidden: true, childElementCount: 0, lines: [], replaceChildren(...lines) {
				this.lines = lines.map((line) => line.textContent);
				this.childElementCount = lines.length;
			} };
			roll = { disabled: false };
			form = {
				querySelector: (selector) => (selector === "[data-wielding-problems]" ? list : null),
				addEventListener: (event, listener) => (listeners[event] ??= []).push(listener)
			};
			const element = { querySelector: (selector) => ({ form, "[data-action='ok']": roll })[selector] ?? null };
			foundry.applications = { ux: { FormDataExtended: class { constructor() { this.object = typed; } } } };
			globalThis.document = { createElement: () => ({}) };
			inputDialog.mockImplementation(async (options) => {
				options.render(null, { element });
				return null;
			});
		});

		afterEach(() => {
			delete globalThis.document;
		});

		it("says no die was read and holds back the roll, until a die is typed", async () => {
			await attack(brute());
			expect(roll.disabled).toBe(false);
			type("8");
			expect(list.lines).toContain("bastionland.attack.improvisedUnread");
			expect(list.hidden).toBe(false);
			expect(roll.disabled).toBe(true);
			type("d8");
			expect(list.lines).not.toContain("bastionland.attack.improvisedUnread");
			expect(roll.disabled).toBe(false);
			// A name alone has nothing to roll; with its die beside it, it's ready.
			type("barrel");
			expect(roll.disabled).toBe(true);
			type("barrel d8");
			expect(list.lines).toEqual([]);
			expect(roll.disabled).toBe(false);
		});

		it("does the same for the bonus dice", async () => {
			await attack(brute());
			type("d8+2", "bonus");
			expect(list.lines).toEqual(["bastionland.attack.bonusUnread"]);
			expect(roll.disabled).toBe(true);
			type("d8, d6", "bonus");
			expect(list.lines).toEqual([]);
			expect(roll.disabled).toBe(false);
		});

		it("lets the box be cleared to fight unarmed", async () => {
			await attack(brute());
			type("barrel");
			type("");
			expect(list.lines).toEqual([]);
			expect(list.hidden).toBe(true);
			expect(roll.disabled).toBe(false);
		});

		it("says Smite isn't made unarmed, as the Attack would roll it, till something is swung (p8, p10)", async () => {
			// Smite was ticked before typing began, so typing keeps it.
			typed = { smite: "d12" };
			await attack(brute());
			expect(list.lines).toEqual(["bastionland.attack.smiteImpaired"]);
			type("barrel d8");
			expect(list.lines).toEqual([]);
			type("");
			expect(list.lines).toEqual(["bastionland.attack.smiteImpaired"]);
		});

		it("reads the whole form again only as it changes, not as dice are typed", async () => {
			let reads = 0;
			foundry.applications.ux.FormDataExtended = class {
				constructor() {
					reads += 1;
					this.object = typed;
				}
			};
			await attack(brute());
			type("d8");
			type("d8 barrel");
			expect(reads).toBe(1);
			for (const listener of listeners.change) listener({ target: { name: "improvised" } });
			expect(reads).toBe(2);
		});
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

	it("isn't made by a duelist knocked down in the bout, till it ends (p188)", async () => {
		knockedDownIn.mockReturnValueOnce({ sparring: true });
		expect(await attack(combatant({ uuid: "Actor.tal", name: "Tal", type: "knight", items: [weapon("mace", "Mace", "d8")] }))).toBeNull();
		expect(inputDialog).not.toHaveBeenCalled();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.duel.knockedDown");
	});
});

describe("a joust (p10)", () => {
	/** Tal on Bayard, who tramples, against Ser Kay, not yet marked Mounted. */
	const setUp = ({ kind = "joust", exchanges = 0, kayMounted = false } = {}) => {
		tokens["Actor.bayard"] = {
			documentName: "Actor",
			name: "Bayard",
			system: { virtues: { vig: { value: 10 } } },
			items: [weapon("hooves", "Hooves", "d6", { trample: true })]
		};
		const kay = combatant({ uuid: "Actor.kay", name: "Ser Kay", type: "knight" });
		kay.system.mounted = kayMounted;
		tokens["Scene.s.Token.Kay"] = { actor: kay };
		openDuelFor.mockReturnValue({ message: { id: "duel-1" }, duel: { kind, exchanges, sparring: false, duelists: [{ uuid: "Actor.tal", token: null }, { uuid: "Actor.kay", token: "Scene.s.Token.Kay" }] }, opponent: { uuid: "Actor.kay", token: "Scene.s.Token.Kay", name: "Ser Kay" } });
		const tal = combatant({ uuid: "Actor.tal", name: "Tal", type: "knight", items: [weapon("lance", "Lance", "d8")] });
		Object.assign(tal.system, { steed: "Actor.bayard", mounted: true });
		return tal;
	};

	it("has the other duelist ride before they've rolled, so the first rider's steed can't trample them", async () => {
		await attack(setUp());
		expect(opened().chargeBarred).toBe("bastionland.attack.chargeBarred");
		inputDialog.mockClear();
		// A plain duel at somebody on foot is another matter.
		await attack(setUp({ kind: "duel" }));
		expect(opened().chargeBarred).toBeNull();
	});

	it("leaves the trample out of a charge at the other rider", async () => {
		const faces = async (options) => {
			postCard.mockClear();
			inputDialog.mockResolvedValue({ "source.lance": true, charge: true, duel: true });
			await attack(setUp(options));
			return postCard.mock.calls[0][3].flags[SYSTEM_ID].attack.dice.map((die) => die.faces);
		};
		expect(await faces()).toEqual([8]);
		expect((await faces({ kind: "duel" })).sort()).toEqual([6, 8]);
	});

	it("leaves a rider thrown in an earlier exchange on foot, to be trampled", async () => {
		await attack(setUp({ exchanges: 1, kayMounted: false }));
		expect(opened().chargeBarred).toBeNull();
		inputDialog.mockClear();
		await attack(setUp({ exchanges: 1, kayMounted: true }));
		expect(opened().chargeBarred).toBe("bastionland.attack.chargeBarred");
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

	it("takes only what the leader's two hands hold, the hardest-hitting first (p11, p12)", async () => {
		const aldric = combatant({ uuid: "Actor.aldric", name: "Aldric", type: "knight", items: [
			weapon("longsword", "Longsword", "2d8", { hefty: true }),
			weapon("spear", "Spear", "d8", { hefty: true }),
			{ id: "shield", name: "Shield", type: "armour", system: { equipped: true, kind: "shield", damage: "d4" } },
			weapon("bow", "Shortbow", "d6", { long: true, ranged: true })
		] });
		leaderCandidates.mockReturnValue([aldric]);
		const raiders = combatant({ uuid: "Actor.raiders", name: "Raiders", scale: "warband", items: [weapon("spear", "Spears", "d8")] });
		inputDialog.mockResolvedValue({ "source.spear": true, leader: "Actor.aldric" });
		const { change } = await joinAttack(raiders, card());
		expect(change.dice.filter((die) => die.label === "Aldric").map((die) => die.faces)).toEqual([8, 8, 4]);
	});

	it("takes a single d4 from a leader who is Impaired (p8)", async () => {
		const aldric = combatant({ uuid: "Actor.aldric", name: "Aldric", type: "knight", items: [weapon("longsword", "Longsword", "2d8", { hefty: true })] });
		aldric.system.conditions.impaired = true;
		leaderCandidates.mockReturnValue([aldric]);
		const raiders = combatant({ uuid: "Actor.raiders", name: "Raiders", scale: "warband", items: [weapon("spear", "Spears", "d8")] });
		inputDialog.mockResolvedValue({ "source.spear": true, leader: "Actor.aldric" });
		const { change } = await joinAttack(raiders, card());
		expect(change.dice.filter((die) => die.label === "Aldric").map((die) => die.faces)).toEqual([4]);
		// The Warband's own share is whole.
		expect(change.impaired).toBe(false);
	});

	it("leaves out the leader's weapon a foe's Impair holds, while they have another (p186)", async () => {
		const aldric = combatant({ uuid: "Actor.aldric", name: "Aldric", type: "knight", items: [weapon("longsword", "Longsword", "2d8", { hefty: true }), weapon("dagger", "Dagger", "d6")] });
		marksOn.mockImplementation((actor) => (actor === aldric ? [{ key: "impair", weapon: { id: "longsword", name: "Longsword", actor: "Actor.aldric" }, hint: "Longsword Impaired" }] : []));
		leaderCandidates.mockReturnValue([aldric]);
		const raiders = combatant({ uuid: "Actor.raiders", name: "Raiders", scale: "warband", items: [weapon("spear", "Spears", "d8")] });
		inputDialog.mockResolvedValue({ "source.spear": true, leader: "Actor.aldric" });
		const { change } = await joinAttack(raiders, card());
		expect(change.dice.filter((die) => die.label === "Aldric").map((die) => die.faces)).toEqual([6]);
		expect(change.impaired).toBe(false);
	});

	it("takes a single d4 from a leader whose only weapon a foe's Impair holds (p186)", async () => {
		const aldric = combatant({ uuid: "Actor.aldric", name: "Aldric", type: "knight", items: [weapon("longsword", "Longsword", "2d8", { hefty: true })] });
		marksOn.mockImplementation((actor) => (actor === aldric ? [{ key: "impair", weapon: { id: "longsword", name: "Longsword", actor: "Actor.aldric" }, hint: "Longsword Impaired" }] : []));
		leaderCandidates.mockReturnValue([aldric]);
		const raiders = combatant({ uuid: "Actor.raiders", name: "Raiders", scale: "warband", items: [weapon("spear", "Spears", "d8")] });
		inputDialog.mockResolvedValue({ "source.spear": true, leader: "Actor.aldric" });
		const { change } = await joinAttack(raiders, card());
		expect(change.dice.filter((die) => die.label === "Aldric").map((die) => die.faces)).toEqual([4]);
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
		const thrower = combatant({ uuid: "Actor.tal", name: "Tal", type: "knight", items: [javelins] });
		inputDialog.mockResolvedValue({ "source.jav": true });
		const joined = await joinAttack(thrower, card());
		expect(joined.change.dice.map((die) => die.faces)).toEqual([6]);
		expect(thrower.updateEmbeddedDocuments).not.toHaveBeenCalled();
		expect(rememberAttack).not.toHaveBeenCalled();
		expect(playBlowFx).not.toHaveBeenCalled();

		await joined.settle();
		expect(thrower.updateEmbeddedDocuments).toHaveBeenCalledExactlyOnceWith("Item", [{ _id: "jav", "system.quantity.value": 2 }], expect.anything());
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
		// A Knight's other grants come with the Ability that lends them.
		expect(opened().declarations.map(({ key }) => key)).toEqual(["blast", "ignoresArmour", "strongGambits"]);
		expect(opened().woundEffects).toEqual([]);
		expect(opened().abilityOffers.map(({ id, checked }) => [id, checked])).toEqual([["thunder", false], ["pierce", true]]);
	});

	it("offers the Referee's Cast every grant, and what a Wound does as one pick (p166)", async () => {
		// Not a Blast, so at one target (p8).
		target(combatant({ uuid: "Actor.boar", name: "Boar" }));
		const actor = knight([]);
		actor.type = "npc";
		inputDialog.mockResolvedValue({ "source.hammer": true, "declare.spirit": true, "declare.onWound": "sleep", "declare.drain": true });
		await attack(actor);
		// Of the grants, only Damage taken back or SPI restored come with an Ability alone (p54, p74).
		expect(opened().declarations.map(({ key }) => key)).toEqual(["blast", "ignoresArmour", "ignoresImmunity", "strongGambits", "spirit", "shatters", "alone", "combine"]);
		expect(opened().woundEffects.map(({ key }) => key)).toEqual(["drain", "sleep", "memory"]);
		expect(state(0)).toMatchObject({ spirit: true, drain: false, onWound: ["sleep"] });
	});

	it("lends a Knight nothing ticked by hand that only an Ability lends", async () => {
		// Not a Blast, so at one target (p8).
		target(combatant({ uuid: "Actor.boar", name: "Boar" }));
		inputDialog.mockResolvedValue({ "source.hammer": true, "declare.spirit": true, "declare.onWound": "drain" });
		await attack(knight([]));
		expect(state(0)).toMatchObject({ spirit: false, drain: false });
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
		expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ _id: "thunder", "system.quantity.value": 1 }], expect.anything());
	});

	it("readies an Ability good once an Attack for this one, then spends it if used", async () => {
		// Not a Blast, so at one target (p8).
		target(combatant({ uuid: "Actor.boar", name: "Boar" }));
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
		], expect.anything());
	});

	it("keeps a declared Blast when the Attack is Impaired, since it isn't a Feat", async () => {
		marksOn.mockReturnValue([{ key: "impair", weapon: null, hint: "Impaired" }]);
		inputDialog.mockResolvedValue({ "source.hammer": true, "declare.blast": true });
		await attack(knight([]));
		expect(state(0)).toMatchObject({ impaired: true, blast: true });
	});
});

describe("what the Knight pages' Abilities lend a blow", () => {
	const ability = (id, name, system) => ({ id, name, type: "ability", system: { grants: {}, quantity: { value: null, max: null }, restock: "", ...system } });
	const lance = () => ({ ...weapon("lance", "Lance", "d10", { heftyMounted: true }), isOwner: true, update: vi.fn(async () => {}) });
	function knight(items) {
		const actor = combatant({ uuid: "Actor.tal", name: "Tal", type: "knight", items });
		actor.updateEmbeddedDocuments = vi.fn(async () => {});
		return actor;
	}
	const state = (call = 0) => postCard.mock.calls[call][3].flags[SYSTEM_ID].attack;

	beforeEach(() => target(combatant({ uuid: "Actor.boar", name: "Boar" })));

	it("adds an Ability's die, and shatters the weapons the charge was made with (p92)", async () => {
		const spear = lance();
		const charge = ability("charge", "Charge", { grants: { blast: true, shatters: true, alone: true }, bonusDie: "d12" });
		inputDialog.mockResolvedValue({ "source.lance": true, "ability.charge": true });
		const actor = knight([spear, charge]);
		await attack(actor);
		expect(state().dice.map((die) => `${die.label} d${die.faces}`)).toEqual(["Charge d12", "Lance d10"]);
		expect(state()).toMatchObject({ blast: true, alone: true, shattered: ["Lance"] });
		// Shattered in one write the Ledger hears as the Attack's.
		expect(actor.updateEmbeddedDocuments).toHaveBeenCalledExactlyOnceWith("Item", [{ _id: "lance", "system.broken": true }], { ledgerCause: "bastionland.ledger.causes.attack" });
		expect(spear.update).not.toHaveBeenCalled();
		expect(opened().abilityOffers[0]).toMatchObject({ label: "bastionland.attack.useAbility", checked: false, hint: "bastionland.attack.useAbilityChosenHint" });
	});

	it("marks the card for Damage to SPI, or VIG taken back, and what burns on where it lands", async () => {
		const flask = weapon("flask", "Flask", "d8", { lingers: "round", ignoresArmour: true });
		inputDialog.mockResolvedValue({ "source.flask": true, "declare.spirit": true, "declare.onWound": "drain" });
		const actor = knight([flask]);
		actor.type = "npc";
		await attack(actor);
		expect(state()).toMatchObject({ spirit: true, drain: true, lingers: [{ name: "Flask", damage: "d8", when: "round", ignoresArmour: true }] });
	});

	/** Somebody whose Ability joins dice, with a mace and a knife. */
	function horde() {
		const actor = knight([weapon("mace", "Mace", "d8"), weapon("knife", "Knife", "d4"), weapon("club", "Club", "d6")]);
		actor.uuid = "Actor.horde";
		actor.name = "Horde";
		actor.system.wields = "free";
		actor.type = "npc";
		return actor;
	}
	const pack = (call = 0) => postCard.mock.calls[call][3].flags[SYSTEM_ID].pack;

	it("gathers allies' dice on a Pack card before anything is rolled (p56)", async () => {
		const rolled = vi.spyOn(globalThis.Roll.prototype, "evaluate");
		inputDialog.mockResolvedValueOnce({ "source.mace": true, "source.knife": true, "declare.combine": true });
		const actor = horde();
		await attack(actor);
		expect(inputDialog).toHaveBeenCalledTimes(1);
		expect(rolled).not.toHaveBeenCalled();
		expect(postCard.mock.calls[0][1]).toBe("pack");
		expect(pack()).toMatchObject({ attacker: "Actor.horde", attackerName: "Horde", rolled: false, targets: [{ uuid: "Scene.s.Token.Boar", name: "Boar" }] });
		expect(pack().shares[0].dice).toEqual([{ faces: 8, label: "Mace", item: "mace" }, { faces: 4, label: "Knife", item: "knife" }]);
		// The Attack is made once the card stands, so what it spends is spent then.
		expect(rememberAttack).toHaveBeenCalled();
	});

	it("brings an ally's dice unrolled, and never asks the ally to join them", async () => {
		const rolled = vi.spyOn(globalThis.Roll.prototype, "evaluate");
		inputDialog.mockResolvedValueOnce({ "source.mace": true, "declare.combine": true });
		await attack(horde());
		const card = pack();
		inputDialog.mockReset().mockResolvedValueOnce({ "source.club": true, "source.knife": true, "declare.combine": true });
		const anne = horde();
		anne.uuid = "Actor.anne";
		anne.name = "Anne";
		const joined = await joinPack(anne, card);
		expect(inputDialog).toHaveBeenCalledTimes(1);
		expect(rolled).not.toHaveBeenCalled();
		expect(joined.change).toMatchObject({ type: "join", actor: "Actor.anne", name: "Anne", dice: [{ faces: 4, label: "Knife" }, { faces: 6, label: "Club" }] });
		expect(rememberAttack).toHaveBeenCalledTimes(1);
		await joined.settle();
		expect(rememberAttack).toHaveBeenCalledTimes(2);
	});

	it("keeps the Wait an actor last ticked on their own Attack when they join, which draws no Wait box", async () => {
		inputDialog.mockResolvedValueOnce({ "source.mace": true, "declare.combine": true });
		await attack(horde());
		const card = pack();
		recallAttack.mockReturnValueOnce({ wait: true, source: {}, specialist: {} });
		inputDialog.mockReset().mockResolvedValueOnce({ "source.club": true });
		const anne = horde();
		anne.uuid = "Actor.anne";
		const joined = await joinPack(anne, card);
		await joined.settle();
		expect(rememberAttack.mock.calls[1][1].wait).toBe(true);
	});

	it("joins anybody's dice, named for who brought them, and rolls them all into one Attack card", async () => {
		inputDialog.mockResolvedValueOnce({ "source.mace": true, "declare.combine": true });
		await attack(horde());
		const card = changePack(pack(), { type: "join", actor: "Actor.anne", name: "Anne", made: { melee: true }, dice: [{ faces: 4, label: "Knife" }, { faces: 6, label: "Club" }], blows: null });
		inputDialog.mockReset().mockResolvedValueOnce({ "group.0": "1", "group.1": "1", "group.2": "0" });
		const groups = await askPackGroups(card);
		const window = inputDialog.mock.calls[0][0];
		expect(window.template).toBe("combine-dice");
		expect(window.context.legend).toBe("bastionland.attack.combine.packLegend");
		expect(window.context.dice).toHaveLength(3);
		expect(groups).toEqual([1, 1, 0]);

		postCard.mockClear();
		playBlowFx.mockClear();
		tokens["Actor.horde"] = horde();
		await rollPack(horde(), card, groups);
		const attackState = postCard.mock.calls[0][3].flags[SYSTEM_ID].attack;
		expect(postCard.mock.calls[0][1]).toBe("attack");
		expect(attackState.dice.map((die) => [die.faces, die.by])).toEqual([[12, "Horde"], [6, "Anne"]]);
		expect(attackState.joined.map((entry) => entry.name)).toEqual(["Anne"]);
		// The blows are drawn once the card stands; Anne's were kept as nothing, so only the Knight's are.
		expect(playBlowFx).not.toHaveBeenCalled();
		await packRolled(horde(), card);
		expect(playBlowFx).toHaveBeenCalledTimes(1);
	});

	it("says in the dice window whose each die will be, and warns of a joined one that can't harm the target (p11)", async () => {
		target(combatant({ uuid: "Actor.militia", name: "Militia", scale: "warband" }));
		inputDialog.mockResolvedValueOnce({ "source.mace": true, "declare.combine": true });
		await attack(horde());
		const card = changePack(pack(), { type: "join", actor: "Actor.raiders", name: "Raiders", made: { melee: true, largeScale: true }, dice: [{ faces: 4, label: "Spears" }], blows: null });
		inputDialog.mockReset().mockResolvedValueOnce(null);
		await askPackGroups(card);
		const window = inputDialog.mock.calls[0][0];
		expect(window.context.hint).toBe("bastionland.attack.combine.packHint");
		// The window's own line, as it's drawn and as the groups change.
		const line = { textContent: "", classList: { toggle: vi.fn() } };
		const selects = { "group.0": { value: "0" }, "group.1": { value: "0" } };
		const roll = { disabled: false };
		const form = { querySelector: (selector) => (selector === "[data-combined]" ? line : selects[selector.match(/group\.\d/)?.[0]] ?? null), addEventListener: (_type, fn) => { form.change = fn; } };
		window.render(null, { element: { querySelector: (selector) => (selector === "form" ? form : roll) } });
		expect(line.classList.toggle).toHaveBeenLastCalledWith("is-warning", false);
		selects["group.0"].value = "1";
		selects["group.1"].value = "1";
		form.change();
		expect(line.classList.toggle).toHaveBeenLastCalledWith("is-warning", true);
		expect(roll.disabled).toBe(false);
	});

	it("waits for allies when asked, though nothing joins dice, and joins none at the roll", async () => {
		const rolled = vi.spyOn(globalThis.Roll.prototype, "evaluate");
		inputDialog.mockResolvedValueOnce({ "source.mace": true, wait: true });
		await attack(horde());
		expect(rolled).not.toHaveBeenCalled();
		expect(pack()).toMatchObject({ rolled: false });
		expect(pack().shares.some((share) => share.combine)).toBe(false);
		const card = changePack(pack(), { type: "join", actor: "Actor.anne", name: "Anne", made: { melee: true }, dice: [{ faces: 4, label: "Knife" }], blows: null });
		inputDialog.mockReset();
		expect(await askPackGroups(card)).toEqual([]);
		expect(inputDialog).not.toHaveBeenCalled();
		// Remembered, so their next Attack opens on it.
		expect(rememberAttack.mock.calls[0][1].wait).toBe(true);
	});

	it("never waits for a blow made alone, which nobody joins, and says so", async () => {
		inputDialog.mockResolvedValueOnce({ "source.mace": true, wait: true, "declare.alone": true });
		await attack(horde());
		expect(postCard.mock.calls[0][1]).toBe("attack");
		expect(ui.notifications.info).toHaveBeenCalledWith("bastionland.attack.waitIgnored");
	});

	it("rolls at once, asking nothing, where its targets Impair it and it wasn't asked to wait (p56, p61)", async () => {
		target(combatant({ uuid: "Actor.bats", name: "Bats", scale: "swarm" }));
		inputDialog.mockResolvedValueOnce({ "source.mace": true, "source.knife": true, "declare.combine": true });
		await attack(horde());
		// A d4 alone has nothing to join, so no dice window opens either.
		expect(inputDialog).toHaveBeenCalledTimes(1);
		expect(postCard.mock.calls[0][1]).toBe("attack");
		expect(state().dice.map((die) => die.faces)).toEqual([4]);
	});

	it("still waits at a swarm when asked to", async () => {
		target(combatant({ uuid: "Actor.bats", name: "Bats", scale: "swarm" }));
		inputDialog.mockResolvedValueOnce({ "source.mace": true, "declare.combine": true, wait: true });
		await attack(horde());
		expect(postCard.mock.calls[0][1]).toBe("pack");
		expect(pack().shares[0]).toMatchObject({ combine: false, dice: [{ faces: 4 }] });
	});

	it("asks which of its own dice to join where it can't gather, as a blow in a duel (p56)", async () => {
		openDuelFor.mockReturnValue({ message: { id: "duel-1" }, duel: { kind: "duel", sparring: false }, opponent: { token: "Scene.s.Token.Boar", name: "Boar" } });
		tokens["Scene.s.Token.Boar"] = { actor: combatant({ uuid: "Actor.boar", name: "Boar" }) };
		inputDialog
			.mockResolvedValueOnce({ "source.mace": true, "source.knife": true, duel: true, "declare.combine": true })
			.mockResolvedValueOnce({ "group.0": "1", "group.1": "1" });
		await attack(horde());
		expect(inputDialog.mock.calls[1][0].template).toBe("combine-dice");
		expect(postCard.mock.calls[0][1]).toBe("attack");
		expect(state().dice.map((die) => die.faces)).toEqual([12]);
	});

	it("spends a thrown lance a charge shatters in one write, its count and its break merged (p92)", async () => {
		const lances = { ...weapon("lances", "Lances", "d10", { usedUp: true, quantity: { value: 2, max: 2 } }) };
		const actor = knight([lances]);
		await spendAttack(actor, { items: ["lances"], shatters: true, abilities: [], keep: [] });
		expect(actor.updateEmbeddedDocuments).toHaveBeenCalledExactlyOnceWith("Item", [{ _id: "lances", "system.quantity.value": 1, "system.broken": true }], expect.objectContaining({ bastionlandUsedUp: true }));
	});

	it("tells whoever plays the actor how many are left, wherever it was spent from", () => {
		foundry.utils.getProperty = (object, path) => path.split(".").reduce((node, key) => node?.[key], object);
		const player = { active: true, isGM: false };
		const actor = { isOwner: true, testUserPermission: (user) => user === player };
		const lances = { name: "Lances", actor, system: { usedUp: true } };
		const changes = { system: { quantity: { value: 1 } } };
		// The player who owns them is told, on their own client.
		game.user = player;
		tellUsedUp(lances, changes, { bastionlandUsedUp: true });
		expect(ui.notifications.info).toHaveBeenCalledExactlyOnceWith("bastionland.attack.usedOne");
		// The Referee who spent them for that player isn't, while the player is here.
		ui.notifications.info.mockClear();
		game.user = { isGM: true };
		game.users = [player];
		tellUsedUp(lances, changes, { bastionlandUsedUp: true });
		expect(ui.notifications.info).not.toHaveBeenCalled();
		// With nobody else to play them, the Referee is.
		player.active = false;
		tellUsedUp(lances, changes, { bastionlandUsedUp: true });
		expect(ui.notifications.info).toHaveBeenCalledOnce();
		// A write that used nothing up says nothing.
		ui.notifications.info.mockClear();
		tellUsedUp(lances, changes, {});
		expect(ui.notifications.info).not.toHaveBeenCalled();
	});

	it("spends nothing of an actor this user doesn't own", async () => {
		const lances = weapon("lances", "Lances", "d10", { usedUp: true, quantity: { value: 2, max: 2 } });
		const actor = knight([lances]);
		actor.isOwner = false;
		await spendAttack(actor, { items: ["lances"], shatters: true, abilities: [], keep: [] });
		expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
		expect(ui.notifications.info).not.toHaveBeenCalled();
	});

	it("offers to wait only on a fresh Attack, not one that joins another's", async () => {
		inputDialog.mockResolvedValueOnce(null);
		await attack(horde());
		expect(opened().canWait).toBe(true);
		inputDialog.mockClear();
		const card = { attacker: "Actor.moss", attackerName: "Moss", targets: [], dice: [{ faces: 8, result: 3, label: "d8", deniedBy: null }], melee: true, gambits: [], feats: [], appliedTo: [] };
		await joinAttack(horde(), card);
		expect(opened().canWait).toBe(false);
	});

	it("uses up nothing until the Pack is rolled, then spends what was declared for it", async () => {
		const ability = { id: "pack", name: "Pack Tactics", type: "ability", system: { grants: { combine: true }, quantity: { value: 2, max: 2 }, restock: "" } };
		const actor = horde();
		actor.items.push(ability);
		inputDialog.mockResolvedValueOnce({ "source.mace": true, "ability.pack": true });
		await attack(actor);
		expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
		const { spend } = pack().shares[0];
		expect(spend).toEqual({ items: ["mace"], shatters: false, abilities: ["pack"], keep: [] });
		await spendAttack(actor, spend);
		expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ _id: "pack", "system.quantity.value": 1 }], expect.anything());
	});

	it("joins nothing on a Pack card nobody else has joined", async () => {
		inputDialog.mockResolvedValueOnce({ "source.mace": true, "source.knife": true, "declare.combine": true });
		await attack(horde());
		inputDialog.mockReset();
		expect(await askPackGroups(pack())).toEqual([]);
		expect(inputDialog).not.toHaveBeenCalled();
	});

	it("joins only their own dice when joining an Attack card already rolled", async () => {
		const card = { attacker: "Actor.moss", attackerName: "Moss", targets: [{ uuid: "Scene.s.Token.Boar", name: "Boar" }], dice: [{ faces: 8, result: 3, label: "d8", deniedBy: null }], melee: true, gambits: [], feats: [], appliedTo: [] };
		inputDialog
			.mockResolvedValueOnce({ "source.mace": true, "source.knife": true, "source.club": true, "declare.combine": true })
			.mockResolvedValueOnce({ "group.0": "1", "group.1": "1", "group.2": "0" });
		const joined = await joinAttack(horde(), card);
		expect(inputDialog.mock.calls[1][0].template).toBe("combine-dice");
		expect(joined.change.dice.map((die) => die.faces)).toEqual([12, 6]);
	});

	it("rolls nothing when the dice window is closed", async () => {
		const card = { attacker: "Actor.moss", attackerName: "Moss", targets: [{ uuid: "Scene.s.Token.Boar", name: "Boar" }], dice: [{ faces: 8, result: 3, label: "d8", deniedBy: null }], melee: true, gambits: [], feats: [], appliedTo: [] };
		inputDialog.mockResolvedValueOnce({ "source.mace": true, "source.knife": true, "declare.combine": true }).mockResolvedValueOnce(null);
		expect(await joinAttack(horde(), card)).toBeNull();
	});

	it("refuses an Ability outside the only kind of Attack it's used in (p68, p92)", async () => {
		const strike = ability("strike", "Strike", { grants: { spirit: true, alone: true }, needs: "melee" });
		inputDialog.mockResolvedValue({ "source.sling": true, "ability.strike": true });
		expect(await attack(knight([weapon("sling", "Sling", "d4", { ranged: true }), strike]))).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.attack.needs.melee");

		const charge = ability("charge", "Charge", { grants: { shatters: true }, needs: "charge" });
		inputDialog.mockResolvedValue({ "source.lance": true, "ability.charge": true });
		expect(await attack(knight([lance(), charge]))).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.attack.needs.charge");
		inputDialog.mockResolvedValue({ "source.lance": true, "ability.charge": true, mounted: true, moved: true });
		expect(await attack(knight([lance(), charge]))).not.toBeNull();
	});

	it("carries the Wound's effect picked for a bite to the card (p166)", async () => {
		const fangs = ability("fangs", "Fangs", { grants: { drain: true, sleep: true, memory: true } });
		inputDialog.mockResolvedValue({ "source.bite": true, "ability.fangs": true, "effect.fangs": "memory" });
		await attack(knight([weapon("bite", "Bite", "d6", { noHand: true }), fangs]));
		expect(opened().abilityOffers[0].effects.map(({ key }) => key)).toEqual(["drain", "sleep", "memory"]);
		expect(state()).toMatchObject({ drain: false, onWound: ["memory"] });
	});

	it("won't join another's Attack with a blow made alone", async () => {
		const card = { attacker: "Actor.moss", attackerName: "Moss", targets: [{ uuid: "Scene.s.Token.Boar", name: "Boar" }], dice: [{ faces: 8, result: 3, label: "d8", deniedBy: null }], melee: true, gambits: [], feats: [], appliedTo: [] };
		inputDialog.mockResolvedValue({ "source.mace": true, "declare.alone": true });
		const actor = knight([weapon("mace", "Mace", "d8")]);
		actor.type = "npc";
		expect(await joinAttack(actor, card)).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.attack.aloneJoin");
	});

	it("says on the card what an Ability declared, and whether the pool may be rolled again", () => {
		const context = attackCardContext({
			attacker: "Actor.tal", targets: [], dice: [{ faces: 8, result: 5, label: "d8", deniedBy: null, adjusted: { by: "Ysolde", from: 3 } }],
			melee: true, gambits: [], feats: [], appliedTo: [], spirit: true, drain: true, alone: true,
			shattered: ["Lance"], lingers: [{ name: "Flask", damage: "d8", when: "round" }], rerolled: { by: "Tal" }
		});
		expect(context).toMatchObject({ shattered: "bastionland.attack.shattered", reroll: false, sigil: false });
		expect(context.grantHints.map(({ name }) => name)).toEqual(["bastionland.attack.grant.spirit", "bastionland.attack.grant.drain", "bastionland.attack.grant.alone"]);
		expect(context.notes).toEqual(["bastionland.attack.lingers"]);
		expect(context.rerolled).toBe("bastionland.attack.reroll.done");
		expect(context.dice[0].label).toBe("bastionland.attack.sigil.turnedDie");
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

	it("rolls one kept for melee with a bow ticked but set aside while engaged, since the blow isn't a shot (p32, p98)", async () => {
		flag = [{ faces: 10, label: "Fury", melee: true }];
		const actor = inCombat(combatant({ uuid: "Actor.tal", name: "Tal", type: "knight", items: [weapon("hammer", "Hookhammer", "d8"), weapon("bow", "Bow", "d6", { ranged: true })] }));
		inputDialog.mockResolvedValue({ "source.hammer": true, "source.bow": true, engaged: true, "lasting.0": true });
		await attack(actor);
		const state = postCard.mock.calls[0][3].flags[SYSTEM_ID].attack;
		expect(state.setAside).toEqual([{ name: "Bow", reason: "ranged" }]);
		expect(state.dice.map((die) => die.label)).toEqual(["Fury", "Hookhammer"]);
	});

	it("rolls a die given to one weapon only with that weapon (p98)", async () => {
		flag = [{ faces: 8, label: "Tempering", melee: true, item: "hammer", itemName: "Hookhammer" }];
		const actor = inCombat(combatant({ uuid: "Actor.tal", name: "Tal", type: "knight", items: [weapon("hammer", "Hookhammer", "d8"), weapon("knife", "Knife", "d4")] }));
		inputDialog.mockResolvedValue({ "source.hammer": true, "lasting.0": true });
		await attack(actor);
		expect(opened().lasting).toEqual([{ index: 0, label: "bastionland.attack.lastingDieWeapon" }]);
		const dice = postCard.mock.calls[0][3].flags[SYSTEM_ID].attack.dice;
		expect(dice.find((die) => die.label === "Tempering")).toMatchObject({ faces: 8, item: "hammer" });

		postCard.mockClear();
		inputDialog.mockResolvedValue({ "source.knife": true, "lasting.0": true });
		await attack(actor);
		expect(postCard.mock.calls[0][3].flags[SYSTEM_ID].attack.dice.map((die) => die.label)).toEqual(["Knife"]);
	});

	it("says on the card which melee weapons a Wound would temper (p98)", async () => {
		const forge = { id: "forge", name: "Tempering", type: "ability", system: { grants: {}, quantity: { value: null, max: null }, lastingDie: "d8", needs: "melee", tempers: true } };
		const actor = inCombat(combatant({ uuid: "Actor.tal", name: "Tal", type: "knight", items: [weapon("hammer", "Hookhammer", "d8"), forge] }));
		inputDialog.mockResolvedValue({ "source.hammer": true });
		await attack(actor);
		expect(postCard.mock.calls[0][3].flags[SYSTEM_ID].attack.tempers).toEqual({ label: "Tempering", faces: 8, weapons: [{ id: "hammer", name: "Hookhammer" }] });

		postCard.mockClear();
		const bow = inCombat(combatant({ uuid: "Actor.moss", name: "Moss", type: "knight", items: [weapon("bow", "Bow", "d6", { ranged: true }), forge] }));
		inputDialog.mockResolvedValue({ "source.bow": true });
		await attack(bow);
		expect(postCard.mock.calls[0][3].flags[SYSTEM_ID].attack.tempers).toBeNull();
	});
});

describe("an Ability that needs a crowd (p38)", () => {
	const war = { id: "war", name: "Awareness", type: "ability", system: { grants: { strongGambits: true }, quantity: { value: null, max: null }, situational: true, crowd: 3 } };

	/** Tal in a Combat with so many friends and foes. */
	function fight(friends, foes) {
		const actor = combatant({ uuid: "Actor.tal", name: "Tal", type: "knight", items: [weapon("hammer", "Hookhammer", "d8"), war] });
		const combat = { started: true, combatants: [] };
		const add = (who, disposition) => combat.combatants.push({ actor: who, token: { disposition }, isDefeated: false, combat, getFlag: () => [] });
		add(actor, 1);
		for (let i = 0; i < friends; i++) add(combatant({ uuid: `Actor.f${i}`, name: "Friend" }), 1);
		for (let i = 0; i < foes; i++) add(combatant({ uuid: `Actor.e${i}`, name: "Foe" }), -1);
		add(combatant({ uuid: "Actor.cat", name: "Cat" }), 0);
		game.combats = [combat];
		return actor;
	}

	beforeEach(() => target(combatant({ uuid: "Actor.boar", name: "Boar" })));

	it("comes ticked once three stand on each side", async () => {
		await attack(fight(2, 3));
		expect(opened().abilityOffers[0]).toMatchObject({ checked: true, hint: "bastionland.attack.crowdMet" });
	});

	it("waits to be ticked with fewer, bystanders not counted", async () => {
		await attack(fight(2, 2));
		expect(opened().abilityOffers[0]).toMatchObject({ checked: false, hint: "bastionland.attack.crowdShort" });
	});

	it("waits to be ticked outside a Combat", async () => {
		await attack(combatant({ uuid: "Actor.tal", name: "Tal", type: "knight", items: [weapon("hammer", "Hookhammer", "d8"), war] }));
		expect(opened().abilityOffers[0]).toMatchObject({ checked: false, hint: "bastionland.attack.crowdUnknown" });
	});
});

describe("a weapon that spends its Ability (p112)", () => {
	const burst = (value) => ({ id: "eruption", name: "Eruption", type: "ability", system: { grants: {}, quantity: { value, max: 1 }, restock: "phase", weapon: "radiance" } });
	const halo = (value) => {
		const light = { ...weapon("light", "Light", "d12", { blast: true, noHand: true }), flags: { [SYSTEM_ID]: { abilityKit: "radiance" } } };
		const actor = combatant({ uuid: "Actor.tal", name: "Tal", type: "knight", items: [weapon("axe", "Axe", "d8"), light, burst(value)] });
		actor.updateEmbeddedDocuments = vi.fn(async () => []);
		return actor;
	};

	beforeEach(() => target(combatant({ uuid: "Actor.boar", name: "Boar" })));

	it("spends a use when it's let loose", async () => {
		const actor = halo(1);
		inputDialog.mockResolvedValue({ "source.light": true });
		await attack(actor);
		expect(postCard).toHaveBeenCalled();
		expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ _id: "eruption", "system.quantity.value": 0 }], expect.anything());
	});

	it("is refused with none left, though the other weapons aren't", async () => {
		const actor = halo(0);
		inputDialog.mockResolvedValue({ "source.light": true });
		await attack(actor);
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.ability.usedUp");
		expect(postCard).not.toHaveBeenCalled();

		inputDialog.mockResolvedValue({ "source.axe": true });
		await attack(actor);
		expect(postCard).toHaveBeenCalled();
		expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
	});
});

describe("an Attack at several targets (p8)", () => {
	const knight = (items = [weapon("sword", "Sword", "d8")]) => {
		const actor = combatant({ uuid: "Actor.tal", name: "Tal", type: "knight", items });
		actor.system.knowsFeat = () => true;
		return actor;
	};
	const two = () => target(combatant({ uuid: "Actor.boar", name: "Boar" }), combatant({ uuid: "Actor.wolf", name: "Wolf" }));

	it("rolls nothing at two Tokens unless it's a Blast", async () => {
		two();
		inputDialog.mockResolvedValue({ "source.sword": true });
		expect(await attack(knight())).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.attack.refusals.severalTargets");
		expect(postCard).not.toHaveBeenCalled();
	});

	it("rolls a card for each when a Blast weapon strikes them", async () => {
		two();
		inputDialog.mockResolvedValue({ "source.bomb": true });
		await attack(knight([weapon("bomb", "Firepot", "d6", { blast: true })]));
		expect(postCard).toHaveBeenCalledTimes(2);
	});

	it("still rolls at one target, as ever", async () => {
		target(combatant({ uuid: "Actor.boar", name: "Boar" }));
		inputDialog.mockResolvedValue({ "source.sword": true });
		await attack(knight());
		expect(postCard).toHaveBeenCalledOnce();
	});

	it("rolls nothing at two Tokens when an Impaired Attack loses the Smite that made it a Blast", async () => {
		two();
		marksOn.mockReturnValue([{ key: "impair", weapon: null, hint: "Impaired" }]);
		inputDialog.mockResolvedValue({ "source.sword": true, smite: "blast" });
		expect(await attack(knight())).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.attack.refusals.severalTargets");
		expect(postCard).not.toHaveBeenCalled();
	});

	it("refuses Smite's d12 at a swarm, which a Blast escapes (p61)", async () => {
		target(combatant({ uuid: "Actor.bats", name: "Bats", scale: "swarm" }));
		inputDialog.mockResolvedValue({ "source.sword": true, smite: "d12" });
		expect(await attack(knight())).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.attack.refusals.smiteSwarm");
	});
});

describe("combat audit of 2026-10-29", () => {
	const shield = { id: "shield", name: "Kite shield", type: "armour", system: { equipped: true, damage: "d4", kind: "shield" } };
	const mace = weapon("mace", "Mace", "d8", { hefty: true });
	const foe = () => combatant({ uuid: "Actor.moss", name: "Moss", type: "knight" });

	it("opens without a shield a foe's Trap holds, and rolls no d4 for it ticked anyway (p10)", async () => {
		marksOn.mockReturnValue([{ key: "trap", hint: "Shield trapped" }]);
		target(foe());
		const guard = combatant({ uuid: "Actor.guard", name: "Guard", items: [mace, shield] });
		guard.system.wields = "hands";
		await attack(guard);
		expect(opened().sources.map(({ name, checked }) => `${name}:${checked}`)).toEqual(["Mace:true", "Kite shield:false"]);

		inputDialog.mockClear();
		inputDialog.mockResolvedValue({ "source.mace": true, "source.shield": true });
		await attack(guard);
		const state = postCard.mock.calls.at(-1)[3].flags[SYSTEM_ID].attack;
		expect(state.dice.map((die) => die.faces)).toEqual([8]);
		expect(state.setAside).toEqual([{ name: "Kite shield", reason: "trapped" }]);
	});

	it("holds a Knight who lost their shield arm this Season to one item (p9)", async () => {
		target(foe());
		const scar = { id: "scar", name: "Mutilation (Shield Arm)", type: "scar", system: { roll: 10, detail: 3, resolved: false } };
		const knight = combatant({ uuid: "Actor.ser", name: "Ser Hal", type: "knight", items: [mace, shield, scar] });
		await attack(knight);
		expect(opened().sources.map(({ name, checked }) => `${name}:${checked}`)).toEqual(["Mace:true", "Kite shield:false"]);

		// One recorded before Scars kept their detail is read from its name.
		inputDialog.mockClear();
		game.i18n.localize = (key) => (key.endsWith("mutilation.detail.3") ? "Shield Arm" : key);
		knight.items = [mace, shield, { ...scar, system: { roll: 10, resolved: false } }];
		await attack(knight);
		expect(opened().sources.map(({ checked }) => checked)).toEqual([true, false]);

		// Settled at the Season's turn, they have learned to get by.
		inputDialog.mockClear();
		knight.items = [mace, shield, { ...scar, system: { roll: 10, detail: 3, resolved: true } }];
		await attack(knight);
		expect(opened().sources.map(({ checked }) => checked)).toEqual([true, true]);
	});

	it("makes no Attack for those who fled, surrendered, or are wiped out or destroyed (p10, p11)", async () => {
		target(foe());
		const wipedOut = (system) => ({ scale: "warband", warband: { wipedOut: true }, virtues: { ...system.virtues, vig: { value: 0, max: 10 } } });
		for (const change of [() => ({ moraleBroken: "fled" }), () => ({ moraleBroken: "surrendered" }), wipedOut, () => ({ destroyed: true })]) {
			const actor = combatant({ uuid: "Actor.x", name: "X", items: [mace] });
			Object.assign(actor.system, change(actor.system));
			expect(await attack(actor)).toBeNull();
		}
		expect(inputDialog).not.toHaveBeenCalled();
		expect(ui.notifications.warn).toHaveBeenCalledTimes(4);
	});

	it("refuses an Attack at oneself", async () => {
		const self = combatant({ uuid: "Actor.self", name: "Self", items: [mace] });
		target(self);
		expect(await attack(self)).toBeNull();
		expect(inputDialog).not.toHaveBeenCalled();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.attack.selfTarget");
	});

	it("says in the dialog that a target is already Slain", async () => {
		const dead = foe();
		dead.system.slain = true;
		target(dead);
		await attack(combatant({ uuid: "Actor.x", name: "X", items: [mace] }));
		expect(opened().marks).toContain("bastionland.attack.targetDown.slain");
	});

	it("lets a siege weapon's Attack count as large-scale (p11)", async () => {
		target(combatant({ uuid: "Actor.militia", name: "Militia", scale: "warband" }));
		const ram = combatant({ uuid: "Actor.ram", name: "Ram", type: "structure", items: [weapon("ram", "Battering Ram", "d12")] });
		inputDialog.mockResolvedValue({ "source.ram": true });
		await attack(ram);
		expect(postCard.mock.calls[0][3].flags[SYSTEM_ID].attack.largeScale).toBe(true);
	});

	it("spends nothing on an Attack whose card never reached the chat", async () => {
		target(foe());
		inputDialog.mockResolvedValue({ "source.mace": true });
		postCard.mockRejectedValueOnce(new Error("chat down"));
		await expect(attack(combatant({ uuid: "Actor.x", name: "X", items: [mace] }))).rejects.toThrow("chat down");
		expect(rememberAttack).not.toHaveBeenCalled();
	});
});

describe("moved this turn, on any Scene (combat audit of 2026-10-29)", () => {
	it("opens Moved ticked from their place in a running Combat, whichever Scene is in view", async () => {
		const rider = combatant({ uuid: "Actor.rider", name: "Rider", items: [weapon("mace", "Mace", "d8")] });
		target(combatant({ uuid: "Actor.moss", name: "Moss", type: "knight" }));
		const place = (moved, started = true) => ({ started, combatants: [{ actor: rider, getFlag: () => null, token: { movementHistory: moved ? [{}] : [] } }] });
		const collection = (list) => Object.assign([...list], { contents: list });
		game.combats = collection([place(true)]);
		await attack(rider);
		expect(opened().moved).toBe(true);

		for (const combats of [[place(false)], [place(true, false)], []]) {
			inputDialog.mockClear();
			game.combats = collection(combats);
			await attack(rider);
			expect(opened().moved).toBe(false);
		}
	});
});
