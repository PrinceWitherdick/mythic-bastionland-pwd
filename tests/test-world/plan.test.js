import { describe, expect, it } from "vitest";
import { tinctureColor } from "../../module/rules/heraldry.js";
import { LAKE, emptyRealm } from "../../module/rules/realm.js";
import { generateRealm } from "../../module/rules/realm-generator.js";
import { edgeKey, hexDistance, hexKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { normaliseRealmSetup } from "../../module/rules/realm-setup.js";
import {
	HEXES_PER_DAY,
	armourKind,
	barriersBeside,
	companionActorData,
	heraldrySvg,
	isSteed,
	pickPlaces,
	propertyItems,
	realmRoad,
	seasonRoad
} from "../../module/test-world/plan.js";

describe("propertyItems", () => {
	it("splits a line into the weapons and armour it lists", () => {
		const { items, companions } = propertyItems(["Old sword (d8 hefty) and half-shield (A1), gambeson (A1)"]);
		expect(companions).toEqual([]);
		expect(items).toHaveLength(3);
		expect(items[0]).toMatchObject({ type: "weapon", name: "Old sword", system: { damage: "d8", hefty: true, long: false, equipped: true } });
		expect(items[1]).toMatchObject({ type: "armour", name: "Half-shield", system: { kind: "shield", armour: 1, damage: "", equipped: true } });
		expect(items[2]).toMatchObject({ type: "armour", name: "Gambeson", system: { kind: "coat", armour: 1, equipped: true } });
	});

	it("keeps a shield's Attack die, and what follows it as its description", () => {
		const [shield] = propertyItems(["Kite shield (d4, A1) painted with a lantern"]).items;
		expect(shield).toMatchObject({ type: "armour", name: "Kite shield", system: { kind: "shield", armour: 1, damage: "d4" } });
		expect(shield.system.description).toBe("<p>Painted with a lantern</p>");
	});

	it("reads a specialist weapon's extra die and when it applies (p12)", () => {
		const [spear] = propertyItems(["Hookspear (d8 hefty, +d8 against riders)"]).items;
		expect(spear.system).toMatchObject({ damage: "d8", hefty: true, specialist: { die: "d8", situation: "against riders" }, description: "" });
	});

	it("turns a stat line into a companion, with its trample and armour", () => {
		const { items, companions } = propertyItems(["Grey charger (VIG 12, CLA 8, SPI 5, 3GD, d6 trample, A1, hates the rain)"]);
		expect(items).toEqual([]);
		expect(companions).toEqual([{
			name: "Grey charger",
			text: "Grey charger (VIG 12, CLA 8, SPI 5, 3GD, d6 trample, A1, hates the rain)",
			stats: { vig: 12, cla: 8, spi: 5, guard: 3 },
			armour: 1,
			trample: "d6",
			attacks: [],
			notes: ["hates the rain"]
		}]);
	});

	it("leaves a line with nothing typed in it whole, commas and all", () => {
		const { items } = propertyItems(["Pouch of salt (keeps meat a Season), and a bone die"]);
		expect(items).toEqual([{ type: "gear", name: "Pouch of salt (keeps meat a Season), and a bone die" }]);
	});

	it("wears only the first piece of each armour type", () => {
		const { items } = propertyItems(["Mail (A1), padded coat (A1), helm (A1)"]);
		expect(items.map((item) => [item.system.kind, item.system.equipped])).toEqual([["coat", true], ["coat", false], ["helm", true]]);
	});

	it("names each piece of armour's type the way the sheet sorts them", () => {
		expect(armourKind("Round shield")).toBe("shield");
		expect(armourKind("Bronze buckler")).toBe("shield");
		expect(armourKind("Mail coif")).toBe("helm");
		expect(armourKind("Splint")).toBe("plates");
		expect(armourKind("Brigandine")).toBe("plates");
		expect(armourKind("Ringmail")).toBe("coat");
	});
});

describe("companionActorData", () => {
	it("makes an NPC of a companion, its trample a weapon", () => {
		const data = companionActorData({ name: "Grey charger", stats: { vig: 12, cla: 8, spi: 5, guard: 3 }, armour: 1, trample: "d6", notes: ["hates the rain"] });
		expect(data).toEqual({
			type: "npc",
			name: "Grey charger",
			system: {
				virtues: { vig: { value: 12, max: 12 }, cla: { value: 8, max: 8 }, spi: { value: 5, max: 5 } },
				guard: { value: 3, max: 3 },
				armour: 1,
				notes: "<p>Hates the rain</p>"
			},
			items: [{ type: "weapon", name: "Trample", system: { damage: "d6", trample: true, equipped: true } }]
		});
	});

	it("tells steeds from other companions", () => {
		expect(isSteed("Grey charger")).toBe(true);
		expect(isSteed("Nervous steed")).toBe(true);
		expect(isSteed("Loyal hawk")).toBe(false);
	});
});

describe("heraldrySvg", () => {
	const size = { width: 420, height: 498 };

	it("paints a plain field inside the shield", () => {
		const svg = heraldrySvg({ division: null, field: ["azure"] }, size);
		expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="420" height="498"/);
		expect(svg).toContain('<clipPath id="shield">');
		expect(svg).toContain(`fill="${tinctureColor("azure")}"`);
		expect(svg).not.toContain("<polygon");
	});

	it("paints each part of a division in its group's tincture", () => {
		const svg = heraldrySvg({ division: "perPale", field: ["or", "gules"] }, size);
		const fills = [...svg.matchAll(/<polygon [^>]*fill="([^"]+)"/g)].map((match) => match[1]);
		expect(fills).toEqual([tinctureColor("gules"), tinctureColor("or")]);
	});

	it("sets the charge at the fess point, tinted and filling its box", () => {
		const charge = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><path fill="#f3f3f3" stroke="#000" d="M0 0h200v100z"/></svg>';
		const svg = heraldrySvg({ division: null, field: ["sable"], charge: { svg: charge, tincture: "argent" } }, size);
		expect(svg).toMatch(/<svg x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+"><svg [^>]*width="100%" height="100%"/);
		expect(svg).toContain(`fill="${tinctureColor("argent")}"`);
		expect(svg.match(/<\/svg>/g)).toHaveLength(3);
	});
});

/** A small Realm of open ground, with no lakes, Barriers or features. */
function openRealm(cols = 5, rows = 5) {
	const g = realmGeometry({ cols, rows });
	const realm = emptyRealm(g);
	realm.terrain.fill(1);
	return { g, realm };
}

/** @returns {boolean} Whether each hex of a road is beside the one before it. */
const joined = (g, from, road) => road.every((hex, index) => hexDistance(g, index ? road[index - 1] : from, hex) === 1);

describe("realmRoad", () => {
	it("takes the shortest road between two hexes", () => {
		const { g, realm } = openRealm();
		const from = { col: 1, row: 1 };
		const to = { col: 5, row: 5 };
		const road = realmRoad(realm, g, from, to);
		expect(road.at(-1)).toEqual(to);
		expect(road).toHaveLength(hexDistance(g, from, to));
		expect(joined(g, from, road)).toBe(true);
	});

	it("goes round a Barrier rather than through it (p18)", () => {
		const { g, realm } = openRealm();
		const from = { col: 1, row: 3 };
		const to = { col: 2, row: 3 };
		realm.barriers.push({ id: null, edge: edgeKey(from, to), revealed: false });
		const road = realmRoad(realm, g, from, to);
		expect(road.length).toBeGreaterThan(1);
		expect(road.at(-1)).toEqual(to);
		expect(joined(g, from, road)).toBe(true);
		const edges = road.map((hex, index) => edgeKey(index ? road[index - 1] : from, hex));
		expect(edges).not.toContain(edgeKey(from, to));
	});

	it("keeps out of lakes where it can", () => {
		const { g, realm } = openRealm(3, 3);
		const from = { col: 1, row: 2 };
		const to = { col: 3, row: 2 };
		const direct = realmRoad(realm, g, from, to);
		for (const hex of direct.slice(0, -1)) realm.terrain[(hex.row - 1) * g.cols + (hex.col - 1)] = LAKE;
		const road = realmRoad(realm, g, from, to);
		expect(road.at(-1)).toEqual(to);
		expect(road.some((hex) => direct.slice(0, -1).some((lake) => hexKey(lake) === hexKey(hex)))).toBe(false);
	});

	it("is empty between a hex and itself", () => {
		const { g, realm } = openRealm();
		expect(realmRoad(realm, g, { col: 2, row: 2 }, { col: 2, row: 2 })).toEqual([]);
	});
});

describe("seasonRoad", () => {
	it("travels to each stop in turn, two hexes a day, marking each arrival", () => {
		const { g, realm } = openRealm(8, 8);
		const from = { col: 1, row: 1 };
		const stops = [{ name: "first", hex: { col: 1, row: 4 } }, { name: "second", hex: { col: 4, row: 4 } }];
		const { days, end } = seasonRoad(realm, g, from, stops);
		const steps = days.flat();
		expect(days.every((day) => day.length <= HEXES_PER_DAY)).toBe(true);
		expect(steps).toHaveLength(3 + hexDistance(g, stops[0].hex, stops[1].hex));
		expect(steps.filter((step) => step.arrive).map((step) => [step.arrive, step.hex])).toEqual(stops.map((stop) => [stop.name, stop.hex]));
		expect(end).toEqual(stops[1].hex);
	});

	it("can stop a hex short of the last stop", () => {
		const { g, realm } = openRealm();
		const to = { col: 1, row: 5 };
		const { days, end } = seasonRoad(realm, g, { col: 1, row: 1 }, [{ name: "myth", hex: to }], { stopShort: true });
		expect(days.flat()).toHaveLength(3);
		expect(hexDistance(g, end, to)).toBe(1);
		expect(days.flat().some((step) => step.arrive)).toBe(false);
	});
});

describe("barriersBeside", () => {
	it("finds the hidden Barriers touching the road walked, in the order it reached them", () => {
		const { realm } = openRealm();
		const walked = [{ col: 1, row: 1 }, { col: 1, row: 2 }, { col: 1, row: 3 }];
		realm.barriers.push(
			{ id: null, edge: edgeKey({ col: 1, row: 3 }, { col: 2, row: 3 }), revealed: false },
			{ id: null, edge: edgeKey({ col: 1, row: 1 }, { col: 2, row: 1 }), revealed: false },
			{ id: null, edge: edgeKey({ col: 1, row: 2 }, { col: 2, row: 2 }), revealed: true },
			{ id: null, edge: edgeKey({ col: 4, row: 4 }, { col: 5, row: 4 }), revealed: false }
		);
		expect(barriersBeside(realm, walked)).toEqual([realm.barriers[1].edge, realm.barriers[0].edge]);
	});
});

describe("pickPlaces", () => {
	const { cols, rows } = normaliseRealmSetup(null);
	const g = realmGeometry({ cols, rows });

	it.each(["gravenmoor", "ashby", "halehx"])("finds every place the story needs in a rolled Realm (%s)", (seed) => {
		const realm = generateRealm({ seed, geometry: g });
		const places = pickPlaces(realm, g);
		expect(places.seat.seat).toBe(true);
		expect(places.sanctum.type).toBe("sanctum");
		expect(places.sanctum.seer).toBeTruthy();
		expect(places.ruin.type).toBe("ruin");
		expect(places.tourney).not.toBe(places.seat);
		expect(places.domain).not.toBe(places.seat);
		expect(places.domain).not.toBe(places.tourney);
		expect(new Set(places.myths.map((myth) => myth.number)).size).toBe(3);
	});

	it("can walk from the Seat to every place without crossing a Barrier", () => {
		const realm = generateRealm({ seed: "gravenmoor", geometry: g });
		const { seat, sanctum, ruin, tourney, domain, myths } = pickPlaces(realm, g);
		for (const place of [sanctum, ruin, tourney, domain, ...myths]) {
			const road = realmRoad(realm, g, seat.hex, place.hex);
			expect(road.at(-1)).toEqual(place.hex);
			expect(joined(g, seat.hex, road)).toBe(true);
		}
	});
});
