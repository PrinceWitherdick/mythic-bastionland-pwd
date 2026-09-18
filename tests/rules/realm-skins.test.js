import { describe, expect, it } from "vitest";
import { contrast, mix } from "../../module/rules/colour.js";
import { TERRAIN } from "../../module/rules/realm.js";
import {
	REALM_CUSTOM_DIR,
	REALM_PALETTES,
	REALM_PICTURES,
	REALM_SKINS,
	customPictureName,
	defaultRealmLook,
	matchCustomFiles,
	normaliseRealmLook,
	paletteSwatches,
	realmPalette,
	realmSetDir,
	sceneColours
} from "../../module/rules/realm-skins.js";

describe("colour sets", () => {
	it("mixes colours", () => {
		expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
		expect(mix("#102030", "#102030", 0.7)).toBe("#102030");
	});

	it("gives each a tint for every terrain, and falls back to the Blank Realm's own", () => {
		for (const palette of REALM_PALETTES) {
			expect(palette.terrain).toHaveLength(TERRAIN.length);
			expect(palette.solid).toHaveLength(TERRAIN.length);
			expect(paletteSwatches(palette.key)).toHaveLength(6);
		}
		expect(realmPalette("nonsense").key).toBe("parchment");
		expect(sceneColours("parchment")).toEqual({ paper: "#efe8d8", grid: "#a89f90", barrier: "#8b1e1e" });
	});

	it.each(REALM_PALETTES.map((palette) => [palette.key, palette]))("%s keeps its ink readable on its paper and hexes", (_key, palette) => {
		expect(contrast(palette.ink, palette.paper)).toBeGreaterThan(7);
		for (const fill of palette.terrain) expect(contrast(palette.ink, fill)).toBeGreaterThan(4.5);
		expect(contrast(palette.accent, palette.paper)).toBeGreaterThan(3);
	});
});

describe("realmSetDir", () => {
	it("serves each set from its own folder", () => {
		expect(REALM_SKINS[0]).toBe("sheet");
		expect(realmSetDir("woodcut", "ochre")).toBe("systems/mythic-bastionland-pwd/assets/realm/woodcut/ochre");
		expect(realmSetDir("nope", "nope")).toBe("systems/mythic-bastionland-pwd/assets/realm/sheet/parchment");
	});
});

describe("normaliseRealmLook", () => {
	it("fills in the default for anything missing or unknown", () => {
		expect(normaliseRealmLook(null)).toEqual(defaultRealmLook());
		expect(normaliseRealmLook({ skin: "chalk", palette: "neon", bookIcons: true, custom: { terrainFit: "stretch", files: { forest: "a.png", "terrain-forest": "", seat: "b.png" } } }))
			.toEqual({ skin: "sheet", palette: "parchment", custom: { folder: "", terrainFit: "hex", files: { seat: "b.png" } } });
	});

	it("reads pictures saved when terrain went by number under the terrain's name", () => {
		expect(normaliseRealmLook({ custom: { files: { "terrain-05": "old.png", "terrain-01": "marsh.png", "terrain-marsh": "new.png" } } }).custom.files)
			.toEqual({ "terrain-forest": "old.png", "terrain-marsh": "new.png" });
	});

	it("keeps a look that's already sound", () => {
		const look = { skin: "atlas", palette: "ashen", custom: { folder: `${REALM_CUSTOM_DIR}`, terrainFit: "icon", files: { "myth-2": "x.webp" } } };
		expect(normaliseRealmLook(look)).toEqual(look);
	});
});

describe("the GM's own pictures", () => {
	it.each([
		["terrain-forest.png", "terrain-forest"],
		["dir/Forest.WEBP", "terrain-forest"],
		["terrain_marsh.jpg", "terrain-marsh"],
		["terrain-01.png", "terrain-marsh"],
		["terrain-3.png", "terrain-crag"],
		["12-plains.png", "terrain-plains"],
		["terrain-10-lake.webp", "terrain-lake"],
		["holding_castle.png", "holding-castle"],
		["Tower.svg", "holding-tower"],
		["ruin.gif", "landmark-ruin"],
		["myth 3.png", "myth-3"],
		["myth4.png", "myth-4"],
		["Seat%20of%20Power.png", "seat"],
		["forest 100%.png", null],
		["Forest%.png", null],
		["river-bend.avif", "river-bend"],
		["forest.txt", null],
		["dragon.png", null],
		[".png", null]
	])("reads %s as %s", (path, name) => {
		expect(customPictureName(path)).toBe(name);
	});

	it("names terrain for its terrain, and reads every picture's own name", () => {
		expect(REALM_PICTURES.slice(0, TERRAIN.length)).toEqual(TERRAIN.map((key) => `terrain-${key}`));
		for (const name of REALM_PICTURES) expect(customPictureName(`${name}.png`)).toBe(name);
	});

	it("matches a folder's files, preferring the exact name", () => {
		expect(matchCustomFiles(["a/forest.png", "a/terrain-forest.webp", "a/notes.md", "a/castle.png", "a/holding-castle.jpg", "a/tower.png", "a/Tower.webp"])).toEqual({
			"terrain-forest": "a/terrain-forest.webp",
			"holding-castle": "a/holding-castle.jpg",
			"holding-tower": "a/tower.png"
		});
	});
});
