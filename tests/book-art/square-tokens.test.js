import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const files = vi.hoisted(() => ({ ensureDirectories: vi.fn(async () => {}), uploadFile: vi.fn(async () => "cut.webp") }));
vi.mock("../../module/book-art/files.js", () => files);
vi.mock("../../module/book-art/art-index.js", () => ({
	artIndexWritten: vi.fn(async () => {}),
	loadArtIndex: vi.fn(async () => ({ knights: [{ path: "portrait.webp", d6: 1, d12: 1, name: "Knight" }] }))
}));
vi.mock("../../module/book-art/pdf.js", () => ({
	canvasToBlob: vi.fn(async () => new Blob(["x"])),
	imageFormat: vi.fn(async () => ({ type: "image/webp", extension: "webp" }))
}));
vi.mock("../../module/actions/knights.js", () => ({ worldKnights: () => [] }));

const { squareKnightTokens } = await import("../../module/book-art/square-tokens.js");

let mayUpload;

beforeEach(() => {
	mayUpload = true;
	files.uploadFile.mockClear();
	globalThis.game = {
		user: { isGM: true, can: (permission) => permission === "FILES_UPLOAD" && mayUpload },
		users: { activeGM: { isSelf: true } },
		scenes: []
	};
	globalThis.Image = class {
		naturalWidth = 400;
		naturalHeight = 600;
		decode = async () => {};
	};
	globalThis.foundry = { utils: { getRoute: (path) => path } };
	globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage() {} }) }) };
});

afterEach(() => {
	for (const key of ["game", "Image", "foundry", "document"]) delete globalThis[key];
});

describe("squareKnightTokens", () => {
	it("cuts the missing tokens when the active GM may upload", async () => {
		await squareKnightTokens();
		expect(files.uploadFile).toHaveBeenCalled();
	});

	it("uploads nothing for an Assistant who may not, so a load raises no errors", async () => {
		mayUpload = false;
		await squareKnightTokens();
		expect(files.uploadFile).not.toHaveBeenCalled();
	});
});
