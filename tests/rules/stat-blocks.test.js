import { describe, expect, it } from "vitest";
import {
	countsAsHeftyMounted,
	featsNamed,
	formatStatLine,
	isStructureBlock,
	npcFromStatBlock,
	parseArmour,
	parseAttacks,
	parseStatLine,
	splitCastName,
	statBlockFromText,
	structureFromStatBlock
} from "../../module/rules/stat-blocks.js";

// Stat blocks here are invented, in the book's format, so no book text lives in the repository.

describe("parseStatLine", () => {
	it("reads Virtues and GD, with anything after them", () => {
		expect(parseStatLine("VIG 12, CLA 9, SPI 14, 5GD")).toEqual({ stats: { vig: 12, cla: 9, spi: 14, guard: 5 }, rest: "" });
		expect(parseStatLine("vig 3, cla 18, spi 7, 11 GD. A2 (bark)")).toEqual({ stats: { vig: 3, cla: 18, spi: 7, guard: 11 }, rest: "A2 (bark)" });
	});

	it("reads GD alone, for things without Virtues", () => {
		expect(parseStatLine("8 GD, A3, counts as a structure")).toEqual({
			stats: { vig: null, cla: null, spi: null, guard: 8 },
			rest: "A3, counts as a structure"
		});
	});

	it("keeps Virtues within 0 to 19", () => {
		expect(parseStatLine("VIG 25, CLA 0, SPI 19, 2GD").stats).toMatchObject({ vig: 19, cla: 0, spi: 19 });
	});

	it("ignores lines that don't start with stats", () => {
		expect(parseStatLine("Riding goose (VIG 7, CLA 6, SPI 6, 5GD)")).toBeNull();
		expect(parseStatLine("2 javelins (d6)")).toBeNull();
		expect(parseStatLine(undefined)).toBeNull();
	});
});

describe("formatStatLine", () => {
	it("prints stats the way the book does", () => {
		expect(formatStatLine({ vig: 12, cla: 9, spi: 14, guard: 5 })).toBe("VIG 12, CLA 9, SPI 14, 5GD");
		expect(formatStatLine({ vig: null, cla: null, spi: null, guard: 3 })).toBe("3GD");
		expect(formatStatLine(null)).toBeNull();
	});

	it("takes other labels", () => {
		expect(formatStatLine({ vig: 1, cla: 2, spi: 3, guard: 4 }, { vig: "V", cla: "C", spi: "S", guard: " Garde" })).toBe("V 1, C 2, S 3, 4 Garde");
	});
});

describe("splitCastName", () => {
	it("takes the name before the first comma", () => {
		expect(splitCastName("The Lamplighter, Warden of Wicks")).toEqual({ name: "The Lamplighter", epithet: "Warden of Wicks" });
		expect(splitCastName("Tollmen, Abe, Brin & Cole")).toEqual({ name: "Tollmen", epithet: "Abe, Brin & Cole" });
		expect(splitCastName("Moth Swarm")).toEqual({ name: "Moth Swarm", epithet: "" });
		expect(splitCastName(null)).toEqual({ name: "", epithet: "" });
	});
});

describe("parseArmour", () => {
	it("reads the value and what the Armour is", () => {
		expect(parseArmour("A3 (quilted coat, tin plate, pot helm)")).toEqual({ armour: 3, note: "quilted coat, tin plate, pot helm", printed: "A3 (quilted coat, tin plate, pot helm)", rest: "" });
	});

	it("keeps every value when it changes with the situation, counting the first", () => {
		expect(parseArmour("A1 when awake, A3 asleep (shell)")).toEqual({ armour: 1, note: "A1 when awake, A3 asleep (shell)", printed: "A1 when awake, A3 asleep (shell)", rest: "" });
		expect(parseArmour("A2, or A4 when curled (plates)").note).toBe("A2, or A4 when curled (plates)");
	});

	it("hands back what follows the Armour", () => {
		expect(parseArmour("A1 (hard skin), tail (d8)")).toEqual({ armour: 1, note: "hard skin", printed: "A1 (hard skin)", rest: "tail (d8)" });
		expect(parseArmour("A2 (wax). Can Deny.")).toEqual({ armour: 2, note: "wax", printed: "A2 (wax)", rest: "Can Deny." });
		expect(parseArmour("A3. Treat as a structure.")).toEqual({ armour: 3, note: "", printed: "A3", rest: "Treat as a structure." });
	});

	it("ignores lines that don't start with Armour", () => {
		expect(parseArmour("A lantern that never dims")).toBeNull();
		expect(parseArmour("Armour 2-4 (varies)")).toBeNull();
	});
});

