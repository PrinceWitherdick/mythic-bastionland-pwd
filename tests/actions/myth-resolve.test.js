import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/actions/myth-notes.js", () => ({ editMythNote: vi.fn(async () => {}), getMythNotes: vi.fn(() => ({ version: 1, myths: {} })) }));
vi.mock("../../module/actions/season-log.js", () => ({ recordMythCompleted: vi.fn(async () => {}), forgetMythCompleted: vi.fn(async () => {}) }));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineMythCompleted: vi.fn(async () => {}), timelineMythUndone: vi.fn(async () => {}) }));
vi.mock("../../module/actions/glory.js", () => ({ takeBackGlory: vi.fn(async () => []) }));
vi.mock("../../module/actions/gm-toolkit.js", () => ({ rollFreeMyth: vi.fn() }));
vi.mock("../../module/actions/realm.js", () => ({ editRealm: vi.fn(async () => true), getRealm: vi.fn(), isRealmScene: vi.fn(() => true) }));
vi.mock("../../module/actions/solo.js", () => ({ keptFromMe: () => false }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => null, mythLookup: () => ({ name: "The Wyvern", page: 33, entry: null }), pageNote: () => null }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => {}), registerCardButtons: vi.fn(), t: (key) => key, warn: vi.fn() }));
vi.mock("../../module/actions/hex-names.js", () => ({ hexLabel: () => "0304" }));

const { registerReplaceMyth, resolveMyth, unresolveMyth } = await import("../../module/actions/myth-resolve.js");
const { editMythNote, getMythNotes } = await import("../../module/actions/myth-notes.js");
const { forgetMythCompleted, recordMythCompleted } = await import("../../module/actions/season-log.js");
const { timelineMythCompleted, timelineMythUndone } = await import("../../module/actions/timeline-events.js");
const { takeBackGlory } = await import("../../module/actions/glory.js");
const { rollFreeMyth } = await import("../../module/actions/gm-toolkit.js");
const { editRealm, getRealm } = await import("../../module/actions/realm.js");
const { registerCardButtons, warn } = await import("../../module/chat/cards.js");
const { emptyMythNotes, withMythNote } = await import("../../module/rules/myth-notes.js");
const { emptyRealm } = await import("../../module/rules/realm.js");
const { realmGeometry } = await import("../../module/rules/realm-geometry.js");

const scene = { id: "s1", name: "The Vale" };
const myth = { number: 3, d6: 2, d12: 7, hex: { col: 3, row: 4 } };
const calls = (fn) => vi.mocked(fn).mock.calls;

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(getMythNotes).mockReturnValue(emptyMythNotes());
	globalThis.game = { user: { isGM: true }, actors: new Map(), scenes: new Map([["s1", scene]]) };
});

describe("a Myth resolved", () => {
	it("is marked, kept in the Season's record, and written on the Timeline with the Knights given Glory", async () => {
		const knight = { id: "k1" };
		await resolveMyth(scene, myth, { name: "The Hollow Bell", note: "Ended at dusk.", award: async () => [knight] });
		expect(calls(editMythNote)).toEqual([[scene, myth, { note: "Ended at dusk.", resolved: true, glory: ["k1"] }]]);
		expect(calls(recordMythCompleted)).toEqual([[{ id: "s1.3.2-7", name: "The Hollow Bell" }]]);
		expect(calls(timelineMythCompleted)).toEqual([[{ scene, completedId: "s1.3.2-7", name: "The Hollow Bell", knights: [knight] }]]);
	});

	it("leaves its note alone when none is given, and goes on the Timeline though nobody took Glory", async () => {
		await resolveMyth(scene, myth, { name: "The Hollow Bell", award: async () => null });
		expect(calls(editMythNote)[0][2]).toEqual({ resolved: true, glory: [] });
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

	it("offers to take back the Glory it gave, from those still in the world", async () => {
		const knight = { id: "k1" };
		game.actors.set("k1", knight);
		vi.mocked(getMythNotes).mockReturnValue(withMythNote(emptyMythNotes(), myth, { resolved: true, glory: ["k1", "gone"] }));
		await unresolveMyth(scene, myth);
		expect(calls(takeBackGlory)).toEqual([["myth", [knight]]]);
	});

	it("asks nothing when nobody was given Glory for it", async () => {
		vi.mocked(getMythNotes).mockReturnValue(withMythNote(emptyMythNotes(), myth, { resolved: true }));
		await unresolveMyth(scene, myth);
		expect(takeBackGlory).not.toHaveBeenCalled();
	});
});

describe("the Season card's Replace button", () => {
	const handler = () => {
		registerReplaceMyth();
		return calls(registerCardButtons)[0][0].handler;
	};
	const button = { dataset: { replaceMyth: "3", replaceMythScene: "s1" } };

	it("rolls a new Myth in the resolved one's hex, under its number, with no Omens met", async () => {
		vi.mocked(getRealm).mockReturnValue({ realm: { myths: [{ ...myth, omen: 4 }] } });
		vi.mocked(getMythNotes).mockReturnValue(withMythNote(emptyMythNotes(), myth, { resolved: true }));
		vi.mocked(rollFreeMyth).mockResolvedValue({ d6: 5, d12: 9, rolls: [] });
		const placed = vi.fn((realm) => realm);
		vi.mocked(editRealm).mockImplementation(async (_scene, edit) => {
			const g = realmGeometry({ cols: 12, rows: 12 });
			placed(edit({ ...emptyRealm(g), myths: [{ ...myth, id: "t3", omen: 4, revealed: false }] }, g));
			return true;
		});
		expect(await handler()(button)).toBe(true);
		const after = placed.mock.calls[0][0];
		expect(after.myths).toEqual([expect.objectContaining({ number: 3, d6: 5, d12: 9, omen: 0, hex: myth.hex })]);
	});

	it("rolls nothing for a Myth no longer resolved, or already replaced", async () => {
		vi.mocked(getRealm).mockReturnValue({ realm: { myths: [{ ...myth, d6: 6, d12: 1 }] } });
		vi.mocked(getMythNotes).mockReturnValue(withMythNote(emptyMythNotes(), myth, { resolved: true }));
		expect(await handler()(button)).toBe(false);
		expect(warn).toHaveBeenCalledWith("time.due.mythGone");
		expect(rollFreeMyth).not.toHaveBeenCalled();
	});
});
