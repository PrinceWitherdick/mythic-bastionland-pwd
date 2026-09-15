import { describe, expect, it } from "vitest";
import {
	ART_ROOT,
	BACKGROUND_SIZES,
	IMAGE_KIND,
	INDEX_VERSION,
	artDirectories,
	artFile,
	buildIndex,
	classifyImage,
	hasPageText,
	indexEntry,
	knightTextFromItems,
	mythTextFromItems,
	pickPageArt,
	rgbaPixels,
	rollLabel,
	seerNameFromItems,
	seerTextFromItems,
	slugify,
	spreadPages,
	spreads,
	titleFromItems,
	withArticle
} from "../../module/rules/book-art.js";

// Names and text here are invented so no book text lives in the repository.

/** A pdf.js text item at a font size and baseline. */
const item = (str, size, x, y, width = str.length * size * 0.5) => ({ str, transform: [size, 0, 0, size, x, y], width });

/** The same, set in a named font, as pdf.js reports bold names apart from body text. */
const inFont = (fontName) => (...args) => ({ ...item(...args), fontName });
const bold = inFont("bold");
const body = inFont("body");
const italic = inFont("italic");

describe("spreads", () => {
	it("lists 72 rolls in book order, each on its own pair of pages", () => {
		const all = spreads();
		expect(all).toHaveLength(72);
		expect(all[0]).toEqual({ d6: 1, d12: 1, roll: "1-01", knightPage: 28, mythPage: 29 });
		expect(all[13]).toMatchObject({ d6: 2, d12: 2, roll: "2-02", knightPage: 54 });
		expect(all.at(-1)).toEqual({ d6: 6, d12: 12, roll: "6-12", knightPage: 170, mythPage: 171 });

		const pages = all.flatMap((spread) => [spread.knightPage, spread.mythPage]);
		expect(new Set(pages).size).toBe(144);
		expect(Math.min(...pages)).toBe(28);
		expect(Math.max(...pages)).toBe(171);
	});

	it("rejects rolls off the dice", () => {
		expect(rollLabel(3, 7)).toBe("3-07");
		expect(spreadPages(1, 2)).toEqual({ knight: 30, myth: 31 });
		expect(() => rollLabel(0, 1)).toThrow(RangeError);
		expect(() => rollLabel(1, 13)).toThrow(RangeError);
		expect(() => spreadPages(7, 1)).toThrow(RangeError);
	});
});

describe("classifyImage", () => {
	it.each(BACKGROUND_SIZES)("treats %ix%i as background", (width, height) => {
		expect(classifyImage({ width, height })).toBe("background");
		expect(classifyImage({ width: width + 2, height: height - 1 })).toBe("background");
	});

	it.each([
		[466, 1095, "knight"],
		[463, 1089, "knight"],
		[470, 184, "seer"],
		[442, 172, "seer"],
		[941, 499, "myth"],
		[400, 40, "other"],
		[200, 200, "other"],
		[470, 1400, "other"]
	])("reads %ix%i as %s", (width, height, kind) => {
		expect(classifyImage({ width, height })).toBe(kind);
	});
});

describe("pickPageArt", () => {
	const paper = { key: "g_paper", width: 1225, height: 1585 };
	const portrait = { key: "img_1", width: 466, height: 1095 };
	const seer = { key: "img_2", width: 470, height: 184 };

	it("finds the Knight and Seer among the backgrounds", () => {
		const { art, problems } = pickPageArt("knight", [paper, seer, portrait, { key: "g_grey", width: 1482, height: 1960 }]);
		expect(art).toEqual({ knight: portrait, seer });
		expect(problems).toEqual([]);
	});

	it("counts an image painted twice once", () => {
		expect(pickPageArt("myth", [{ key: "img_3", width: 941, height: 499 }, { key: "img_3", width: 941, height: 499 }]).problems).toEqual([]);
	});

	it("reports missing art", () => {
		const { art, problems } = pickPageArt("knight", [paper, portrait]);
		expect(art.seer).toBeNull();
		expect(problems).toEqual([{ kind: "seer", reason: "notFound" }]);
	});

	it("keeps the largest when more than one image fits", () => {
		const smaller = { key: "img_4", width: 440, height: 1000 };
		const { art, problems } = pickPageArt("knight", [smaller, portrait, seer]);
		expect(art.knight).toBe(portrait);
		expect(problems).toEqual([{ kind: "knight", reason: "extra" }]);
	});
});

