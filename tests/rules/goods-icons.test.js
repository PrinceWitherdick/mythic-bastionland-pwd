import { describe, expect, it } from "vitest";
import { GOODS_ICONS, GOODS_ICON_ROOT, goodsActorIcon, goodsIconCredit, goodsIconCredits, goodsIconNotice, goodsItemIcon } from "../../module/rules/goods-icons.js";

/** The picture's key, so a failure reads "broadsword" rather than a path. */
const itemKey = (type, name, system) => goodsItemIcon({ type, name, system })?.slice(GOODS_ICON_ROOT.length + 1, -4) ?? null;
const actorKey = (type, name) => goodsActorIcon({ type, name })?.slice(GOODS_ICON_ROOT.length + 1, -4) ?? null;

describe("goodsItemIcon", () => {
	it("gives Arms & Goods (p12, p11) a picture each", () => {
		const weapons = {
			Pitchfork: "pitchfork", Hatchet: "hatchet", Staff: "wood-stick", "Logging Axe": "wood-axe", Pick: "war-pick",
			Dagger: "plain-dagger", Club: "wood-club", Handaxe: "hatchet", Spear: "barbed-spear", Mace: "flanged-mace", Axe: "battle-axe",
			Poleaxe: "halberd", Billhook: "halberd", Sling: "sling", Javelin: "spears", Shortbow: "bow-arrow", Shortsword: "broadsword",
			Lance: "barbed-spear", Greataxe: "battle-axe", Maul: "warhammer", Longbow: "bow-string", Longsword: "broadsword",
			Greatsword: "two-handed-sword", Curvebow: "pocket-bow", Crossbow: "crossbow",
			"Battering Ram": "siege-ram", "Stone Thrower": "catapult", "Bolt Launcher": "ballista", Trebuchet: "trebuchet"
		};
		for (const [name, key] of Object.entries(weapons)) expect([name, itemKey("weapon", name)]).toEqual([name, key]);

		const armour = { Shield: "shield", Coat: "leather-vest", Helm: "visored-helm", Plates: "breastplate" };
		for (const [name, key] of Object.entries(armour)) expect([name, itemKey("armour", name)]).toEqual([name, key]);

		const gear = {
			Saw: "hand-saw", "Fishing Rod": "fishing-pole", "Sewing Set": "sewing-needle", Candles: "candles", Shovel: "spade", Flute: "flute",
			"Animal Trap": "wolf-trap", "Smithing Tools": "anvil", "Herbalist Kit": "herbs-bundle", "Scribe Set": "quill-ink", Lute: "harp",
			"Alchemy Tools": "round-bottom-flask", "Crystal Ball": "crystal-ball", "Extravagant Harp": "harp",
			Sustenance: "roast-chicken", Stimulant: "herbs-bundle", Sacrament: "incense", "Rare poison": "poison-bottle"
		};
		for (const [name, key] of Object.entries(gear)) expect([name, itemKey("gear", name)]).toEqual([name, key]);
	});

	it("reads a Knight's Property by its words, whatever it's called", () => {
		expect(itemKey("weapon", "Polished mace")).toBe("flanged-mace");
		expect(itemKey("weapon", "Spiny mace")).toBe("spiked-mace");
		expect(itemKey("weapon", "Morningstar")).toBe("spiked-mace");
		expect(itemKey("weapon", "3 Rider’s Axes")).toBe("hatchet");
		expect(itemKey("weapon", "Splittingaxe")).toBe("wood-axe");
		expect(itemKey("weapon", "Two-pronged pike")).toBe("trident");
		expect(itemKey("weapon", "Greatlance")).toBe("barbed-spear");
		expect(itemKey("weapon", "Ancient greatblade")).toBe("two-handed-sword");
		expect(itemKey("weapon", "Needledagger")).toBe("plain-dagger");
		expect(itemKey("weapon", "Rootbow")).toBe("bow-arrow");
		expect(itemKey("armour", "Mail coif")).toBe("visored-helm");
		expect(itemKey("armour", "Bronze buckler")).toBe("viking-shield");
		expect(itemKey("armour", "Iron chestplate")).toBe("breastplate");
		expect(itemKey("armour", "Brass-studded brigandine")).toBe("armor-vest");
		expect(itemKey("gear", "Ring of keys (one of them fits most doors)")).toBe("key");
		expect(itemKey("gear", "Flickerlamp (a warm lantern)")).toBe("lantern");
		expect(itemKey("gear", "Sack of books")).toBe("book-cover");
	});

	it("puts polearms before the blades on them, and weapons before a beast's own", () => {
		expect(itemKey("weapon", "Pole sickle")).toBe("halberd");
		expect(itemKey("weapon", "Blade-staff")).toBe("halberd");
		expect(itemKey("weapon", "Fang blades")).toBe("broadsword");
		expect(itemKey("weapon", "Bite")).toBe("fangs");
		expect(itemKey("weapon", "Talons")).toBe("claws");
		expect(itemKey("weapon", "Trample")).toBe("hoof");
		// Armour before the cloak worn over it, the plate before its pauldrons.
		expect(itemKey("armour", "Red cloaked mail")).toBe("mail-shirt");
		expect(itemKey("armour", "Plate pauldrons")).toBe("pauldrons");
	});

	it("reads only the lead words, not the gloss after them", () => {
		expect(itemKey("gear", "Cleaner salt (scrubs any pot bright)")).toBe("knapsack");
		expect(itemKey("gear", "Pouch of acorns (squirrels adore them), a song on a scrap of vellum")).toBe("swap-bag");
	});

	it("keeps words from matching inside others", () => {
		expect(itemKey("weapon", "Pillar of inscribed stone")).toBe("crossed-swords");
		expect(itemKey("gear", "Inscribed scabbard")).toBe("broadsword");
		expect(itemKey("gear", "Sharp stone")).toBe("knapsack");
		expect(itemKey("gear", "Leather strap")).toBe("leather-vest");
		expect(itemKey("gear", "Childhood toy")).toBe("knapsack");
	});

	it("falls back on the item's type, and armour on its kind", () => {
		expect(itemKey("weapon", "Titan beads")).toBe("crossed-swords");
		expect(itemKey("gear", "Tattoos")).toBe("knapsack");
		expect(itemKey("armour", "Salvaged harness", { kind: "helm" })).toBe("visored-helm");
		expect(itemKey("armour", "Something odd", {})).toBe("breastplate");
	});

	it("gives Abilities, Passions and Scars nothing", () => {
		for (const type of ["ability", "passion", "scar"]) expect(goodsItemIcon({ type, name: "Sword oath" })).toBeNull();
	});
});