describe("parseAttacks", () => {
	it("reads each attack's dice, qualities and notes", () => {
		expect(parseAttacks("Hookstaff (d10 long, +d6 vs riders) or kick (d4)")).toEqual({
			attacks: [
				{ name: "Hookstaff", damage: "d10", qualities: ["long"], note: "+d6 vs riders" },
				{ name: "kick", damage: "d4", qualities: [], note: "", or: true }
			],
			rest: ""
		});
	});

	it("reads Blast, extra dice and ignored armour", () => {
		expect(parseAttacks("Bellow (2d8 blast)").attacks[0]).toMatchObject({ damage: "2d8", qualities: ["blast"] });
		expect(parseAttacks("Stomp (d6+d6 slow)").attacks[0]).toMatchObject({ damage: "d6+d6", qualities: ["slow"] });
		expect(parseAttacks("Needle (d6, ignores armour, once per day)").attacks[0]).toMatchObject({
			qualities: ["ignoresArmour"],
			note: "once per day"
		});
	});

	it("keeps the rest of the line, including parentheses without dice", () => {
		expect(parseAttacks("Cleaver (d8 hefty), shield (d4), sack of turnips")).toMatchObject({
			attacks: [{ name: "Cleaver" }, { name: "shield" }],
			rest: "sack of turnips"
		});
		expect(parseAttacks("Wind cloak (warm), gale (d10 blast)")).toMatchObject({ attacks: [{ name: "gale" }], rest: "Wind cloak (warm)" });
		expect(parseAttacks("flight, lash (d6)")).toMatchObject({ attacks: [{ name: "lash" }], rest: "flight" });
	});

	it("reads a weapon that counts as Hefty when mounted", () => {
		expect(parseAttacks("Tilting pole (d10 long, count as hefty if mounted)").attacks[0]).toMatchObject({
			qualities: ["long", "heftyMounted"],
			note: ""
		});
		expect(countsAsHeftyMounted("counts as hefty when mounted")).toBe(true);
		expect(countsAsHeftyMounted("count as hefty when braced")).toBe(false);
		expect(countsAsHeftyMounted(null)).toBe(false);
	});

	it("keeps a name that reads as one list", () => {
		expect(parseAttacks("Nipping, pecking, and flapping (d4)").attacks[0].name).toBe("Nipping, pecking, and flapping");
	});

	it("finds nothing on a line without dice", () => {
		expect(parseAttacks("Loves a warm hearth.")).toEqual({ attacks: [], rest: "Loves a warm hearth." });
	});
});

describe("featsNamed", () => {
	it("finds the Feats a character Can perform", () => {
		expect(featsNamed("Can Focus.")).toEqual(["focus"]);
		expect(featsNamed("Can only be seen at dusk. Can Smite and Deny.")).toEqual(["smite", "deny"]);
		expect(featsNamed("Canny and quick.")).toEqual([]);
	});
});

