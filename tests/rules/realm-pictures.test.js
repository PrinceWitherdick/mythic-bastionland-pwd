import { describe, expect, it } from "vitest";
import { PICTURE_ROLL, TERRAIN, emptyRealm } from "../../module/rules/realm.js";
import { allHexes, edgeDirection, hexIndex, hexKey, neighbour, neighbours, parseHexKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { generateRealm } from "../../module/rules/realm-generator.js";
import { layRiver, paintTerrain, placeFeature, relayRealm } from "../../module/rules/realm-edits.js";
import { brokenPictures, pickPicture, pictureCount, pictureOf, rollFor, rollPictures } from "../../module/rules/realm-pictures.js";
import { skinFeatures } from "../../module/rules/realm-skins.js";
import { createRandom } from "../../module/rules/random.js";

const g = realmGeometry();
const hex = (col, row) => ({ col, row });
const PEAKS = TERRAIN.indexOf("peaks") + 1;
const CRAG = TERRAIN.indexOf("crag") + 1;
const LAKE = TERRAIN.indexOf("lake") + 1;

/** Where on the example map each picture of a terrain was traced from: the skin's own, those shown alone, then the groups'. */
const placesOf = (terrain) => {
	const { terrainPlaces, terrainGroups } = skinFeatures("sheet");
	const key = TERRAIN[terrain - 1];
	return [null, ...(terrainPlaces[key] ?? []), ...(terrainGroups[key] ?? []).flat()];
};

/** Whether two pictures of a terrain stood on the example map as two hexes stand on this one. */
function laidAsDrawn(terrain, picture, other, direction) {
	const places = placesOf(terrain);
	if (!places[picture] || !places[other]) return false;
	return edgeDirection(g, parseHexKey(places[picture]), parseHexKey(places[other])) === direction;
}

/** Every pair of neighbouring hexes of one terrain with more than one picture, each pair once. */
function pairs(realm) {
	return allHexes(g).flatMap((place) => {
		const index = hexIndex(g, place);
		const terrain = realm.terrain[index];
		if (pictureCount(terrain) < 2) return [];
		return neighbours(g, place).flatMap(({ direction, hex: next }) => {
			const at = hexIndex(g, next);
			if (at < index || realm.terrain[at] !== terrain) return [];
			return [{ terrain, direction, picture: pictureOf(terrain, realm.variants[index]), other: pictureOf(terrain, realm.variants[at]) }];
		});
	});
}

/** @returns {boolean} Whether a hex shows one of a group's pictures. */
const isJoined = (realm, place) => {
	const index = hexIndex(g, place);
	return pictureOf(realm.terrain[index], realm.variants[index]) >= pictureCount(realm.terrain[index]);
};

const blankRealm = () => ({ ...emptyRealm(g, "pictures"), variants: new Array(g.cols * g.rows).fill(0) });

describe("pictureCount and rollFor", () => {
	it("counts the skin's own picture with those a hex shows alone", () => {
		expect(pictureCount(PEAKS)).toBe(13);
		expect(pictureCount(LAKE)).toBe(1);
	});

	it("rolls each terrain's pictures as often as each other", () => {
		for (let terrain = 1; terrain <= TERRAIN.length; terrain++) expect(PICTURE_ROLL % pictureCount(terrain)).toBe(0);
	});

	it("rolls past PICTURE_ROLL for a group's pictures, and back again", () => {
		const first = pictureCount(CRAG);
		expect(rollFor(CRAG, first)).toBe(PICTURE_ROLL + 1);
		expect(pictureOf(CRAG, rollFor(CRAG, first + 3))).toBe(first + 3);
		expect(pictureOf(CRAG, rollFor(CRAG, 0))).toBe(0);
		// A roll past the last picture shows the skin's own.
		expect(pictureOf(CRAG, PICTURE_ROLL + 99)).toBe(0);
	});
});

describe("pickPicture", () => {
	it("picks the picture that stood on the same side of a neighbour's on the example map", () => {
		const realm = blankRealm();
		// Peaks' first traced picture stood at 1,4; 1,5 was south of it, and 1,6 south again.
		realm.terrain[hexIndex(g, hex(4, 4))] = PEAKS;
		realm.variants[hexIndex(g, hex(4, 4))] = 1;
		realm.terrain[hexIndex(g, hex(4, 6))] = PEAKS;
		realm.variants[hexIndex(g, hex(4, 6))] = 3;
		realm.terrain[hexIndex(g, hex(4, 5))] = PEAKS;
		expect(pictureOf(PEAKS, pickPicture(g, realm, hex(4, 5), PEAKS, Math.random))).toBe(2);
	});

	it("doesn't show a neighbour's picture again when none fits", () => {
		const realm = blankRealm();
		realm.terrain[hexIndex(g, hex(4, 4))] = PEAKS;
		// The skin's own picture stood beside nothing on the example map.
		realm.variants[hexIndex(g, hex(4, 4))] = pictureCount(PEAKS);
		realm.terrain[hexIndex(g, hex(4, 5))] = PEAKS;
		for (const roll of [0, 0.3, 0.99]) {
			expect(pictureOf(PEAKS, pickPicture(g, realm, hex(4, 5), PEAKS, () => roll))).not.toBe(0);
		}
	});
});

describe("painting a group drawn as one", () => {
	// The example map's ridge of crags runs south-east four hexes from an odd column.
	const ridge = [hex(3, 5)];
	for (let step = 0; step < 3; step++) ridge.push(neighbour(g, ridge.at(-1), 0));

	it("lays the whole group along a stroke of its shape", () => {
		const painted = paintTerrain(blankRealm(), g, ridge, CRAG, () => 0.5);
		expect(ridge.map((place) => pictureOf(CRAG, painted.variants[hexIndex(g, place)]))).toEqual([0, 1, 2, 3].map((n) => pictureCount(CRAG) + n));
		expect(brokenPictures(g, painted)).toEqual([]);
	});

	it("never lays part of one, nor one on a single hex", () => {
		expect(ridge.slice(0, 3).some((place) => isJoined(paintTerrain(blankRealm(), g, ridge.slice(0, 3), CRAG), place))).toBe(false);
		expect(isJoined(paintTerrain(blankRealm(), g, [ridge[0]], CRAG), ridge[0])).toBe(false);
	});

	it("picks the rest again when one of its hexes is painted, so none is left broken", () => {
		const laid = paintTerrain(blankRealm(), g, ridge, CRAG, () => 0.5);
		const stepped = paintTerrain(laid, g, [ridge[1]], CRAG);
		expect(pictureOf(CRAG, stepped.variants[hexIndex(g, ridge[1])])).toBeLessThan(pictureCount(CRAG));
		expect(brokenPictures(g, stepped)).toEqual([]);
		expect(ridge.some((place) => isJoined(stepped, place))).toBe(false);

		const repainted = paintTerrain(laid, g, [ridge[2]], PEAKS);
		expect(brokenPictures(g, repainted)).toEqual([]);
		expect(ridge.some((place) => isJoined(repainted, place))).toBe(false);
	});

	it("leaves the terrain a stroke passes over as it was, so extending a patch keeps its pictures", () => {
		const laid = paintTerrain(blankRealm(), g, ridge, CRAG, () => 0.5);
		const beyond = neighbour(g, ridge.at(-1), 0);
		const extended = paintTerrain(laid, g, [...ridge, beyond], CRAG, () => 0.5);
		expect(ridge.map((place) => extended.variants[hexIndex(g, place)])).toEqual(ridge.map((place) => laid.variants[hexIndex(g, place)]));
		expect(extended.variants[hexIndex(g, beyond)]).toBeGreaterThan(0);
		expect(paintTerrain(laid, g, ridge, CRAG)).toBe(laid);
	});

	it("never lays one over a river or a Holding, and picks one again that a new one cuts through", () => {
		const wet = { ...blankRealm(), rivers: [[ridge[1], neighbour(g, ridge[1], 1)]] };
		const painted = paintTerrain(wet, g, ridge, CRAG, () => 0.5);
		expect(ridge.some((place) => isJoined(painted, place))).toBe(false);

		const laid = paintTerrain(blankRealm(), g, ridge, CRAG, () => 0.5);
		const crossed = layRiver(laid, g, [ridge[2], neighbour(g, ridge[2], 1)]);
		expect(ridge.some((place) => isJoined(crossed, place))).toBe(false);
		expect(brokenPictures(g, crossed)).toEqual([]);
		const settled = placeFeature(laid, g, ridge[0], { kind: "holding", style: "castle" });
		expect(ridge.some((place) => isJoined(settled, place))).toBe(false);
		expect(brokenPictures(g, settled)).toEqual([]);
	});

	it("picks one again when the Realm's hexes are laid out another way and its hexes no longer lie as drawn", () => {
		const laid = paintTerrain(blankRealm(), g, ridge, CRAG, () => 0.5);
		const rows = realmGeometry({ layout: "evenRows" });
		expect(brokenPictures(rows, laid)).not.toEqual([]);
		const relaid = relayRealm(laid, rows);
		expect(brokenPictures(rows, relaid)).toEqual([]);
		expect(brokenPictures(g, laid)).toEqual([]);
	});
});

describe("rollPictures", () => {
	const realms = Array.from({ length: 30 }, (_, index) => generateRealm({ seed: `pictures-${index}`, geometry: g }));
	const all = realms.flatMap(pairs);

	it("keeps the pictures when only the rivers and Holdings are rolled again, but none cut through", () => {
		const setup = { roll: { terrain: false, myths: false, landmarks: false, barriers: false } };
		const rerolled = realms.map((base, index) => generateRealm({ seed: `reroll-${index}`, setup, geometry: g, base }));
		expect(rerolled.every((realm) => brokenPictures(g, realm).length === 0)).toBe(true);
		expect(rerolled.some((realm, index) => realm.variants.some((roll, at) => roll === realms[index].variants[at] && roll))).toBe(true);
	});

	it("lays many neighbours of one terrain as the example map drew them, and few alike", () => {
		const drawn = all.filter(({ terrain, picture, other, direction }) => laidAsDrawn(terrain, picture, other, direction));
		expect(drawn.length / all.length).toBeGreaterThan(0.25);
		expect(all.filter(({ picture, other }) => picture === other).length / all.length).toBeLessThan(0.05);
	});

	it("lays groups drawn as one whole, each at most once, and off rivers and Holdings", () => {
		let laid = 0;
		for (const realm of realms) {
			expect(brokenPictures(g, realm)).toEqual([]);
			const joinedHexes = allHexes(g).filter((place) => isJoined(realm, place));
			laid += joinedHexes.length;
			const pictures = joinedHexes.map((place) => `${realm.terrain[hexIndex(g, place)]}:${pictureOf(realm.terrain[hexIndex(g, place)], realm.variants[hexIndex(g, place)])}`);
			expect(new Set(pictures).size).toBe(pictures.length);
			const kept = new Set([...realm.rivers.flat(), ...realm.holdings.map((holding) => holding.hex)].map(hexKey));
			expect(joinedHexes.filter((place) => kept.has(hexKey(place)))).toEqual([]);
		}
		expect(laid).toBeGreaterThan(0);
	});

	it("rolls the same pictures from the same numbers", () => {
		const { terrain } = realms[0];
		expect(rollPictures(g, terrain, createRandom("same").float)).toEqual(rollPictures(g, terrain, createRandom("same").float));
		expect(rollPictures(g, terrain, createRandom("same").float).every((roll, index) => (terrain[index] ? roll >= 1 : roll === 0))).toBe(true);
	});
});
