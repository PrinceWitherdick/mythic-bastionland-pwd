import { afterEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

const { POSTED_AT_FLAG, postedAt, stampPostedAt } = await import("../../module/chat/posted-at.js");

afterEach(() => {
	delete globalThis.game;
});

describe("postedAt", () => {
	it("reads the server's time a message was stamped with, before the poster's own clock", () => {
		expect(postedAt({ timestamp: 5000, flags: { [SYSTEM_ID]: { [POSTED_AT_FLAG]: 4000 } } })).toBe(4000);
	});

	it("gives no time for one posted before messages were stamped, which every expansion came after", () => {
		expect(postedAt({ timestamp: 5000, flags: {} })).toBeUndefined();
		expect(postedAt(null)).toBeUndefined();
	});

	it("stamps a message about to be made with the time of day, not the server's uptime, which a restart sets back", () => {
		const now = Date.UTC(2026, 10, 22, 16);
		globalThis.game = { time: { serverTime: 1234 } };
		vi.spyOn(Date, "now").mockReturnValue(now);
		const message = { updateSource: vi.fn() };
		stampPostedAt(message);
		expect(message.updateSource).toHaveBeenCalledWith({ flags: { [SYSTEM_ID]: { [POSTED_AT_FLAG]: now } } });
		vi.restoreAllMocks();
	});
});
