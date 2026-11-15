import { beforeEach, describe, expect, it, vi } from "vitest";

/** What the pick-one window was asked, and what it answers. */
let asked;
let answer;

vi.mock("../../module/apps/ui.js", () => ({
	inputDialog: vi.fn(async (options) => {
		asked = options;
		return answer;
	}),
	wireSearchBox: vi.fn()
}));

const { chooseOne, waitForChoice, wirePickSearch } = await import("../../module/apps/actor-pick.js");

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

	it("gives each row its words to search by, name and detail, only when asked for a search", async () => {
		await chooseOne(items, { title: "T", message: "M" });
		expect(asked.context.search).toBeNull();
		expect(asked.context.choices[1]).not.toHaveProperty("search");
		const search = { label: "Search the Knights…", none: "No Knight matches." };
		await chooseOne(items, { title: "T", message: "M", search });
		expect(asked.context.search).toBe(search);
		expect(asked.context.choices.map((choice) => choice.search)).toEqual(["sir ash", "sir rival npc knight"]);
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

describe("wirePickSearch", () => {
	/**
	 * @param {boolean} hidden Whether the chosen row is hidden by the search.
	 * @returns {{element: object, chosen: object, type: () => void}} A pick list with a search box and a chosen row.
	 */
	function searchDialog(hidden) {
		const inputs = [];
		const box = { addEventListener: (name, fn) => name === "input" && inputs.push(fn), focus: vi.fn() };
		const chosen = { checked: true, closest: () => (hidden ? {} : null), dispatchEvent: vi.fn() };
		const element = {
			querySelector: (selector) => {
				if (selector.includes("__search")) return box;
				if (selector.includes(":checked")) return chosen.checked ? chosen : null;
				return {};
			}
		};
		return { element, chosen, type: () => inputs.forEach((fn) => fn()) };
	}

	it("unpicks a choice the search hides, so the button can't send one out of sight", () => {
		const dialog = searchDialog(true);
		wirePickSearch(dialog.element);
		dialog.type();
		expect(dialog.chosen.checked).toBe(false);
		expect(dialog.chosen.dispatchEvent).toHaveBeenCalledOnce();
	});

	it("keeps a choice the search still shows", () => {
		const dialog = searchDialog(false);
		wirePickSearch(dialog.element);
		dialog.type();
		expect(dialog.chosen.checked).toBe(true);
		expect(dialog.chosen.dispatchEvent).not.toHaveBeenCalled();
	});
});
