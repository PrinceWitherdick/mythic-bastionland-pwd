import { beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

const { registerCardButtons } = await import("../../module/chat/cards.js");

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
const chatMessage = (isOwner) => {
	const message = {
		id: "m1",
		isOwner,
		flags: {},
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
	globalThis.game = { user: { isGM: true }, users: { activeGM: { query: vi.fn(async () => true) } }, messages: new Map() };
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
		expect(game.users.activeGM.query).toHaveBeenCalledWith(`${SYSTEM_ID}.spendButton`, { messageId: "m1", key: "[data-test]#0" });

		// The GM's side of it.
		const kept = chatMessage(true);
		game.messages.set("m1", kept);
		await CONFIG.queries[`${SYSTEM_ID}.spendButton`]({ messageId: "m1", key: "[data-test]#0" });
		expect(kept.flags[SYSTEM_ID].spentButtons).toEqual(["[data-test]#0"]);
	});

	it("never spend the Referee's own buttons for somebody who asks", async () => {
		registerCardButtons({ selector: "[data-referee]", gmOnly: true, handler: async () => true, once: true });
		const kept = chatMessage(true);
		game.messages.set("m1", kept);
		expect(await CONFIG.queries[`${SYSTEM_ID}.spendButton`]({ messageId: "m1", key: "[data-referee]#0" })).toBe(false);
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