describe("titleFromItems", () => {
	it("reads the largest text on the page", () => {
		const items = [
			item("The", 33.5, 227, 740),
			item("Lantern", 60.4, 179, 700, 150),
			item("Warden", 60.4, 345, 700, 160),
			item("A couplet about lanterns", 14, 200, 660),
			item("28", 22, 21, 30)
		];
		expect(titleFromItems(items)).toBe("Lantern Warden");
	});

	it("joins a word pdf.js split in two", () => {
		expect(titleFromItems([item("Lan", 60.4, 100, 700, 60), item("tern", 60.4, 160, 700, 80)])).toBe("Lantern");
	});

	it("gives up without a title-sized line or readable letters", () => {
		expect(titleFromItems([item("Small print", 11, 71, 500)])).toBeNull();
		expect(titleFromItems([item("The", 33.5, 227, 740)])).toBeNull();
		expect(titleFromItems([item("#&*", 60.4, 179, 700)])).toBeNull();
		expect(titleFromItems([{ type: "beginMarkedContent" }])).toBeNull();
	});
});

describe("seerNameFromItems", () => {
	const anchor = item("KNIGHTED BY…", 11, 71, 200);

	it("reads the larger line just below the label", () => {
		const items = [item("A couplet about glass", 14, 200, 660), anchor, item("The Glass Seer", 14, 71, 183), item("VIG 7, CLA 5", 11, 71, 169)];
		expect(seerNameFromItems(items)).toBe("The Glass Seer");
	});

	it("joins a name split across runs", () => {
		expect(seerNameFromItems([anchor, item("The Glass", 14, 71, 183, 60), item("Seer", 14, 135, 183, 28)])).toBe("The Glass Seer");
	});

	it("gives up without the label or a name close below it", () => {
		expect(seerNameFromItems([item("The Glass Seer", 14, 71, 183)])).toBeNull();
		expect(seerNameFromItems([anchor, item("A couplet about glass", 14, 200, 660)])).toBeNull();
	});
});

describe("seerTextFromItems", () => {
	const anchor = item("KNIGHTED BY…", 11, 71, 196);
	const name = item("The Glass Seer", 14, 71, 177);

	it("reads the Seer's stats and each trait, stopping at the prompts", () => {
		const items = [
			anchor,
			name,
			item("VIG", 7.9, 71, 166, 15),
			item("7,", 11, 89, 166, 9),
			item("CLA", 7.9, 101, 166, 17),
			item("5,", 11, 121, 166, 9),
			item("SPI", 7.9, 133, 166, 13),
			item("11, 2", 11, 150, 166, 24),
			item("GD", 7.9, 174, 166, 12),
			item("•", 11, 71, 147, 7),
			item("Rings like a struck", 11, 89, 147, 100),
			item("bell when touched.", 11, 89, 136, 90),
			item("•", 11, 71, 123, 7),
			item("Wants a steady hand.", 11, 89, 123, 100),
			item("Person", 11, 94, 75, 40),
			item(": Glazier ~", 11, 134, 75, 60)
		];
		expect(seerTextFromItems(items)).toEqual({
			stats: { vig: 7, cla: 5, spi: 11, guard: 2 },
			lines: ["Rings like a struck bell when touched.", "Wants a steady hand."]
		});
	});

	it("reads a Seer with only GD, or with no stats at all", () => {
		const kiln = [anchor, item("The Kiln Seer", 14, 71, 177), item("4GD, A3, treat as a Structure", 11, 71, 166), item("• Always warm.", 11, 71, 147)];
		expect(seerTextFromItems(kiln)).toEqual({
			stats: { vig: null, cla: null, spi: null, guard: 4 },
			lines: ["A3, treat as a Structure", "Always warm."]
		});

		const hollow = [anchor, item("The Hollow Seer", 14, 71, 177), item("Is not there.", 11, 71, 166)];
		expect(seerTextFromItems(hollow)).toEqual({ stats: null, lines: ["Is not there."] });
	});

	it("gives up without the label", () => {
		expect(seerTextFromItems([name])).toBeNull();
		expect(seerTextFromItems([anchor, name])).toBeNull();
	});
});

