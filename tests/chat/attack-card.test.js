import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

vi.mock("../../module/actions/attack.js", () => ({
	renderAttackCard: vi.fn(async () => "<section></section>"),
	dieLabel: (die) => die.label,
	cardTarget: () => ({}),
	joinAttack: vi.fn(async () => null),
	poolRerollers: vi.fn(() => []),
	sigilHolders: vi.fn(() => []),
	showRolls: vi.fn()
}));
vi.mock("../../module/actions/damage.js", async (importOriginal) => ({ ...(await importOriginal()), takeAttack: vi.fn(async () => true) }));
vi.mock("../../module/actions/saves.js", () => ({ rollSave: vi.fn() }));
vi.mock("../../module/apps/ui.js", () => ({
	chooseDialog: vi.fn(),
	confirmDialog: vi.fn(async () => false),
	inputDialog: vi.fn(async () => null)
}));
// Only the Save, its Fatigue and the chat card are stubbed: whether somebody may Deny is the rule under test.
vi.mock("../../module/actions/feats.js", async (importOriginal) => ({
	...(await importOriginal()),
	rollFeat: vi.fn(async () => ({ passed: false, value: 10, roll: { total: 14 } })),
	payFeat: vi.fn(async () => {}),
	postFeat: vi.fn(async () => {})
}));

const { chooseDialog, confirmDialog, inputDialog } = await import("../../module/apps/ui.js");
const { payFeat, postFeat, rollFeat } = await import("../../module/actions/feats.js");
const { joinAttack, poolRerollers, showRolls, sigilHolders } = await import("../../module/actions/attack.js");
const { rollSave } = await import("../../module/actions/saves.js");
const { takeAttack } = await import("../../module/actions/damage.js");
const { registerAttackCards } = await import("../../module/chat/attack-card.js");

/** A Knight or a foe, owned by this user unless said otherwise. */
const actor = ({ uuid, name, fatigued = false, isOwner = true, knows = true }) => ({
	uuid,
	name,
	isOwner,
	system: { virtues: { vig: {}, cla: {}, spi: {} }, fatigued, knowsFeat: () => knows }
});

/** The Attack card's state: a foe's d8 and d6 rolled at one Knight. */
const attackState = (extra = {}) => ({
	attackId: "attack-1",
	attacker: "Actor.foe",
	targets: [{ uuid: "Scene.s.Token.k", name: "Ser Kay" }],
	dice: [
		{ faces: 8, result: 6, label: "d8", deniedBy: null },
		{ faces: 6, result: 3, label: "d6", deniedBy: null }
	],
	melee: true,
	impaired: false,
	gambits: [],
	feats: [],
	appliedTo: [],
	...extra
});

let hooks;
let warnings;
let tokens;

beforeEach(() => {
	hooks = {};
	warnings = [];
	tokens = {};
	globalThis.Hooks = { on: (name, fn) => { hooks[name] = fn; } };
	globalThis.CONFIG = { queries: {} };
	globalThis.canvas = { tokens: { controlled: [] } };
	globalThis.ui = { notifications: { warn: (text) => warnings.push(text) } };
	globalThis.fromUuidSync = (uuid) => tokens[uuid] ?? null;
	globalThis.game = {
		user: { character: null, targets: new Set() },
		messages: [],
		users: { activeGM: null },
		i18n: { localize: (key) => key, format: (key) => key }
	};
});

afterEach(() => {
	for (const key of ["Hooks", "CONFIG", "canvas", "ui", "fromUuidSync", "game"]) delete globalThis[key];
	vi.clearAllMocks();
});

/**
 * Draw the card for this user and hand back its Deny button and a way to click
 * any of them, as `renderChatMessageHTML` does in the chat log.
 */
function renderCard(state) {
	const message = {
		id: "message-1",
		isOwner: true,
		flags: { [SYSTEM_ID]: { attack: state } },
		update: vi.fn(async () => {})
	};
	game.messages = [message];
	game.messages.get = () => message;

	const data = { "gambit-save": { gambit: "0" }, gambit: { die: "0" }, greater: { gambit: "0" } };
	const buttons = ["deny", "focus", "apply", "gambit-save", "gambit", "join", "greater", "reroll", "sigil"].map((action) => ({
		dataset: { attackAction: action, ...data[action] },
		disabled: false,
		hidden: false,
		closest: () => null
	}));
	for (const button of buttons) button.closest = () => button;
	const listeners = {};
	const card = {
		querySelectorAll: () => buttons,
		addEventListener: (type, fn) => { listeners[type] = fn; }
	};
	registerAttackCards();
	hooks.renderChatMessageHTML(message, { querySelector: () => card });

	const find = (action) => buttons.find((button) => button.dataset.attackAction === action);
	return {
		message,
		deny: find("deny"),
		join: find("join"),
		reroll: find("reroll"),
		sigil: find("sigil"),
		hover: () => listeners.pointerenter?.(),
		click: (action) => listeners.click?.({ target: find(action), preventDefault() {} })
	};
}

