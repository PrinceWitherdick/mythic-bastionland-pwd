import { describe, expect, it } from "vitest";
import { CITY_CAST, castBlock, gatherCast } from "../../module/rules/myth-cast.js";

/** The Cast as Import PDF reads one from a Myth's page. */
const cast = [
	{ name: "The Wyvern, That Foul Twisted Reptile", stats: { vig: 15, cla: 12, spi: 10, guard: 7 }, lines: ["Claws (d8)."] },
	{ name: "Ghostly Riders, Warband", stats: { vig: 10, cla: 10, spi: 10, guard: 3 }, lines: [] },
	{ name: "The Broken Tower", stats: { vig: null, cla: null, spi: null, guard: 12 }, lines: ["Counts as a structure."] }
];

const actor = (name, extra = {}) => ({ uuid: `Actor.${name.replace(/\W/g, "")}`, name, img: null, flagged: false, myth: null, from: null, ...extra });

describe("gatherCast", () => {
	it("gives every printed entry, with nobody made of them yet", () => {
		const { members, extras, made } = gatherCast(cast, [], "1-05");
		expect(members.map((member) => [member.index, member.name, member.epithet])).toEqual([
			[0, "The Wyvern", "That Foul Twisted Reptile"],
			[1, "Ghostly Riders", "Warband"],
			[2, "The Broken Tower", ""]
		]);
		expect(members.every((member) => member.actors.length === 0)).toBe(true);
		expect(extras).toEqual([]);
		expect(made).toBe(0);
	});

	it("gives nothing for a Myth whose page hasn't been read", () => {
		expect(gatherCast(null, [], "1-05")).toEqual({ members: [], extras: [], made: 0 });
	});

	it("gathers an actor made from an entry by the flag it carries, whatever it is called now", () => {
		const gorthax = actor("Gorthax", { flagged: true, myth: "1-05", from: "The Wyvern, That Foul Twisted Reptile" });
		const { members, made } = gatherCast(cast, [gorthax], "1-05");
		expect(members[0].actors).toEqual([gorthax]);
		expect(members[1].actors).toEqual([]);
		expect(made).toBe(1);
	});

	it("leaves an actor flagged to another Myth alone", () => {
		const theirs = actor("The Wyvern", { flagged: true, myth: "2-11", from: "The Wyvern, That Foul Twisted Reptile" });
		const { members, extras } = gatherCast(cast, [theirs], "1-05");
		expect(members.every((member) => !member.actors.length)).toBe(true);
		expect(extras).toEqual([]);
	});

	it("collects one made before by its name, by the whole printed name or the part before the epithet", () => {
		const short = actor("The Wyvern");
		const printed = actor("Ghostly Riders, Warband");
		const { members, made } = gatherCast(cast, [short, printed], "1-05");
		expect(members[0].actors).toEqual([short]);
		expect(members[1].actors).toEqual([printed]);
		expect(made).toBe(2);
	});

	it("reads a name past its capitals and punctuation", () => {
		const loose = actor("the  wyvern");
		expect(gatherCast(cast, [loose], "1-05").members[0].actors).toEqual([loose]);
	});

	it("gives an entry everyone made of it, and lets nobody stand for two", () => {
		const first = actor("The Wyvern");
		const second = { ...actor("The Wyvern"), uuid: "Actor.Wyvern2" };
		const { members, made } = gatherCast(cast, [first, second], "1-05");
		expect(members[0].actors).toEqual([first, second]);
		expect(made).toBe(1);
	});

	it("keeps an actor put in the Cast by hand, and one taken out of it", () => {
		const dropped = actor("Sir Bramble", { flagged: true, myth: "1-05" });
		const cut = actor("The Wyvern", { flagged: true, myth: null });
		const { members, extras } = gatherCast(cast, [dropped, cut], "1-05");
		expect(extras).toEqual([dropped]);
		// Taken out, the book's own name no longer gathers them again.
		expect(members[0].actors).toEqual([]);
	});

	it("gathers the City Quest's Cast under its own key", () => {
		const herald = actor("The Herald", { flagged: true, myth: CITY_CAST });
		expect(gatherCast([], [herald], CITY_CAST).extras).toEqual([herald]);
		expect(gatherCast([], [herald], "1-05").extras).toEqual([]);
	});
});

describe("castBlock", () => {
	it("takes the Armour out, to stand beside the stats", () => {
		const block = castBlock(["A2 (waxed leather, iron cap)", "Wick-hook (d8 hefty)"]);
		expect(block).toEqual({ armour: "A2 (waxed leather, iron cap)", lines: ["Wick-hook (d8 hefty)"] });
	});

	it("keeps an attack printed on the Armour's line", () => {
		expect(castBlock(["A1 (hard skin), tail (d8)"])).toEqual({ armour: "A1 (hard skin)", lines: ["tail (d8)"] });
	});

	it("gives no Armour to a stat block printed without one", () => {
		expect(castBlock(["Claws (d8)."])).toEqual({ armour: null, lines: ["Claws (d8)."] });
		expect(castBlock([])).toEqual({ armour: null, lines: [] });
		expect(castBlock(null)).toEqual({ armour: null, lines: [] });
	});

	it("runs the writing together, since the book only broke it where its column ran out", () => {
		const block = castBlock(["Wants the tower rebuilt.", "Hates the cold.", "Will trade for iron."]);
		expect(block.lines).toEqual(["Wants the tower rebuilt. Hates the cold. Will trade for iron."]);
	});

	it("leaves each attack on a line of its own", () => {
		const block = castBlock(["A3 (plate)", "Crush (2d12)", "Sweep (d12 blast)", "Can Focus.", "Wants quiet."]);
		expect(block).toEqual({
			armour: "A3 (plate)",
			lines: ["Crush (2d12)", "Sweep (d12 blast)", "Can Focus. Wants quiet."]
		});
	});

	it("closes up a word the column broke, keeping its hyphen", () => {
		expect(castBlock(["Wants the caravan un-", "harmed."]).lines).toEqual(["Wants the caravan un-harmed."]);
	});
});
