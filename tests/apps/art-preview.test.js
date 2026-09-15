import { describe, expect, it } from "vitest";
import { fitArt, placeArt } from "../../module/apps/art-preview.js";

const viewport = { width: 1920, height: 1080 };

describe("fitArt", () => {
	it("fits a Knight's tall art to the height", () => {
		expect(fitArt({ width: 465, height: 1094 }, viewport)).toEqual({ width: 272, height: 640 });
	});

	it("fits a Seer's wide art to the width", () => {
		expect(fitArt({ width: 1000, height: 400 }, viewport)).toEqual({ width: 560, height: 224 });
	});

	it("shrinks to fit a short window", () => {
		expect(fitArt({ width: 465, height: 1094 }, { width: 1920, height: 600 })).toEqual({ width: 204, height: 480 });
	});

	it("enlarges small art no more than double", () => {
		expect(fitArt({ width: 100, height: 100 }, viewport)).toEqual({ width: 200, height: 200 });
	});

	it("waits for art whose size is unknown", () => {
		expect(fitArt({ width: 0, height: 0 }, viewport)).toBeNull();
	});
});

describe("placeArt", () => {
	const popup = { width: 272, height: 300 };

	it("sits right of the art, level with its middle", () => {
		expect(placeArt({ top: 400, bottom: 560, left: 300, right: 400 }, popup, viewport)).toEqual({ top: 330, left: 412 });
	});

	it("moves left of the art when the right has no room", () => {
		expect(placeArt({ top: 400, bottom: 560, left: 1700, right: 1800 }, popup, viewport)).toEqual({ top: 330, left: 1416 });
	});

	it("stays inside the window", () => {
		expect(placeArt({ top: 0, bottom: 100, left: 300, right: 400 }, popup, viewport)).toEqual({ top: 12, left: 412 });
		expect(placeArt({ top: 980, bottom: 1080, left: 300, right: 400 }, popup, viewport)).toEqual({ top: 768, left: 412 });
	});
});