describe("the Deny button", () => {
	it("is live for a target this user owns, and says nothing about it", () => {
		tokens["Scene.s.Token.k"] = { actor: actor({ uuid: "Actor.k", name: "Ser Kay" }) };
		const { deny } = renderCard(attackState());
		expect(deny.disabled).toBe(false);
		expect(deny.dataset.tooltip).toBeUndefined();
	});

	it("is refused, with the reason, while the only Knight who could Deny is Fatigued", () => {
		tokens["Scene.s.Token.k"] = { actor: actor({ uuid: "Actor.k", name: "Ser Kay", fatigued: true }) };
		const { deny } = renderCard(attackState());
		expect(deny.disabled).toBe(true);
		expect(deny.dataset.tooltip).toBe("bastionland.attack.cantDeny");
	});

	it("is refused once that Knight has already Denied a die of this Attack", () => {
		tokens["Scene.s.Token.k"] = { actor: actor({ uuid: "Actor.k", name: "Ser Kay" }) };
		const denied = attackState({
			dice: [
				{ faces: 8, result: 6, label: "d8", deniedBy: "Ser Kay" },
				{ faces: 6, result: 3, label: "d6", deniedBy: null }
			],
			feats: [{ key: "deny", actor: "Actor.k" }]
		});
		expect(renderCard(denied).deny.disabled).toBe(true);
	});

	it("asks for a Token when this user has nobody to Deny with", () => {
		tokens["Scene.s.Token.k"] = { actor: actor({ uuid: "Actor.k", name: "Ser Kay", isOwner: false }) };
		const { deny } = renderCard(attackState());
		expect(deny.disabled).toBe(true);
		expect(deny.dataset.tooltip).toBe("bastionland.attack.noDenier");
	});

	it("weighs itself again as the pointer arrives, since a Token is selected after the card is drawn", () => {
		tokens["Scene.s.Token.k"] = { actor: actor({ uuid: "Actor.k", name: "Ser Kay", isOwner: false }) };
		const card = renderCard(attackState());
		expect(card.deny.disabled).toBe(true);

		canvas.tokens.controlled = [{ actor: actor({ uuid: "Actor.ally", name: "Ser Ban" }) }];
		card.hover();
		expect(card.deny.disabled).toBe(false);
	});
});

describe("the Gambit's Save", () => {
	const twoTargets = () => attackState({
		targets: [{ uuid: "Scene.s.Token.k", name: "Ser Kay" }, { uuid: "Scene.s.Token.b", name: "Ser Ban" }],
		gambits: [{ key: "dismount", save: null }]
	});

	beforeEach(() => {
		tokens["Scene.s.Token.k"] = { actor: actor({ uuid: "Actor.k", name: "Ser Kay" }) };
		tokens["Scene.s.Token.b"] = { actor: actor({ uuid: "Actor.b", name: "Ser Ban" }) };
	});

	it("rolls nothing when the window asking who Saves is closed", async () => {
		chooseDialog.mockResolvedValue(null);
		const card = renderCard(twoTargets());
		await card.click("gambit-save");
		expect(chooseDialog).toHaveBeenCalledOnce();
		expect(rollSave).not.toHaveBeenCalled();
		expect(card.message.update).not.toHaveBeenCalled();
	});

	it("rolls for whoever was picked", async () => {
		chooseDialog.mockResolvedValue("1");
		rollSave.mockResolvedValue({ roll: { total: 9 }, value: 12, passed: true });
		const card = renderCard(twoTargets());
		await card.click("gambit-save");
		expect(rollSave).toHaveBeenCalledWith(tokens["Scene.s.Token.b"].actor, "vig");
	});

	it("asks nobody when only one could Save", async () => {
		rollSave.mockResolvedValue({ roll: { total: 9 }, value: 12, passed: true });
		const card = renderCard(attackState({ gambits: [{ key: "dismount", save: null }] }));
		await card.click("gambit-save");
		expect(chooseDialog).not.toHaveBeenCalled();
		expect(rollSave).toHaveBeenCalledWith(tokens["Scene.s.Token.k"].actor, "vig");
	});

	it("rolls the Virtue the Gambit was declared with, as a CLA Save to dodge a stab (p187)", async () => {
		rollSave.mockResolvedValue({ roll: { total: 9 }, value: 12, passed: true });
		const card = renderCard(attackState({ gambits: [{ key: "impair", save: null, saveIn: "cla" }] }));
		await card.click("gambit-save");
		expect(rollSave).toHaveBeenCalledWith(tokens["Scene.s.Token.k"].actor, "cla");
	});
});