describe("goodsActorIcon", () => {
	it("gives the beasts, hirelings, Warbands and structures of p11 to p13 a picture each", () => {
		const actors = {
			Hound: "hound", "Sheep or Pig": "sheep", Pony: "horse-head", Mule: "donkey", Ox: "bull", Hawk: "eagle-head",
			"Riding Steed": "horse-head", "Heavy Steed": "horse-head", Charger: "horse-head",
			Servant: "broom", Guide: "direction-signs", Sentry: "pikeman", Herbalist: "herbs-bundle", "Soldier-at-Arms": "swordman", Archer: "archer",
			Sage: "wizard-face", Alchemist: "fizzing-flask", Sellsword: "swordman",
			Militia: "pikeman", Skirmishers: "archer", Mercenaries: "swordman", Riders: "cavalry", Knights: "mounted-knight"
		};
		for (const [name, key] of Object.entries(actors)) expect([name, actorKey("npc", name)]).toEqual([name, key]);

		const structures = {
			Gate: "medieval-gate", Rampart: "rempart", "Castle Wall": "stone-wall", Rowboat: "canoe", Longship: "drakkar",
			Warship: "galleon", "Siege Tower": "siege-tower"
		};
		for (const [name, key] of Object.entries(structures)) expect([name, actorKey("structure", name)]).toEqual([name, key]);
	});

	it("knows a steed by any of the book's names for one, with the Knight's name after it", () => {
		expect(actorKey("npc", "Well-groomed steed (Alex)")).toBe("horse-head");
		expect(actorKey("npc", "Bullish warhorse")).toBe("horse-head");
		expect(actorKey("npc", "Bearded steed")).toBe("horse-head");
		expect(actorKey("npc", "Horned stallion")).toBe("horse-head");
		expect(actorKey("npc", "Loyal bird")).toBe("raven");
		expect(actorKey("npc", "Caged bug")).toBe("beetle-shell");
	});

	it("puts riders before their horses, and keeps names from matching inside others", () => {
		expect(actorKey("npc", "Horsemen")).toBe("cavalry");
		expect(actorKey("npc", "Wallace")).toBeNull();
		expect(actorKey("npc", "Lambert")).toBeNull();
		expect(actorKey("npc", "Scorpion")).toBeNull();
		expect(actorKey("npc", "The one who does not sleep")).toBeNull();
	});

	it("gives Knights and the GM Toolkit nothing, as they have portraits", () => {
		expect(goodsActorIcon({ type: "knight", name: "Sir Hound" })).toBeNull();
		expect(goodsActorIcon({ type: "gmToolkit", name: "Hound" })).toBeNull();
	});
});

describe("credits", () => {
	it("credits each icon's artist and page on game-icons.net", () => {
		expect(goodsIconCredit("broadsword")).toEqual({
			title: "Broadsword",
			artist: "Lorc",
			url: "https://lorcblog.blogspot.com",
			page: "https://game-icons.net/1x1/lorc/broadsword.html"
		});
		expect(goodsIconCredit("fangs")).toMatchObject({ artist: "Skoll", page: "https://game-icons.net/1x1/skoll/fangs.html" });
		for (const key of Object.keys(GOODS_ICONS)) {
			expect(goodsIconCredit(key).artist).toBeTruthy();
			// It goes in an XML comment, which may not hold two hyphens in a row.
			expect(goodsIconNotice(key)).not.toContain("--");
			expect(goodsIconNotice(key)).toContain("CC BY 3.0");
		}
	});

	it("lists every icon in the credits file", () => {
		const credits = goodsIconCredits();
		for (const key of Object.keys(GOODS_ICONS)) expect(credits).toContain(`\`${key}.svg\``);
		expect(credits).toContain("https://creativecommons.org/licenses/by/3.0/");
	});
});
