import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import { changePack, newPack } from "../../module/rules/pack.js";

// The Attack dialog, the dice window and the roll are the Attack's own, tested with it; the card is under test here.
// What the card draws of its state is the Attack's own too, and kept as it is.
vi.mock("../../module/actions/attack.js", async (importOriginal) => ({
	packShown: (await importOriginal()).packShown,
	askPackGroups: vi.fn(async () => []),
	joinPack: vi.fn(async () => null),
	packRolled: vi.fn(async () => {}),
	renderPackCard: vi.fn(async () => "<section></section>"),
	rollPack: vi.fn(async () => ({ id: "attack-message" })),
	spendAttack: vi.fn(async () => {})
}));
vi.mock("../../module/apps/actor-pick.js", () => ({ chooseActor: vi.fn(async (actors) => actors[0]) }));
vi.mock("../../module/apps/ui.js", () => ({ confirmDialog: vi.fn(async () => true) }));
vi.mock("../../module/ask-gm.js", () => ({ askActiveGM: vi.fn(async () => true) }));
vi.mock("../../module/chat/attack-card.js", () => ({ joinersFor: vi.fn(() => []) }));

const { askPackGroups, joinPack, packRolled, renderPackCard, rollPack, spendAttack } = await import("../../module/actions/attack.js");
const { confirmDialog } = await import("../../module/apps/ui.js");
const { askActiveGM } = await import("../../module/ask-gm.js");
const { joinersFor } = await import("../../module/chat/attack-card.js");
const { registerPackCards } = await import("../../module/chat/pack-card.js");

/** The Horde Knight's Pack card, aimed at a boar. */
const packState = () => newPack({
	attackId: "attack-1",
	attacker: "Actor.horde",
	attackerName: "Horde",
	targets: [{ uuid: "Scene.s.Token.boar", name: "Boar" }],
	share: { made: { melee: true }, dice: [{ faces: 8, label: "Spear" }], blows: null }
});

const anne = { uuid: "Actor.anne", name: "Anne", isOwner: true };

let hooks;
let warnings;
let tokens;

beforeEach(() => {
	hooks = {};
	warnings = [];
	joinersFor.mockReturnValue([]);
	tokens = { "Actor.horde": { uuid: "Actor.horde", name: "Horde", isOwner: true } };
	globalThis.Hooks = { on: (name, fn) => { hooks[name] = fn; } };
	globalThis.CONFIG = { queries: {} };
	globalThis.ui = { notifications: { warn: (text) => warnings.push(text) } };
	globalThis.fromUuidSync = (uuid) => tokens[uuid] ?? null;
	globalThis.game = {
		user: { isGM: false },
		messages: [],
		users: { activeGM: null },
		i18n: { localize: (key) => key, format: (key) => key }
	};
});

afterEach(() => {
	for (const key of ["Hooks", "CONFIG", "ui", "fromUuidSync", "game"]) delete globalThis[key];
	vi.clearAllMocks();
});

/** Draw the card for this user, as `renderChatMessageHTML` does, with a way to click its buttons. */
function renderCard(state) {
	const message = {
		id: "message-1",
		isOwner: true,
		flags: { [SYSTEM_ID]: { pack: state } },
		update: vi.fn(async (data) => { message.flags[SYSTEM_ID].pack = data[`flags.${SYSTEM_ID}.pack`]; })
	};
	game.messages = [message];
	game.messages.get = () => message;
	const buttons = ["join", "roll", "call-off", "recover"].map((action) => ({ dataset: { packAction: action }, disabled: false, hidden: false }));
	for (const button of buttons) button.closest = () => button;
	const listeners = {};
	const card = {
		querySelector: (selector) => buttons.find((button) => selector.includes(`'${button.dataset.packAction}'`)) ?? null,
		addEventListener: (type, fn) => { listeners[type] = fn; }
	};
	registerPackCards();
	hooks.renderChatMessageHTML(message, { querySelector: () => card });
	const find = (action) => buttons.find((button) => button.dataset.packAction === action);
	return {
		message,
		join: find("join"),
		roll: find("roll"),
		callOff: find("call-off"),
		recover: find("recover"),
		state: () => message.flags[SYSTEM_ID].pack,
		click: (action) => listeners.click?.({ target: find(action), preventDefault() {} })
	};
}

