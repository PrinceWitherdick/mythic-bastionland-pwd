import { describe, expect, it } from "vitest";
import {
	CITY_OMEN_COUNT,
	CITY_QUEST_END,
	CITY_QUEST_PAGES,
	cityOmen,
	cityOmenReplaces,
	cityQuestCastFromItems,
	cityQuestOmensFromItems,
	cityQuestOver,
	worthyOfCityQuest
} from "../../module/rules/city-quest.js";

// Text here is invented so no book text lives in the repository. Sizes and
// positions follow the printed pages: 20pt headings centred on a 612pt page,
// 11pt text in two columns, and lines that end a paragraph set centred.

/** A pdf.js text item at a font size and baseline, set in a named font. */
const run = (fontName) => (str, size, x, y, width = str.length * size * 0.5) => ({ str, transform: [size, 0, 0, size, x, y], width, fontName });
const heading = run("heading");
const body = run("body");
const bold = run("bold");

/** The same, centred on a column's middle. */
const centred = (font, str, size, centre, y, width = str.length * size * 0.45) => font(str, size, centre - width / 2, y, width);

const LEFT = 185;
const RIGHT = 426;

describe("cityQuestOmensFromItems", () => {
	/** Most Omens take one printed line and a centred second; a few are set apart to test wrapping. */
	const printed = (number) => ({
		2: ["A heron made of", "copper wire."],
		6: ["Lanterns drift over the fen and burst", "(2d8 blast) above the", "Company."],
		13: ["A bell rings for the half-", "drowned."]
	})[number] ?? [`A milestone leans at ${number} paces`, "from the road."];

	/** One column of Omens. The left sets each number apart; the right runs it into the text. */
	const column = (numbers, left) => {
		const items = [];
		let y = 510;
		for (const number of numbers) {
			const [first, ...rest] = printed(number);
			if (left) items.push(body(`${number}.`, 11, 71, y, 9), body(first, 11, 88, y, 212));
			else items.push(body(`${number}. ${first}`, 11, 312, y, 229));
			for (const line of rest) {
				y -= 11;
				items.push(centred(body, line, 11, left ? LEFT : RIGHT, y));
			}
			y -= 13;
		}
		return items;
	};

	const numbers = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
	const page = [
		body("1. Rules above the Omens heading aren’t an Omen.", 11, 71, 600, 450),
		heading("Omens", 20, 277, 521.6, 58),
		...column(numbers(11, 24), false),
		...column(numbers(1, 10), true),
		heading("172", 22, 17, 21, 27)
	];

	it("reads 24 Omens in number order, left column then right, joined across wrapped lines", () => {
		const omens = cityQuestOmensFromItems(page);
		expect(omens).toHaveLength(CITY_OMEN_COUNT);
		expect(omens[0]).toBe("A milestone leans at 1 paces from the road.");
		expect(omens[1]).toBe("A heron made of copper wire.");
		expect(omens[5]).toBe("Lanterns drift over the fen and burst (2d8 blast) above the Company.");
		expect(omens[9]).toBe("A milestone leans at 10 paces from the road.");
		expect(omens[10]).toBe("A milestone leans at 11 paces from the road.");
		expect(omens[12]).toBe("A bell rings for the half-drowned.");
		expect(omens[23]).toBe("A milestone leans at 24 paces from the road.");
	});

	it("joins a line pdf.js split into words", () => {
		const split = page.flatMap((item) => (item.str === "copper wire." ? [centred(body, "copper", 11, 175, item.transform[5], 32), centred(body, "wire.", 11, 207, item.transform[5], 24)] : [item]));
		expect(cityQuestOmensFromItems(split)[1]).toBe("A heron made of copper wire.");
	});

	it("gives up without the heading or every Omen", () => {
		expect(cityQuestOmensFromItems(page.filter((item) => item.str !== "Omens"))).toBeNull();
		expect(cityQuestOmensFromItems(page.filter((item) => !item.str.startsWith("17. ")))).toBeNull();
		expect(cityQuestOmensFromItems([])).toBeNull();
	});
});

