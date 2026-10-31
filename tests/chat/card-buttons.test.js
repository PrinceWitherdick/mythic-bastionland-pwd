import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

const { registerCardButtons, statefulCard } = await import("../../module/chat/cards.js");

/** The hooks registered, by name. */
let hooks;

/**
 * A card's buttons as chat draws them, just enough of the DOM for the wiring.
 * @param {number} count
 * @returns {{html: object, buttons: object[], click: (button: object) => Promise<void>}}
 */
function drawnCard(count) {
	let listener = null;
	const row = { querySelector: () => buttons.find((button) => !button.removed) ?? null, remove: vi.fn() };
	const buttons = Array.from({ length: count }, () => ({
		disabled: false,
		removed: false,
		remove() {
			this.removed = true;
		}
	}));
	for (const button of buttons) button.closest = (selector) => (selector === "[data-test]" ? button : row);
	const html = {
		querySelector: () => buttons.find((button) => !button.removed) ?? null,
		querySelectorAll: () => buttons.filter((button) => !button.removed),
		addEventListener: (_type, fn) => (listener = fn)
	};
	const click = (button) => listener({ target: button, preventDefault: () => {} });
	return { html, buttons, click };
}

/**
 * A chat message whose flags the presser may or may not update.
 * @param {boolean} isOwner
 * @returns {object}
 */
const chatMessage = (isOwner, buttons = 1) => {
	const message = {
		id: "m1",
		isOwner,
		flags: {},
		content: "<button data-test></button>".repeat(buttons),
		setFlag: vi.fn(async (scope, key, value) => {
			message.flags[scope] = { ...message.flags[scope], [key]: value };
		})
	};
	return message;
};

beforeEach(() => {
	hooks = new Map();
	globalThis.Hooks = { on: (name, fn) => hooks.set(name, fn) };
	globalThis.CONFIG = { queries: {} };
	// This browser is the active GM's unless a test says otherwise, and so writes every card itself.
	globalThis.game = { user: { isGM: true }, users: { activeGM: { isSelf: true, query: vi.fn(async () => true) } }, messages: new Map(), i18n: { localize: (key) => key } };
	globalThis.ui = { notifications: { warn: vi.fn() } };
	// Enough of the browser's parser to find a card's buttons by their attribute.
	globalThis.DOMParser = class {
		parseFromString(html) {
			return { querySelectorAll: (selector) => Array.from({ length: html.split(selector.slice(1, -1)).length - 1 }, () => ({ dataset: {} })) };
		}
	};
});

afterEach(() => {
	for (const key of ["DOMParser", "ui"]) delete globalThis[key];
	vi.restoreAllMocks();
});

