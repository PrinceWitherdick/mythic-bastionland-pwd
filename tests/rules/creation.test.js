import { describe, expect, it } from "vitest";
import {
	DEFAULT_START,
	STANDARD_KIT,
	STARTS,
	knightItems,
	knightTypeFromName,
	knightUpdate,
	seerForKnight,
	seerInfo,
	startFor,
	takenKnights
} from "../../module/rules/creation.js";
import { rankForGlory } from "../../module/rules/glory.js";

// Names here are invented so no book text lives in the repository.

const lantern = {
	roll: "1-01",
	name: "The Lantern Knight",
	path: "mythic-bastionland-art/knights/1-01-lantern-knight.webp",
	token: "mythic-bastionland-art/knight-tokens/1-01-lantern-knight.webp",
	property: ["Hooked lamp (d8 hefty), coat (A1)", "Grumbling mule (VIG 9, GD 2)"],
	ability: { name: "Snuff Out", text: "Put out every flame you can see <at once>." },
	passion: { name: "Vigil", text: "Restore SPI when you keep watch all night." }
};
const glassSeer = {
	roll: "1-01",
	name: "The Glass Seer",
	path: "mythic-bastionland-art/seers/1-01-glass-seer.webp",
	stats: { vig: 8, cla: 13, spi: 16, guard: 3 },
	lines: ["Sees through <anything> made by hands.", "Wants the Lantern returned."]
};
const glassInfo = "<p><strong>VIG 8, CLA 13, SPI 16, 3GD</strong></p>"
	+ "<ul><li>Sees through &lt;anything&gt; made by hands.</li><li>Wants the Lantern returned.</li></ul>";

describe("STARTS", () => {
	it("lists Wanderer, Courtier and Ruler, each reaching its Rank", () => {
		expect(STARTS.map((start) => start.key)).toEqual(["wanderer", "courtier", "ruler"]);
		for (const start of STARTS) expect(rankForGlory(start.glory)).toBe(start.rank);
	});

	it("rolls the Wanderer's dice when unsure", () => {
		expect(startFor(DEFAULT_START)).toMatchObject({ virtues: "1d12 + 1d6", guard: "1d6", age: "young", glory: 0 });
		expect(startFor("nonsense").key).toBe(DEFAULT_START);
		expect(startFor("ruler")).toMatchObject({ virtues: "1d12 + 6", guard: "1d6 + 6", age: "mature", glory: 6 });
	});
});

describe("knightTypeFromName", () => {
	it("keeps the word between the article and Knight", () => {
		expect(knightTypeFromName("The Lantern Knight")).toBe("Lantern");
		expect(knightTypeFromName("Lantern")).toBe("Lantern");
		expect(knightTypeFromName(null)).toBe("");
	});
});

describe("takenKnights", () => {
	const entries = [lantern, { roll: "1-02", name: "The Bell Knight" }, { roll: "1-03", name: null }];

	it("maps each claimed roll to the character who has it", () => {
		const knights = [
			{ id: "a", name: "Sir Aled", knightType: "lantern" },
			{ id: "b", name: "Dame Brin", knightType: " Bell " },
			{ id: "c", name: "Nobody", knightType: "" }
		];
		expect(takenKnights(knights, entries)).toEqual(new Map([["1-01", "Sir Aled"], ["1-02", "Dame Brin"]]));
	});

	it("ignores the Knight being chosen for", () => {
		expect(takenKnights([{ id: "a", name: "Sir Aled", knightType: "Lantern" }], entries, "a").size).toBe(0);
	});
});

