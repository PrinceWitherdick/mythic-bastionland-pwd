import { readFileSync } from "node:fs";
import { join } from "node:path";
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
	SHIELD_FIELD_IN_OUTLINE_PATH,
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
	floodReach,
	hexToRgba,
	insertLayer,
	moveLayer,
	readLayers,
	isBlank,
	keepOnPainting,
	placementBox,
	placementLimits,
	boundingBoxPath,
	readRecentColors,
	rememberColor,
	rgbaToHex,
	snapLine,
	zoomPlacement,
	randomArms,
	readsWell,
	touchingGroups,
	METALS,
	armsWithCharge,
	chargeColors,
	colorsReadWell,
	counterchange,
	editableArms,
	heraldryStamp,
	readArms,
	rechargeArms,
	redivideArms,
	refieldArms,
	retinctureArms,
	tinctureColor,
	tinctureOf
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

describe("floodReach", () => {
	it("finds what a fill would paint without painting it", () => {
		const pixels = row(CLEAR, CLEAR, SABLE, CLEAR);
		const before = pixels.slice();
		expect([...floodReach(pixels, 4, 1, 0, 0, GULES)].map(Boolean)).toEqual([true, true, false, false]);
		expect(pixels).toEqual(before);
	});

	it("reaches nothing where the fill would paint nothing", () => {
		expect(floodReach(row(GULES, CLEAR), 2, 1, 0, 0, GULES)).toBeNull();
		expect(floodReach(row(GULES, CLEAR), 2, 1, 3, 0, SABLE)).toBeNull();
	});
});