describe("applying the Damage", () => {
	beforeEach(() => {
		tokens["Scene.s.Token.k"] = { actor: actor({ uuid: "Actor.k", name: "Ser Kay" }) };
	});

	it("says a target could still Deny before the Damage lands", async () => {
		const card = renderCard(attackState());
		await card.click("apply");
		expect(confirmDialog).toHaveBeenCalledOnce();
		expect(confirmDialog.mock.calls[0][0].message).toEqual([
			"bastionland.attack.unspentGambitsOne",
			"bastionland.attack.deniableDice",
			"bastionland.attack.applyAnyway"
		]);
		expect(takeAttack).not.toHaveBeenCalled();
	});

	it("asks nothing once the target is Fatigued and no die can pay for a Gambit", async () => {
		tokens["Scene.s.Token.k"] = { actor: actor({ uuid: "Actor.k", name: "Ser Kay", fatigued: true }) };
		const card = renderCard(attackState({ dice: [{ faces: 6, result: 3, label: "d6", deniedBy: null }] }));
		await card.click("apply");
		expect(confirmDialog).not.toHaveBeenCalled();
		expect(takeAttack).toHaveBeenCalledOnce();
		// A Trap Gambit on this very card holds the shield only after its own blow lands.
		expect(takeAttack.mock.calls[0][2]).toEqual({ except: ["message-1"] });
	});

	it("lands only on the targets this user owns that are still waiting", async () => {
		tokens["Scene.s.Token.k"] = { actor: actor({ uuid: "Actor.k", name: "Ser Kay", fatigued: true }) };
		tokens["Scene.s.Token.g"] = { actor: actor({ uuid: "Actor.g", name: "Ser Gale", fatigued: true }) };
		tokens["Scene.s.Token.n"] = { actor: actor({ uuid: "Actor.n", name: "Nell", fatigued: true, isOwner: false }) };
		const targets = [{ uuid: "Scene.s.Token.k", name: "Ser Kay" }, { uuid: "Scene.s.Token.g", name: "Ser Gale" }, { uuid: "Scene.s.Token.n", name: "Nell" }];
		const state = attackState({ targets, dice: [{ faces: 6, result: 3, label: "d6", deniedBy: null }], appliedTo: ["Ser Kay"], appliedTokens: ["Scene.s.Token.k"] });
		const card = renderCard(state);
		await card.click("apply");
		expect(takeAttack).toHaveBeenCalledOnce();
		expect(takeAttack.mock.calls[0][0]).toBe(tokens["Scene.s.Token.g"].actor);
		expect(savedState(card.message).appliedTo).toEqual(["Ser Kay", "Ser Gale"]);
		expect(savedState(card.message).appliedTokens).toEqual(["Scene.s.Token.k", "Scene.s.Token.g"]);
	});
});

/** A Knight or NPC who could join an Attack, owned by this user unless said otherwise. */
const combatant = ({ uuid, name, type = "knight", isOwner = true, owners = [] }) => ({
	...actor({ uuid, name, isOwner }),
	type,
	testUserPermission: (user) => owners.includes(user.id)
});

/** What joinAttack hands back once Tal has rolled: 2d8 showing 5 and 3, as on p185. */
const talJoins = () => ({
	type: "join",
	actor: "Actor.tal",
	name: "Tal",
	melee: true,
	dice: [{ faces: 8, result: 5, label: "Hookhammer" }, { faces: 8, result: 3, label: "Hookhammer" }],
	rolls: [{ class: "Roll", formula: "1d8 + 1d8", evaluated: true }]
});

/** @returns {object} The Attack card's state as the card was last updated. */
const savedState = (message) => message.update.mock.calls.at(-1)[0][`flags.${SYSTEM_ID}.attack`];

