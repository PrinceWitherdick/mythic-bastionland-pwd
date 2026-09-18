import { describe, expect, it } from "vitest";
import {
	GOODS_ACTOR_KINDS,
	GOODS_ITEM_KINDS,
	GOODS_KIND_PAGES,
	GOODS_KINDS,
	goodsDocuments,
	goodsFromPages
} from "../../module/rules/arms-and-goods.js";

// Everything here is invented so no book text lives in the repository.

/** A pdf.js text item for one printed line. */
const line = (str, x, y, size = 11) => ({ str, transform: [size, 0, 0, size, x, y], width: str.length * size * 0.5 });

const LEFT = 70.9;
const RIGHT = 308.8;

const warfare = [
	line("WARBANDS", LEFT, 640),
	line("• Many fighters acting as one.", LEFT, 629),
	line("WOOD AND STONE", LEFT, 600),
	line("Walls stop most things.", LEFT, 589),
	line("Palisade: 6GD, A1", LEFT, 570),
	line("Raft: 3GD, carries 4 passengers", LEFT, 559),
	line("ARTILLERY AND SIEGERY", LEFT, 540),
	line("Mantlet: 5GD, A1", LEFT, 529),
	line("Catapult: 2d12 blast, immobile", LEFT, 518),
	line("WARBANDS", RIGHT, 640),
	line("Peasants: VIG 8, CLA 8, SPI 6, 2GD", RIGHT, 629),
	line("Pitchforks (d6 long)", RIGHT, 618),
	line("Cavalry: VIG 11, CLA 11, SPI 9, 3GD", RIGHT, 599),
	line("A2 (helm, shield)", RIGHT, 588),
	line("Lance (d10 long), shield (d4), warhorse (d8", RIGHT, 577),
	line("trample)", RIGHT, 566)
];

const arms = [
	line("Gear & Stuff", 145, 664.8, 54),
	line("BUYING THINGS", LEFT, 640),
	line("Barter works: offer what they value.", LEFT, 629),
	line("COMMON WEAPONS", LEFT, 600),
	line("Farm Tools: d6 hefty (scythe, flail)", LEFT, 589),
	line("Throwing Stick: d4", LEFT, 578),
	line("Hunting Bow: d6 long", LEFT, 567),
	line("UNCOMMON WEAPONS", LEFT, 548),
	line("Pike: d10 long, count as hefty when braced", LEFT, 537),
	line("COMMON ARMOUR", RIGHT, 640),
	line("Shield: d4, A1 (buckler, targe)", RIGHT, 629),
	line("RARE ARMOUR", RIGHT, 610),
	line("Plates: A1 (heavy plate worn over a", RIGHT, 599),
	line("coat, hard to take off)", RIGHT, 588),
	line("TOOLS", RIGHT, 569),
	line("Common Tools: Rake, bucket,", RIGHT, 558),
	line("lantern", RIGHT, 547),
	line("COMMON BEASTS", RIGHT, 528),
	line("Goat: VIG 4, CLA 6, SPI 8, 1GD, d4 headbutt", RIGHT, 517),
	line("RARE BEASTS", RIGHT, 498),
	line("Warhorse: VIG 12, CLA 4, SPI 6, 4GD, d10 trample", RIGHT, 487),
	line("REMEDIES (All Uncommon)", RIGHT, 468),
	line("Broth: A hot meal for everyone.", RIGHT, 457),
	line("Used to recover VIG.", RIGHT, 446),
	line("POISONS", RIGHT, 427),
	line("Rare: A long sleep", RIGHT, 416)
];

const people = [
	line("SERVICE", LEFT, 640),
	line("Roll their Virtues as usual.", LEFT, 629),
	line("COMMON", LEFT, 610),
	line("Porter: 2GD", LEFT, 599),
	line("Carries a lot of baggage", LEFT, 588),
	line("UNCOMMON", LEFT, 569),
	line("Crossbowman: 4GD", LEFT, 558),
	line("A1 (padded coat)", LEFT, 547),
	line("Heavy crossbow (d8 slow)", LEFT, 536),
	line("REALMS", RIGHT, 640),
	line("• Some words about the world: none of it gear.", RIGHT, 627)
];

