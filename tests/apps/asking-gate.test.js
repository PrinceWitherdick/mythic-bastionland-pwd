import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every dialog the system opens waits on the gate a time advance sets before
 * it asks, and tells it once answered, so what the Referee does meanwhile is
 * left out of the advance (actions/time-capture.js).
 */

vi.mock("../../module/rules/text.js", () => ({ searchable: (text) => text }));

const { confirmDialog, inputDialog, promptDialog, setAskingGate, waitDialog } = await import("../../module/apps/ui.js");

let order;

beforeEach(() => {
	order = [];
	const answer = (value) => async () => {
		order.push("asked");
		return value;
	};
	globalThis.foundry = {
		applications: {
			api: { DialogV2: { confirm: vi.fn(answer(true)), wait: vi.fn(answer("go")), prompt: vi.fn(answer("ok")), input: vi.fn(answer({ a: 1 })) } },
			handlebars: { renderTemplate: vi.fn(async () => "<p></p>") }
		}
	};
});

afterEach(() => {
	setAskingGate(null);
	delete globalThis.foundry;
});

describe("the gate before a dialog asks", () => {
	it("is waited on before each dialog opens, and told once it's answered", async () => {
		setAskingGate(async () => {
			order.push("gate");
			return async () => order.push("answered");
		});
		expect(await confirmDialog({ title: "T", icon: "i", message: "m" })).toBe(true);
		expect(await waitDialog({ buttons: [] })).toBe("go");
		expect(await promptDialog({ title: "T", icon: "i", content: "c", ok: {} })).toBe("ok");
		expect(await inputDialog({ title: "T", icon: "i", template: "x", context: {}, ok: {} })).toEqual({ a: 1 });
		expect(order).toEqual(Array(4).fill(["gate", "asked", "answered"]).flat());
	});

	it("is told even when the dialog fails", async () => {
		const answered = vi.fn();
		setAskingGate(async () => answered);
		foundry.applications.api.DialogV2.wait.mockRejectedValueOnce(new Error("closed"));
		await expect(waitDialog({ buttons: [] })).rejects.toThrow("closed");
		expect(answered).toHaveBeenCalled();
	});

	it("leaves dialogs as they are with no gate set", async () => {
		expect(await confirmDialog({ title: "T", icon: "i", message: "m" })).toBe(true);
		expect(order).toEqual(["asked"]);
	});
});
