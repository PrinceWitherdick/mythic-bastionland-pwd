import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The calendar's turning: CALENDAR_HOOK's listeners told as Hooks.callAll
 * tells them, then every writer, inside the scope a time advance hands
 * calendar.js, which waits on what each writer writes (actions/time-capture.js).
 */

vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));

/** @type {typeof import("../../module/actions/calendar.js")} Fresh for each test, so no writer is left from the last. */
let calendar;
/** @type {Function} The calendar setting's onChange. */
let onChange;

beforeEach(async () => {
	vi.resetModules();
	calendar = await import("../../module/actions/calendar.js");
	globalThis.Hooks = { callAll: vi.fn() };
	globalThis.game = { settings: { register: (_namespace, _key, config) => (onChange = config.onChange) } };
	calendar.registerCalendarSetting();
});

afterEach(() => {
	calendar.setTurningScope(null);
	for (const key of ["Hooks", "game"]) delete globalThis[key];
});

describe("the calendar's turning", () => {
	it("runs every writer inside the scope, named for who turned it, and waits on what each writes", async () => {
		const order = [];
		calendar.setTurningScope(async (userId, work) => {
			order.push(`open ${userId}`);
			await work();
			order.push("closed");
		});
		let write;
		calendar.onCalendarWrites(() => new Promise((resolve) => (write = () => {
			order.push("written");
			resolve();
		})));
		calendar.onCalendarWrites((after) => order.push(`told ${after.phase}`));
		const turning = onChange({ phase: "night" }, {}, "other");
		expect(order).toEqual(["open other", "told night"]);
		write();
		await turning;
		expect(order).toEqual(["open other", "told night", "written", "closed"]);
	});

	it("tells the hook's listeners as Hooks.callAll does, with what came round", async () => {
		await onChange({ phase: "night" }, {}, "gm");
		expect(Hooks.callAll).toHaveBeenCalledWith(calendar.CALENDAR_HOOK, expect.objectContaining({ phase: "night" }), expect.anything(), expect.any(Array));
	});

	it("tells every writer though one fails", async () => {
		const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
		const after = vi.fn();
		calendar.onCalendarWrites(() => {
			throw new Error("broken");
		});
		calendar.onCalendarWrites(async () => {
			throw new Error("rejected");
		});
		calendar.onCalendarWrites(after);
		await onChange({ phase: "night" }, {}, "gm");
		await onChange({ phase: "morning" }, {}, "gm");
		expect(after).toHaveBeenCalledTimes(2);
		expect(quiet).toHaveBeenCalledTimes(4);
		quiet.mockRestore();
	});
});