describe("goodsFromPages", () => {
	const goods = goodsFromPages([warfare, arms, people]);

	it("gives a list for every kind", () => {
		expect(Object.keys(goods)).toEqual([...GOODS_KINDS]);
		expect(goodsFromPages([])).toEqual(Object.fromEntries(GOODS_KINDS.map((kind) => [kind, []])));
	});

	it("reads weapons, one for each example a line names", () => {
		expect(goods.weapons.map((weapon) => weapon.name)).toEqual(["Catapult", "Scythe", "Flail", "Throwing Stick", "Hunting Bow", "Pike"]);
		const [catapult, scythe, , stick, bow, pike] = goods.weapons;
		expect(scythe).toEqual({ name: "Scythe", damage: "d6", qualities: ["hefty"], note: "", rarity: "common", group: "Farm Tools", siege: false });
		expect(stick).toMatchObject({ damage: "d4", qualities: [], group: null });
		expect(bow.qualities).toEqual(["long", "ranged"]);
		expect(pike).toMatchObject({ rarity: "uncommon", qualities: ["long"], note: "count as hefty when braced" });
		expect(catapult).toMatchObject({ damage: "2d12", qualities: ["blast", "ranged"], note: "immobile", rarity: null, siege: true });
	});

	it("reads armour by its kind, keeping what it is", () => {
		expect(goods.armour).toEqual([
			{ name: "Shield", kind: "shield", rarity: "common", armour: 1, damage: "d4", note: "buckler, targe" },
			{ name: "Plates", kind: "plates", rarity: "rare", armour: 1, damage: "", note: "heavy plate worn over a coat, hard to take off" }
		]);
	});

	it("reads each tool on a line, even one wrapped onto the next", () => {
		expect(goods.tools).toEqual([
			{ name: "Rake", rarity: "common" },
			{ name: "Bucket", rarity: "common" },
			{ name: "Lantern", rarity: "common" }
		]);
	});

	it("reads Remedies with the Virtue they recover, and poisons by rarity", () => {
		expect(goods.remedies).toEqual([{ name: "Broth", rarity: "uncommon", virtue: "vig", note: "A hot meal for everyone. Used to recover VIG." }]);
		expect(goods.poisons).toEqual([{ rarity: "rare", note: "A long sleep" }]);
	});

	it("reads beasts, turning their attack into a stat block's", () => {
		expect(goods.beasts).toEqual([
			{ name: "Goat", rarity: "common", stats: { vig: 4, cla: 6, spi: 8, guard: 1 }, lines: ["Headbutt (d4)"] },
			{ name: "Warhorse", rarity: "rare", stats: { vig: 12, cla: 4, spi: 6, guard: 4 }, lines: ["Trample (d10 trample)"] }
		]);
	});

	it("reads hirelings, who give only GD", () => {
		expect(goods.hirelings).toEqual([
			{ name: "Porter", rarity: "common", stats: { vig: null, cla: null, spi: null, guard: 2 }, lines: ["Carries a lot of baggage"] },
			{ name: "Crossbowman", rarity: "uncommon", stats: { vig: null, cla: null, spi: null, guard: 4 }, lines: ["A1 (padded coat)", "Heavy crossbow (d8 slow)"] }
		]);
	});

	it("reads Warbands, joining an attack wrapped over two lines", () => {
		expect(goods.warbands.map((warband) => warband.name)).toEqual(["Peasants", "Cavalry"]);
		expect(goods.warbands[1]).toEqual({
			name: "Cavalry",
			rarity: null,
			stats: { vig: 11, cla: 11, spi: 9, guard: 3 },
			lines: ["A2 (helm, shield)", "Lance (d10 long), shield (d4), warhorse (d8 trample)"]
		});
	});

	it("reads structures, ships and siege towers", () => {
		expect(goods.structures).toEqual([
			{ name: "Palisade", guard: 6, armour: 1, note: "", siege: false },
			{ name: "Raft", guard: 3, armour: 0, note: "carries 4 passengers", siege: false },
			{ name: "Mantlet", guard: 5, armour: 1, note: "", siege: true }
		]);
	});
});