describe("layers", () => {
	it("moves a layer forward or back one step, no further than the ends", () => {
		const layers = ["a", "b", "c"];
		expect(moveLayer(layers, 0, 1)).toEqual(["b", "a", "c"]);
		expect(moveLayer(layers, 2, -1)).toEqual(["a", "c", "b"]);
		expect(moveLayer(layers, 2, 1)).toBe(layers);
		expect(moveLayer(layers, 0, -1)).toBe(layers);
		expect(moveLayer(layers, 5, -1)).toBe(layers);
	});

	it("puts a new layer straight above another, or at the front", () => {
		expect(insertLayer(["a", "b"], "n", 0)).toEqual(["a", "n", "b"]);
		expect(insertLayer(["a", "b"], "n", -1)).toEqual(["n", "a", "b"]);
		expect(insertLayer(["a", "b"], "n")).toEqual(["a", "b", "n"]);
		expect(insertLayer([], "n")).toEqual(["n"]);
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
		const outline = SHIELD_CLIPS["bastionland-shield-outline"];
		expect(outline.path).toBe(SHIELD_OUTLINE_PATH);
		expect(outline.width).toBe(SHIELD_WIDTH + SHIELD_BORDER * 2);
		expect(outline.height).toBe(SHIELD_HEIGHT + SHIELD_BORDER * 2);
		expect(SHIELD_OUTLINE_PATH).toMatch(new RegExp(`^M0 \\d+ Q${outline.width / 2} -?\\d+ ${outline.width} `));
	});

	it("rings the field with the border, the field sitting a border's width inside the outline", () => {
		const shifted = SHIELD_PATH.replace(/-?\d+/g, (value) => String(Number(value) + SHIELD_BORDER));
		expect(SHIELD_FIELD_IN_OUTLINE_PATH).toBe(shifted);
		expect(SHIELD_CLIPS["bastionland-shield-border"]).toEqual({
			path: `${SHIELD_OUTLINE_PATH} ${SHIELD_FIELD_IN_OUTLINE_PATH}`,
			width: SHIELD_WIDTH + SHIELD_BORDER * 2,
			height: SHIELD_HEIGHT + SHIELD_BORDER * 2
		});
	});

	it("clips the sheet's and the painter's shields with the same paths", () => {
		const css = readFileSync(join(import.meta.dirname, "../../styles/mythic-bastionland.css"), "utf8");
		for (const id of Object.keys(SHIELD_CLIPS)) expect(css.match(new RegExp(`clip-path: url\\(#${id}\\)`, "g"))).toHaveLength(2);
		expect(css).not.toContain("clip-path: path(");
	});

	it("sets the margin behind the border on the sheet, and at twice the size in the painter", () => {
		const css = readFileSync(join(import.meta.dirname, "../../styles/mythic-bastionland.css"), "utf8");
		expect(css).toContain(`width: calc(100% + ${PAINT_MARGIN * 2}px)`);
		expect(css).toContain(`inset: -${PAINT_MARGIN}px`);
		expect(css).toContain(`width: calc(100% + ${PAINT_MARGIN * 4}px)`);
		expect(css).toContain(`top: -${PAINT_MARGIN * 2}px`);
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

describe("randomArms", () => {
	/** @returns {() => number} A seeded stand-in for Math.random, so a failure can be run again. */
	const seeded = (seed) => () => {
		seed = (seed * 1664525 + 1013904223) % 2 ** 32;
		return seed / 2 ** 32;
	};
	const isMetal = (key) => METALS.includes(key);
	const charges = ["lion", "tower", "mullet"];
	const division = (key) => DIVISIONS.find((each) => each.key === key);

	it("finds which groups share a side", () => {
		expect(touchingGroups(division("perPale"))).toEqual([[0, 1]]);
		expect(touchingGroups(division("tiercedInPale"))).toEqual([[1, 2], [0, 2]]);
		expect(touchingGroups(division("perPall"))).toHaveLength(3);
	});

	it("counts or on vert as reading well, and colour on colour or metal on metal as not", () => {
		expect(readsWell("or", "vert")).toBe(true);
		expect(readsWell("argent", "sable")).toBe(true);
		expect(readsWell("gules", "azure")).toBe(false);
		expect(readsWell("gules", "sable")).toBe(false);
		expect(readsWell("or", "argent")).toBe(false);
	});

	it("gives touching parts tinctures that read well, keeping the rule of tincture wherever it can", () => {
		const random = seeded(7);
		for (let trial = 0; trial < 3000; trial++) {
			const arms = randomArms({ charges, random });
			if (!arms.division) continue;
			const { field } = arms;
			const each = division(arms.division);
			expect(field).toHaveLength(new Set(each.parts.map(({ group }) => group)).size);
			expect(new Set(field).size).toBe(field.length);
			for (const [a, b] of touchingGroups(each)) {
				expect(readsWell(field[a], field[b])).toBe(true);
				if (arms.division !== "perPall") expect(isMetal(field[a])).not.toBe(isMetal(field[b]));
			}
		}
	});

	it("gives a charge a tincture that reads well against every part it lies over", () => {
		const random = seeded(11);
		let counterchanged = 0;
		for (let trial = 0; trial < 3000; trial++) {
			const { division: key, field, charge } = randomArms({ charges, random });
			if (!key) expect(charge).not.toBeNull();
			if (!charge) continue;
			expect(charges).toContain(charge.key);
			expect(charge.tinctures).toHaveLength(field.length);
			charge.tinctures.forEach((tincture, group) => expect(readsWell(tincture, field[group])).toBe(true));
			if (!key) expect(isMetal(charge.tinctures[0])).not.toBe(isMetal(field[0]));
			if (new Set(charge.tinctures).size > 1) counterchanged++;
		}
		expect(counterchanged).toBeGreaterThan(0);
	});

	it("draws plain and divided fields, and no charge when there are none to draw", () => {
		const random = seeded(3);
		const many = Array.from({ length: 500 }, () => randomArms({ random }));
		expect(many.some(({ division: key }) => key)).toBe(true);
		expect(many.some(({ division: key }) => !key)).toBe(true);
		for (const { charge } of many) expect(charge).toBeNull();
	});

	it("paints a plain field in a metal about as often as a colour", () => {
		const random = seeded(5);
		const plain = Array.from({ length: 4000 }, () => randomArms({ random })).filter(({ division }) => !division);
		const metals = plain.filter(({ field }) => isMetal(field[0])).length / plain.length;
		expect(metals).toBeGreaterThan(0.4);
		expect(metals).toBeLessThan(0.6);
	});
});

describe("arms kept editable", () => {
	const seeded = (seed) => () => {
		seed = (seed * 1664525 + 1013904223) % 2 ** 32;
		return seed / 2 ** 32;
	};
	const isMetal = (color) => METALS.includes(tinctureOf(color));
	const division = (key) => DIVISIONS.find((each) => each.key === key);
	const groups = (key) => (key ? new Set(division(key).parts.map(({ group }) => group)).size : 1);
	const [or, argent, gules, azure, vert, sable] = ["or", "argent", "gules", "azure", "vert", "sable"].map(tinctureColor);
	const placement = { x: 210, y: 224, scale: 0.7 };
	const charges = ["lion", "tower", "mullet"];
	const plainArms = (color, charge = null) => ({ division: null, field: [color], charge });
	const bearing = (color, counterchanged = false) => ({ key: "lion", color, counterchanged, placement, flip: false });

	it("counterchanges a charge by swapping the field's colours, taking the clearest where there are more", () => {
		expect(counterchange([or, gules])).toEqual([gules, or]);
		const three = counterchange([gules, azure, or]);
		expect(three[0]).toBe(or);
		expect(three[1]).toBe(or);
		expect([gules, azure]).toContain(three[2]);
		// A field in one colour has no other to swap in.
		expect(counterchange([or, or])).toEqual([or, or]);
	});

	it("keeps random arms' colours, and knows a counterchanged charge", () => {
		const random = seeded(13);
		for (let trial = 0; trial < 2000; trial++) {
			const drawn = randomArms({ charges, random });
			const arms = editableArms(drawn, placement);
			expect(arms.division).toBe(drawn.division);
			expect(arms.field).toEqual(drawn.field.map(tinctureColor));
			if (!drawn.charge) {
				expect(arms.charge).toBeNull();
				continue;
			}
			expect(arms.charge).toMatchObject({ key: drawn.charge.key, placement, flip: false });
			expect(chargeColors(arms)).toEqual(drawn.charge.tinctures.map(tinctureColor));
		}
	});

	it("keeps each group's colour on another division, and draws new groups' to read well beside theirs", () => {
		const random = seeded(17);
		for (let trial = 0; trial < 200; trial++) {
			const arms = redivideArms({ division: "perPale", field: [gules, azure], charge: null }, "tiercedInPale", random);
			expect(arms.division).toBe("tiercedInPale");
			expect(arms.field.slice(0, 2)).toEqual([gules, azure]);
			const [, , third] = arms.field;
			// The third part lies between two colours, so it's a metal.
			expect(isMetal(third)).toBe(true);
		}
		// Between or and gules no tincture keeps the rule with both, or reads well beside both, so it takes the clearest beside both.
		expect(redivideArms({ division: "perPale", field: [or, gules], charge: null }, "tiercedInPale").field[2]).toBe(sable);
		// Beside one metal on a plain field made Per Fess, it's a colour.
		const random2 = seeded(5);
		for (let trial = 0; trial < 100; trial++) expect(isMetal(redivideArms(plainArms(argent), "perFess", random2).field[1])).toBe(false);
	});

	it("drops the extra colours on a plain field, where a counterchanged charge keeps its colour over the first part", () => {
		const arms = redivideArms({ division: "perPale", field: [or, gules], charge: bearing(argent, true) }, null);
		expect(arms).toEqual({ division: null, field: [or], charge: { ...bearing(gules), counterchanged: false } });
		// A charge of one colour stays as it was.
		expect(redivideArms({ division: "perPale", field: [or, gules], charge: bearing(sable) }, "quarterly").charge).toEqual(bearing(sable));
	});

	it("rolls new tinctures that keep the division and the charge's place", () => {
		const random = seeded(19);
		for (let trial = 0; trial < 500; trial++) {
			const before = { division: "perBend", field: [or, gules], charge: { ...bearing(sable), flip: true } };
			const arms = retinctureArms(before, random);
			expect(arms.division).toBe("perBend");
			expect(arms.field).toHaveLength(2);
			expect(isMetal(arms.field[0])).not.toBe(isMetal(arms.field[1]));
			expect(arms.charge).toMatchObject({ key: "lion", placement, flip: true });
			chargeColors(arms).forEach((color, group) => expect(colorsReadWell(color, arms.field[group])).toBe(true));
		}
	});

	it("rolls another field with as many colours as its division takes, keeping the charge", () => {
		const random = seeded(23);
		for (let trial = 0; trial < 500; trial++) {
			const arms = refieldArms(plainArms(or, bearing(gules)), random);
			expect(arms.field).toHaveLength(groups(arms.division));
			expect(arms.charge).toMatchObject({ key: "lion", placement });
		}
	});

	it("bears another charge in the old one's colours and place, or a first one that reads well", () => {
		const moved = { ...bearing(sable, false), placement: { x: 50, y: 60, scale: 0.4 }, flip: true };
		expect(armsWithCharge(plainArms(or, moved), "tower", placement).charge).toEqual({ ...moved, key: "tower" });
		const random = seeded(29);
		for (let trial = 0; trial < 200; trial++) {
			const first = armsWithCharge(plainArms(or), "tower", placement, random).charge;
			expect(first).toMatchObject({ key: "tower", placement, flip: false, counterchanged: false });
			expect(isMetal(first.color)).toBe(false);
			// A colour mixed by hand takes a tincture that shows on it.
			const mixed = armsWithCharge(plainArms("#335577"), "tower", placement, random).charge;
			expect(colorsReadWell(mixed.color, "#335577")).toBe(true);
		}
	});

	it("rolls a charge other than the one borne, and leaves the arms be when there's no other", () => {
		const random = seeded(31);
		for (let trial = 0; trial < 100; trial++) expect(rechargeArms(plainArms(or, bearing(gules)), charges, placement, random).charge.key).not.toBe("lion");
		const arms = plainArms(or, bearing(gules));
		expect(rechargeArms(arms, ["lion"], placement)).toBe(arms);
	});

	it("stamps heraldry so arms saved with it can be told from arms saved with other heraldry", () => {
		expect(heraldryStamp("worlds/w/heraldry/a.webp?v=1")).toBe(heraldryStamp("worlds/w/heraldry/a.webp?v=1"));
		expect(heraldryStamp("worlds/w/heraldry/a.webp?v=1")).not.toBe(heraldryStamp("worlds/w/heraldry/a.webp?v=2"));
	});

	describe("readArms", () => {
		const heraldry = "worlds/w/heraldry/Actor-abc.webp?v=5";
		const saved = (arms) => ({ ...arms, stamp: heraldryStamp(heraldry) });
		const arms = { division: "perPale", field: [or, gules], charge: bearing(argent, true) };

		it("reads back arms saved with the heraldry", () => {
			expect(readArms(saved(arms), heraldry, charges)).toEqual(arms);
			expect(readArms(saved(plainArms(vert)), heraldry, charges)).toEqual(plainArms(vert));
		});

		it("refuses arms saved with other heraldry, or none", () => {
			expect(readArms(saved(arms), "worlds/w/heraldry/Actor-abc.webp?v=6", charges)).toBeNull();
			expect(readArms({ ...arms }, heraldry, charges)).toBeNull();
			expect(readArms(saved(arms), "", charges)).toBeNull();
			expect(readArms(null, heraldry, charges)).toBeNull();
		});

		it("refuses arms that don't fit together", () => {
			expect(readArms(saved({ ...arms, field: [or] }), heraldry, charges)).toBeNull();
			expect(readArms(saved({ ...arms, division: "perNothing" }), heraldry, charges)).toBeNull();
			expect(readArms(saved({ ...arms, field: [or, "red"] }), heraldry, charges)).toBeNull();
			expect(readArms(saved({ ...arms, charge: { ...arms.charge, key: "dragon" } }), heraldry, charges)).toBeNull();
			expect(readArms(saved({ ...arms, charge: { ...arms.charge, placement: { x: 1, y: 2 } } }), heraldry, charges)).toBeNull();
			expect(readArms(saved({ ...arms, charge: { ...arms.charge, color: azure.toUpperCase() } }), heraldry, charges)).toBeNull();
		});

		it("never counterchanges a charge on a plain field", () => {
			expect(readArms(saved(plainArms(or, bearing(gules, true))), heraldry, charges).charge.counterchanged).toBe(false);
		});
	});

	describe("readLayers", () => {
		const heraldry = "worlds/w/heraldry/Actor-abc.webp?v=5";
		const stamp = heraldryStamp(heraldry);
		const arms = { division: "perPale", field: [or, gules], charge: bearing(argent, true) };
		const layers = [
			{ kind: "paint", src: "worlds/w/heraldry/layers/Actor-abc-0.webp?v=5" },
			{ kind: "field" },
			{ kind: "charge", key: "tower", color: azure, placement, flip: true },
			{ kind: "armsCharge" },
			{ kind: "picture", src: "data:image/webp;base64,AAAA", placement, flip: false },
			{ kind: "paint", src: null }
		];

		it("reads back layers saved with the heraldry, in their order", () => {
			expect(readLayers({ stamp, arms, layers }, heraldry, charges)).toEqual({ arms, layers });
			expect(readLayers({ stamp, arms: null, layers: [layers[2]] }, heraldry, charges)).toEqual({ arms: null, layers: [layers[2]] });
		});

		it("refuses layers saved with other heraldry, or none", () => {
			expect(readLayers({ stamp, arms, layers }, "worlds/w/heraldry/Actor-abc.webp?v=6", charges)).toBeNull();
			expect(readLayers({ arms, layers }, heraldry, charges)).toBeNull();
			expect(readLayers({ stamp, arms }, heraldry, charges)).toBeNull();
			expect(readLayers(null, heraldry, charges)).toBeNull();
		});

		it("refuses layers that don't fit the arms", () => {
			expect(readLayers({ stamp, arms: null, layers }, heraldry, charges)).toBeNull();
			expect(readLayers({ stamp, arms: { ...arms, charge: null }, layers }, heraldry, charges)).toBeNull();
			expect(readLayers({ stamp, arms, layers: layers.filter(({ kind }) => kind !== "field") }, heraldry, charges)).toBeNull();
			expect(readLayers({ stamp, arms, layers: [...layers, { kind: "field" }] }, heraldry, charges)).toBeNull();
		});

		it("refuses a layer it can't draw", () => {
			const refused = (layer) => readLayers({ stamp, arms: null, layers: [layer] }, heraldry, charges);
			expect(refused({ kind: "charge", key: "dragon", color: azure, placement })).toBeNull();
			expect(refused({ kind: "charge", key: "tower", color: "blue", placement })).toBeNull();
			expect(refused({ kind: "charge", key: "tower", color: azure, placement: { x: 1, y: 2 } })).toBeNull();
			expect(refused({ kind: "picture", src: "", placement })).toBeNull();
			expect(refused({ kind: "paint", src: 5 })).toBeNull();
			expect(refused({ kind: "brush" })).toBeNull();
		});
	});
});