describe("mythTextFromItems", () => {
	const headings = [item("Omens", 14, 165, 365, 41), item("Cast", 14, 413, 365, 27)];

	it("reads the Omens and each Cast entry above the table and prompts", () => {
		const page = [
			item("The", 30, 285, 715),
			item("Lamplighter", 54, 227, 680),
			...headings,
			body("1.", 11, 71, 354, 9),
			body("A guttering candle on the road.", 11, 88, 354, 200),
			body("2.", 11, 71, 330, 9),
			body("A procession of lanterns winds", 11, 88, 330, 210),
			body("toward the hill.", 11, 90, 319, 80),
			bold("The Lamplighter, Warden of", 11, 320, 354, 200),
			bold("Wicks", 11, 400, 343, 30),
			body("VIG", 7.9, 360, 332, 15),
			body("12,", 11, 378, 332, 15),
			body("CLA", 7.9, 396, 332, 17),
			body("9,", 11, 416, 332, 9),
			body("SPI", 7.9, 428, 332, 13),
			body("14, 5", 11, 444, 332, 24),
			body("GD", 7.9, 468, 332, 12),
			body("A2 (waxed leather, iron cap)", 11, 330, 321, 180),
			body("Wick-hook (d8 hefty, +d6 vs", 11, 330, 310, 180),
			body("the unlit)", 11, 380, 299, 60),
			body("Can", 11, 390, 288, 18),
			italic("Focus.", 11, 411, 288, 30),
			bold("Moth Swarm", 11, 360, 269, 60),
			body("&", 11, 423, 269, 6),
			bold("Wisp", 11, 432, 269, 25),
			body("VIG 5, CLA 10, SPI 3, 2GD", 11, 350, 258, 140),
			body("Bites (d4)", 11, 390, 247, 60),
			bold("The Great Wick", 11, 370, 228, 90),
			body("Burns for a hundred years.", 11, 350, 217, 150),
			bold("WICK TABLE", 10, 380, 190, 70),
			body("1 Tallow", 10, 320, 178, 50),
			body("Dwelling", 11, 99, 75, 51),
			body(": Candle shop ~", 11, 150, 75, 90),
			body("Monument", 11, 370, 75, 62),
			body(": Wax statue", 11, 432, 75, 70)
		];

		expect(mythTextFromItems(page)).toEqual({
			omens: ["A guttering candle on the road.", "A procession of lanterns winds toward the hill."],
			cast: [
				{
					name: "The Lamplighter, Warden of Wicks",
					stats: { vig: 12, cla: 9, spi: 14, guard: 5 },
					lines: ["A2 (waxed leather, iron cap)", "Wick-hook (d8 hefty, +d6 vs the unlit)", "Can Focus."]
				},
				{ name: "Moth Swarm & Wisp", stats: { vig: 5, cla: 10, spi: 3, guard: 2 }, lines: ["Bites (d4)"] },
				{ name: "The Great Wick", stats: null, lines: ["Burns for a hundred years."] }
			],
			castNote: ""
		});
	});

	it("keeps text above the first name as a note about the whole Cast", () => {
		const page = [
			...headings,
			body("1.", 11, 71, 354, 9),
			body("A warm draught.", 11, 88, 354, 90),
			body("Chosen by the season.", 11, 330, 354, 120),
			bold("Frost Warden", 11, 360, 343, 70),
			body("VIG 9, CLA 9, SPI 9, 4GD", 11, 340, 332, 130)
		];
		expect(mythTextFromItems(page)).toEqual({
			omens: ["A warm draught."],
			cast: [{ name: "Frost Warden", stats: { vig: 9, cla: 9, spi: 9, guard: 4 }, lines: [] }],
			castNote: "Chosen by the season."
		});
	});

	it("gives up without its column headings", () => {
		expect(mythTextFromItems([item("Cast", 14, 413, 365, 27)])).toBeNull();
		expect(mythTextFromItems(headings)).toBeNull();
		expect(mythTextFromItems([])).toBeNull();
	});
});

