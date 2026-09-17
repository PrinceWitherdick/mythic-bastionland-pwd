import { describe, expect, it } from "vitest";
import { RIVER_SHAPES } from "../module/rules/realm.js";
import { REALM_PALETTES, REALM_PICTURES, REALM_SKINS, realmPalette } from "../module/rules/realm-skins.js";
import { DRAWN_SKINS, drawRealmSet } from "../scripts/lib/realm-drawings.js";

const HEX_H = 480;
const HEX_W = (2 * HEX_H) / Math.sqrt(3);

/** Every x,y pair in a path, whatever its commands. */
function coordinates(d) {
	const numbers = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
	return Array.from({ length: numbers.length / 2 }, (_, index) => ({ x: numbers[2 * index], y: numbers[2 * index + 1] }));
}

/** A point turned about the hex's middle, clockwise by `sixths` of a turn. */
function turned({ x, y }, sixths) {
	const angle = (sixths * Math.PI) / 3;
	const [dx, dy] = [x - HEX_W / 2, y - HEX_H / 2];
	return { x: HEX_W / 2 + dx * Math.cos(angle) - dy * Math.sin(angle), y: HEX_H / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) };
}

/**
 * How far along the south edge each point on any of the hex's edges falls,
 * from the edge's middle, once the edge it's on is turned to the south.
 */
function edgeCrossings(d) {
	const crossings = [];
	for (const point of coordinates(d)) {
		for (let sixths = 0; sixths < 6; sixths++) {
			const south = turned(point, sixths);
			if (Math.abs(south.y - HEX_H) < 0.3 && Math.abs(south.x - HEX_W / 2) < HEX_W / 4) crossings.push(Math.round(south.x - HEX_W / 2));
		}
	}
	return [...new Set(crossings)].sort((a, b) => a - b);
}

describe("drawRealmSet", () => {
	it("draws every skin the Realm Appearance window offers", () => {
		expect([...DRAWN_SKINS].sort()).toEqual([...REALM_SKINS].sort());
	});

	it.each(REALM_SKINS)("draws every picture for %s", (skin) => {
		const files = drawRealmSet(skin, "heraldic");
		expect(Object.keys(files).sort()).toEqual(REALM_PICTURES.map((name) => `${name}.svg`).sort());
		for (const content of Object.values(files)) {
			expect(content).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*>.*<\/svg>\n$/s);
			expect(content).not.toMatch(/undefined|NaN|Infinity/);
		}
	});

	it("draws each colour set in its own colours", () => {
		expect(drawRealmSet("classic", "midnight")["myth-1.svg"]).toContain("#e8dcc0");
		expect(drawRealmSet("classic", "parchment")["myth-1.svg"]).not.toContain("#e8dcc0");
	});
});

describe("the Blank Realm skin", () => {
	const blank = drawRealmSet("sheet", "blank");
	const ochre = realmPalette("ochre");

	it("draws the sheet's own terrain, Holdings and Landmarks, and credits them", () => {
		for (const name of ["terrain-05", "holding-castle", "landmark-ruin"]) {
			expect(blank[`${name}.svg`]).toMatch(/<desc>Traced from the map legend of the Mythic Bastionland Blank Realm sheet/);
		}
		expect(blank["myth-1.svg"]).not.toContain("<desc>");
	});

	it("inks terrain and Holdings, and pens Landmarks and Myths in the colour set's red", () => {
		const drawn = drawRealmSet("sheet", "ochre");
		expect(drawn["terrain-03.svg"]).toContain(`fill="${ochre.ink}"`);
		expect(drawn["holding-town.svg"]).toContain(`fill="${ochre.ink}"`);
		expect(drawn["holding-town.svg"]).toContain(`fill="${ochre.paper}"`);
		expect(drawn["landmark-dwelling.svg"]).toContain(`fill="${ochre.accent}"`);
		expect(drawn["myth-4.svg"]).toContain(`stroke="${ochre.accent}"`);
	});

	it("keeps each terrain's drawing inside its hex", () => {
		for (let number = 1; number <= 12; number++) {
			expect(blank[`terrain-${String(number).padStart(2, "0")}.svg`]).toMatch(/<clipPath id="hex">.*clip-path="url\(#hex\)"/s);
		}
	});

	it.each(REALM_PALETTES.map(({ key }) => key))("lays every river piece's banks and water at the same places on the edges it crosses, in %s", (palette) => {
		const drawn = drawRealmSet("sheet", palette);
		const banks = RIVER_SHAPES.map((shape) => edgeCrossings(drawn[`river-${shape}.svg`].match(/<path d="([^"]+)" fill="[^"]+"\/><\/svg>/)[1]));
		const water = RIVER_SHAPES.map((shape) => edgeCrossings(drawn[`river-${shape}.svg`].match(/<path d="([^"]+)"/)[1]));
		// The water's edges and each bank's outer edge, the same for every piece, so pieces join however they're laid.
		for (const crossings of banks) expect(crossings).toEqual(banks[0]);
		for (const crossings of water) expect(crossings).toEqual([-29, 29]);
		expect(banks[0]).toEqual([-46, -29, 29, 46]);
	});
});
