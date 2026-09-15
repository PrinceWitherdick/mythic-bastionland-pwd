import { describe, expect, it } from "vitest";
import {
	REALM_ICON_DIR,
	buildRealmIconIndex,
	classifyRealmIcons,
	imageBox,
	looksLikeRealmSheet,
	realmIconFile,
	trackImageTransforms,
	whiteToAlpha
} from "../../module/rules/realm-icons.js";

/**
 * Where each picture sits on the first page of the Blank Realm PDF, measured
 * from the page, in the order the page paints them.
 */
const LEGEND = [
	["img_p0_1", 136, 107, 0.569, 0.793, "landmark", "ruin"],
	["img_p0_2", 225, 176, 0.847, 0.867, "holding", "fortress"],
	["img_p0_3", 126, 107, 0.57, 0.552, "landmark", "dwelling"],
	["img_p0_4", 118, 107, 0.571, 0.6, "landmark", "sanctum"],
	["img_p0_5", 118, 107, 0.571, 0.648, "landmark", "monument"],
	["img_p0_6", 136, 107, 0.569, 0.696, "landmark", "hazard"],
	["img_p0_7", 103, 107, 0.574, 0.745, "landmark", "curse"],
	["img_p0_8", 141, 176, 0.916, 0.898, "holding", "tower"],
	["img_p0_9", 197, 166, 0.033, 0.868, "terrain", 1],
	["img_p0_10", 197, 166, 0.252, 0.868, "terrain", 5],
	["img_p0_11", 197, 166, 0.472, 0.868, "terrain", 9],
	["img_p0_12", 197, 166, 0.088, 0.899, "terrain", 2],
	["img_p0_13", 198, 166, 0.307, 0.899, "terrain", 6],
	["img_p0_14", 197, 166, 0.527, 0.899, "terrain", 10],
	["img_p0_15", 197, 166, 0.143, 0.868, "terrain", 3],
	["img_p0_16", 197, 166, 0.362, 0.868, "terrain", 7],
	["img_p0_17", 197, 166, 0.582, 0.868, "terrain", 11],
	["img_p0_18", 197, 166, 0.197, 0.899, "terrain", 4],
	["img_p0_19", 197, 166, 0.417, 0.899, "terrain", 8],
	["img_p0_20", 197, 166, 0.637, 0.899, "terrain", 12],
	["img_p0_21", 261, 219, 0.713, 0.867, "holding", "castle"],
	["img_p0_22", 225, 168, 0.792, 0.898, "holding", "town"]
];

const pictures = LEGEND.map(([key, width, height, left, top]) => ({ key, width, height, box: { left, top, width: 0.05, height: 0.05 } }));

describe("classifyRealmIcons", () => {
	const expectLegend = (result) => {
		for (const [key, , , , , kind, name] of LEGEND) expect(result[kind][name]?.key, `${kind} ${name}`).toBe(key);
		expect(result.problems).toEqual([]);
	};

	it("names every icon on the legend from where it sits", () => {
		expectLegend(classifyRealmIcons(pictures));
		expect(looksLikeRealmSheet(pictures)).toBe(true);
	});

	it("doesn't depend on the order the page paints them", () => {
		expectLegend(classifyRealmIcons([...pictures].reverse()));
		expectLegend(classifyRealmIcons([...pictures.slice(11), ...pictures.slice(0, 11)]));
	});

	it("reports icons it can't find, and isn't fooled by another page", () => {
		const missing = classifyRealmIcons(pictures.filter((picture) => picture.key !== "img_p0_20"));
		expect(missing.problems).toEqual([{ kind: "terrain", reason: "notFound" }]);
		expect(missing.terrain[12]).toBeNull();
		expect(looksLikeRealmSheet([{ key: "cover", width: 1225, height: 1585, box: { left: 0, top: 0, width: 1, height: 1 } }])).toBe(false);
		expect(looksLikeRealmSheet([...pictures, { key: "extra", width: 50, height: 50, box: { left: 0.6, top: 0.5 } }])).toBe(false);
	});

	it("counts a picture painted twice once", () => {
		expect(classifyRealmIcons([...pictures, pictures[0]]).problems).toEqual([]);
	});
});