describe("once-only card buttons", () => {
	it("keep a press that did its work, and leave the button off from then on", async () => {
		const message = chatMessage(true);
		// Marked before its work is done, so nobody else can press it meanwhile.
		const handler = vi.fn(async () => {
			expect(message.flags[SYSTEM_ID].spentButtons).toEqual(["[data-test]#1"]);
			return true;
		});
		registerCardButtons({ selector: "[data-test]", handler, once: true });
		const first = drawnCard(2);
		hooks.get("renderChatMessageHTML")(message, first.html);
		await first.click(first.buttons[1]);
		expect(message.flags[SYSTEM_ID].spentButtons).toEqual(["[data-test]#1"]);
		// Pressed again before the card redraws: nothing more happens.
		await first.click(first.buttons[1]);
		expect(handler).toHaveBeenCalledTimes(1);

		// Drawn again, the spent button is gone and the other stays.
		const again = drawnCard(2);
		hooks.get("renderChatMessageHTML")(message, again.html);
		expect(again.buttons.map((button) => button.removed)).toEqual([false, true]);
	});

	it("take every button of one choice off with the one pressed", async () => {
		const handler = vi.fn(async () => true);
		registerCardButtons({ selector: "[data-test]", handler, once: true });
		const message = chatMessage(true, 3);
		const card = drawnCard(3);
		card.buttons[0].dataset = { onceGroup: "held" };
		card.buttons[1].dataset = { onceGroup: "held" };
		hooks.get("renderChatMessageHTML")(message, card.html);
		await card.click(card.buttons[1]);
		expect(message.flags[SYSTEM_ID].spentButtons).toEqual(["[data-test]#0", "[data-test]#1"]);
		// The other of the choice can't be pressed after it, and the button outside it still can.
		await card.click(card.buttons[0]);
		expect(handler).toHaveBeenCalledTimes(1);
		expect(card.buttons.map((button) => button.disabled)).toEqual([false, false, false]);
	});

	it("leave a press that came to nothing pressable", async () => {
		const handler = vi.fn(async () => false);
		registerCardButtons({ selector: "[data-test]", handler, once: true });
		const message = chatMessage(true);
		const card = drawnCard(1);
		hooks.get("renderChatMessageHTML")(message, card.html);
		await card.click(card.buttons[0]);
		expect(message.flags[SYSTEM_ID].spentButtons).toEqual([]);
		await card.click(card.buttons[0]);
		expect(handler).toHaveBeenCalledTimes(2);
	});

	it("tell the Referee somebody else pressed it first, while that press was being marked", async () => {
		const handler = vi.fn(async () => true);
		registerCardButtons({ selector: "[data-test]", handler, once: true });
		const message = chatMessage(true);
		const write = message.setFlag.getMockImplementation();
		message.setFlag.mockImplementation(async (...args) => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			return write(...args);
		});
		game.messages.set("m1", message);
		const card = drawnCard(1);
		hooks.get("renderChatMessageHTML")(message, card.html);
		const asked = CONFIG.queries[`${SYSTEM_ID}.spendButton`]({ messageId: "m1", keys: ["[data-test]#0"] }, { user: { id: "u1" } });
		await card.click(card.buttons[0]);
		expect(await asked).toBe(true);
		expect(handler).not.toHaveBeenCalled();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.cardButtons.alreadyPressed");
	});

	it("take the mark back when the work throws", async () => {
		registerCardButtons({ selector: "[data-test]", handler: async () => { throw new Error("broke"); }, once: true });
		const message = chatMessage(true);
		const card = drawnCard(1);
		hooks.get("renderChatMessageHTML")(message, card.html);
		await expect(card.click(card.buttons[0])).rejects.toThrow("broke");
		expect(message.flags[SYSTEM_ID].spentButtons).toEqual([]);
	});

	it("make every button of the kind one choice, where the card asks", async () => {
		registerCardButtons({ selector: "[data-test]", handler: async () => true, once: true, oneChoice: true });
		const message = chatMessage(true, 3);
		const card = drawnCard(3);
		hooks.get("renderChatMessageHTML")(message, card.html);
		await card.click(card.buttons[2]);
		expect(message.flags[SYSTEM_ID].spentButtons).toEqual(["[data-test]#0", "[data-test]#1", "[data-test]#2"]);
	});

	it("tell somebody who may not press it, and do nothing", async () => {
		const handler = vi.fn(async () => true);
		game.user = { id: "u2", isGM: false };
		registerCardButtons({ selector: "[data-test]", handler, once: true, mayPress: (_message, user) => user.id === "u1" });
		const card = drawnCard(1);
		hooks.get("renderChatMessageHTML")(chatMessage(true), card.html);
		await card.click(card.buttons[0]);
		expect(handler).not.toHaveBeenCalled();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.cardButtons.notYours");
	});

	it("ask the active GM to mark a press, before its work, on a card the presser can't update", async () => {
		game.users.activeGM.isSelf = false;
		const handler = vi.fn(async () => {
			expect(game.users.activeGM.query).toHaveBeenCalledOnce();
			return true;
		});
		registerCardButtons({ selector: "[data-test]", handler, once: true });
		const message = chatMessage(false);
		const card = drawnCard(1);
		hooks.get("renderChatMessageHTML")(message, card.html);
		await card.click(card.buttons[0]);
		expect(handler).toHaveBeenCalledOnce();
		expect(game.users.activeGM.query).toHaveBeenCalledWith(`${SYSTEM_ID}.spendButton`, { messageId: "m1", keys: ["[data-test]#0"] }, { timeout: 10000 });

		// The GM's side of it.
		const kept = chatMessage(true);
		game.messages.set("m1", kept);
		await CONFIG.queries[`${SYSTEM_ID}.spendButton`]({ messageId: "m1", keys: ["[data-test]#0"] }, { user: { id: "u1" } });
		expect(kept.flags[SYSTEM_ID].spentButtons).toEqual(["[data-test]#0"]);
	});

	it("never spend the Referee's own buttons for somebody who asks", async () => {
		registerCardButtons({ selector: "[data-referee]", gmOnly: true, handler: async () => true, once: true });
		const kept = chatMessage(true);
		game.messages.set("m1", kept);
		expect(await CONFIG.queries[`${SYSTEM_ID}.spendButton`]({ messageId: "m1", keys: ["[data-referee]#0"] }, { user: { id: "u1" } })).toBe(false);
		expect(kept.setFlag).not.toHaveBeenCalled();
	});

	it("never spend a button for somebody who can't see its card", async () => {
		registerCardButtons({ selector: "[data-test]", handler: async () => true, once: true });
		const kept = { ...chatMessage(true), whisper: ["u1"], author: { id: "u1" } };
		game.messages.set("m1", kept);
		const ask = (user) => CONFIG.queries[`${SYSTEM_ID}.spendButton`]({ messageId: "m1", keys: ["[data-test]#0"] }, { user });
		expect(await ask({ id: "u2" })).toBe(false);
		expect(kept.setFlag).not.toHaveBeenCalled();
		expect(await ask({ id: "u1" })).toBe(true);
		expect(kept.setFlag).toHaveBeenCalled();
	});

	it("ask the active GM even on the presser's own card, so one client marks each card", async () => {
		game.users.activeGM.isSelf = false;
		registerCardButtons({ selector: "[data-test]", handler: async () => true, once: true });
		const message = chatMessage(true);
		const card = drawnCard(1);
		hooks.get("renderChatMessageHTML")(message, card.html);
		await card.click(card.buttons[0]);
		expect(game.users.activeGM.query).toHaveBeenCalledOnce();
		expect(message.setFlag).not.toHaveBeenCalled();
	});

	it("mark it themselves on their own card while no GM is here", async () => {
		game.users.activeGM = null;
		registerCardButtons({ selector: "[data-test]", handler: async () => true, once: true });
		const message = chatMessage(true);
		const card = drawnCard(1);
		hooks.get("renderChatMessageHTML")(message, card.html);
		await card.click(card.buttons[0]);
		expect(message.flags[SYSTEM_ID].spentButtons).toEqual(["[data-test]#0"]);
	});

	it("do nothing, and say so, when the GM won't mark the press", async () => {
		game.users.activeGM = { isSelf: false, query: vi.fn(async () => false) };
		const handler = vi.fn(async () => true);
		registerCardButtons({ selector: "[data-test]", handler, once: true });
		const card = drawnCard(1);
		hooks.get("renderChatMessageHTML")(chatMessage(false), card.html);
		await card.click(card.buttons[0]);
		expect(handler).not.toHaveBeenCalled();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.cardButtons.notKept");
	});

	it("ask the GM to take the mark back when the work came to nothing", async () => {
		game.users.activeGM.isSelf = false;
		registerCardButtons({ selector: "[data-test]", handler: async () => false, once: true });
		const card = drawnCard(1);
		hooks.get("renderChatMessageHTML")(chatMessage(false), card.html);
		await card.click(card.buttons[0]);
		expect(game.users.activeGM.query).toHaveBeenLastCalledWith(`${SYSTEM_ID}.spendButton`, { messageId: "m1", keys: ["[data-test]#0"], release: true }, { timeout: 10000 });
	});

	it("ask again to take the mark back, and say so when it can't be", async () => {
		vi.useFakeTimers();
		try {
			game.users.activeGM = { isSelf: false, query: vi.fn(async (_name, data) => !data.release) };
			registerCardButtons({ selector: "[data-test]", handler: async () => false, once: true });
			const card = drawnCard(1);
			hooks.get("renderChatMessageHTML")(chatMessage(false), card.html);
			const pressed = card.click(card.buttons[0]);
			await vi.runAllTimersAsync();
			await pressed;
			expect(game.users.activeGM.query.mock.calls.filter(([, data]) => data.release)).toHaveLength(3);
			expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.cardButtons.stuck");
		} finally {
			vi.useRealTimers();
		}
	});

	it("free the button on the second ask, as when a Referee has just taken over, and say nothing", async () => {
		vi.useFakeTimers();
		try {
			let refused = 1;
			game.users.activeGM = { isSelf: false, query: vi.fn(async (_name, data) => !data.release || refused-- <= 0) };
			registerCardButtons({ selector: "[data-test]", handler: async () => false, once: true });
			const card = drawnCard(1);
			hooks.get("renderChatMessageHTML")(chatMessage(false), card.html);
			const pressed = card.click(card.buttons[0]);
			await vi.runAllTimersAsync();
			await pressed;
			expect(game.users.activeGM.query.mock.calls.filter(([, data]) => data.release)).toHaveLength(2);
			expect(ui.notifications.warn).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it("do nothing on somebody else's card while no GM is here to keep the press", async () => {
		const handler = vi.fn(async () => true);
		registerCardButtons({ selector: "[data-test]", handler, once: true });
		game.users.activeGM = null;
		game.i18n = { localize: (key) => key };
		globalThis.ui = { notifications: { warn: vi.fn() } };
		const card = drawnCard(1);
		hooks.get("renderChatMessageHTML")(chatMessage(false), card.html);
		await card.click(card.buttons[0]);
		expect(handler).not.toHaveBeenCalled();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.cardButtons.needsGM");
	});
});

describe("a once-only press another user asks to keep", () => {
	const ask = (key, user = { id: "u1" }) => CONFIG.queries[`${SYSTEM_ID}.spendButton`]({ messageId: "m1", keys: [key] }, user ? { user } : {});

	it("is refused when nobody says who asked", async () => {
		registerCardButtons({ selector: "[data-test]", handler: async () => true, once: true });
		const kept = chatMessage(true);
		game.messages.set("m1", kept);
		expect(await ask("[data-test]#0", null)).toBe(false);
		expect(kept.setFlag).not.toHaveBeenCalled();
	});

	it("is refused to somebody who couldn't have done its work", async () => {
		const mayPress = vi.fn((message, user) => user.id === "rider");
		registerCardButtons({ selector: "[data-test]", handler: async () => true, once: true, mayPress });
		const kept = chatMessage(true);
		game.messages.set("m1", kept);
		expect(await ask("[data-test]#0", { id: "someoneElse" })).toBe(false);
		expect(kept.setFlag).not.toHaveBeenCalled();
		expect(await ask("[data-test]#0", { id: "rider" })).toBe(true);
		expect(mayPress).toHaveBeenLastCalledWith(kept, { id: "rider" }, expect.objectContaining({ dataset: {} }));
	});

	it("keeps only keys for buttons the card holds", async () => {
		registerCardButtons({ selector: "[data-test]", handler: async () => true, once: true });
		const kept = chatMessage(true, 2);
		game.messages.set("m1", kept);
		for (const key of ["[data-test]#2", "[data-test]#-1", "[data-test]#1.5", "[data-test]#", "[data-test]", "[data-test]#junk", "[data-other]#0"]) {
			expect(await ask(key)).toBe(false);
		}
		expect(kept.setFlag).not.toHaveBeenCalled();
		expect(await ask("[data-test]#1")).toBe(true);
		expect(kept.flags[SYSTEM_ID].spentButtons).toEqual(["[data-test]#1"]);
	});

	it("leaves the button working, and does nothing, when the GM never answers", async () => {
		const failed = vi.spyOn(console, "warn").mockImplementation(() => {});
		game.users.activeGM = { isSelf: false, query: vi.fn(async () => {
			throw new Error("timed out");
		}) };
		const handler = vi.fn(async () => true);
		registerCardButtons({ selector: "[data-test]", handler, once: true });
		const card = drawnCard(1);
		hooks.get("renderChatMessageHTML")(chatMessage(false), card.html);
		await card.click(card.buttons[0]);
		expect(failed).toHaveBeenCalled();
		expect(handler).not.toHaveBeenCalled();
		expect(card.buttons[0].disabled).toBe(false);
	});

	it("is refused once the button is pressed already", async () => {
		registerCardButtons({ selector: "[data-test]", handler: async () => true, once: true });
		const kept = chatMessage(true);
		game.messages.set("m1", kept);
		expect(await ask("[data-test]#0")).toBe(true);
		expect(await ask("[data-test]#0", { id: "u2" })).toBe(false);
		expect(kept.setFlag).toHaveBeenCalledOnce();
	});

	it("keeps only the first of two pressing at once", async () => {
		registerCardButtons({ selector: "[data-test]", handler: async () => true, once: true });
		const kept = chatMessage(true);
		const write = kept.setFlag.getMockImplementation();
		// Each write lands a moment later, as a message's flag does.
		kept.setFlag.mockImplementation(async (...args) => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			return write(...args);
		});
		game.messages.set("m1", kept);
		const answers = await Promise.all([ask("[data-test]#0", { id: "u1" }), ask("[data-test]#0", { id: "u2" })]);
		expect(answers.sort()).toEqual([false, true]);
		expect(kept.flags[SYSTEM_ID].spentButtons).toEqual(["[data-test]#0"]);
	});

	it("keeps a choice whole, or not at all", async () => {
		registerCardButtons({ selector: "[data-test]", handler: async () => true, once: true });
		const kept = chatMessage(true, 2);
		game.messages.set("m1", kept);
		const spend = (keys, data = {}) => CONFIG.queries[`${SYSTEM_ID}.spendButton`]({ messageId: "m1", keys, ...data }, { user: { id: "u1" } });
		expect(await spend(["[data-test]#0", "[data-test]#1"])).toBe(true);
		expect(await spend(["[data-test]#1"])).toBe(false);
		// Its work came to nothing, so the mark is taken back.
		expect(await spend(["[data-test]#0", "[data-test]#1"], { release: true })).toBe(true);
		expect(kept.flags[SYSTEM_ID].spentButtons).toEqual([]);
	});

	it("spends the Referee's own buttons for another GM who asks", async () => {
		registerCardButtons({ selector: "[data-referee]", gmOnly: true, handler: async () => true, once: true });
		const kept = { ...chatMessage(true), content: "<button data-referee></button>" };
		game.messages.set("m1", kept);
		expect(await ask("[data-referee]#0", { id: "gm2", isGM: true })).toBe(true);
	});
});

describe("the Referee's own card buttons", () => {
	/** A card drawn on this client, by a GM or a player. */
	const drawnBy = (authorIsGM, options = {}) => {
		const handler = vi.fn(async () => true);
		registerCardButtons({ selector: "[data-test]", gmOnly: true, handler, ...options });
		const card = drawnCard(1);
		hooks.get("renderChatMessageHTML")({ ...chatMessage(true), author: { isGM: authorIsGM } }, card.html);
		return { card, handler };
	};

	it("work on a card a GM posted", async () => {
		const { card, handler } = drawnBy(true);
		expect(card.buttons[0].removed).toBe(false);
		await card.click(card.buttons[0]);
		expect(handler).toHaveBeenCalled();
	});

	it("are taken off a card a player posted, which they could have written themselves", () => {
		expect(drawnBy(false).card.buttons[0].removed).toBe(true);
	});

	it("stay on a player's card where they're meant to, as Ask the Referee's", () => {
		expect(drawnBy(false, { fromPlayers: true }).card.buttons[0].removed).toBe(false);
	});

	it("are taken off for a player, whoever posted the card", () => {
		game.user.isGM = false;
		expect(drawnBy(true).card.buttons[0].removed).toBe(true);
	});

	/** A once-only Referee's button on a GM's card, with the message it's drawn on. */
	const onceDrawn = (handler) => {
		registerCardButtons({ selector: "[data-test]", gmOnly: true, handler, once: true });
		const message = { ...chatMessage(true), author: { isGM: true } };
		const card = drawnCard(1);
		hooks.get("renderChatMessageHTML")(message, card.html);
		return { card, message };
	};

	it("write nothing on a once-only press that came to nothing", async () => {
		const handler = vi.fn(async () => false);
		const { card, message } = onceDrawn(handler);
		await card.click(card.buttons[0]);
		expect(handler).toHaveBeenCalledTimes(1);
		expect(message.setFlag).not.toHaveBeenCalled();
	});

	it("mark a once-only press spent once its work is done, and not let it be pressed again meanwhile", async () => {
		let finish;
		const handler = vi.fn(() => new Promise((resolve) => (finish = resolve)));
		const { card, message } = onceDrawn(handler);
		const first = card.click(card.buttons[0]);
		// Drawn again while the work goes on, the button is there but can't be pressed twice.
		const again = drawnCard(1);
		hooks.get("renderChatMessageHTML")(message, again.html);
		await again.click(again.buttons[0]);
		expect(handler).toHaveBeenCalledTimes(1);
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.cardButtons.alreadyPressed");
		expect(message.setFlag).not.toHaveBeenCalled();
		finish(true);
		await first;
		expect(message.flags[SYSTEM_ID].spentButtons).toEqual(["[data-test]#0"]);
	});
});

describe("a stateful card's change asked of the GM", () => {
	const card = () => statefulCard({ flag: "test", query: `${SYSTEM_ID}.changeTest`, notices: "test", change: (state) => state, render: async () => "" });

	it("waits only so long, and says the change was refused when the query fails", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		game.users.activeGM.isSelf = false;
		game.users.activeGM.query = vi.fn(async () => {
			throw new Error("timed out");
		});
		expect(await card().save({ id: "m1", isOwner: false }, { type: "x" })).toBe(false);
		expect(game.users.activeGM.query).toHaveBeenCalledWith(`${SYSTEM_ID}.changeTest`, { messageId: "m1", change: { type: "x" } }, { timeout: 10000 });
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.test.changeRefused");
	});
});