describe("Join this Attack", () => {
	/** What joining spends, which waits until the card takes the join. */
	let settle;

	beforeEach(() => {
		settle = vi.fn(async () => {});
		tokens["Scene.s.Token.k"] = { actor: combatant({ uuid: "Actor.k", name: "Ser Kay", isOwner: false }) };
		game.user.isGM = false;
		game.actors = [];
	});

	it("stays hidden from a player with nobody to join it with", () => {
		expect(renderCard(attackState()).join.hidden).toBe(true);
	});

	it("shows for a player who owns a Knight not yet in it", () => {
		game.actors = [combatant({ uuid: "Actor.tal", name: "Tal" })];
		expect(renderCard(attackState()).join.hidden).toBe(false);
	});

	it("leaves out whoever already rolls in it, or is struck by it", () => {
		tokens["Scene.s.Token.k"] = { actor: combatant({ uuid: "Actor.k", name: "Ser Kay" }) };
		game.actors = [combatant({ uuid: "Actor.tal", name: "Tal" }), tokens["Scene.s.Token.k"].actor];
		expect(renderCard(attackState({ joined: [{ actor: "Actor.tal", name: "Tal" }] })).join.hidden).toBe(true);
	});

	it("stays for a GM, who is told whose Token to select", async () => {
		game.user.isGM = true;
		const card = renderCard(attackState());
		expect(card.join.hidden).toBe(false);
		await card.click("join");
		expect(warnings).toEqual(["bastionland.attack.noJoiner"]);
		expect(joinAttack).not.toHaveBeenCalled();
	});

	it("rolls the joiner in, pooling their dice on the card (p8)", async () => {
		const tal = combatant({ uuid: "Actor.tal", name: "Tal" });
		game.actors = [tal];
		joinAttack.mockResolvedValue({ change: talJoins(), settle });
		const card = renderCard(attackState());
		await card.click("join");
		expect(joinAttack).toHaveBeenCalledWith(tal, expect.objectContaining({ attackId: "attack-1" }));
		const state = savedState(card.message);
		expect(state.dice.map((die) => die.result)).toEqual([6, 5, 3, 3]);
		expect(state.dice.filter((die) => die.by === "Tal")).toHaveLength(2);
		expect(state.joined).toEqual([expect.objectContaining({ actor: "Actor.tal", name: "Tal" })]);
		// Their roll rides on the card's message beside its own, for its tooltip.
		expect(card.message.update.mock.calls[0][0].rolls).toEqual([JSON.stringify(talJoins().rolls[0])]);
		expect(settle).toHaveBeenCalledOnce();
	});

	it("closes once a Deny, Gambit or Focus is declared, since everybody rolls first (p8)", async () => {
		game.actors = [combatant({ uuid: "Actor.tal", name: "Tal" })];
		const declared = attackState({ declared: true, gambits: [{ key: "bolster", die: 0, save: null }] });
		const card = renderCard(declared);
		expect(card.join.hidden).toBe(true);
		await card.click("join");
		expect(warnings).toEqual(["bastionland.attack.joinClosed"]);
		expect(joinAttack).not.toHaveBeenCalled();
	});

	it("records nothing when a Gambit was declared while the joiner's dialog stood open", async () => {
		game.actors = [combatant({ uuid: "Actor.tal", name: "Tal" })];
		const card = renderCard(attackState());
		joinAttack.mockImplementation(async () => {
			card.message.flags[SYSTEM_ID].attack = attackState({ declared: true });
			return { change: talJoins(), settle };
		});
		await card.click("join");
		expect(warnings).toEqual(["bastionland.attack.joinClosed"]);
		expect(card.message.update).not.toHaveBeenCalled();
		// Nothing is spent for a join the card never took: no Smite paid for, nothing thrown.
		expect(settle).not.toHaveBeenCalled();
		joinAttack.mockReset();
	});

	it("spends nothing when the GM refuses the join", async () => {
		game.actors = [combatant({ uuid: "Actor.tal", name: "Tal" })];
		game.users.activeGM = { query: vi.fn(async () => false) };
		const card = renderCard(attackState());
		card.message.isOwner = false;
		joinAttack.mockResolvedValue({ change: talJoins(), settle });
		await card.click("join");
		expect(game.users.activeGM.query).toHaveBeenCalledOnce();
		expect(warnings).toEqual(["bastionland.attack.changeRefused"]);
		expect(settle).not.toHaveBeenCalled();
		joinAttack.mockReset();
	});

	it("asks which Knight joins when there are several, and joins nobody when the window closes", async () => {
		game.actors = [combatant({ uuid: "Actor.tal", name: "Tal" }), combatant({ uuid: "Actor.moss", name: "Moss" })];
		chooseDialog.mockResolvedValue(null);
		const card = renderCard(attackState());
		await card.click("join");
		expect(chooseDialog).toHaveBeenCalledOnce();
		expect(joinAttack).not.toHaveBeenCalled();
	});

	it("does nothing once the Damage is applied, or on a duel's blow", async () => {
		game.actors = [combatant({ uuid: "Actor.tal", name: "Tal" })];
		await renderCard(attackState({ appliedTo: ["Ser Kay"] })).click("join");
		await renderCard(attackState({ duel: "Message.d" })).click("join");
		expect(joinAttack).not.toHaveBeenCalled();
	});
});

