import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyLore, loreAt } from "../../module/rules/hex-lore.js";
import { KNIGHT_NAMES } from "../../module/rules/knight-names.js";

// Invented, so no book text lives in the repository.
const table = (name) => ({
	name,
	columns: ["Left", "Right"],
	rows: Array.from({ length: 12 }, (_, row) => [`${name}-a${row + 1}`, `${name}-b${row + 1}`])
});
const tables = (prefix, count) => Array.from({ length: count }, (_, index) => table(`${prefix}${index}`));
const index = {
	spark: [
		{ key: "nature", name: "Nature", page: 22, tables: tables("N", 9) },
		{ key: "civilisation", name: "Civilisation", page: 23, tables: tables("C", 9) },
		{ key: "people", name: "People", page: 24, tables: tables("P", 9) }
	]
};

const when = { age: 1, season: "spring", day: 1, phase: "morning" };
const hex = { col: 4, row: 5 };
let artIndex;
let realm;
let lore;
/** What each die thrown lands on, in the order they're thrown. */
let thrown;

vi.mock("../../module/chat/cards.js", () => ({
	postCard: vi.fn(),
	t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key),
	warn: vi.fn()
}));
vi.mock("../../module/book-art/art-index.js", () => ({
	loadArtIndex: async () => artIndex,
	sparkPageOf: (index, key) => index?.spark?.find((page) => page.key === key) ?? null,
	sparkTablesOf: (index, key) => {
		const page = index?.spark?.find((each) => each.key === key);
		return page?.tables?.length ? page : null;
	},
	mythEntry: (_index, myth) => ({ name: `The Myth ${myth.number}`, page: 27 + myth.number * 2 })
}));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => when }));
vi.mock("../../module/actions/hex-lore.js", () => ({
	getHexRecord: (_scene, at) => lore.hexes[`${at.col},${at.row}`] ?? null,
	keepHexSparkRecords: vi.fn(async (_scene, hex, sparks) => {
		const { recordSpark } = await import("../../module/rules/hex-lore.js");
		lore = sparks.reduce((next, spark) => recordSpark(next, hex, spark), lore);
		return true;
	})
}));
vi.mock("../../module/actions/realm.js", () => ({
	getRealm: () => ({ realm }),
	isRealmScene: (scene) => Boolean(scene?.realm)
}));

const { keepHexPerson, postPerson, rollHexPerson, rollPersonTables, rollUpHolding } = await import("../../module/actions/people.js");
const { postCard, warn } = await import("../../module/chat/cards.js");
const { keepHexSparkRecords } = await import("../../module/actions/hex-lore.js");

/** Just enough of Foundry's Roll: each die takes the next number thrown. */
class FakeRoll {
	constructor(formula) {
		this.formula = formula;
	}

	async evaluate() {
		const terms = this.formula.split(" + ");
		this.dice = terms.filter((term) => term.includes("d")).map((term) => ({ faces: Number(term.split("d")[1]), total: thrown.shift() }));
		const flat = terms.filter((term) => !term.includes("d")).reduce((sum, term) => sum + Number(term), 0);
		this.total = this.dice.reduce((sum, die) => sum + die.total, flat);
		return this;
	}
}

const scene = { id: "realm", realm: true };

beforeEach(() => {
	artIndex = structuredClone(index);
	realm = {
		holdings: [{ id: "h1", hex, style: "town", seat: true, name: "Oakwall" }],
		myths: [{ number: 2 }, { number: 5 }, { number: 6 }],
		landmarks: []
	};
	lore = emptyLore();
	thrown = [];
	vi.mocked(postCard).mockClear();
	vi.mocked(warn).mockClear();
	vi.mocked(keepHexSparkRecords).mockClear();
	globalThis.Roll = FakeRoll;
	globalThis.foundry = { utils: { randomID: () => `id${Math.random()}` } };
	globalThis.game = { user: { isGM: true } };
});

/** Dice for one person: each of the nine tables' two columns lands on its table's number and the next. */
const personDice = () => Array.from({ length: 9 }, (_, index) => [index + 1, index + 2]).flat();

