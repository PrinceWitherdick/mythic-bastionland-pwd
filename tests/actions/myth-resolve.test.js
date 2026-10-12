import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/actions/myth-notes.js", () => ({ editMythNote: vi.fn(async () => {}) }));
vi.mock("../../module/actions/season-log.js", () => ({ recordMythCompleted: vi.fn(async () => {}), forgetMythCompleted: vi.fn(async () => {}) }));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineMythCompleted: vi.fn(async () => {}), timelineMythUndone: vi.fn(async () => {}) }));

const { resolveMyth, unresolveMyth } = await import("../../module/actions/myth-resolve.js");
const { editMythNote } = await import("../../module/actions/myth-notes.js");
const { forgetMythCompleted, recordMythCompleted } = await import("../../module/actions/season-log.js");
const { timelineMythCompleted, timelineMythUndone } = await import("../../module/actions/timeline-events.js");

const scene = { id: "s1", name: "The Vale" };
const myth = { number: 3, d6: 2, d12: 7 };
const calls = (fn) => vi.mocked(fn).mock.calls;

beforeEach(() => vi.clearAllMocks());

describe("a Myth resolved", () => {
	it("is marked, kept in the Season's record, and written on the Timeline with the Knights given Glory", async () => {
		const knight = { id: "k1" };
		await resolveMyth(scene, myth, { name: "The Hollow Bell", note: "Ended at dusk.", award: async () => [knight] });
		expect(calls(editMythNote)).toEqual([[scene, myth, { note: "Ended at dusk.", resolved: true }]]);
		expect(calls(recordMythCompleted)).toEqual([[{ id: "s1.3.2-7", name: "The Hollow Bell" }]]);
		expect(calls(timelineMythCompleted)).toEqual([[{ scene, completedId: "s1.3.2-7", name: "The Hollow Bell", knights: [knight] }]]);
	});

	it("leaves its note alone when none is given, and goes on the Timeline though nobody took Glory", async () => {
		await resolveMyth(scene, myth, { name: "The Hollow Bell", award: async () => null });
		expect(calls(editMythNote)[0][2]).toEqual({ resolved: true });
		expect(calls(timelineMythCompleted)[0][0].knights).toEqual([]);
	});
});

describe("a Myth unresolved", () => {
	it("comes out of the Season's record and off the Timeline", async () => {
		await unresolveMyth(scene, myth);
		expect(calls(editMythNote)).toEqual([[scene, myth, { resolved: false }]]);
		expect(calls(forgetMythCompleted)).toEqual([["s1.3.2-7"]]);
		expect(calls(timelineMythUndone)).toEqual([["s1.3.2-7"]]);
	});
});
