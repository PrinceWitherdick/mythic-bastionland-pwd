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

	it("closes a yes-or-no question unanswered once its time is up, saying so with null", async () => {
		vi.useFakeTimers();
		try {
			const dialog = { close: vi.fn() };
			foundry.applications.api.DialogV2.confirm.mockImplementationOnce(({ render }) => {
				render(null, dialog);
				return new Promise((resolve) => (dialog.close = vi.fn(() => resolve(null))));
			});
			const asked = confirmDialog({ title: "T", icon: "i", message: "m", closeBy: Date.now() + 1000 });
			await vi.advanceTimersByTimeAsync(999);
			expect(dialog.close).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			expect(await asked).toBeNull();
			expect(dialog.close).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	/** A yes-or-no question that waits to be closed or refused. */
	const waitingQuestion = () => {
		const dialog = { close: vi.fn() };
		foundry.applications.api.DialogV2.confirm.mockImplementationOnce(({ render }) => {
			render(null, dialog);
			return new Promise((resolve) => {
				dialog.close = vi.fn(() => resolve(null));
				dialog.refuse = () => resolve(false);
			});
		});
		return dialog;
	};

	it("reckons its time by the server's clock, which the client that set it shares", async () => {
		vi.useFakeTimers();
		// This client's clock runs 30 seconds behind the server's.
		const start = Date.now();
		const server = start + 30000;
		globalThis.game = { time: { get serverTime() { return server + (Date.now() - start); } } };
		try {
			const dialog = waitingQuestion();
			const asked = confirmDialog({ title: "T", icon: "i", message: "m", closeBy: server + 1000 });
			await vi.advanceTimersByTimeAsync(1000);
			expect(dialog.close).toHaveBeenCalledTimes(1);
			expect(await asked).toBeNull();
		} finally {
			delete globalThis.game;
			vi.useRealTimers();
		}
	});

	it("gives a no in time as false, not as unanswered", async () => {
		vi.useFakeTimers();
		try {
			const dialog = waitingQuestion();
			const asked = confirmDialog({ title: "T", icon: "i", message: "m", closeBy: Date.now() + 1000 });
			await vi.advanceTimersByTimeAsync(999);
			dialog.refuse();
			expect(await asked).toBe(false);
			await vi.advanceTimersByTimeAsync(10);
			expect(dialog.close).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it("leaves dialogs as they are with no gate set", async () => {
		expect(await confirmDialog({ title: "T", icon: "i", message: "m" })).toBe(true);
		expect(order).toEqual(["asked"]);
	});
});