describe("goodsDocuments", () => {
	const labels = {
		rarities: { common: "Common", uncommon: "Uncommon", rare: "Rare" },
		siege: "Siege engine",
		poison: (rarity) => `${rarity} poison`,
		rollVirtues: "Roll their Virtues.",
		attack: "Attack"
	};
	const { items, actors } = goodsDocuments(goodsFromPages([warfare, arms, people]), labels);

	it("files every kind as items or NPCs, and knows where each is printed", () => {
		expect(Object.keys(items)).toEqual([...GOODS_ITEM_KINDS]);
		expect(Object.keys(actors)).toEqual([...GOODS_ACTOR_KINDS]);
		expect([...GOODS_ITEM_KINDS, ...GOODS_ACTOR_KINDS].sort()).toEqual([...GOODS_KINDS].sort());
		expect(Object.keys(GOODS_KIND_PAGES).sort()).toEqual([...GOODS_KINDS].sort());
	});

	it("makes weapons with their qualities, rarity and note", () => {
		const scythe = items.weapons.find((weapon) => weapon.name === "Scythe");
		expect(scythe).toEqual({
			type: "weapon",
			name: "Scythe",
			system: { damage: "d6", hefty: true, long: false, slow: false, ranged: false, blast: false, heftyMounted: false, equipped: true, description: "<p>Common · Farm Tools</p>" }
		});
		const pike = items.weapons.find((weapon) => weapon.name === "Pike");
		expect(pike.system.description).toBe("<p>Uncommon</p><p>Count as hefty when braced</p>");
		// Braced isn't mounted, so only a note says so.
		expect(pike.system.heftyMounted).toBe(false);
		expect(items.weapons.find((weapon) => weapon.name === "Catapult").system).toMatchObject({ blast: true, ranged: true, description: "<p>Siege engine</p><p>Immobile</p>" });
	});

	it("makes armour, tools, Remedies that know their Virtue, and poisons", () => {
		expect(items.armour[0]).toMatchObject({ type: "armour", name: "Shield", system: { kind: "shield", armour: 1, damage: "d4" } });
		expect(items.tools.map((tool) => tool.name)).toEqual(["Rake", "Bucket", "Lantern"]);
		expect(items.remedies[0]).toMatchObject({ type: "gear", name: "Broth", system: { remedy: "vig" } });
		expect(items.poisons[0]).toEqual({ type: "gear", name: "rare poison", system: { description: "<p>A long sleep</p>" } });
	});

	it("makes beasts, hirelings and Warbands as NPCs", () => {
		const warhorse = actors.beasts.find((beast) => beast.name === "Warhorse");
		expect(warhorse.system.virtues.vig).toEqual({ value: 12, max: 12 });
		expect(warhorse.items[0]).toMatchObject({ type: "weapon", name: "Trample", system: { damage: "d10", trample: true } });

		const porter = actors.hirelings.find((hireling) => hireling.name === "Porter");
		expect(porter.system.virtues).toBeUndefined();
		expect(porter.system.guard).toEqual({ value: 2, max: 2 });
		expect(porter.system.notes).toBe("<p>Common</p><p>Roll their Virtues.</p><p>Carries a lot of baggage</p>");

		const cavalry = actors.warbands.find((warband) => warband.name === "Cavalry");
		expect(cavalry.system).toMatchObject({ scale: "warband", armour: 2 });
		expect(cavalry.items.map((item) => item.name)).toEqual(["Lance", "Shield", "Warhorse"]);

	});

	it("makes structures, ships and siege engines as Structures, with what a ship carries", () => {
		expect(actors.structures.map((structure) => [structure.type, structure.name, structure.system.kind])).toEqual([
			["structure", "Palisade", "structure"],
			["structure", "Raft", "ship"],
			["structure", "Mantlet", "siege"]
		]);
		expect(actors.structures[1]).toEqual({
			type: "structure",
			name: "Raft",
			system: { kind: "ship", guard: { value: 3, max: 3 }, armour: 0, carries: "4 passengers", notes: "" },
			items: []
		});
	});
});
