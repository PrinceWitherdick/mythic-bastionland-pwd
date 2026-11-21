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
		settings: { set: vi.fn(async () => {}) }
	};
});

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
});