describe("the GM recording a joint Attack for a player", () => {
	const player = { id: "player-1" };
	const ask = (change) => CONFIG.queries[`${SYSTEM_ID}.changeAttack`]({ messageId: "message-1", change }, { user: player });

	it("refuses a join that comes after a Deny or Gambit", async () => {
		tokens["Actor.tal"] = combatant({ uuid: "Actor.tal", name: "Tal", owners: ["player-1"] });
		const card = renderCard(attackState({ declared: true, dice: [{ faces: 8, result: 6, label: "d8", deniedBy: "Ser Kay" }] }));
		expect(await ask(talJoins())).toBe(false);
		expect(card.message.update).not.toHaveBeenCalled();
	});

	it("records a join only for the joiner's owner, under the joiner's own name", async () => {
		tokens["Actor.tal"] = combatant({ uuid: "Actor.tal", name: "Tal" });
		const card = renderCard(attackState());
		expect(await ask(talJoins())).toBe(false);
		expect(card.message.update).not.toHaveBeenCalled();

		tokens["Actor.tal"] = combatant({ uuid: "Actor.tal", name: "Tal", owners: ["player-1"] });
		expect(await ask({ ...talJoins(), name: "Somebody else" })).toBe(true);
		expect(savedState(card.message).joined[0].name).toBe("Tal");
	});

	it("lets a player spend the pooled dice only on an Attack they roll in", async () => {
		tokens["Actor.tal"] = combatant({ uuid: "Actor.tal", name: "Tal", owners: ["player-1"] });
		renderCard(attackState());
		expect(await ask({ type: "gambit", die: 0, key: "bolster" })).toBe(false);

		renderCard(attackState({ joined: [{ actor: "Actor.tal", name: "Tal", impaired: false }] }));
		expect(await ask({ type: "gambit", die: 0, key: "bolster" })).toBe(true);
	});

	it("records Damage applied only to targets the player owns, under their own names", async () => {
		tokens["Scene.s.Token.k"] = { actor: combatant({ uuid: "Actor.k", name: "Ser Kay" }) };
		const card = renderCard(attackState());
		expect(await ask({ type: "applied", names: ["Ser Kay"], tokens: ["Scene.s.Token.k"] })).toBe(false);
		expect(card.message.update).not.toHaveBeenCalled();

		tokens["Scene.s.Token.k"] = { actor: combatant({ uuid: "Actor.k", name: "Ser Kay", owners: ["player-1"] }) };
		expect(await ask({ type: "applied", names: ["Somebody else"], tokens: ["Scene.s.Token.k", "Scene.s.Token.x"] })).toBe(true);
		expect(savedState(card.message).appliedTo).toEqual(["Ser Kay"]);
		expect(savedState(card.message).appliedTokens).toEqual(["Scene.s.Token.k"]);
	});

	it("lets a second target's owner apply the Damage after the first has", async () => {
		tokens["Scene.s.Token.k"] = { actor: combatant({ uuid: "Actor.k", name: "Ser Kay", owners: ["player-2"] }) };
		tokens["Scene.s.Token.g"] = { actor: combatant({ uuid: "Actor.g", name: "Ser Gale", owners: ["player-1"] }) };
		const targets = [{ uuid: "Scene.s.Token.k", name: "Ser Kay" }, { uuid: "Scene.s.Token.g", name: "Ser Gale" }];
		const card = renderCard(attackState({ targets, appliedTo: ["Ser Kay"], appliedTokens: ["Scene.s.Token.k"] }));
		// Ser Kay's Damage has landed, and is never taken twice.
		expect(await ask({ type: "applied", names: ["Ser Kay"], tokens: ["Scene.s.Token.k"] })).toBe(false);
		expect(await ask({ type: "applied", names: ["Ser Gale"], tokens: ["Scene.s.Token.g"] })).toBe(true);
		expect(savedState(card.message).appliedTo).toEqual(["Ser Kay", "Ser Gale"]);
	});

	it("lets a player Focus only with one of the attackers, and one of theirs", async () => {
		tokens["Actor.tal"] = combatant({ uuid: "Actor.tal", name: "Tal", owners: ["player-1"] });
		tokens["Actor.moss"] = combatant({ uuid: "Actor.moss", name: "Moss", owners: ["player-1"] });
		renderCard(attackState({ joined: [{ actor: "Actor.tal", name: "Tal", impaired: false }] }));
		expect(await ask({ type: "focus", key: "bolster", actor: "Actor.moss" })).toBe(false);
		expect(await ask({ type: "focus", key: "bolster", actor: "Actor.tal" })).toBe(true);
	});
});