describe("npcFromStatBlock", () => {
	const block = {
		name: "The Lamplighter, Warden of Wicks",
		stats: { vig: 12, cla: 9, spi: 14, guard: 5 },
		lines: [
			"A2 (waxed leather, iron cap)",
			"Wick-hook (d8 hefty, +d6 vs the unlit) or snuffer (d6 blast), bundle of tapers",
			"Can Focus. Hates the dark."
		]
	};

	it("fills in the sheet from the stat block", () => {
		const npc = npcFromStatBlock(block);
		expect(npc.name).toBe("The Lamplighter");
		expect(npc.system).toEqual({
			epithet: "Warden of Wicks",
			virtues: { vig: { value: 12, max: 12 }, cla: { value: 9, max: 9 }, spi: { value: 14, max: 14 } },
			guard: { value: 5, max: 5 },
			armour: 2,
			armourNote: "waxed leather, iron cap",
			scale: "individual",
			structure: false,
			feats: { smite: false, focus: true, deny: false },
			notes: "<p>bundle of tapers</p><p>Can Focus. Hates the dark.</p>"
		});
		expect(npc.items).toEqual([
			{
				type: "weapon",
				name: "Wick-hook",
				system: {
					damage: "d8",
					equipped: true,
					hefty: true,
					long: false,
					slow: false,
					ranged: false,
					blast: false,
					ignoresArmour: false,
					nonLethal: false,
					trample: false,
					heftyMounted: false,
					description: "<p>+d6 vs the unlit</p>",
					either: "Wick-hook"
				}
			},
			{ type: "weapon", name: "Snuffer", system: expect.objectContaining({ damage: "d6", blast: true, description: "", either: "Wick-hook" }) }
		]);
	});

	it("makes attacks printed with \"or\" one or the other, and leaves those listed with commas or \"and\" together", () => {
		const either = (lines) => npcFromStatBlock({ name: "Beast", stats: null, lines }).items.map((item) => [item.name, item.system.either ?? ""]);
		expect(either(["Lash (d10 blast) or gnaw (3d10 slow) or spray with grit (d8 blast)"])).toEqual([
			["Lash", "Lash"], ["Gnaw", "Lash"], ["Spray with grit", "Lash"]
		]);
		expect(either(["Hooked talons (2d8) and tail (d10 blast)", "Barbs (2d6), sour spit (d8)"])).toEqual([
			["Hooked talons", ""], ["Tail", ""], ["Barbs", ""], ["Sour spit", ""]
		]);
		expect(either(["Pincers (2d4) or cold fire (d6 blast), bite (d6)"])).toEqual([
			["Pincers", "Pincers"], ["Cold fire", "Pincers"], ["Bite", ""]
		]);
	});

	it("leaves out scores the stat block doesn't give, and marks structures and Warbands", () => {
		const tower = npcFromStatBlock({ name: "The Candle Tower", stats: { vig: null, cla: null, spi: null, guard: 9 }, lines: ["A3, counts as a structure"] });
		expect(tower.system).not.toHaveProperty("virtues");
		expect(tower.system).toMatchObject({ guard: { value: 9, max: 9 }, armour: 3, structure: true });

		const riders = npcFromStatBlock({ name: "Moth Riders, Warband", stats: null });
		expect(riders.system).toMatchObject({ scale: "warband" });
		expect(riders.system).not.toHaveProperty("guard");
	});

	it("marks a swarm by its rule, even where the line breaks inside it (p61)", () => {
		const bats = npcFromStatBlock({ name: "Enthralled Bat Swarm", stats: null, lines: ["Stings (d4), individual attacks are Impaired", "save for a Blast."] });
		expect(bats.system.scale).toBe("swarm");
		expect(npcFromStatBlock({ name: "Foxes of the Imp's Court", stats: null, lines: ["Bite (d4), smouldering tails"] }).system.scale).toBe("individual");
		expect(npcFromStatBlock({ name: "Clawed Bee Swarm, Warband", stats: null, lines: ["Claws and stings (d6)"] }).system.scale).toBe("warband");
	});

	it("names an attack printed without a name, and escapes notes", () => {
		const imp = npcFromStatBlock({ name: "Imp", stats: null, lines: ["(d4)", "Loves <b>mischief</b> & jam."] }, { attackName: "Strike" });
		expect(imp.items[0].name).toBe("Strike");
		expect(imp.system.notes).toBe("<p>Loves &lt;b&gt;mischief&lt;/b&gt; &amp; jam.</p>");
	});
});

describe("structureFromStatBlock", () => {
	const seer = { name: "The Glass Seer", stats: { vig: null, cla: null, spi: null, guard: 6 }, lines: ["A3, treated as a Structure", "A tall figure of green glass, humming."] };

	it("tells a thing with only GD that counts as a structure from a creature that counts as one", () => {
		expect(isStructureBlock(seer)).toBe(true);
		expect(isStructureBlock({ name: "Mortar Golem", stats: { vig: 16, cla: 6, spi: 3, guard: 4 }, lines: ["A3 (mortared stone), count as a structure"] })).toBe(false);
		expect(isStructureBlock({ name: "Bearer", stats: { vig: null, cla: null, spi: null, guard: 2 }, lines: ["Hauls sacks"] })).toBe(false);
		expect(isStructureBlock({ name: "Imp", stats: null, lines: ["A3, counts as a structure"] })).toBe(false);
	});

	it("keeps GD, Armour and notes, leaving out that it's a structure", () => {
		expect(structureFromStatBlock(seer)).toEqual({
			name: "The Glass Seer",
			system: {
				kind: "structure",
				epithet: "",
				guard: { value: 6, max: 6 },
				armour: 3,
				armourNote: "",
				notes: "<p>A tall figure of green glass, humming.</p>"
			},
			items: []
		});

		const chariot = structureFromStatBlock({ name: "The Wagon, Ever Rolling", stats: { vig: null, cla: null, spi: null, guard: 5 }, lines: ["A2 (structure)", "Wheels (2d12 trample)"] });
		expect(chariot.system).toMatchObject({ epithet: "Ever Rolling", armour: 2, armourNote: "", notes: "" });
		expect(chariot.items[0]).toMatchObject({ type: "weapon", name: "Wheels", system: { damage: "2d12", trample: true } });

		const spire = structureFromStatBlock({ name: "The Mushroom Keep", stats: { vig: null, cla: null, spi: null, guard: 9 }, lines: ["count as a structure", "A2 (spongy walls)"] });
		expect(spire.system).toMatchObject({ armour: 2, armourNote: "spongy walls", notes: "" });
	});
});

