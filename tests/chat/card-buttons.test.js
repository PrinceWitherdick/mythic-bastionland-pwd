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
	globalThis.game = { user: { isGM: true }, users: { activeGM: { query: vi.fn(async () => true) } }, messages: new Map(), i18n: { localize: (key) => key } };
	globalThis.ui = { notifications: { warn: vi.fn() } };
	// Enough of the browser's parser to count a card's buttons by their attribute.
	globalThis.DOMParser = class {
		parseFromString(html) {
			return { querySelectorAll: (selector) => ({ length: html.split(selector.slice(1, -1)).length - 1 }) };
		}
	};
});

afterEach(() => {
	for (const key of ["DOMParser", "ui"]) delete globalThis[key];
	vi.restoreAllMocks();
});

describe("once-only card buttons", () => {
	it("keep a press that did its work, and leave the button off from then on", async () => {
		const handler = vi.fn(async () => true);
		registerCardButtons({ selector: "[data-test]", handler, once: true });
		const message = chatMessage(true);
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

	it("leave a press that came to nothing pressable", async () => {
		registerCardButtons({ selector: "[data-test]", handler: async () => false, once: true });
		const message = chatMessage(true);
		const card = drawnCard(1);
		hooks.get("renderChatMessageHTML")(message, card.html);
		await card.click(card.buttons[0]);
		expect(message.setFlag).not.toHaveBeenCalled();
	});

	it("ask the active GM to keep a press on a card the presser can't update", async () => {
		registerCardButtons({ selector: "[data-test]", handler: async () => true, once: true });
		const message = chatMessage(false);
		const card = drawnCard(1);
		hooks.get("renderChatMessageHTML")(message, card.html);
		await card.click(card.buttons[0]);
		expect(game.users.activeGM.query).toHaveBeenCalledWith(`${SYSTEM_ID}.spendButton`, { messageId: "m1", key: "[data-test]#0" }, { timeout: 10000 });

		// The GM's side of it.
		const kept = chatMessage(true);
		game.messages.set("m1", kept);
		await CONFIG.queries[`${SYSTEM_ID}.spendButton`]({ messageId: "m1", key: "[data-test]#0" }, { user: { id: "u1" } });
		expect(kept.flags[SYSTEM_ID].spentButtons).toEqual(["[data-test]#0"]);
	});

	it("never spend the Referee's own buttons for somebody who asks", async () => {
		registerCardButtons({ selector: "[data-referee]", gmOnly: true, handler: async () => true, once: true });
		const kept = chatMessage(true);
		game.messages.set("m1", kept);
		expect(await CONFIG.queries[`${SYSTEM_ID}.spendButton`]({ messageId: "m1", key: "[data-referee]#0" }, { user: { id: "u1" } })).toBe(false);
		expect(kept.setFlag).not.toHaveBeenCalled();
	});

	it("never spend a button for somebody who can't see its card", async () => {
		registerCardButtons({ selector: "[data-test]", handler: async () => true, once: true });
		const kept = { ...chatMessage(true), whisper: ["u1"], author: { id: "u1" } };
		game.messages.set("m1", kept);
		const ask = (user) => CONFIG.queries[`${SYSTEM_ID}.spendButton`]({ messageId: "m1", key: "[data-test]#0" }, { user });
		expect(await ask({ id: "u2" })).toBe(false);
		expect(kept.setFlag).not.toHaveBeenCalled();
		expect(await ask({ id: "u1" })).toBe(true);
		expect(kept.setFlag).toHaveBeenCalled();
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
	const ask = (key, user = { id: "u1" }) => CONFIG.queries[`${SYSTEM_ID}.spendButton`]({ messageId: "m1", key }, user ? { user } : {});

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
		expect(mayPress).toHaveBeenLastCalledWith(kept, { id: "rider" });
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

	it("leaves the button working when the GM never answers", async () => {
		const failed = vi.spyOn(console, "warn").mockImplementation(() => {});
		game.users.activeGM.query = vi.fn(async () => {
			throw new Error("timed out");
		});
		registerCardButtons({ selector: "[data-test]", handler: async () => true, once: true });
		const card = drawnCard(1);
		hooks.get("renderChatMessageHTML")(chatMessage(false), card.html);
		await card.click(card.buttons[0]);
		expect(failed).toHaveBeenCalled();
		expect(card.buttons[0].disabled).toBe(false);
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
});

describe("a stateful card's change asked of the GM", () => {
	const card = () => statefulCard({ flag: "test", query: `${SYSTEM_ID}.changeTest`, notices: "test", change: (state) => state, render: async () => "" });

	it("waits only so long, and says the change was refused when the query fails", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		game.users.activeGM.query = vi.fn(async () => {
			throw new Error("timed out");
		});
		expect(await card().save({ id: "m1", isOwner: false }, { type: "x" })).toBe(false);
		expect(game.users.activeGM.query).toHaveBeenCalledWith(`${SYSTEM_ID}.changeTest`, { messageId: "m1", change: { type: "x" } }, { timeout: 10000 });
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.test.changeRefused");
	});
});