describe("paying for Focus and Deny", () => {
	beforeEach(() => {
		tokens["Actor.foe"] = actor({ uuid: "Actor.foe", name: "Foe" });
		tokens["Scene.s.Token.k"] = { actor: actor({ uuid: "Actor.k", name: "Ser Kay" }) };
		inputDialog.mockResolvedValue({ gambit: "bolster", saveIn: "vig", denier: "Actor.k", die: "0" });
	});

	it("Fatigues whoever Focused only once the card takes the Focus (p10)", async () => {
		const card = renderCard(attackState());
		await card.click("focus");
		expect(rollFeat).toHaveBeenCalledWith(tokens["Actor.foe"], "focus");
		expect(savedState(card.message).gambits[0]).toMatchObject({ key: "bolster", focus: { passed: false, total: 14, target: 10 } });
		expect(payFeat).toHaveBeenCalledWith(tokens["Actor.foe"], expect.objectContaining({ passed: false }));
		expect(postFeat).toHaveBeenCalledOnce();
	});

	it("costs nothing for a Focus or Deny the GM refuses", async () => {
		game.users.activeGM = { query: vi.fn(async () => false) };
		for (const action of ["focus", "deny"]) {
			const card = renderCard(attackState());
			card.message.isOwner = false;
			await card.click(action);
		}
		expect(rollFeat).toHaveBeenCalledTimes(2);
		expect(game.users.activeGM.query).toHaveBeenCalledTimes(2);
		expect(payFeat).not.toHaveBeenCalled();
		expect(postFeat).not.toHaveBeenCalled();
	});
});

describe("an Impair naming a weapon", () => {
	beforeEach(() => {
		const croc = actor({ uuid: "Actor.croc", name: "Crocodile" });
		croc.items = [
			{ id: "tail", name: "Tail", system: { equipped: true, damage: "d6" } },
			{ id: "jaw", name: "Jaws", system: { equipped: true, damage: "d10" } },
			{ id: "hide", name: "Hide", system: { equipped: true, damage: "" } },
			{ id: "claw", name: "Broken claw", system: { equipped: true, damage: "d8", broken: true } }
		];
		tokens["Scene.s.Token.k"] = { actor: croc };
	});

	it("offers the GM the foe's weapons still at hand, hardest-hitting first, and keeps the one named (p186)", async () => {
		game.user.isGM = true;
		inputDialog.mockResolvedValue({ gambit: "impair", saveIn: "vig", weapon: "0" });
		const card = renderCard(attackState());
		await card.click("gambit");
		expect(inputDialog.mock.calls[0][0].context.weapons).toHaveLength(2);
		expect(savedState(card.message).gambits[0].weapon).toEqual({ id: "jaw", name: "Jaws", actor: "Actor.croc" });
	});

	it("offers a player only what the foe has been seen attacking with", async () => {
		inputDialog.mockResolvedValue({ gambit: "impair", saveIn: "vig", weapon: "0" });
		const card = renderCard(attackState());
		const shown = { visible: true, flags: { [SYSTEM_ID]: { attack: attackState({ attacker: "Actor.croc", dice: [{ faces: 6, result: 2, label: "Tail", deniedBy: null }] }) } } };
		const hidden = { visible: false, flags: { [SYSTEM_ID]: { attack: attackState({ attacker: "Actor.croc", dice: [{ faces: 10, result: 2, label: "Jaws", deniedBy: null }] }) } } };
		game.messages.push(shown, hidden);
		await card.click("gambit");
		const offered = inputDialog.mock.calls[0][0].context;
		expect(offered.weapons).toHaveLength(1);
		expect(savedState(card.message).gambits[0].weapon).toEqual({ id: "tail", name: "Tail", actor: "Actor.croc" });
	});

	it("offers a player only their whole next Attack while the foe has shown nothing", async () => {
		inputDialog.mockResolvedValue({ gambit: "impair", saveIn: "vig" });
		const card = renderCard(attackState());
		await card.click("gambit");
		expect(inputDialog.mock.calls[0][0].context.weapons).toEqual([]);
		expect(savedState(card.message).gambits[0]).not.toHaveProperty("weapon");
	});

	it("Impairs their whole next Attack when none is named", async () => {
		inputDialog.mockResolvedValue({ gambit: "impair", saveIn: "vig", weapon: "" });
		const card = renderCard(attackState());
		await card.click("gambit");
		expect(savedState(card.message).gambits[0]).not.toHaveProperty("weapon");
	});

	it("names nothing for any other Gambit", async () => {
		inputDialog.mockResolvedValue({ gambit: "trap", saveIn: "vig", weapon: "0" });
		const card = renderCard(attackState());
		await card.click("gambit");
		expect(savedState(card.message).gambits[0]).not.toHaveProperty("weapon");
	});
});

