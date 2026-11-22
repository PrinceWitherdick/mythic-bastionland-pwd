import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { writeOutsideShifts } = await import("../../module/actions/realm-expand.js");

let toolkit;
let page;

beforeEach(() => {
	toolkit = {
		id: "toolkit",
		system: { threads: { kept: { kind: "favour", name: "A favour", hex: "4,5" } } },
		update: vi.fn(async () => {})
	};
	page = {
		id: "page",
		system: { entries: { row1: { key: "visit:vale:4,5" } } },
		update: vi.fn(async () => {})
	};
	const book = { id: "book", pages: { get: (id) => (id === page.id ? page : undefined) } };
	globalThis.game = {
		actors: { get: (id) => (id === toolkit.id ? toolkit : undefined) },
		journal: { get: (id) => (id === book.id ? book : undefined) },
		settings: { get: vi.fn(() => omenEntered), set: vi.fn(async () => {}) }
	};
});

let omenEntered = null;
const entered = (scene, col, row) => ({ when: { day: 3, phase: "night" }, scene, hex: { col, row }, omen: true });

afterEach(() => {
	delete globalThis.game;
});

describe("writeOutsideShifts", () => {
	it("moves only the threads and Timeline rows still kept, bringing back none settled or deleted since", async () => {
		await writeOutsideShifts({
			journal: [],
			threads: { actor: "toolkit", threads: { kept: "7,6", settled: "8,8" } },
			timeline: [{ journal: "book", page: "page", keys: { row1: "visit:vale:7,6", gone: "visit:vale:8,8" } }],
			omen: null
		});
		expect(toolkit.update).toHaveBeenCalledWith({ "system.threads.kept.hex": "7,6" });
		expect(page.update).toHaveBeenCalledWith({ "system.entries.row1.key": "visit:vale:7,6" });
	});

	it("writes nothing where everything it would move is gone", async () => {
		await writeOutsideShifts({
			journal: [],
			threads: { actor: "toolkit", threads: { settled: "8,8" } },
			timeline: [{ journal: "book", page: "page", keys: { gone: "visit:vale:8,8" } }],
			omen: null
		});
		expect(toolkit.update).not.toHaveBeenCalled();
		expect(page.update).not.toHaveBeenCalled();
	});

	const omenOnly = (from, value) => ({ journal: [], threads: null, timeline: [], omen: { from, value } });

	it("moves the waiting Omen while the setting still holds the entry the plan moved", async () => {
		omenEntered = entered("vale", 4, 5);
		await writeOutsideShifts(omenOnly(entered("vale", 4, 5), entered("vale", 6, 5)));
		expect(game.settings.set).toHaveBeenCalledWith(expect.any(String), "omenEntered", entered("vale", 6, 5));
	});

	it("leaves an Omen entered since, on another Realm, or one already moved, as it is", async () => {
		omenEntered = entered("moor", 2, 2);
		await writeOutsideShifts(omenOnly(entered("vale", 4, 5), entered("vale", 6, 5)));
		omenEntered = entered("vale", 6, 5);
		await writeOutsideShifts(omenOnly(entered("vale", 4, 5), entered("vale", 6, 5)));
		omenEntered = null;
		await writeOutsideShifts(omenOnly(entered("vale", 4, 5), null));
		expect(game.settings.set).not.toHaveBeenCalled();
	});
});
