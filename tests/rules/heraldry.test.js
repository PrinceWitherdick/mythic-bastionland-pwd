import { describe, expect, it } from "vitest";
import {
	BRUSH,
	DIVISIONS,
	IMAGE_SCALE,
	PAINTING_HEIGHT,
	PAINTING_WIDTH,
	PAINT_MARGIN,
	RECENT_COLORS_LIMIT,
	SHIELD_BORDER,
	SHIELD_CLIPS,
	SHIELD_HEIGHT,
	SHIELD_OUTLINE_PATH,
	SHIELD_PATH,
	SHIELD_WIDTH,
	TINCTURES,
	centredPlacement,
	containFit,
	coverFit,
	divisionGroupAt,
	fillScale,
	floodFill,
	hexToRgba,
	isBlank,
	keepOnPainting,
	placementBox,
	placementLimits,
	boundingBoxPath,
	readRecentColors,
	rememberColor,
	rgbaToHex,
	snapLine,
	zoomPlacement
} from "../../module/rules/heraldry.js";

const CLEAR = [0, 0, 0, 0];
const SABLE = [29, 26, 23, 255];
const GULES = [176, 38, 30, 255];

/** A row of pixels, one colour each. */
const row = (...colors) => Uint8ClampedArray.from(colors.flat());

/** The colour of each pixel in a row. */
const colorsOf = (pixels) => Array.from({ length: pixels.length / 4 }, (_, index) => [...pixels.slice(index * 4, index * 4 + 4)]);

describe("floodFill", () => {
	it("fills the area around a pixel and stops at a line of another colour", () => {
		// 3 × 2, with a sable line down the middle column.
		const pixels = row(CLEAR, SABLE, CLEAR, CLEAR, SABLE, CLEAR);
		expect(floodFill(pixels, 3, 2, 0, 1, GULES)).toBe(true);
		expect(colorsOf(pixels)).toEqual([GULES, SABLE, CLEAR, GULES, SABLE, CLEAR]);
	});

	it("paints over a brush stroke's soft edge without spreading past it", () => {
		const soft = [29, 26, 23, 100];
		const pixels = row(CLEAR, CLEAR, soft, CLEAR);
		floodFill(pixels, 4, 1, 0.5, 0.5, GULES);
		expect(colorsOf(pixels)).toEqual([GULES, GULES, GULES, CLEAR]);
	});

	it("stays inside the shield", () => {
		const pixels = row(CLEAR, CLEAR, CLEAR);
		floodFill(pixels, 3, 1, 1, 0, GULES, { inside: Uint8Array.from([0, 1, 1]) });
		expect(colorsOf(pixels)).toEqual([CLEAR, GULES, GULES]);
	});

	it("does nothing outside the picture or the shield, or on the colour already there", () => {
		const pixels = row(GULES, CLEAR);
		expect(floodFill(pixels, 2, 1, 0, 0, GULES)).toBe(false);
		expect(floodFill(pixels, 2, 1, 5, 0, SABLE)).toBe(false);
		expect(floodFill(pixels, 2, 1, 1, 0, SABLE, { inside: Uint8Array.from([1, 0]) })).toBe(false);
		expect(colorsOf(pixels)).toEqual([GULES, CLEAR]);
	});
});

describe("isBlank", () => {
	it("is blank until any pixel has been painted", () => {
		expect(isBlank(row(CLEAR, CLEAR))).toBe(true);
		expect(isBlank(row(CLEAR, [0, 0, 0, 1]))).toBe(false);
	});
});

describe("coverFit", () => {
	it("covers the box in the picture's own shape, cropping evenly", () => {
		expect(coverFit({ width: 200, height: 100 }, { width: 100, height: 100 })).toEqual({ x: -50, y: 0, width: 200, height: 100 });
		expect(coverFit({ width: 0, height: 0 }, { width: 10, height: 20 })).toEqual({ x: 0, y: 0, width: 10, height: 20 });
	});
});