describe("a Strong Gambit's Greater effect", () => {
	const strong = () => attackState({ gambits: [{ key: "repel", die: 0, strong: "greater", bonus: null, save: { by: "Ser Kay", total: 15, target: 10, passed: false }, dismissed: false }] });
	let kay;

	beforeEach(() => {
		kay = actor({ uuid: "Actor.kay", name: "Ser Kay" });
		kay.type = "knight";
		const sword = { id: "sword", name: "Sword", type: "weapon", system: { equipped: true, damage: "d8" }, update: vi.fn(async () => {}) };
		kay.items = Object.assign([sword], { get: (id) => (id === "sword" ? sword : undefined) });
		tokens["Scene.s.Token.k"] = { actor: kay };
		game.user.isGM = true;
	});

	it("offers the foe's things as a radio list with Something else beside them", async () => {
		inputDialog.mockResolvedValue({ effect: "0" });
		const card = renderCard(strong());
		await card.click("greater");
		const asked = inputDialog.mock.calls[0][0];
		expect(asked.template).toBe("greater");
		expect(asked.context.effects).toEqual([{ id: "0", name: "Ser Kay: bastionland.attack.greater.disarm" }]);
		expect(savedState(card.message).gambits[0].greater).toBe("bastionland.attack.greater.disarmed bastionland.attack.greater.pickUp");
		expect(kay.items.get("sword").update).toHaveBeenCalledWith({ "system.equipped": false }, expect.anything());
	});

	it("records Something else as written, changing nobody's sheet (p114)", async () => {
		inputDialog.mockResolvedValue({ effect: "blank", other: "  Takes the arm  " });
		const card = renderCard(strong());
		await card.click("greater");
		expect(savedState(card.message).gambits[0].greater).toBe("bastionland.attack.greater.otherDone");
		expect(kay.items.get("sword").update).not.toHaveBeenCalled();
	});

	it("asks for the words when Something else is left blank", async () => {
		inputDialog.mockResolvedValue({ effect: "blank", other: " " });
		const card = renderCard(strong());
		await card.click("greater");
		expect(card.message.update).not.toHaveBeenCalled();
		expect(warnings).toEqual(["bastionland.attack.greater.otherEmpty"]);
	});

	it("lets an attacker's player, and only theirs, write one in for the GM to record", async () => {
		const player = { id: "player-1" };
		const ask = (change) => CONFIG.queries[`${SYSTEM_ID}.changeAttack`]({ messageId: "message-1", change }, { user: player });
		const other = { type: "greater", index: 0, text: "Greater effect: takes the arm", other: true };
		kay.testUserPermission = () => false;
		tokens["Actor.foe"] = { uuid: "Actor.foe", testUserPermission: () => false };
		const card = renderCard(strong());
		expect(await ask(other)).toBe(false);
		expect(card.message.update).not.toHaveBeenCalled();

		tokens["Actor.foe"] = { uuid: "Actor.foe", testUserPermission: (user) => user === player };
		expect(await ask(other)).toBe(true);
		expect(savedState(card.message).gambits[0].greater).toBe("Greater effect: takes the arm");
	});

	it("lets the owner of the foe a player targets write one in on a card rolled with no targets", async () => {
		const player = { id: "player-1" };
		const ask = (change) => CONFIG.queries[`${SYSTEM_ID}.changeAttack`]({ messageId: "message-1", change }, { user: player });
		const other = { type: "greater", index: 0, text: "Greater effect: takes the arm", other: true };
		tokens["Actor.foe"] = { uuid: "Actor.foe", testUserPermission: () => false };
		tokens["Actor.mine"] = { uuid: "Actor.mine", testUserPermission: (user) => user === player };
		tokens["Actor.theirs"] = { uuid: "Actor.theirs", testUserPermission: () => false };
		const card = renderCard({ ...strong(), targets: [] });
		expect(await ask(other)).toBe(false);
		expect(await ask({ ...other, actor: "Actor.theirs" })).toBe(false);
		expect(card.message.update).not.toHaveBeenCalled();
		expect(await ask({ ...other, actor: "Actor.mine" })).toBe(true);
		expect(savedState(card.message).gambits[0].greater).toBe("Greater effect: takes the arm");
	});
});

/** A Roll whose dice all show the given results in turn. */
function rollShowing(...results) {
	return class {
		constructor(formula) {
			this.formula = formula;
		}

		async evaluate() {
			this.dice = this.formula.split("+").map((_term, index) => ({ total: results[index] ?? 1 }));
			return this;
		}

		toJSON() {
			return { class: "Roll", formula: this.formula, evaluated: true };
		}
	};
}

/** An Ability with uses, as a reroll or a rune spends. */
const abilityWithUses = (value) => ({ system: { quantity: { value, max: 4 } }, isOwner: true, update: vi.fn(async () => {}) });