describe("knightTextFromItems", () => {
	const page = [
		item("The", 30, 227, 710),
		item("Lantern Knight", 54, 179, 678),
		item("A couplet about lamps", 14, 200, 658),
		item("PROPERTY", 11, 71, 625.6, 68),
		item("•", 11, 71, 614.6, 6.7),
		item(" ", 11, 77.8, 614.6, 11.3),
		item("Hooked lamp (d8 hefty), coat (A1),", 11, 89.1, 614.6, 180),
		item("and helm (A1)", 11, 89.1, 603.6, 70),
		item("•", 11, 71, 590.6, 6.7),
		item("Grumbling mule (", 11, 89.1, 590.6, 80.9),
		item("VIG", 7.9, 170, 590.6, 15),
		item("9,", 11, 188, 590.6, 9.2),
		item("GD", 7.9, 200, 590.6, 12),
		item(")", 11, 212.5, 590.6, 3.7),
		item("ABILITY - Snuff Out", 11, 71, 540.6),
		item("Put out every candle-", 11, 71, 529.6),
		item("flame you can see.", 11, 71, 518.6),
		item("PASSION - Vigil", 11, 71, 499.6),
		item("Restore", 11, 71, 488.6, 38.7),
		item("SPI", 7.9, 112.9, 488.6, 13.4),
		item("when you keep watch all night.", 11, 129.3, 488.6, 150),
		item("LAMP OILS", 10, 115, 452),
		item("1", 10, 75.8, 417.2),
		item("KNIGHTED BY…", 11, 71, 196.4),
		item("The Glass Seer", 14, 71, 177.4)
	];

	it("reads Property bullets, Ability and Passion", () => {
		expect(knightTextFromItems(page)).toEqual({
			property: ["Hooked lamp (d8 hefty), coat (A1), and helm (A1)", "Grumbling mule (VIG 9, GD)"],
			ability: { name: "Snuff Out", text: "Put out every candle-flame you can see." },
			passion: { name: "Vigil", text: "Restore SPI when you keep watch all night." }
		});
	});

	it("stops the Passion at a table set close beneath it", () => {
		const tight = page.map((entry) => {
			if (entry.str === "LAMP OILS") return item("LAMP OILS", 10, 115, 473.6);
			if (entry.str === "1") return item("1 Whale Bright", 10, 75.8, 463.2);
			return entry;
		});
		expect(knightTextFromItems(tight).passion.text).toBe("Restore SPI when you keep watch all night.");
	});

	it("gives up when a heading is missing or out of order", () => {
		expect(knightTextFromItems(page.filter((entry) => !entry.str.startsWith("PASSION")))).toBeNull();
		expect(knightTextFromItems(page.filter((entry) => entry.str !== "PROPERTY"))).toBeNull();
		expect(knightTextFromItems([])).toBeNull();
	});
});

describe("names and files", () => {
	it("adds the article once", () => {
		expect(withArticle("Lantern Warden")).toBe("The Lantern Warden");
		expect(withArticle("The Glass Seer")).toBe("The Glass Seer");
	});

	it("slugs names without the article, accents or apostrophes", () => {
		expect(slugify("The Glass Seer")).toBe("glass-seer");
		expect(slugify("Théodric’s Bell")).toBe("theodrics-bell");
		expect(slugify("Thessaly Knight")).toBe("thessaly-knight");
		expect(slugify(null)).toBe("");
	});

	it("names files by roll, falling back to the kind", () => {
		expect(artFile("knight", 1, 1, "The Lantern Warden")).toEqual({
			dir: `${ART_ROOT}/knights`,
			fileName: "1-01-lantern-warden.webp",
			file: "knights/1-01-lantern-warden.webp"
		});
		expect(artFile("seer", 6, 12, null, "png").file).toBe("seers/6-12-seer.png");
		expect(artDirectories()).toEqual([ART_ROOT, `${ART_ROOT}/knights`, `${ART_ROOT}/seers`, `${ART_ROOT}/myths`]);
	});
});

