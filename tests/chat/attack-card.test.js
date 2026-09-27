import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

vi.mock("../../module/actions/attack.js", () => ({ renderAttackCard: vi.fn(async () => "<section></section>") }));
vi.mock("../../module/actions/damage.js", () => ({ takeAttack: vi.fn(async () => true) }));
vi.mock("../../module/actions/saves.js", () => ({ rollSave: vi.fn() }));
vi.mock("../../module/apps/ui.js", () => ({
	chooseDialog: vi.fn(),
	confirmDialog: vi.fn(async () => false),
	inputDialog: vi.fn(async () => null)
}));
// Only the Save and the chat card are stubbed: whether somebody may Deny is the rule under test.
vi.mock("../../module/actions/feats.js", async (importOriginal) => ({
	...(await importOriginal()),
	performFeat: vi.fn(async () => ({ passed: true, roll: {} }))
}));

const { chooseDialog, confirmDialog } = await import("../../module/apps/ui.js");
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

	const buttons = ["deny", "focus", "apply", "gambit-save"].map((action) => ({
		dataset: action === "gambit-save" ? { attackAction: action, gambit: "0" } : { attackAction: action },
		disabled: false,
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
	});
});