describe("cityQuestCastFromItems", () => {
	/** A stat line with its names in small capitals, as the book sets them. */
	const statLine = (centre, y, [vig, cla, spi, guard]) => {
		const parts = [["VIG", 7.9, 15, 3], [`${vig},`, 11, 15, 3], ["CLA", 7.9, 17, 3], [`${cla},`, 11, 15, 3], ["SPI", 7.9, 13, 3], [`${spi}, ${guard}`, 11, 25, 0], ["GD", 7.9, 12, 0]];
		let x = centre - parts.reduce((total, [, , width, gap]) => total + width + gap, 0) / 2;
		return parts.map(([str, size, width, gap]) => {
			const item = body(str, size, x, y, width);
			x += width + gap;
			return item;
		});
	};

	/** A stat block centred in its column, top line at `top`. */
	const entry = (centre, top, name, stats, lines) => [
		centred(bold, name, 11, centre, top),
		...statLine(centre, top - 11, stats),
		...lines.map((line, index) => centred(body, line, 11, centre, top - 22 - index * 11))
	];

	const page = [
		heading("Cast", 20, 287, 441.4, 38),
		...entry(LEFT, 422.6, "Tin Pilgrim, Oswy", [8, 12, 10, 3], ["Rusted crank (d6)", "Wants to find a key that fits the", "slot in his back."]),
		...entry(LEFT, 359.6, "Kettle Wardens, led by Brume", [11, 9, 8, 5], ["A1 (enamel plates)", "Steam lances (d8 long),", "a spare boiler (d10 blast)", "Want warm hands."]),
		...entry(RIGHT, 422.6, "Clockwork Heron", [6, 6, 6, 2], ["A2 (brass feathers)", "Beak (d6)"]),
		...entry(RIGHT, 378.6, "Paper Colossus", [16, 5, 3, 4], ["A1, count as a structure", "Fold (2d10 slow) or flap (d8 blast)", "Hates rain and", "open flames."]),
		heading("173", 22, 568, 21, 27)
	];

	it("reads each stat block, left column first", () => {
		expect(cityQuestCastFromItems(page)).toEqual({
			cast: [
				{ name: "Tin Pilgrim, Oswy", stats: { vig: 8, cla: 12, spi: 10, guard: 3 }, lines: ["Rusted crank (d6)", "Wants to find a key that fits the slot in his back."] },
				{
					name: "Kettle Wardens, led by Brume",
					stats: { vig: 11, cla: 9, spi: 8, guard: 5 },
					lines: ["A1 (enamel plates)", "Steam lances (d8 long), a spare boiler (d10 blast)", "Want warm hands."]
				},
				{ name: "Clockwork Heron", stats: { vig: 6, cla: 6, spi: 6, guard: 2 }, lines: ["A2 (brass feathers)", "Beak (d6)"] },
				{
					name: "Paper Colossus",
					stats: { vig: 16, cla: 5, spi: 3, guard: 4 },
					lines: ["A1, count as a structure", "Fold (2d10 slow) or flap (d8 blast)", "Hates rain and open flames."]
				}
			],
			castNote: ""
		});
	});

	it("gives up without the heading or any stat block", () => {
		expect(cityQuestCastFromItems(page.filter((item) => item.str !== "Cast"))).toBeNull();
		expect(cityQuestCastFromItems([heading("Cast", 20, 287, 441.4, 38)])).toBeNull();
		expect(cityQuestCastFromItems([])).toBeNull();
	});
});

describe("cityOmen", () => {
	it("adds the Omens already encountered to the d12", () => {
		expect(CITY_QUEST_PAGES).toEqual({ omens: 172, cast: 173 });
		expect(cityOmen(5)).toEqual({ omen: 5, ends: false });
		expect(cityOmen(5, [3, 9])).toEqual({ omen: 7, ends: false });
	});

	it("takes the Omen after it in place of one already encountered", () => {
		expect(cityOmen(5, [7, 2])).toEqual({ omen: 8, ends: false });
		expect(cityOmen(4, [6, 7, 8])).toEqual({ omen: 9, ends: false });
	});

	it("counts each Omen once and ignores numbers off the list", () => {
		expect(cityOmen(3, [4, 4, 0, 30])).toEqual({ omen: 5, ends: false });
	});

	it("treats rolls over 24 as 24", () => {
		const thirteen = Array.from({ length: 13 }, (_, index) => index + 1);
		expect(cityOmen(12, thirteen)).toEqual({ omen: 24, ends: true });
		// With nothing left further down the list, the nearest Omen back up it.
		expect(cityOmen(12, [...thirteen.slice(1), 24])).toEqual({ omen: 23, ends: true });
	});

	it("ends the City Quest from Omen 18", () => {
		const eight = [2, 3, 5, 6, 8, 9, 11, 12];
		expect(cityOmen(9, eight)).toEqual({ omen: CITY_QUEST_END - 1, ends: false });
		expect(cityOmen(10, eight)).toEqual({ omen: CITY_QUEST_END, ends: true });
	});

	it("finds nothing once every Omen has been encountered, and refuses rolls off the die", () => {
		expect(cityOmen(1, Array.from({ length: 24 }, (_, index) => index + 1))).toEqual({ omen: null, ends: true });
		expect(() => cityOmen(0)).toThrow(RangeError);
		expect(() => cityOmen(13)).toThrow(RangeError);
		expect(() => cityOmen(2.5)).toThrow(RangeError);
	});
});

describe("cityQuestOver", () => {
	it("is over once an Omen from 18 has been encountered", () => {
		expect(cityQuestOver([])).toBe(false);
		expect(cityQuestOver([3, 17])).toBe(false);
		expect(cityQuestOver([5, 18])).toBe(true);
		expect(cityQuestOver([24])).toBe(true);
	});
});

describe("worthyOfCityQuest", () => {
	const knight = (rank, hasPlayerOwner = true) => ({ type: "knight", hasPlayerOwner, system: { rank } });
	it("takes one player's Knight-Radiant", () => {
		expect(worthyOfCityQuest([knight("tenant"), knight("radiant")])).toBe(true);
		expect(worthyOfCityQuest([knight("dominant")])).toBe(false);
		expect(worthyOfCityQuest([knight("radiant", false)])).toBe(false);
		expect(worthyOfCityQuest([{ type: "npc", hasPlayerOwner: true, system: { rank: "radiant" } }])).toBe(false);
	});
});

describe("cityOmenReplaces", () => {
	it("stands in for a random Myth's Omen only, while the Quest goes on", () => {
		expect(cityOmenReplaces("randomOmen", true, [])).toBe(true);
		expect(cityOmenReplaces("randomOmen", true, [4, 12])).toBe(true);
		expect(cityOmenReplaces("nearestOmen", true, [])).toBe(false);
		expect(cityOmenReplaces("randomOmen", false, [])).toBe(false);
		expect(cityOmenReplaces("randomOmen", true, [19])).toBe(false);
	});
});