describe("trackImageTransforms and imageBox", () => {
	const OPS = { save: 1, restore: 2, transform: 3, paintFormXObjectBegin: 4, paintFormXObjectEnd: 5, paintImageXObject: 6, paintInlineImageXObject: 7 };

	it("follows saves, restores, transforms and forms to each picture", () => {
		const fnArray = [1, 3, 6, 2, 4, 3, 7, 5, 6];
		const argsArray = [
			null,
			[50, 0, 0, 40, 100, 200],
			["a", 197, 166],
			null,
			[[1, 0, 0, 1, 10, 20], [0, 0, 100, 100]],
			[2, 0, 0, 2, 0, 0],
			[{ width: 8, height: 4 }],
			null,
			["b", 5, 5]
		];
		const [first, inline, last] = trackImageTransforms(fnArray, argsArray, OPS);
		expect(first).toMatchObject({ key: "a", width: 197, height: 166, matrix: [50, 0, 0, 40, 100, 200] });
		expect(inline).toMatchObject({ key: null, width: 8, height: 4, matrix: [2, 0, 0, 2, 10, 20] });
		expect(last.matrix).toEqual([1, 0, 0, 1, 0, 0]);
	});

	it("measures a picture's place on the page from the top left", () => {
		const box = imageBox([50, 0, 0, 40, 100, 200], [0, 0, 1000, 500]);
		expect(box.left).toBeCloseTo(0.1);
		expect(box.top).toBeCloseTo(0.52);
		expect(box.width).toBeCloseTo(0.05);
		expect(box.height).toBeCloseTo(0.08);
	});
});

describe("whiteToAlpha", () => {
	const pixel = (...rgba) => whiteToAlpha(new Uint8ClampedArray(rgba));

	it("clears white, keeps black, and thins grey to see-through ink", () => {
		expect([...pixel(255, 255, 255, 255)]).toEqual([0, 0, 0, 0]);
		expect([...pixel(0, 0, 0, 255)]).toEqual([0, 0, 0, 255]);
		const grey = pixel(128, 128, 128, 255);
		expect(grey[0]).toBe(0);
		expect(grey[3]).toBeCloseTo(127, 0);
	});

	it("keeps red ink red, looking the same laid back over white", () => {
		const [red, green, blue, alpha] = pixel(139, 30, 30, 255);
		const over = (channel) => (channel * alpha) / 255 + 255 * (1 - alpha / 255);
		expect(over(red)).toBeCloseTo(139, -1);
		expect(over(green)).toBeCloseTo(30, -1);
		expect(over(blue)).toBeCloseTo(30, -1);
	});
});

describe("the icon files and their index", () => {
	it("names files by what they show", () => {
		expect(realmIconFile("terrain", 5, "png")).toEqual({ dir: REALM_ICON_DIR, fileName: "terrain-05-forest.png", file: "realm/terrain-05-forest.png" });
		expect(realmIconFile("holding", "tower").fileName).toBe("holding-tower.webp");
		expect(realmIconFile("landmark", "ruin").file).toBe("realm/landmark-ruin.webp");
	});

	it("lists every icon in order, saved or not", () => {
		const index = buildRealmIconIndex({
			entries: [
				{ kind: "terrain", key: 2, file: "realm/terrain-02-heath.webp", path: "mythic-bastionland-art/realm/terrain-02-heath.webp", width: 197, height: 166 },
				{ kind: "holding", key: "town", file: "realm/holding-town.webp", path: "mythic-bastionland-art/realm/holding-town.webp", width: 225, height: 168 }
			],
			problems: [{ kind: "landmark", key: "ruin", reason: "decode" }],
			importedAt: "2026-09-14T00:00:00.000Z",
			systemVersion: "0.1.0",
			source: "Blank.pdf",
			pdfPages: 3
		});
		expect(index).toMatchObject({ version: 1, root: REALM_ICON_DIR, source: "Blank.pdf", pdfPages: 3 });
		expect(index.terrain).toHaveLength(12);
		expect(index.terrain[1]).toEqual({ terrain: 2, file: "realm/terrain-02-heath.webp", path: "mythic-bastionland-art/realm/terrain-02-heath.webp", width: 197, height: 166 });
		expect(index.terrain[0]).toMatchObject({ terrain: 1, path: null });
		expect(index.holdings.map((entry) => entry.style)).toEqual(["castle", "town", "fortress", "tower"]);
		expect(index.holdings[1].path).toMatch(/holding-town/);
		expect(index.landmarks).toHaveLength(6);
		expect(index.problems).toEqual([{ kind: "landmark", key: "ruin", reason: "decode" }]);
	});
});
