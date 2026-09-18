import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHARGE_LICENCE, HERALDIC_ART, HERALDIC_ART_COPYRIGHT, HERALDIC_ART_ILLUSTRATOR } from "../module/rules/heraldry-charges.js";
import { HOLDING_STYLES, LANDMARK_TYPES, RIVER_SHAPES } from "../module/rules/realm.js";
import { PICTURE_NAME, REALM_PALETTES, REALM_PICTURES, REALM_SKINS, realmPalette } from "../module/rules/realm-skins.js";
import { checkChargeSvg } from "../scripts/lib/charge-svg.js";
import { DRAWN_SKINS, drawRealmSet } from "../scripts/lib/realm-drawings.js";
import { PUBLIC_DOMAIN } from "./public-domain-sources.js";

const HEX_H = 480;
const HEX_W = (2 * HEX_H) / Math.sqrt(3);
/** The square the skins draw everything but terrain and rivers in. */
const BADGE = 300;

/** What scripts/realm-sheet-art.py traced from the Blank Realm sheet. */
const SHEET_ART = JSON.parse(readFileSync(new URL("../scripts/data/realm-sheet-art.json", import.meta.url), "utf8"));

/** What scripts/realm-armorial-art.js took from the Book of Traceable Heraldic Art. */
const ARMORIAL_ART = JSON.parse(readFileSync(new URL("../scripts/data/realm-armorial-art.json", import.meta.url), "utf8"));
const ARMORIAL_ART_KEYS = Object.keys(ARMORIAL_ART);

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

	it.each(REALM_SKINS.filter((skin) => !["sheet", "armorial"].includes(skin)))("draws %s's Holdings as game-icons.net icons, and credits them", (skin) => {
		const files = drawRealmSet(skin, "parchment");
		expect(files["holding-town.svg"]).toContain("<desc>Village icon by Delapouite");
		expect(files["holding-castle.svg"]).toContain("<desc>Castle icon by Delapouite");
		expect(files["holding-tower.svg"]).toContain("<desc>White Tower icon by Lorc");
		expect(files["holding-fortress.svg"]).toContain("<desc>Rempart icon by Delapouite");
		expect(files["seat.svg"]).toContain("Eastern Crown");
		expect(files["seat.svg"]).not.toContain("Crown icon by Lorc");
	});

	it.each(REALM_SKINS)("rings %s's crown, so the Seat of Power reads as a badge on the map", (skin) => {
		const seat = drawRealmSet(skin, "parchment")["seat.svg"];
		// Each skin rings it in its own hand, but always in gold and behind the crown, which its credit marks the start of.
		const ring = seat.slice(0, seat.indexOf("<desc>"));
		expect(ring).toMatch(/<circle|<path/);
		expect(ring).toContain("#c9a227");
		// The middle of the ring is left open, so the Holding the Seat is pinned above shows through it.
		expect(ring).not.toMatch(/fill="(?!none)/);
	});

	it("draws each colour set in its own colours", () => {
		expect(drawRealmSet("classic", "midnight")["myth-1.svg"]).toContain("#e8dcc0");
		expect(drawRealmSet("classic", "parchment")["myth-1.svg"]).not.toContain("#e8dcc0");
	});
});