describe("rolling the pool again (p62)", () => {
	const joint = () => attackState({ joined: [{ actor: "Actor.tal", name: "Tal" }] });

	beforeEach(() => {
		globalThis.Roll = rollShowing(2, 5);
		poolRerollers.mockReturnValue([]);
	});
	afterEach(() => {
		delete globalThis.Roll;
	});

	it("shows only to whoever owns an attacker with an Ability that does it", () => {
		expect(renderCard(joint()).reroll.hidden).toBe(true);
		poolRerollers.mockReturnValue([{ actor: { uuid: "Actor.tal", name: "Tal", isOwner: false }, item: abilityWithUses(1) }]);
		expect(renderCard(joint()).reroll.hidden).toBe(true);
		poolRerollers.mockReturnValue([{ actor: { uuid: "Actor.tal", name: "Tal", isOwner: true }, item: abilityWithUses(1) }]);
		expect(renderCard(joint()).reroll.hidden).toBe(false);
	});

	it("rolls every die again, keeps the roll on the card, and spends a use", async () => {
		const item = abilityWithUses(1);
		poolRerollers.mockReturnValue([{ actor: { uuid: "Actor.tal", name: "Tal", isOwner: true }, item }]);
		const card = renderCard(joint());
		await card.click("reroll");
		const state = savedState(card.message);
		expect(state.dice.map((die) => die.result)).toEqual([5, 2]);
		expect(state.rerolled).toEqual({ by: "Tal" });
		expect(card.message.update.mock.calls.at(-1)[0].rolls).toHaveLength(1);
		expect(showRolls).toHaveBeenCalledOnce();
		expect(item.update).toHaveBeenCalledWith({ "system.quantity.value": 0 }, expect.anything());
	});

	it("says so, and rolls nothing, once something has been spent on the dice", async () => {
		poolRerollers.mockReturnValue([{ actor: { uuid: "Actor.tal", name: "Tal", isOwner: true }, item: abilityWithUses(1) }]);
		const card = renderCard({ ...joint(), gambits: [{ key: "repel", die: 0, strong: null, save: null }] });
		await card.click("reroll");
		expect(card.message.update).not.toHaveBeenCalled();
		expect(warnings).toEqual(["bastionland.attack.reroll.closed"]);
	});
});

describe("turning a die with a rune (p100)", () => {
	beforeEach(() => {
		sigilHolders.mockReturnValue([]);
	});

	it("shows only to whoever owns a Knight whose rune a die shows", () => {
		expect(renderCard(attackState()).sigil.hidden).toBe(true);
		sigilHolders.mockReturnValue([{ actor: { uuid: "Actor.y", name: "Ysolde", isOwner: true }, item: abilityWithUses(3), number: 3 }]);
		expect(renderCard(attackState()).sigil.hidden).toBe(false);
	});

	it("turns the die picked to the face asked for, and spends one of the rune's turns", async () => {
		const item = abilityWithUses(3);
		sigilHolders.mockReturnValue([{ actor: { uuid: "Actor.y", name: "Ysolde", isOwner: true }, item, number: 3 }]);
		inputDialog.mockResolvedValueOnce({ die: "1", value: "6" });
		const card = renderCard(attackState());
		await card.click("sigil");
		const state = savedState(card.message);
		expect(state.dice.map((die) => die.result)).toEqual([6, 6]);
		expect(state.dice.find((die) => die.adjusted)).toMatchObject({ faces: 6, adjusted: { by: "Ysolde", from: 3 } });
		expect(item.update).toHaveBeenCalledWith({ "system.quantity.value": 2 }, expect.anything());
	});

	it("turns nothing to a face the die hasn't", async () => {
		const item = abilityWithUses(3);
		sigilHolders.mockReturnValue([{ actor: { uuid: "Actor.y", name: "Ysolde", isOwner: true }, item, number: 3 }]);
		inputDialog.mockResolvedValueOnce({ die: "1", value: "8" });
		const card = renderCard(attackState());
		await card.click("sigil");
		expect(card.message.update).not.toHaveBeenCalled();
		expect(item.update).not.toHaveBeenCalled();
		expect(warnings).toEqual(["bastionland.attack.sigil.badValue"]);
	});

	it("records for a player only a die showing the number their own rune is etched for", async () => {
		const player = { id: "player-1" };
		const ask = (change) => CONFIG.queries[`${SYSTEM_ID}.changeAttack`]({ messageId: "message-1", change }, { user: player });
		const ysolde = { uuid: "Actor.y", name: "Ysolde", isOwner: false, testUserPermission: (user) => user === player };
		tokens["Actor.y"] = ysolde;
		const card = renderCard(attackState());
		const turn = { type: "sigil", die: 1, from: 3, value: 6, actor: "Actor.y" };
		expect(await ask(turn)).toBe(false);
		sigilHolders.mockReturnValue([{ actor: ysolde, item: abilityWithUses(3), number: 3 }]);
		expect(await ask({ ...turn, die: 0, from: 6, value: 1 })).toBe(false);
		expect(card.message.update).not.toHaveBeenCalled();
		expect(await ask(turn)).toBe(true);
		expect(savedState(card.message).dice.map((die) => die.result)).toEqual([6, 6]);
	});
});
