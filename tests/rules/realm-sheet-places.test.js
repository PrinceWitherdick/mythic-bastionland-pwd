import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAIRED_SKIN, skinFeatures } from "../../module/rules/realm-skins.js";

const root = join(import.meta.dirname, "../..");

/**
 * @param {string} name
 * @returns {Record<string, unknown[]>} One of scripts/realm-sheet-art.py's tables of hexes, read as JSON.
 */
function scriptTable(name) {
	const source = readFileSync(join(root, "scripts/realm-sheet-art.py"), "utf8");
	const found = source.match(new RegExp(`^${name} = (\\{[\\s\\S]*?^\\})`, "m"));
	return JSON.parse(found[1].replace(/,(\s*[\]}])/g, "$1"));
}

/** Each picture the script traced, with the hex it stood in. */
const traced = JSON.parse(readFileSync(join(root, "scripts/data/realm-sheet-variants.json"), "utf8"));

// The pictures are numbered by where their hex comes in the script's tables, and laid beside their
// neighbours by where the skin's tables put that hex, so the three must never drift apart.
describe("the example Realm's hexes", () => {
	const { terrainPlaces, terrainGroups } = skinFeatures(PAIRED_SKIN);

	it("are the ones scripts/realm-sheet-art.py traces, in its order", () => {
		expect(terrainPlaces).toEqual(scriptTable("VARIANTS"));
		expect(terrainGroups).toEqual(scriptTable("GROUPS"));
	});

	it("are where each traced picture stood, and every traced picture is among them", () => {
		const names = [];
		for (const [terrain, places] of Object.entries(terrainPlaces)) {
			const pictures = places.map((_, index) => `terrain-${terrain}-${index + 2}`);
			expect(pictures.map((name) => traced[name]?.place)).toEqual(places);
			names.push(...pictures);
		}
		for (const [terrain, groups] of Object.entries(terrainGroups)) {
			const pictures = groups.flat().map((_, index) => `terrain-${terrain}-joined-${index + 1}`);
			expect(pictures.map((name) => traced[name]?.place)).toEqual(groups.flat());
			names.push(...pictures);
		}
		expect(Object.keys(traced).filter((name) => !name.startsWith("$")).sort()).toEqual(names.sort());
	});
});
