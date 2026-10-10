import { beforeEach, describe, expect, it, vi } from "vitest";

let entries = [];
let fails = false;
vi.mock("../../module/actions/timeline-store.js", () => ({
	trackFor: (target) => (target === "company" ? { trackId: "company", kind: "company" } : target?.id ? { trackId: target.id, kind: "knight" } : null),
	removeKeyEverywhere: vi.fn(async () => {
		if (fails) throw new Error("no");
	}),
	mutateTrack: vi.fn(async (track, change) => {
		if (fails) throw new Error("no");
		const result = change(entries);
		entries = result.entries;
		return { page: {} };
	})
}));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({ age: 2, year: 1, season: "harvest", day: 1, phase: "morning" }) }));

const { forgetEverywhere, recordOnTrack, recordOnTracks, timelineNow } = await import("../../module/actions/timeline-record.js");
const { mutateTrack } = await import("../../module/actions/timeline-store.js");

beforeEach(() => {
	entries = [];
	fails = false;
	vi.mocked(mutateTrack).mockClear();
	globalThis.game = { user: { id: "u1" } };
	globalThis.foundry = { utils: { randomID: () => `r${entries.length}` } };
});

describe("recordOnTrack", () => {
	it("dates a milestone now, stamps who wrote it, and writes it only once", async () => {
		expect(timelineNow()).toBe("2-harvest");
		await recordOnTrack("company", { source: "myth", key: "myth:x", title: "Done" });
		await recordOnTrack("company", { source: "myth", key: "myth:x", title: "Again" });
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ season: "2-harvest", authorId: "u1", title: "Done" });
	});

	it("takes the Season it's given, and refreshes only what it's told to", async () => {
		await recordOnTrack("company", { source: "note", key: "note:x", body: "One" }, { when: "1-spring" });
		await recordOnTrack("company", { source: "note", key: "note:x", body: "Two", refresh: ["body"] });
		expect(entries).toMatchObject([{ season: "1-spring", body: "Two" }]);
	});

	it("never throws: whatever happened still happens", async () => {
		fails = true;
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		await expect(recordOnTrack("company", { source: "myth", key: "k" })).resolves.toBeNull();
		await expect(forgetEverywhere("k")).resolves.toBeUndefined();
		warn.mockRestore();
	});

	it("writes on each thread once, however often it's named", async () => {
		await recordOnTracks(["company", { id: "k1" }, "company", null], { source: "visit", key: "visit:x" });
		expect(vi.mocked(mutateTrack).mock.calls.map(([track]) => track.trackId)).toEqual(["company", "k1"]);
	});
});
