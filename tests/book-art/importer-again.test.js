import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Import PDF run by the system itself after an update (`again`), and the stamp
 * that says the world is up to date with this version's reading.
 */

vi.mock("../../module/apps/ui.js", () => ({ confirmDialog: vi.fn(async () => false), promptDialog: vi.fn(async () => null) }));
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
vi.mock("../../module/rulebook/store.js", () => ({ setImportedVersion: vi.fn(async () => {}) }));
vi.mock("../../module/world-setup.js", () => ({ markSetupDone: vi.fn(async () => {}) }));
vi.mock("../../module/book-art/art-index.js", () => ({ artIndexWritten: vi.fn(async () => {}), loadArtIndex: vi.fn(async () => null) }));
vi.mock("../../module/book-art/book-text.js", () => ({ BOOK_TEXT_TOTAL: 0, readBookText: vi.fn(async () => ({ texts: {}, missing: [] })) }));
const browse = vi.fn(async () => ({ files: [] }));
vi.mock("../../module/book-art/files.js", () => ({
	ensureDirectories: vi.fn(async () => {}),
	filePicker: () => ({ browse }),
	uploadFile: vi.fn(async () => "art/index.json")
}));
vi.mock("../../module/book-art/goods-folders.js", () => ({
	GOODS_PACKS: { items: { name: "goods", type: "Item", kinds: [], label: "Arms & Goods" } },
	copyGoodsToWorld: vi.fn(async () => ({}))
}));
vi.mock("../../module/book-art/npc-pack.js", () => ({ NPC_PACK: { label: "NPCs" }, NPC_PACK_STEP: "npcPack", fillNpcPack: vi.fn(async () => ({})) }));
vi.mock("../../module/book-art/packs.js", () => ({ fillPack: vi.fn(async () => {}) }));
vi.mock("../../module/book-art/report.js", () => ({ showImportReport: vi.fn(async () => {}) }));
vi.mock("../../module/book-art/square-tokens.js", () => ({ useSquareTokens: vi.fn(async () => ({})) }));
vi.mock("../../module/book-art/pdf.js", () => ({
	// A PDF that isn't the book's length, whose pages can't be read.
	openPdf: vi.fn(async () => ({ pdf: { numPages: 3, destroy: async () => {} }, OPS: {} })),
	withPage: vi.fn(async () => {
		throw new Error("no page");
	}),
	listPageImages: vi.fn(async () => []),
	saveImages: vi.fn(async () => []),
	imageFormat: vi.fn(async () => ({ extension: "webp" }))
}));

const { importBookArt } = await import("../../module/book-art/importer.js");
const { confirmDialog } = await import("../../module/apps/ui.js");
const { setImportedVersion } = await import("../../module/rulebook/store.js");
const { fillPack } = await import("../../module/book-art/packs.js");
const { fillNpcPack } = await import("../../module/book-art/npc-pack.js");
const { loadArtIndex } = await import("../../module/book-art/art-index.js");
const { uploadFile } = await import("../../module/book-art/files.js");
const { listPageImages, saveImages, withPage } = await import("../../module/book-art/pdf.js");
const { INDEX_FILE, KIND_FOLDERS, spreads } = await import("../../module/rules/book-art.js");

const pdf = () => new File(["%PDF"], "rulebook.pdf", { type: "application/pdf" });

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	globalThis.game = { ready: true, user: { isGM: true, can: () => true }, system: { version: "1" } };
	globalThis.ui = { notifications: { info: vi.fn(() => ({ update: vi.fn() })), warn: vi.fn(), error: vi.fn() } };
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
	delete globalThis.game;
	delete globalThis.ui;
});

describe("reading the book again after an update", () => {
	it("doesn't ask again about a book that doesn't match, which the Referee already took", async () => {
		expect(await importBookArt(pdf(), { again: true })).not.toBeNull();
		expect(confirmDialog).not.toHaveBeenCalled();
	});

	it("still asks when the Referee imports a book themselves", async () => {
		expect(await importBookArt(pdf())).toBeNull();
		expect(confirmDialog).toHaveBeenCalled();
	});
});

describe("the stamp that the world is up to date", () => {
	it("is set once the compendiums are filled", async () => {
		await importBookArt(pdf(), { again: true });
		expect(setImportedVersion).toHaveBeenCalled();
	});

	it("isn't set when Arms & Goods couldn't be filled, so it's read again next load", async () => {
		vi.mocked(fillPack).mockRejectedValueOnce(new Error("locked"));
		await importBookArt(pdf(), { again: true });
		expect(setImportedVersion).not.toHaveBeenCalled();
	});

	it("isn't set when the NPCs couldn't be filled", async () => {
		vi.mocked(fillNpcPack).mockRejectedValueOnce(new Error("locked"));
		await importBookArt(pdf(), { again: true });
		expect(setImportedVersion).not.toHaveBeenCalled();
	});
});

