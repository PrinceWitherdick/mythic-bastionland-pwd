import { beforeEach, describe, expect, it, vi } from "vitest";

/** What the pick-one window was asked, and what it answers. */
let asked;
let answer;

vi.mock("../../module/apps/ui.js", () => ({
	inputDialog: vi.fn(async (options) => {
		asked = options;
		return answer;
	})
}));

const { chooseOne, waitForChoice } = await import("../../module/apps/actor-pick.js");

beforeEach(() => {
	asked = null;
	answer = null;
});

/**
 * @returns {{element: object, button: {disabled: boolean}, pick: () => void}} A dialog with a pick list and its button.
 */
function fakeDialog() {
	let checked = null;
	const listeners = [];
	const button = { disabled: false };
	const form = {
		querySelector: (selector) => (selector.includes(":checked") ? checked : null),
		addEventListener: (_name, fn) => listeners.push(fn)
	};
	const element = { querySelector: (selector) => (selector === "form" ? form : selector.includes("ok") ? button : null) };
	return {
		element,
		button,
		pick: () => {
			checked = {};
			for (const fn of listeners) fn();
		}
	};
}

describe("chooseOne", () => {
	const items = [{ name: "Sir Ash" }, { name: "Sir Rival", detail: "NPC Knight" }];

	it("checks the first to start with, unless none is to be chosen yet", async () => {
		answer = { choice: "1" };
		expect(await chooseOne(items, { title: "Tournament", message: "Who won?" })).toBe(items[1]);
		expect(asked.context.unchosen).toBe(false);
		expect(asked.render).toBeUndefined();
		await chooseOne(items, { title: "Tournament", message: "Who won?", unchosen: true });
		expect(asked.context.unchosen).toBe(true);
		expect(asked.render).toBeTypeOf("function");
	});

	it("answers none for a window closed, or sent with nothing picked", async () => {
		expect(await chooseOne(items, { title: "T", message: "M" })).toBeNull();
		answer = { choice: null };
		expect(await chooseOne(items, { title: "T", message: "M", unchosen: true })).toBeNull();
	});
});

describe("waitForChoice", () => {
	it("keeps the button greyed out until a choice is picked", () => {
		const dialog = fakeDialog();
		waitForChoice(dialog.element);
		expect(dialog.button.disabled).toBe(true);
		dialog.pick();
		expect(dialog.button.disabled).toBe(false);
	});

	it("does nothing without a button to grey out", () => {
		expect(() => waitForChoice(null)).not.toThrow();
		expect(() => waitForChoice({ querySelector: () => null })).not.toThrow();
	});
});
