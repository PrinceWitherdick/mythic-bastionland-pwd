import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetServerClock, isTimeOfDay, learnServerClock, learntWallNow, serverNow, wallNow } from "../module/server-now.js";

/** The server's reply, dated as an HTTP header dates it: to the whole second. */
const replyDated = (date) => vi.fn(async () => ({ headers: { get: (name) => (name === "date" ? date : null) } }));

afterEach(() => {
	forgetServerClock();
	vi.restoreAllMocks();
	delete globalThis.game;
});

describe("serverNow", () => {
	it("reads the server's own count, which every client shares while they play", () => {
		globalThis.game = { time: { serverTime: 600_000 } };
		expect(serverNow()).toBe(600_000);
	});
});

describe("wallNow", () => {
	it("is this computer's time of day until the server's clock is learnt", () => {
		vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 22, 16));
		globalThis.game = { time: { serverTime: 600_000 } };
		expect(wallNow()).toBe(Date.UTC(2026, 10, 22, 16));
	});

	it("runs by the server's clock once learnt, for a computer whose own runs five minutes slow", async () => {
		const own = Date.UTC(2026, 10, 22, 16, 0, 0, 200);
		vi.spyOn(Date, "now").mockReturnValue(own);
		const skew = await learnServerClock(replyDated("Sun, 22 Nov 2026 16:05:00 GMT"));
		// The server named 16:05:00, so it was somewhere in that second: halfway through it is taken.
		expect(skew).toBe(5 * 60_000 + 300);
		expect(wallNow()).toBe(Date.UTC(2026, 10, 22, 16, 5, 0, 500));
	});

	it("keeps this computer's clock when it agrees with the server's to within the second the server answers in", async () => {
		vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 22, 16, 0, 0, 900));
		expect(await learnServerClock(replyDated("Sun, 22 Nov 2026 16:00:00 GMT"))).toBe(0);
	});

	it("asks again once when the first asking fails", async () => {
		const own = Date.UTC(2026, 10, 22, 16, 0, 0, 200);
		vi.spyOn(Date, "now").mockReturnValue(own);
		const dated = replyDated("Sun, 22 Nov 2026 16:05:00 GMT");
		const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockImplementation(dated);
		expect(await learnServerClock(fetcher)).toBe(5 * 60_000 + 300);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it("gives up on a server that doesn't answer in time, so nothing waiting on it is held up long", async () => {
		vi.useFakeTimers();
		try {
			const learnt = learnServerClock(vi.fn(() => new Promise(() => {})));
			await vi.advanceTimersByTimeAsync(10_000);
			expect(await learnt).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it("keeps this computer's clock when the server can't be asked, or answers with no date", async () => {
		expect(await learnServerClock(vi.fn(async () => { throw new Error("offline"); }))).toBe(0);
		expect(await learnServerClock(replyDated(null))).toBe(0);
	});
});

describe("learntWallNow", () => {
	it("waits for the server's clock to be learnt before it stamps", async () => {
		vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 22, 16, 0, 0, 200));
		let answer;
		learnServerClock(vi.fn(() => new Promise((resolve) => { answer = resolve; })));
		const stamp = learntWallNow();
		answer({ headers: { get: () => "Sun, 22 Nov 2026 16:05:00 GMT" } });
		expect(await stamp).toBe(Date.UTC(2026, 10, 22, 16, 5, 0, 500));
	});

	it("is the time of day straight away when the clock was never asked", async () => {
		vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 22, 16));
		expect(await learntWallNow()).toBe(Date.UTC(2026, 10, 22, 16));
	});
});

describe("isTimeOfDay", () => {
	it("tells a time of day from the server's uptime, as 1.0.2 stamped what it kept", () => {
		expect(isTimeOfDay(Date.UTC(2026, 10, 22))).toBe(true);
		expect(isTimeOfDay(3_600_000)).toBe(false);
		expect(isTimeOfDay(undefined)).toBe(false);
	});
});