describe("a Pack card's buttons", () => {
	it("shows Join and Roll, and Call Off, only to whoever plays the Knight", () => {
		const theirs = renderCard(packState());
		expect([theirs.roll.hidden, theirs.callOff.hidden]).toEqual([false, false]);
		tokens["Actor.horde"].isOwner = false;
		const others = renderCard(packState());
		expect([others.roll.hidden, others.callOff.hidden]).toEqual([true, true]);
	});

	it("shows Join only to a player with somebody to join with, and always to a Referee", () => {
		expect(renderCard(packState()).join.hidden).toBe(true);
		joinersFor.mockReturnValue([anne]);
		expect(renderCard(packState()).join.hidden).toBe(false);
		joinersFor.mockReturnValue([]);
		game.user.isGM = true;
		expect(renderCard(packState()).join.hidden).toBe(false);
	});
});

describe("joining a Pack card (p8, p56)", () => {
	it("keeps the joiner's dice, and spends what they spend only once the card takes them", async () => {
		joinersFor.mockReturnValue([anne]);
		const settle = vi.fn(async () => {});
		joinPack.mockResolvedValueOnce({ change: { type: "join", actor: "Actor.anne", name: "Anne", made: {}, dice: [{ faces: 4, label: "Dagger" }], blows: null }, settle });
		const card = renderCard(packState());
		await card.click("join");
		expect(joinPack).toHaveBeenCalledWith(anne, expect.objectContaining({ attacker: "Actor.horde" }));
		expect(card.state().shares.map((share) => share.name)).toEqual(["Horde", "Anne"]);
		expect(settle).toHaveBeenCalled();
	});

	it("asks for a Token with nobody to join with", async () => {
		await renderCard(packState()).click("join");
		expect(warnings).toEqual(["bastionland.attack.noJoiner"]);
		expect(joinPack).not.toHaveBeenCalled();
	});

	it("spends nothing for a join the Knight rolled before", async () => {
		joinersFor.mockReturnValue([anne]);
		const settle = vi.fn();
		const card = renderCard(packState());
		joinPack.mockImplementationOnce(async () => {
			card.message.flags[SYSTEM_ID].pack = { ...card.state(), rolled: true };
			return { change: { type: "join", actor: "Actor.anne", name: "Anne", dice: [{ faces: 4, label: "Dagger" }] }, settle };
		});
		await card.click("join");
		expect(warnings).toEqual(["bastionland.attack.pack.closed"]);
		expect(settle).not.toHaveBeenCalled();
	});
});

describe("rolling a Pack card (p56)", () => {
	it("closes the card, rolls everybody's dice into an Attack card, and keeps it", async () => {
		const card = renderCard(packState());
		await card.click("roll");
		expect(askPackGroups).toHaveBeenCalled();
		expect(rollPack).toHaveBeenCalledWith(tokens["Actor.horde"], expect.objectContaining({ rolled: false }), []);
		expect(card.state()).toMatchObject({ rolled: true, message: "attack-message", spent: [0] });
	});

	it("draws the card again as it closes, but not for the Attack card it keeps or the spending marked", async () => {
		const card = renderCard(packState());
		await card.click("roll");
		expect(renderPackCard).toHaveBeenCalledTimes(1);
		const [closing, posted, spent] = card.message.update.mock.calls.map(([data]) => data);
		expect(closing).toHaveProperty("content");
		expect(posted).not.toHaveProperty("content");
		expect(spent).not.toHaveProperty("content");
		expect(spent[`flags.${SYSTEM_ID}.pack`]).toMatchObject({ message: "attack-message", spent: [0] });
	});

	it("draws the blows without waiting on the spending", async () => {
		let spendDone;
		spendAttack.mockImplementationOnce(() => new Promise((resolve) => { spendDone = resolve; }));
		const card = renderCard(packState());
		const rolling = card.click("roll");
		await vi.waitFor(() => expect(packRolled).toHaveBeenCalled());
		expect(spendDone).toBeTypeOf("function");
		spendDone();
		await rolling;
	});

	it("rolls nothing when the dice window is closed", async () => {
		askPackGroups.mockResolvedValueOnce(null);
		const card = renderCard(packState());
		await card.click("roll");
		expect(rollPack).not.toHaveBeenCalled();
		expect(card.state().rolled).toBe(false);
	});

	it("rolls nothing while somebody joined as the dice were being joined, so their dice aren't left out", async () => {
		const card = renderCard(packState());
		askPackGroups.mockImplementationOnce(async () => {
			card.message.flags[SYSTEM_ID].pack = changePack(card.state(), { type: "join", actor: "Actor.anne", name: "Anne", dice: [{ faces: 4, label: "Dagger" }] });
			return [1, 1];
		});
		await card.click("roll");
		expect(warnings).toEqual(["bastionland.attack.pack.joinedMeanwhile"]);
		expect(rollPack).not.toHaveBeenCalled();
		expect(card.state().rolled).toBe(false);
	});

	it("is refused to anybody who doesn't play the Knight", async () => {
		tokens["Actor.horde"].isOwner = false;
		await renderCard(packState()).click("roll");
		expect(warnings).toEqual(["bastionland.attack.pack.notYours"]);
		expect(askPackGroups).not.toHaveBeenCalled();
	});

	it("opens the card again where the Attack card never reached the chat, so nothing is lost", async () => {
		rollPack.mockResolvedValueOnce(null);
		const card = renderCard(packState());
		await card.click("roll");
		expect(warnings).toEqual(["bastionland.attack.pack.rollFailed"]);
		expect(card.state()).toMatchObject({ rolled: false, message: null });
		expect(spendAttack).not.toHaveBeenCalled();

		rollPack.mockRejectedValueOnce(new Error("no chat"));
		vi.spyOn(console, "error").mockImplementationOnce(() => {});
		await card.click("roll");
		expect(card.state().rolled).toBe(false);
	});
});

