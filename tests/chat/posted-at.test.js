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

	it("falls back to the message's own timestamp for one posted before messages were stamped", () => {
		expect(postedAt({ timestamp: 5000, flags: {} })).toBe(5000);
		expect(postedAt(null)).toBeUndefined();
	});

	it("stamps a message about to be made with the server's time, not this computer's", () => {
		globalThis.game = { time: { serverTime: 1234 } };
		const message = { updateSource: vi.fn() };
		stampPostedAt(message);
		expect(message.updateSource).toHaveBeenCalledWith({ flags: { [SYSTEM_ID]: { [POSTED_AT_FLAG]: 1234 } } });
	});
});