describe("buildIndex", () => {
	it("groups entries by kind in book order", () => {
		const entries = [
			indexEntry({ kind: "myth", d6: 1, d12: 2, page: 31, name: "The Drowned Bell", file: "myths/1-02-drowned-bell.webp", path: "x/1-02.webp", width: 941, height: 499 }),
			indexEntry({ kind: "myth", d6: 1, d12: 1, page: 29, file: "myths/1-01-myth.webp" }),
			indexEntry({ kind: "knight", d6: 1, d12: 1, page: 28, name: "The Lantern Warden", file: "knights/1-01-lantern-warden.webp", path: "x/k.webp" })
		];
		const problems = [{ kind: "myth", roll: "1-01", page: 29, reason: "upload" }];
		const index = buildIndex({ entries, problems, pdfPages: 212, importedAt: "2026-01-01T00:00:00.000Z", systemVersion: "0.1.0" });

		expect(index).toMatchObject({ version: INDEX_VERSION, root: ART_ROOT, pdfPages: 212, seers: [], problems });
		expect(index.myths.map((entry) => entry.roll)).toEqual(["1-01", "1-02"]);
		expect(index.myths[0]).toEqual({
			d6: 1,
			d12: 1,
			roll: "1-01",
			page: 29,
			name: null,
			file: "myths/1-01-myth.webp",
			path: null,
			width: null,
			height: null,
			omens: null,
			cast: null,
			castNote: null
		});
		expect(index.knights[0]).not.toHaveProperty("kind");
		expect(index.knights[0]).toMatchObject({ property: null, ability: null, passion: null });
		expect(index.myths[0]).not.toHaveProperty("property");
		expect(index.cityQuest).toBeNull();
	});

	it("keeps the City Quest's Omens and Cast", () => {
		const cityQuest = {
			page: { omens: 172, cast: 173 },
			omens: ["A heron made of copper wire."],
			cast: [{ name: "Clockwork Heron", stats: { vig: 6, cla: 6, spi: 6, guard: 2 }, lines: ["Beak (d6)"] }],
			castNote: "Wound up at dusk."
		};
		const index = buildIndex({ entries: [], cityQuest, pdfPages: 212, importedAt: "2026-01-01T00:00:00.000Z", systemVersion: "0.1.0" });
		expect(index).toMatchObject({ version: INDEX_VERSION, cityQuest });
		expect(buildIndex({ entries: [], cityQuest: { ...cityQuest, omens: null }, pdfPages: 212 }).cityQuest.omens).toBeNull();
	});

	it("keeps the text read from each kind's page", () => {
		const knight = { property: ["Hooked lamp"], ability: { name: "Snuff Out", text: "Put out a flame." }, passion: { name: "Vigil", text: "Keep watch." } };
		expect(indexEntry({ kind: "knight", d6: 1, d12: 1, page: 28, file: "knights/1-01-knight.webp", text: knight })).toMatchObject(knight);

		const seer = { stats: { vig: 7, cla: 5, spi: 11, guard: 2 }, lines: ["Wants a steady hand."] };
		expect(indexEntry({ kind: "seer", d6: 1, d12: 1, page: 28, file: "seers/1-01-seer.webp", text: seer })).toMatchObject(seer);
		expect(indexEntry({ kind: "seer", d6: 1, d12: 1, page: 28, file: "seers/1-01-seer.webp" })).toMatchObject({ stats: null, lines: null });

		const myth = { omens: ["A guttering candle."], cast: [{ name: "Moth Swarm", stats: null, lines: [] }], castNote: "" };
		expect(indexEntry({ kind: "myth", d6: 1, d12: 1, page: 29, file: "myths/1-01-myth.webp", text: myth })).toMatchObject(myth);
	});
});

describe("hasPageText", () => {
	it("knows whether each kind's text was read", () => {
		expect(hasPageText("knight", { ability: { name: "Snuff Out", text: "Put out a flame." } })).toBe(true);
		expect(hasPageText("knight", { ability: null })).toBe(false);
		expect(hasPageText("seer", { stats: null, lines: ["Is not there."] })).toBe(true);
		expect(hasPageText("seer", { stats: null, lines: null })).toBe(false);
		expect(hasPageText("myth", { cast: [{ name: "Moth Swarm" }] })).toBe(true);
		expect(hasPageText("myth", { cast: [] })).toBe(false);
		expect(hasPageText("myth", null)).toBe(false);
	});
});

describe("rgbaPixels", () => {
	it("keeps transparency", () => {
		const data = new Uint8ClampedArray([10, 20, 30, 128, 40, 50, 60, 0]);
		expect([...rgbaPixels({ width: 2, height: 1, data, kind: IMAGE_KIND.RGBA_32BPP })]).toEqual([10, 20, 30, 128, 40, 50, 60, 0]);
		expect([...rgbaPixels({ width: 2, height: 1, data })]).toEqual([10, 20, 30, 128, 40, 50, 60, 0]);
	});

	it("makes RGB opaque", () => {
		const data = new Uint8ClampedArray([1, 2, 3, 4, 5, 6]);
		expect([...rgbaPixels({ width: 2, height: 1, data, kind: IMAGE_KIND.RGB_24BPP })]).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
	});

	it("refuses data that doesn't fit the size", () => {
		expect(rgbaPixels({ width: 2, height: 2, data: new Uint8ClampedArray(5) })).toBeNull();
		expect(rgbaPixels({ width: 1, height: 1, data: new Uint8ClampedArray(1), kind: 1 })).toBeNull();
		expect(rgbaPixels({ width: 0, height: 0, data: new Uint8ClampedArray(0) })).toBeNull();
	});
});