describe("what a Pack spends, and when", () => {
	/** A Pack with the Knight's share and Anne's, each with something to use up. */
	const twoShares = () => changePack(
		newPack({ attackId: "a", attacker: "Actor.horde", attackerName: "Horde", targets: [], share: { made: {}, dice: [{ faces: 8, label: "Spear" }], spend: { items: ["spear"], abilities: ["pack"] } } }),
		{ type: "join", actor: "Actor.anne", name: "Anne", dice: [{ faces: 4, label: "Javelin" }], spend: { items: ["javelin"] } }
	);

	it("spends nothing before the roll, then each share's own once it's rolled, the Referee spending for another player", async () => {
		tokens["Actor.anne"] = { ...anne, isOwner: false };
		game.users.activeGM = { id: "gm" };
		const card = renderCard(twoShares());
		// With a Referee here, the card's changes go through them; the test records them in place.
		askActiveGM.mockImplementation(async (_query, { change }) => {
			if (!change) return true;
			card.message.flags[SYSTEM_ID].pack = changePack(card.state(), change);
			return true;
		});
		await card.click("roll");
		expect(spendAttack).toHaveBeenCalledTimes(1);
		expect(spendAttack).toHaveBeenCalledWith(tokens["Actor.horde"], { items: ["spear"], shatters: false, abilities: ["pack"], keep: [] });
		expect(askActiveGM).toHaveBeenCalledWith(`${SYSTEM_ID}.spendPack`, { messageId: "message-1", share: 1 }, expect.any(String));
		expect(card.state().spent).toEqual([0]);
		expect(packRolled).toHaveBeenCalled();
		askActiveGM.mockReset().mockResolvedValue(true);
	});

	it("spends from the card as it was saved, though the Referee's write of it hasn't reached this client yet", async () => {
		tokens["Actor.anne"] = { ...anne, isOwner: false };
		game.users.activeGM = { id: "gm" };
		const card = renderCard(twoShares());
		// The Referee records every change, but this client hears only the roll before spending.
		let kept = card.state();
		askActiveGM.mockImplementation(async (_query, { change }) => {
			if (!change) return true;
			kept = changePack(kept, change);
			if (change.type === "roll") card.message.flags[SYSTEM_ID].pack = kept;
			return Boolean(kept);
		});
		await card.click("roll");
		expect(card.state().message).toBeNull();
		expect(spendAttack).toHaveBeenCalledWith(tokens["Actor.horde"], expect.objectContaining({ items: ["spear"] }));
		expect(askActiveGM).toHaveBeenCalledWith(`${SYSTEM_ID}.spendPack`, { messageId: "message-1", share: 1 }, expect.any(String));
		expect(warnings).toEqual([]);
		askActiveGM.mockReset().mockResolvedValue(true);
	});

	it("won't roll in another player's dice with no Referee here to spend what they use up", async () => {
		tokens["Actor.anne"] = { ...anne, isOwner: false };
		await renderCard(twoShares()).click("roll");
		expect(warnings).toEqual(["bastionland.attack.pack.spendNeedsGM"]);
		expect(rollPack).not.toHaveBeenCalled();
	});

	it("is spent for whoever rolled it by the Referee, once, and only after it's rolled", async () => {
		tokens["Actor.anne"] = { ...anne, testUserPermission: () => false };
		tokens["Actor.horde"].testUserPermission = (user) => user.owns.includes("Actor.horde");
		const spend = (share, owns) => CONFIG.queries[`${SYSTEM_ID}.spendPack`]({ messageId: "message-1", share }, { user: { id: "p", owns } });
		const card = renderCard(twoShares());
		expect(await spend(1, ["Actor.horde"])).toBe(false);
		card.message.flags[SYSTEM_ID].pack = changePack(changePack(card.state(), { type: "roll", shares: 2 }), { type: "posted", message: "m" });
		expect(await spend(1, [])).toBe(false);
		expect(await spend(1, ["Actor.horde"])).toBe(true);
		expect(spendAttack).toHaveBeenCalledWith(tokens["Actor.anne"], { items: ["javelin"], shatters: false, abilities: [], keep: [] });
		expect(await spend(1, ["Actor.horde"])).toBe(false);
		expect(spendAttack).toHaveBeenCalledTimes(1);
	});

	it("calls the Attack off, once its player is sure, spending nothing", async () => {
		const card = renderCard(twoShares());
		confirmDialog.mockResolvedValueOnce(false);
		await card.click("call-off");
		expect(card.state().calledOff).toBe(false);
		await card.click("call-off");
		expect(card.state()).toMatchObject({ calledOff: true, rolled: false });
		expect(spendAttack).not.toHaveBeenCalled();
		await card.click("roll");
		expect(warnings).toEqual(["bastionland.attack.pack.closed"]);
	});

	it("is called off only by whoever plays the Knight", async () => {
		tokens["Actor.horde"].isOwner = false;
		const card = renderCard(twoShares());
		await card.click("call-off");
		expect(confirmDialog).not.toHaveBeenCalled();
		expect(card.state().calledOff).toBe(false);
	});
});