describe("knightUpdate", () => {
	it("sets everything that was chosen and rolled", () => {
		const update = knightUpdate({
			start: startFor("courtier"),
			virtues: { vig: 14, cla: 9, spi: 17 },
			guard: 7,
			knight: lantern,
			seer: glassSeer
		});
		expect(update).toEqual({
			"system.age": "mature",
			"system.glory": 3,
			"system.virtues.vig.value": 14,
			"system.virtues.vig.max": 14,
			"system.virtues.cla.value": 9,
			"system.virtues.cla.max": 9,
			"system.virtues.spi.value": 17,
			"system.virtues.spi.max": 17,
			"system.guard.value": 7,
			"system.guard.max": 7,
			"system.knightType": "Lantern",
			"system.seer": "The Glass Seer",
			"system.seerImg": glassSeer.path,
			"system.seerInfo": glassInfo,
			img: lantern.path,
			"prototypeToken.texture.src": lantern.token
		});
	});

	it("keeps the actor's picture when the Knight has no imported portrait", () => {
		const update = knightUpdate({ start: startFor("wanderer"), knight: { roll: "1-02", name: "The Bell Knight", path: null } });
		expect(update).toMatchObject({ "system.knightType": "Bell", "system.seer": "", "system.seerImg": "", "system.seerInfo": "" });
		expect(update).not.toHaveProperty("img");
		expect(update).not.toHaveProperty(["prototypeToken.texture.src"]);
	});

	it("leaves the token to follow the portrait when an older import saved no square", () => {
		const update = knightUpdate({ start: startFor("wanderer"), knight: { ...lantern, token: undefined } });
		expect(update.img).toBe(lantern.path);
		expect(update).not.toHaveProperty(["prototypeToken.texture.src"]);
	});

	it("leaves out what wasn't rolled or chosen", () => {
		expect(knightUpdate({ start: startFor("wanderer"), virtues: { vig: 11, cla: null } })).toEqual({
			"system.age": "young",
			"system.glory": 0,
			"system.virtues.vig.value": 11,
			"system.virtues.vig.max": 11
		});
	});
});

describe("seerInfo", () => {
	it("gives the stat line, then each trait as a bullet", () => {
		expect(seerInfo(glassSeer)).toBe(glassInfo);
	});

	it("keeps a Seer with only GD, or only traits", () => {
		expect(seerInfo({ stats: { vig: null, cla: null, spi: null, guard: 4 }, lines: [] })).toBe("<p><strong>4GD</strong></p>");
		expect(seerInfo({ stats: null, lines: ["Speaks only in riddles."] })).toBe("<ul><li>Speaks only in riddles.</li></ul>");
	});

	it("is blank when the text wasn't read", () => {
		expect(seerInfo(null)).toBe("");
		expect(seerInfo({ stats: null, lines: null })).toBe("");
	});
});

describe("seerForKnight", () => {
	const index = {
		knights: [lantern, { roll: "1-02", name: "The Bell Knight" }],
		seers: [glassSeer, { roll: "1-02", name: "The Salt Seer" }]
	};

	it("finds the Seer by name", () => {
		expect(seerForKnight(index, { seer: " the salt seer ", knightType: "Lantern" }).roll).toBe("1-02");
	});

	it("falls back on the Knight's own roll", () => {
		expect(seerForKnight(index, { seer: "", knightType: "lantern" })).toBe(glassSeer);
		expect(seerForKnight(index, { seer: "Someone Else", knightType: "Bell" }).name).toBe("The Salt Seer");
	});

	it("finds nobody without a match or an index", () => {
		expect(seerForKnight(index, { seer: "", knightType: "" })).toBeNull();
		expect(seerForKnight(index, { seer: "Nobody", knightType: "Candle" })).toBeNull();
		expect(seerForKnight(null, { seer: "The Glass Seer", knightType: "Lantern" })).toBeNull();
	});
});

describe("knightItems", () => {
	const kitNames = { dagger: "Dagger", torches: "Torches", rope: "Rope", rations: "Dry rations", camping: "Camping gear" };

	it("gives Property, Ability, Passion and the standard kit", () => {
		const items = knightItems(lantern, kitNames);
		expect(items.slice(0, 4)).toEqual([
			{ type: "gear", name: "Hooked lamp (d8 hefty), coat (A1)" },
			{ type: "gear", name: "Grumbling mule (VIG 9, GD 2)" },
			{ type: "ability", name: "Snuff Out", system: { description: "<p>Put out every flame you can see &lt;at once&gt;.</p>" } },
			{ type: "passion", name: "Vigil", system: { description: "<p>Restore SPI when you keep watch all night.</p>" } }
		]);
		expect(items.slice(4)).toEqual([
			{ type: "weapon", name: "Dagger", system: { damage: "d6" } },
			{ type: "gear", name: "Torches" },
			{ type: "gear", name: "Rope" },
			{ type: "gear", name: "Dry rations" },
			{ type: "gear", name: "Camping gear" }
		]);
	});

	it("still gives the kit without the Knight's text", () => {
		expect(knightItems(null, kitNames)).toHaveLength(STANDARD_KIT.length);
		expect(knightItems({ ...lantern, property: null, ability: null, passion: null }, kitNames)).toHaveLength(STANDARD_KIT.length);
	});
});