describe("the pictures, read again after an update", () => {
	const knightPages = new Set(spreads().map((spread) => spread.knightPage));
	// Each spread saves a Knight with their token, a Seer and a Myth, in three goes.
	const saves = spreads().length * 3;
	let written;

	/** A book whose every page reads, with a Knight and a Seer on each Knight page and a Myth on each Myth page. */
	beforeEach(() => {
		written = null;
		vi.mocked(loadArtIndex).mockResolvedValue(null);
		vi.mocked(confirmDialog).mockResolvedValue(false);
		browse.mockResolvedValue({ files: [] });
		vi.mocked(withPage).mockImplementation(async (_pdf, number, read) => read({ number, getTextContent: async () => ({ items: [] }) }));
		vi.mocked(listPageImages).mockImplementation(async (page) => (knightPages.has(page.number)
			? [{ key: `k${page.number}`, width: 450, height: 1000 }, { key: `s${page.number}`, width: 450, height: 180 }]
			: [{ key: `m${page.number}`, width: 900, height: 500 }]));
		vi.mocked(saveImages).mockImplementation(async (_page, _image, targets) => targets.map(({ dir, fileName }) => ({ path: `${dir}/${fileName}` })));
		vi.mocked(uploadFile).mockImplementation(async (dir, file) => {
			if (file.name === INDEX_FILE) written = JSON.parse(await file.text());
			return `${dir}/${file.name}`;
		});
	});

	/** The index a first import writes, and every file it saved, as the server lists them. */
	const firstImport = async () => {
		await importBookArt(pdf(), { again: true });
		const index = written;
		const files = saveImages.mock.results.length ? (await Promise.all(saveImages.mock.results.map((result) => result.value))).flat().map(({ path }) => path) : [];
		vi.mocked(saveImages).mockClear();
		vi.mocked(loadArtIndex).mockClear();
		return { index, files };
	};
	const withoutDate = ({ importedAt: _importedAt, ...index }) => index;

	it("keeps every picture an earlier import saved, and writes the same index", async () => {
		const { index, files } = await firstImport();
		expect(files.length).toBe(spreads().length * 4);
		vi.mocked(loadArtIndex).mockResolvedValue(index);
		browse.mockResolvedValue({ files });
		await importBookArt(pdf(), { again: true });
		expect(saveImages).not.toHaveBeenCalled();
		expect(withoutDate(written)).toEqual(withoutDate(index));
	});

	it("saves again only a picture gone from the server", async () => {
		const { index, files } = await firstImport();
		const [knight] = index[KIND_FOLDERS.knight];
		vi.mocked(loadArtIndex).mockResolvedValue(index);
		browse.mockResolvedValue({ files: files.filter((path) => path !== knight.token) });
		await importBookArt(pdf(), { again: true });
		expect(saveImages).toHaveBeenCalledOnce();
		expect(saveImages.mock.calls[0][2].map(({ dir, fileName }) => `${dir}/${fileName}`)).toEqual([knight.path, knight.token]);
		expect(withoutDate(written)).toEqual(withoutDate(index));
	});

	it("saves every picture again from an index older than the square tokens, or when the folders can't be listed", async () => {
		const { index, files } = await firstImport();
		vi.mocked(loadArtIndex).mockResolvedValue({ ...index, version: 5 });
		browse.mockResolvedValue({ files });
		await importBookArt(pdf(), { again: true });
		expect(saveImages).toHaveBeenCalledTimes(saves);

		vi.mocked(saveImages).mockClear();
		vi.mocked(loadArtIndex).mockResolvedValue(index);
		browse.mockRejectedValue(new Error("no browsing"));
		vi.spyOn(console, "warn").mockImplementation(() => {});
		await importBookArt(pdf(), { again: true });
		expect(saveImages).toHaveBeenCalledTimes(saves);
	});

	it("saves every picture when the Referee imports the book themselves", async () => {
		const { index, files } = await firstImport();
		vi.mocked(loadArtIndex).mockResolvedValue(index);
		browse.mockResolvedValue({ files });
		vi.mocked(confirmDialog).mockResolvedValue(true);
		await importBookArt(pdf());
		expect(loadArtIndex).not.toHaveBeenCalled();
		expect(saveImages).toHaveBeenCalledTimes(saves);
	});
});