describe("a stateful card's changes made at once", () => {
	/** A card whose state is a list each change adds to, as joiners and Gambits are. */
	const listCard = () => statefulCard({
		flag: "test",
		query: `${SYSTEM_ID}.changeTest`,
		notices: "test",
		change: (state, delta) => ({ list: [...(state?.list ?? []), delta.add] }),
		render: async () => {
			// Drawing the card takes a moment, during which the other change arrives.
			await new Promise((resolve) => setTimeout(resolve, 5));
			return "";
		}
	});

	/** A card message whose update lands on its flags. */
	const stateMessage = (isOwner = true) => {
		const message = { id: "m-state", isOwner, flags: { [SYSTEM_ID]: { test: { list: [] } } } };
		message.update = vi.fn(async (changes) => {
			message.flags[SYSTEM_ID].test = changes[`flags.${SYSTEM_ID}.test`];
		});
		return message;
	};

	it("keeps both, each written from the state the other left", async () => {
		const card = listCard();
		const message = stateMessage();
		game.messages.set(message.id, message);
		await Promise.all([card.commit(message, { add: "a" }), card.commit(message, { add: "b" })]);
		expect(message.flags[SYSTEM_ID].test.list).toEqual(["a", "b"]);
	});

	it("are sent to the active GM, even by the card's author, so one client writes the card", async () => {
		game.users.activeGM.isSelf = false;
		const message = stateMessage(true);
		expect(await listCard().save(message, { add: "a" })).toBe(true);
		expect(game.users.activeGM.query).toHaveBeenCalledWith(`${SYSTEM_ID}.changeTest`, { messageId: "m-state", change: { add: "a" } }, { timeout: 10000 });
		expect(message.update).not.toHaveBeenCalled();
	});

	it("are written by the active GM's own client, and by the author's while no GM is here", async () => {
		const message = stateMessage(true);
		game.messages.set(message.id, message);
		expect(await listCard().save(message, { add: "a" })).toBe(true);
		game.users.activeGM = null;
		expect(await listCard().save(message, { add: "b" })).toBe(true);
		expect(message.flags[SYSTEM_ID].test.list).toEqual(["a", "b"]);
	});
});