describe("statBlockFromText", () => {
	it("reads a pasted stat block, rejoining wrapped lines", () => {
		const text = [
			"The Lamplighter, Warden",
			"of Wicks",
			"VIG 12, CLA 9, SPI 14, 5GD",
			"A2 (waxed leather, iron cap)",
			"Wick-hook (d8 hefty, +d6 vs the",
			"unlit) or snuffer (d6 blast)",
			"Hates the dark."
		].join("\r\n");
		expect(statBlockFromText(text)).toEqual({
			name: "The Lamplighter, Warden of Wicks",
			stats: { vig: 12, cla: 9, spi: 14, guard: 5 },
			lines: ["A2 (waxed leather, iron cap)", "Wick-hook (d8 hefty, +d6 vs the unlit) or snuffer (d6 blast)", "Hates the dark."]
		});
	});

	it("finds the stat line partway along a line, and gives no name without one", () => {
		expect(statBlockFromText("Moth Swarm VIG 5, CLA 10, SPI 3, 2GD Bites (d4)")).toEqual({
			name: "Moth Swarm",
			stats: { vig: 5, cla: 10, spi: 3, guard: 2 },
			lines: ["Bites (d4)"]
		});
		expect(statBlockFromText("VIG 5, CLA 10, SPI 3, 2GD").name).toBeNull();
	});

	it("needs a full stat line", () => {
		expect(statBlockFromText("A lantern\nA1 (glass)")).toBeNull();
		expect(statBlockFromText("")).toBeNull();
	});
});

describe("Cast weapons", () => {
	const attacks = (line) => npcFromStatBlock({ name: "Tester", stats: { vig: 10, cla: 10, spi: 10, guard: 3 }, lines: [line] }).items;

	it("counts the number carried off the front of a name", () => {
		const [firepots] = attacks("3 oil pots (d6 blast, leave the ground burning)");
		expect(firepots.name).toBe("Oil pots");
		expect(firepots.system).toMatchObject({ damage: "d6", blast: true, quantity: { value: 3, max: 3 }, usedUp: true });
		expect(firepots.system.description).toContain("Leave the ground burning");
	});

	it("keeps an attack used once a day to one, restocked each day", () => {
		const [scream] = attacks("Keening wail (d10 slow, ignore armour, once a day)");
		expect(scream.system).toMatchObject({ slow: true, ignoresArmour: true, quantity: { value: 1, max: 1 }, restock: "day", usedUp: true });
	});

	it("reads another way to fight from an \"or\"", () => {
		const [crush] = attacks("Crush (2d12 or d12 blast)");
		expect(crush.system.damage).toBe("2d12");
		expect(crush.system.alternate).toEqual({ label: "blast", damage: "d12", blast: true });
		expect(crush.system.description).toBe("");
	});

	it("leaves an ordinary attack uncounted", () => {
		const [claws] = attacks("Claws and teeth (2d6)");
		expect(claws.system).not.toHaveProperty("quantity");
		expect(claws.system).not.toHaveProperty("alternate");
		expect(claws.system).not.toHaveProperty("usedUp");
	});

	it("leaves counted weapons that can be picked up again unspent", () => {
		const [javelins] = attacks("2 javelins (d6 ranged)");
		expect(javelins.system).toMatchObject({ quantity: { value: 2, max: 2 } });
		expect(javelins.system).not.toHaveProperty("usedUp");
	});
});