describe("placing a picture", () => {
	const painting = { width: 100, height: 200 };
	const wide = { width: 400, height: 100 };

	it("fits all of a picture inside the painting, in the middle", () => {
		expect(containFit(wide, painting)).toEqual({ x: 0, y: 87.5, width: 100, height: 25 });
		expect(containFit({ width: 0, height: 5 }, painting)).toEqual({ x: 0, y: 0, width: 100, height: 200 });
		const placement = centredPlacement(painting);
		expect(placement).toEqual({ x: 50, y: 100, scale: IMAGE_SCALE.initial });
		expect(placementBox(wide, painting, placement)).toEqual(containFit(wide, painting));
	});

	it("draws the picture about its middle at its scale", () => {
		expect(placementBox(wide, painting, { x: 20, y: 30, scale: 2 })).toEqual({ x: -80, y: 5, width: 200, height: 50 });
	});

	it("grows a picture enough to cover the painting, and lets a long thin one grow that far", () => {
		expect(fillScale(wide, painting)).toBeCloseTo(8);
		expect(placementBox(wide, painting, centredPlacement(painting, fillScale(wide, painting))).height).toBeCloseTo(200);
		expect(placementLimits(wide, painting)).toEqual({ min: IMAGE_SCALE.min, max: 8 });
		expect(placementLimits({ width: 1, height: 2 }, painting).max).toBe(IMAGE_SCALE.max);
	});

	it("resizes about a point, keeping that point of the picture where it is", () => {
		const limits = { min: 0.5, max: 3 };
		expect(zoomPlacement({ x: 50, y: 50, scale: 1 }, 2, limits, { x: 40, y: 60 })).toEqual({ x: 60, y: 40, scale: 2 });
		expect(zoomPlacement({ x: 50, y: 50, scale: 1 }, 2, limits)).toEqual({ x: 50, y: 50, scale: 2 });
		expect(zoomPlacement({ x: 50, y: 50, scale: 1 }, 10, limits).scale).toBe(3);
		expect(zoomPlacement({ x: 50, y: 50, scale: 1 }, 0, limits).scale).toBe(0.5);
	});

	it("keeps the picture's middle on the painting", () => {
		expect(keepOnPainting({ x: -5, y: 250, scale: 2 }, painting)).toEqual({ x: 0, y: 200, scale: 2 });
		expect(keepOnPainting({ x: 30, y: 40, scale: 1 }, painting)).toEqual({ x: 30, y: 40, scale: 1 });
	});
});

describe("recent colours", () => {
	it("reads a colour off the painting, however opaque it is", () => {
		expect(rgbaToHex([176, 38, 30, 128])).toBe("#b0261e");
		expect(rgbaToHex(Uint8ClampedArray.from([0, 0, 0, 0, 1, 2, 3, 255]), 4)).toBe("#010203");
	});

	it("puts the newest first, once each, up to the limit", () => {
		expect(rememberColor(["#111111", "#222222"], "#222222")).toEqual(["#222222", "#111111"]);
		expect(rememberColor([], "#ABCDEF")).toEqual(["#abcdef"]);

		const full = Array.from({ length: RECENT_COLORS_LIMIT }, (_, index) => `#0000${index.toString(16).padStart(2, "0")}`);
		const next = rememberColor(full, "#ffffff");
		expect(next).toHaveLength(RECENT_COLORS_LIMIT);
		expect(next[0]).toBe("#ffffff");
		expect(next).not.toContain(full.at(-1));
	});

	it("leaves the list alone for a tincture, the colour already first, or something that isn't a colour", () => {
		const recent = ["#123456"];
		expect(rememberColor(recent, TINCTURES[0].color)).toBe(recent);
		expect(rememberColor(recent, "#123456")).toBe(recent);
		expect(rememberColor(recent, "red")).toBe(recent);
	});

	it("reads back only real colours from what was saved", () => {
		expect(readRecentColors(undefined)).toEqual([]);
		expect(readRecentColors(["#ABCDEF", "#abcdef", 7, "blue"])).toEqual(["#abcdef"]);
	});
});

describe("the shield's outline", () => {
	it("gives the painting an even margin round the shield", () => {
		expect(PAINTING_WIDTH).toBe(SHIELD_WIDTH + PAINT_MARGIN * 2);
		expect(PAINTING_HEIGHT).toBe(SHIELD_HEIGHT + PAINT_MARGIN * 2);
	});

	it("scales a path to run from 0 to 1 across its box", () => {
		expect(boundingBoxPath("M0 7 Q68 -5 136 7 V68 H34 Z", 136, 162))
			.toBe("M 0 0.04321 Q 0.5 -0.03086 1 0.04321 V 0.41975 H 0.25 Z");
	});

	it("draws the border's outline round the field, as large as the border on every side", () => {
		expect(SHIELD_CLIPS["bastionland-shield-field"]).toEqual({ path: SHIELD_PATH, width: SHIELD_WIDTH, height: SHIELD_HEIGHT });
		const outline = SHIELD_CLIPS["bastionland-shield-outline"];
		expect(outline.path).toBe(SHIELD_OUTLINE_PATH);
		expect(outline.width).toBe(SHIELD_WIDTH + SHIELD_BORDER * 2);
		expect(outline.height).toBe(SHIELD_HEIGHT + SHIELD_BORDER * 2);
		expect(SHIELD_OUTLINE_PATH).toMatch(new RegExp(`^M0 \\d+ Q${outline.width / 2} -?\\d+ ${outline.width} `));
	});
});

