import { describe, expect, it } from "vitest";
import {
	DEFAULT_START,
	STANDARD_KIT,
	STARTS,
	knightItems,
	knightTypeFromName,
	knightUpdate,
	seerAutoFill,
	seerForKnight,
	seerBook,
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
const glassInfo = "<ul><li>Sees through &lt;anything&gt; made by hands.</li><li>Wants the Lantern returned.</li></ul>";
// What the book gives them, kept as data rather than printed in the text.
const glassBook = { vig: 8, cla: 13, spi: 16, guard: 3, armour: 0, structure: false };

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
			"system.seerBook": glassBook,
			img: lantern.path,
			"prototypeToken.texture.src": lantern.token
		});
	});

	it("keeps the actor's picture when the Knight has no imported portrait", () => {
		const update = knightUpdate({ start: startFor("wanderer"), knight: { roll: "1-02", name: "The Bell Knight", path: null } });
		expect(update).toMatchObject({ "system.knightType": "Bell", "system.seer": "", "system.seerImg": "", "system.seerInfo": "", "system.seerBook": null });
		expect(update).not.toHaveProperty("img");
		expect(update).not.toHaveProperty(["prototypeToken.texture.src"]);
	});

	it("leaves the token to follow the portrait when an older import saved no square", () => {
		const update = knightUpdate({ start: startFor("wanderer"), knight: { ...lantern, token: undefined } });
		expect(update.img).toBe(lantern.path);
		expect(update).not.toHaveProperty(["prototypeToken.texture.src"]);
	});

	it("keeps the Seer's scores as data beside their text, so the sheet can roll their Saves", () => {
		const update = knightUpdate({ start: startFor("wanderer"), knight: lantern, seer: glassSeer });
		expect(update["system.seerBook"]).toEqual(glassBook);
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
	it("gives each trait as a bullet, leaving the scores to seerBook", () => {
		expect(seerInfo(glassSeer)).toBe(glassInfo);
		expect(seerInfo({ stats: null, lines: ["Speaks only in riddles."] })).toBe("<ul><li>Speaks only in riddles.</li></ul>");
	});

	// They are the Referee's Spark Table, not anything the Knight knows.
	it("leaves out the prompts along the foot of the page", () => {
		const prompts = [{ label: "Person", value: "Glazier" }, { label: "Theme", value: "<Glass>" }];
		expect(seerInfo({ ...glassSeer, prompts })).toBe(glassInfo);
	});

	it("is blank when the text wasn't read", () => {
		expect(seerInfo(null)).toBe("");
		expect(seerInfo({ stats: null, lines: null })).toBe("");
	});
});

