import { beforeEach, describe, expect, it, vi } from "vitest";

let entries = [];
let fails = false;
vi.mock("../../module/actions/timeline-store.js", () => ({
	trackFor: (target) => (target === "company" ? { trackId: "company", kind: "company" } : target?.id ? { trackId: target.id, kind: "knight", secret: Boolean(target.secret) } : null),
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

const { forgetEverywhere, keptFromPlayers, recordOnTrack, recordOnTracks, timelineNow } = await import("../../module/actions/timeline-record.js");
const { mutateTrack, removeKeyEverywhere } = await import("../../module/actions/timeline-store.js");

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

	it("forgets on every thread, or on just the threads it's given, each once", async () => {
		vi.mocked(removeKeyEverywhere).mockClear();
		await forgetEverywhere("k");
		await forgetEverywhere("k", ["company", { id: "d1" }, null, "company"]);
		expect(vi.mocked(removeKeyEverywhere).mock.calls).toEqual([
			["k", undefined],
			["k", [{ trackId: "company", kind: "company" }, { trackId: "d1", kind: "knight", secret: false }]]
		]);
	});

	it("keeps a row about someone kept from the players off every thread they read, and never stores who it's about", async () => {
		const rival = { id: "d2", secret: true };
		const seen = { id: "d1" };
		expect(keptFromPlayers(rival)).toBe(true);
		expect(keptFromPlayers(null)).toBe(false);
		await expect(recordOnTrack("company", { source: "founded", key: "a", about: [rival] })).resolves.toBeNull();
		await recordOnTrack("company", [{ source: "founded", key: "b", about: [seen, null] }, { source: "founded", key: "c", about: [rival] }]);
		expect(entries.map((entry) => entry.key)).toEqual(["b"]);
		expect(entries[0]).not.toHaveProperty("about");
		// A thread kept for the Referee may tell of anyone.
		await recordOnTrack({ id: "k9", secret: true }, { source: "rules", key: "d", about: [rival] });
		expect(entries.map((entry) => entry.key)).toEqual(["b", "d"]);
	});

	it("writes a row about someone hidden on the hidden threads of several, and none of the rest", async () => {
		await recordOnTracks(["company", { id: "k1" }, { id: "k9", secret: true }], { source: "circle", key: "e", about: [{ id: "d2", secret: true }] });
		expect(vi.mocked(mutateTrack).mock.calls.map(([track]) => track.trackId)).toEqual(["k9"]);
	});

	it("writes on each thread once, however often it's named", async () => {
		await recordOnTracks(["company", { id: "k1" }, "company", null], { source: "visit", key: "visit:x" });
		expect(vi.mocked(mutateTrack).mock.calls.map(([track]) => track.trackId)).toEqual(["company", "k1"]);
	});
});