describe("a Pack whose Attack card never came", () => {
	/** Closed for a roll this long ago, as a browser closed mid-roll leaves it. */
	const stalled = (ago) => ({ ...changePack(packState(), { type: "roll", shares: 1, at: Date.now() - ago }) });

	it("shows Open Again to whoever plays the Knight only once the roll has stood longer than any roll takes", () => {
		vi.useFakeTimers();
		try {
			const soon = renderCard(stalled(1000));
			expect(soon.recover.hidden).toBe(true);
			vi.advanceTimersByTime(30_000);
			expect(soon.recover.hidden).toBe(false);
			expect(renderCard(packState()).recover.hidden).toBe(true);
			tokens["Actor.horde"].isOwner = false;
			expect(renderCard(stalled(60_000)).recover.hidden).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it("keeps the Attack card where it was posted after all, and spends what it uses up", async () => {
		const card = renderCard(stalled(60_000));
		const posted = { id: "attack-message", flags: { [SYSTEM_ID]: { attack: { attackId: "attack-1" } } } };
		game.messages.push(posted);
		await card.click("recover");
		expect(confirmDialog).not.toHaveBeenCalled();
		expect(card.state()).toMatchObject({ rolled: true, message: "attack-message", spent: [0] });
		expect(spendAttack).toHaveBeenCalledOnce();
	});

	it("opens the dice again to be rolled, once its player is sure, where no Attack card came", async () => {
		const card = renderCard(stalled(60_000));
		confirmDialog.mockResolvedValueOnce(false);
		await card.click("recover");
		expect(card.state().rolled).toBe(true);
		await card.click("recover");
		expect(card.state()).toMatchObject({ rolled: false, rolledAt: null, message: null });
		expect(spendAttack).not.toHaveBeenCalled();
	});
});

describe("what the Referee records for a player (p8)", () => {
	const ask = (change, user) => CONFIG.queries[`${SYSTEM_ID}.changePack`]({ messageId: "message-1", change }, { user });
	const player = (owns) => ({ id: "player", isGM: false, owns });

	beforeEach(() => {
		tokens["Actor.anne"] = { ...anne, testUserPermission: (user) => user.owns.includes("Actor.anne") };
		tokens["Actor.horde"].testUserPermission = (user) => user.owns.includes("Actor.horde");
	});

	it("brings only a joiner the player owns, named as the Referee sees them", async () => {
		const card = renderCard(packState());
		const join = { type: "join", actor: "Actor.anne", name: "Somebody", dice: [{ faces: 4, label: "Dagger" }] };
		await ask(join, player([]));
		expect(card.state().shares).toHaveLength(1);
		await ask(join, player(["Actor.anne"]));
		expect(card.state().shares.map((share) => share.name)).toEqual(["Horde", "Anne"]);
	});

	it("lets only whoever plays the Knight close the card to roll it", async () => {
		const card = renderCard(packState());
		await ask({ type: "roll", shares: 1 }, player(["Actor.anne"]));
		expect(card.state().rolled).toBe(false);
		await ask({ type: "roll", shares: 1 }, player(["Actor.horde"]));
		expect(card.state().rolled).toBe(true);
	});
});