describe("snapLine", () => {
	it("keeps a line level, upright or diagonal, ending beside the pointer", () => {
		const level = snapLine({ x: 0, y: 0 }, { x: 10, y: 1 });
		expect(level.x).toBeCloseTo(10);
		expect(level.y).toBeCloseTo(0);

		const upright = snapLine({ x: 5, y: 5 }, { x: 4, y: -20 });
		expect(upright.x).toBeCloseTo(5);
		expect(upright.y).toBeCloseTo(-20);

		const diagonal = snapLine({ x: 0, y: 0 }, { x: 5, y: 4 });
		expect(diagonal.x).toBeCloseTo(4.5);
		expect(diagonal.y).toBeCloseTo(4.5);
	});

	it("leaves a line of no length where it started", () => {
		expect(snapLine({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual({ x: 3, y: 3 });
	});
});

describe("tinctures and brush", () => {
	it("turns each tincture into an opaque colour", () => {
		expect(hexToRgba("#b0261e")).toEqual(GULES);
		for (const { color } of TINCTURES) expect(color).toMatch(/^#[0-9a-f]{6}$/);
		expect(new Set(TINCTURES.map(({ key }) => key)).size).toBe(TINCTURES.length);
	});

	it("starts the brush within its range", () => {
		expect(BRUSH.initial).toBeGreaterThanOrEqual(BRUSH.min);
		expect(BRUSH.initial).toBeLessThanOrEqual(BRUSH.max);
	});

});

describe("divisions", () => {
	const division = (key) => DIVISIONS.find((each) => each.key === key);

	/** The share of the painting each group covers, measured on a grid. */
	const coverage = ({ parts }) => {
		const shares = {};
		const steps = 40;
		for (let across = 0; across < steps; across++) {
			for (let down = 0; down < steps; down++) {
				const group = divisionGroupAt({ parts }, (across + 0.5) / steps, (down + 0.5) / steps);
				shares[group] = (shares[group] ?? 0) + 1 / steps ** 2;
			}
		}
		return shares;
	};

	it("covers the whole painting with every division's parts, and nothing twice", () => {
		expect(new Set(DIVISIONS.map(({ key }) => key)).size).toBe(DIVISIONS.length);
		for (const each of DIVISIONS) {
			const shares = coverage(each);
			expect(shares.null, each.key).toBeUndefined();
			expect(Object.values(shares).reduce((sum, share) => sum + share, 0)).toBeCloseTo(1);
		}
	});

	it("finds the part under a point, and its tincture's group", () => {
		expect(divisionGroupAt(division("perPale"), 0.2, 0.5)).toBe(1);
		expect(divisionGroupAt(division("perPale"), 0.8, 0.5)).toBe(0);
		expect(divisionGroupAt(division("perBend"), 0.2, 0.8)).toBe(1);
		expect(divisionGroupAt(division("perBendSinister"), 0.1, 0.5)).toBe(0);
		expect(divisionGroupAt(division("tiercedInPale"), 0.5, 0.5)).toBe(2);
		expect(divisionGroupAt(division("quarterly"), 0.9, 0.9)).toBe(divisionGroupAt(division("quarterly"), 0.1, 0.1));
		expect(divisionGroupAt(division("perPale"), 1.5, 0.5)).toBeNull();
	});

	it("gives a point on a line between parts to one of them", () => {
		expect(divisionGroupAt(division("perPale"), 0.5, 0.5)).not.toBeNull();
		expect(divisionGroupAt(division("gyronny"), 0.5, 0.45)).not.toBeNull();
		expect(divisionGroupAt(division("barry"), 0, 0)).not.toBeNull();
	});
});