describe("rolling a person", () => {
	it("rolls every People table in one throw, a d12 to each column", async () => {
		thrown = personDice();
		const person = await rollPersonTables();
		expect(person.roll.formula.split(" + ")).toHaveLength(18);
		expect(person.traits).toHaveLength(9);
		expect(person.traits[0]).toMatchObject({ name: "P0", prompt: "P0-a1 P0-b2", rolls: [1, 2] });
		expect(person.traits[8]).toMatchObject({ name: "P8", prompt: "P8-a9 P8-b10" });
	});

	it("posts one card for them all", async () => {
		thrown = personDice();
		await postPerson(await rollPersonTables());
		expect(postCard).toHaveBeenCalledOnce();
		const [, template, context, options] = vi.mocked(postCard).mock.calls[0];
		expect(template).toBe("people");
		expect(context.people).toHaveLength(1);
		expect(context.people[0].traits.map(({ name }) => name)).toEqual(["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]);
		expect(options.rolls).toHaveLength(1);
		expect(options.mode).toBeUndefined();
	});

	it("says so, and rolls nothing, where Import PDF hasn't read the People page", async () => {
		artIndex.spark = artIndex.spark.filter((page) => page.key !== "people");
		expect(await rollPersonTables()).toBeNull();
		expect(warn).toHaveBeenCalledWith("people.missing");
		expect(postCard).not.toHaveBeenCalled();
	});
});

describe("rolling a person in a hex", () => {
	it("keeps them there as one roll and whispers the GMs", async () => {
		thrown = personDice();
		await rollHexPerson({ scene, hex });
		const [spark] = loreAt(lore, hex).sparks;
		expect(spark).toMatchObject({ page: "people", rolls: personDice(), when });
		expect(spark.entries).toHaveLength(9);
		expect(spark.prompt.startsWith("P0: P0-a1 P0-b2 · P1: P1-a2 P1-b3")).toBe(true);
		expect(vi.mocked(postCard).mock.calls[0][3].mode).toBe("gm");
	});

	it("names them from the Knight names, on the card as well, never as somebody already there", async () => {
		thrown = personDice();
		await rollHexPerson({ scene, hex });
		const [first] = loreAt(lore, hex).sparks;
		expect(first.person).toBe(true);
		expect(KNIGHT_NAMES).toContain(first.name);
		expect(vi.mocked(postCard).mock.calls[0][2].title).toBe(first.name);

		const random = vi.spyOn(Math, "random").mockReturnValue(0);
		try {
			lore = emptyLore();
			thrown = personDice();
			await rollHexPerson({ scene, hex });
			thrown = personDice();
			await rollHexPerson({ scene, hex });
			const names = loreAt(lore, hex).sparks.map(({ name }) => name);
			expect(names).toEqual([KNIGHT_NAMES[0], KNIGHT_NAMES[1]]);
		} finally {
			random.mockRestore();
		}
	});

	it("is the GM's alone", async () => {
		game.user.isGM = false;
		expect(await rollHexPerson({ scene, hex })).toBeNull();
		expect(keepHexSparkRecords).not.toHaveBeenCalled();
	});
});

describe("keeping a person rolled elsewhere in a hex", () => {
	it("keeps them as the Lay of the Land does, with no card of its own", async () => {
		thrown = personDice();
		const person = await rollPersonTables();
		expect(await keepHexPerson(scene, hex, person, "Wren")).toBe(true);
		const [spark] = loreAt(lore, hex).sparks;
		expect(spark).toMatchObject({ page: "people", rolls: personDice(), when, name: "Wren" });
		expect(postCard).not.toHaveBeenCalled();
	});

	it("is the GM's alone, and only on a Realm", async () => {
		thrown = personDice();
		const person = await rollPersonTables();
		expect(await keepHexPerson({ id: "plain" }, hex, person, "Wren")).toBe(false);
		game.user.isGM = false;
		expect(await keepHexPerson(scene, hex, person, "Wren")).toBe(false);
		expect(keepHexSparkRecords).not.toHaveBeenCalled();
	});
});

describe("rolling up a Holding", () => {
	/** The count's d2, then the Holding's four tables, then each person, then each one's Myth. */
	const holdingDice = (d2, myths) => [d2, ...[1, 2, 3, 4, 5, 6, 7, 8], ...Array.from({ length: d2 + 1 }, personDice).flat(), ...myths];

	it("rolls the Holding, two or three people there, and the Myth each has heard of, kept in one write", async () => {
		thrown = holdingDice(2, [3, 1, 2]);
		const made = await rollUpHolding({ scene, hex });
		expect(made.people).toHaveLength(3);
		expect(keepHexSparkRecords).toHaveBeenCalledOnce();

		const sparks = loreAt(lore, hex).sparks;
		expect(sparks.map(({ page, table }) => [page, table])).toEqual([
			["civilisation", "C0"],
			["civilisation", "C1"],
			["civilisation", "C2"],
			["civilisation", "C8"],
			["people", 'people.holding.kept {"number":1,"count":3}'],
			["people", 'people.holding.kept {"number":2,"count":3}'],
			["people", 'people.holding.kept {"number":3,"count":3}']
		]);
		expect(sparks[0].prompt).toBe("C0-a1 C0-b2");
		expect(sparks[3].prompt).toBe("C8-a7 C8-b8");
		expect(sparks[4].entries.at(-1)).toBe('people.heardOf {"name":"the Myth 6"}');
		expect(sparks[5].entries.at(-1)).toBe('people.heardOf {"name":"the Myth 2"}');
		expect(sparks[6].entries.at(-1)).toBe('people.heardOf {"name":"the Myth 5"}');

		const [, template, context, options] = vi.mocked(postCard).mock.calls[0];
		expect(template).toBe("people");
		expect(context.title).toBe("Oakwall");
		expect(context.sparks).toHaveLength(4);
		expect(context.people.map(({ heard }) => heard)).toEqual([
			'people.heardOfPage {"name":"the Myth 6","page":39}',
			'people.heardOfPage {"name":"the Myth 2","page":31}',
			'people.heardOfPage {"name":"the Myth 5","page":37}'
		]);
		expect(context.note).toBeNull();
		expect(options).toMatchObject({ mode: "gm" });
		expect(options.rolls).toHaveLength(2);
		expect(options.rolls[1].dice.at(-1).faces).toBe(3);
	});

	it("gives each person there a name of their own, on the card as well", async () => {
		thrown = holdingDice(2, [3, 1, 2]);
		await rollUpHolding({ scene, hex });
		const names = loreAt(lore, hex).sparks.filter(({ person }) => person).map(({ name }) => name);
		expect(names).toHaveLength(3);
		expect(new Set(names).size).toBe(3);
		for (const name of names) expect(KNIGHT_NAMES).toContain(name);
		expect(vi.mocked(postCard).mock.calls[0][2].people[0].label).toBe(`people.holding.personNamed ${JSON.stringify({ name: names[0], number: 1, count: 3 })}`);
	});

	it("rolls two people on a d2 of 1", async () => {
		thrown = holdingDice(1, [1, 1]);
		expect((await rollUpHolding({ scene, hex })).people).toHaveLength(2);
		expect(loreAt(lore, hex).sparks).toHaveLength(6);
	});

	it("says nobody has heard of a Myth where the Realm has none", async () => {
		realm.myths = [];
		thrown = holdingDice(1, []);
		const made = await rollUpHolding({ scene, hex });
		expect(made.people.every(({ known }) => known === null)).toBe(true);
		expect(vi.mocked(postCard).mock.calls[0][2].note).toBe("people.holding.noMyths");
		expect(loreAt(lore, hex).sparks.at(-1).entries).toHaveLength(9);
	});

	it("rolls nothing in a hex without a Holding, or before the tables are imported", async () => {
		expect(await rollUpHolding({ scene, hex: { col: 1, row: 1 } })).toBeNull();
		expect(warn).toHaveBeenCalledWith("people.holding.none");
		artIndex.spark = artIndex.spark.filter((page) => page.key !== "civilisation");
		expect(await rollUpHolding({ scene, hex })).toBeNull();
		expect(warn).toHaveBeenCalledWith("people.holding.missing");
		expect(keepHexSparkRecords).not.toHaveBeenCalled();
		expect(postCard).not.toHaveBeenCalled();
	});
});