describe("seerBook", () => {
	it("takes the scores the book gives them straight from the index", () => {
		expect(seerBook(glassSeer)).toEqual(glassBook);
	});

	it("keeps a Seer the book gives only GD", () => {
		expect(seerBook({ stats: { vig: null, cla: null, spi: null, guard: 4 }, lines: [] }))
			.toEqual({ vig: null, cla: null, spi: null, guard: 4, armour: 0, structure: false });
	});

	it("reads their Armour from the first trait, and whether they count as a structure", () => {
		expect(seerBook({ ...glassSeer, lines: ["A2 (bronze plates)", "Rings when struck."] })).toMatchObject({ armour: 2, structure: false });
		const statue = { stats: { vig: null, cla: null, spi: null, guard: 6 }, lines: ["A3, treat as a Structure", "Never moves."] };
		expect(seerBook(statue)).toMatchObject({ armour: 3, structure: true });
		// Armour named later on is only something they say.
		expect(seerBook({ ...glassSeer, lines: ["Wants A1 armour for their acolytes."] }).armour).toBe(0);
	});

	it("gives nothing for a Seer whose stats Import PDF couldn't read", () => {
		expect(seerBook(null)).toBeNull();
		expect(seerBook({ stats: null, lines: ["Speaks only in riddles."] })).toBeNull();
		expect(seerBook({ stats: { vig: 8, cla: 13, spi: 16, guard: null } })).toBeNull();
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
		expect(items).toHaveLength(10);
		expect(items[0]).toMatchObject({ type: "weapon", name: "Hooked lamp", system: { damage: "d8", hefty: true } });
		expect(items[1]).toMatchObject({ type: "armour", name: "Coat", system: { kind: "coat", armour: 1, equipped: true } });
		expect(items.slice(2, 5)).toEqual([
			{ type: "gear", name: "Grumbling mule (VIG 9, GD 2)" },
			{ type: "ability", name: "Snuff Out", system: { description: "<p>Put out every flame you can see &lt;at once&gt;.</p>" } },
			{ type: "passion", name: "Vigil", system: { description: "<p>Restore SPI when you keep watch all night.</p>" } }
		]);
		expect(items.slice(5)).toEqual([
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

describe("seerAutoFill", () => {
	const hookSeer = { roll: "1-02", name: "The Hook Seer", path: "mythic-bastionland-art/seers/1-02-hook-seer.webp", stats: null, lines: ["Fishes for names."] };
	const index = { knights: [lantern], seers: [glassSeer, hookSeer] };

	it("fills the picture and what the book says for a named Seer", () => {
		expect(seerAutoFill(index, { seer: "The Glass Seer", seerImg: "", seerInfo: "" })).toEqual({
			"system.seerImg": glassSeer.path,
			"system.seerInfo": glassInfo,
			"system.seerBook": glassBook
		});
	});

	it("finds the Seer by the Knight's roll while no name is written", () => {
		expect(seerAutoFill(index, { seer: "", knightType: "Lantern" })).toMatchObject({ "system.seer": "The Glass Seer", "system.seerImg": glassSeer.path });
	});

	it("swaps a book Seer for another when the name changes", () => {
		expect(seerAutoFill(index, { seer: "The Hook Seer", seerImg: glassSeer.path, seerInfo: glassInfo })).toEqual({
			"system.seerImg": hookSeer.path,
			"system.seerInfo": "<ul><li>Fishes for names.</li></ul>",
			// The book gives this one no stats to keep.
			"system.seerBook": null
		});
	});

	// Fills made while the page still printed the prompts are the book's own text too,
	// so the prompts come back off them.
	it("takes the prompts off a fill that ends with them", () => {
		const prompts = [{ label: "Person", value: "Glazier" }, { label: "Theme", value: "<Glass>" }];
		const reimported = { knights: [lantern], seers: [{ ...glassSeer, prompts }] };
		const older = `${glassInfo}<p class="bastionland-seer__prompts"><span class="bastionland-seer__prompt"><strong>Person</strong>: Glazier</span>`
			+ '<span class="bastionland-seer__sep"> <span>~</span> </span><span class="bastionland-seer__prompt"><strong>Theme</strong>: &lt;Glass&gt;</span></p>';
		expect(seerAutoFill(reimported, { seer: "The Glass Seer", seerImg: glassSeer.path, seerInfo: older })).toEqual({
			"system.seerInfo": glassInfo,
			"system.seerBook": glassBook
		});
	});

	// Fills before the scores became data printed them at the head of the text. That text is
	// still the book's own, so it is written again without them and the scores kept as data.
	it("fills again over a fill that opened with the Seer's stat line", () => {
		const older = `<p><strong>VIG 8, CLA 13, SPI 16, 3GD</strong></p>${glassInfo}`;
		expect(seerAutoFill(index, { seer: "The Glass Seer", seerImg: glassSeer.path, seerInfo: older })).toEqual({
			"system.seerInfo": glassInfo,
			"system.seerBook": glassBook
		});
	});

	// Nor is a fill from before the "~" came out of wrapped lines taken for a hand's work.
	it("fills again over an older fill that wrote the prompts as plain text", () => {
		const prompts = [{ label: "Person", value: "Glazier" }, { label: "Theme", value: "<Glass>" }];
		const reimported = { knights: [lantern], seers: [{ ...glassSeer, prompts }] };
		const older = `<p><strong>VIG 8, CLA 13, SPI 16, 3GD</strong></p>${glassInfo}`
			+ '<p class="bastionland-seer__prompts"><strong>Person</strong>: Glazier ~ <strong>Theme</strong>: &lt;Glass&gt;</p>';
		expect(seerAutoFill(reimported, { seer: "The Glass Seer", seerImg: glassSeer.path, seerInfo: older })).toEqual({
			"system.seerInfo": glassInfo,
			"system.seerBook": glassBook
		});
	});

	it("keeps a picture or text chosen by hand, and does nothing once filled", () => {
		expect(seerAutoFill(index, { seer: "The Glass Seer", seerImg: "my/seer.webp", seerInfo: "<p>Mine</p>" })).toEqual({});
		// Not even text of their own that opens with a bold line, as an older fill's stat line did.
		expect(seerAutoFill(index, { seer: "The Glass Seer", seerImg: "my/seer.webp", seerInfo: "<p><strong>Mine</strong></p><p>And the rest.</p>" })).toEqual({});
		expect(seerAutoFill(index, { seer: "The Glass Seer", seerImg: glassSeer.path, seerInfo: glassInfo })).toEqual({});
	});

	it("leaves a Squire, a Seer the book doesn't know, and a world without Import PDF alone", () => {
		expect(seerAutoFill(index, { isSquire: true, seer: "The Glass Seer" })).toEqual({});
		expect(seerAutoFill(index, { seer: "Old Mother Crow", knightType: "Lantern" })).toEqual({});
		expect(seerAutoFill(null, { seer: "The Glass Seer" })).toEqual({});
	});
});