describe("the Armorial skin", () => {
	const parchment = realmPalette("parchment");
	const drawn = drawRealmSet("armorial", "parchment");
	/** Its pictures drawn from the Book of Traceable Heraldic Art: all but the Valley, the Myths and the rivers. */
	const heraldic = Object.keys(drawn).filter((name) => !/^(terrain-06|myth-\d|river-\w+)\.svg$/.test(name));

	it.each(ARMORIAL_ART_KEYS)("draws %s after a public-domain source", (key) => {
		const { sources, artists } = ARMORIAL_ART[key];
		expect(sources.length).toBeGreaterThan(0);
		for (const source of sources) expect(Object.keys(PUBLIC_DOMAIN)).toContain(source);
		for (const artist of artists) expect(sources.some((source) => PUBLIC_DOMAIN[source]?.includes(artist))).toBe(true);
	});

	it.each(ARMORIAL_ART_KEYS)("keeps %s a drawing that can be tinted safely", (key) => {
		expect(() => checkChargeSvg(ARMORIAL_ART[key].svg)).not.toThrow();
	});

	it.each(heraldic)("credits the heraldry drawing %s is made from, under its licence", (name) => {
		const credit = /<desc>([^<]*)<\/desc>/.exec(drawn[name])?.[1];
		expect(credit).toContain(`${HERALDIC_ART_ILLUSTRATOR} for the Book of Traceable Heraldic Art, ${HERALDIC_ART}`);
		expect(credit).toContain(HERALDIC_ART_COPYRIGHT);
		expect(credit).toContain(CHARGE_LICENCE.url);
		expect(credit).toMatch(/Source: .+\. Artist: .+\./);
	});

	it("uses every drawing it ships", () => {
		const used = new Set(heraldic.map((name) => /heraldicart\.org\/([^ ]+?)\. /.exec(drawn[name])[1]));
		expect(ARMORIAL_ART_KEYS.map((key) => ARMORIAL_ART[key].href).filter((href) => !used.has(href))).toEqual([]);
	});

	it("tints each drawing in the colour set, leaving none of the painter's own colours", () => {
		for (const name of heraldic) {
			expect(drawn[name]).not.toMatch(/="#f3f3f3"|="#000"/);
			expect(drawn[name]).toContain(`="${parchment.ink}"`);
		}
		expect(drawn["holding-castle.svg"]).toContain(`fill="${parchment.paper}"`);
		expect(drawn["terrain-05.svg"]).toContain(`fill="${parchment.terrain[4]}"`);
		expect(drawRealmSet("armorial", "midnight")["holding-castle.svg"]).toContain(`="${realmPalette("midnight").ink}"`);
	});

	it("keeps the drawn mark for the Valley, which no heraldry drawing reads as", () => {
		expect(drawn["terrain-06.svg"]).not.toContain("<desc>");
		expect(drawn["terrain-06.svg"]).toMatch(/<path d="M12 30c20 10/);
	});

	it("numbers its Myths on shields, with no drawing that could give a Myth away", () => {
		for (let number = 1; number <= 6; number++) {
			expect(drawn[`myth-${number}.svg`]).not.toContain("<desc>");
			expect(drawn[`myth-${number}.svg`]).toContain(`>${number}</text>`);
		}
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

	it("crowns the Seat of Power with the heraldic Eastern Crown, and credits it", () => {
		expect(blank["seat.svg"]).toMatch(/<desc>[^<]*Eastern Crown/);
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

	const shadowed = [...HOLDING_STYLES.map(PICTURE_NAME.holding), ...LANDMARK_TYPES.map(PICTURE_NAME.landmark)];
	it.each(shadowed)("stands %s on the middle of its badge, with the shadow it casts still inside it", (name) => {
		const art = SHEET_ART[name];
		const [, left, top, size] = /<g transform="translate\((-?[\d.]+) (-?[\d.]+)\) scale\(([\d.]+)\)"/.exec(blank[`${name}.svg`]).map(Number);
		// The picture itself sits in the middle, not the middle of the picture and its shadow together.
		expect(Math.abs(left + art.middle[0] * size - BADGE / 2)).toBeLessThan(1);
		expect(Math.abs(top + art.middle[1] * size - BADGE / 2)).toBeLessThan(1);
		// And the shadow reaching past it is drawn rather than cropped off the badge.
		expect(left).toBeGreaterThanOrEqual(0);
		expect(top).toBeGreaterThanOrEqual(0);
		expect(left + art.width * size).toBeLessThanOrEqual(BADGE);
		expect(top + art.height * size).toBeLessThanOrEqual(BADGE);
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
