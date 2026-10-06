import { describe, expect, it } from "vitest";
import { emptyLore, loreAt, recordSpark } from "../../module/rules/hex-lore.js";
import {
	CIVILISATION_PAGE,
	PEOPLE_PAGE,
	dealSparkDice,
	editedPerson,
	heardOfMyth,
	hexesWithPeople,
	holdingSparkSet,
	personLine,
	personSpark,
	personTraits,
	personView,
	sparkDiceCount
} from "../../module/rules/people.js";

// Invented, so no book text lives in the repository.
const table = (name, first = "Left", second = "Right") => ({
	name,
	columns: [first, second],
	rows: Array.from({ length: 12 }, (_, row) => [`${name}-a${row + 1}`, `${name}-b${row + 1}`])
});
const page = (count) => ({ tables: Array.from({ length: count }, (_, index) => table(`T${index}`)) });

describe("the pages", () => {
	it("rolls people from the People page and Holdings from the Civilisation page", () => {
		expect(PEOPLE_PAGE).toBe("people");
		expect(CIVILISATION_PAGE).toBe("civilisation");
	});
});

describe("holdingSparkSet", () => {
	it("takes the page's first row and its last table, by place rather than by name", () => {
		expect(holdingSparkSet(page(9)).map(({ index, table: { name } }) => [index, name])).toEqual([[0, "T0"], [1, "T1"], [2, "T2"], [8, "T8"]]);
	});

	it("takes the first three of a page not read whole, and nothing from a page never read", () => {
		expect(holdingSparkSet(page(5)).map(({ index }) => index)).toEqual([0, 1, 2]);
		expect(holdingSparkSet(page(2)).map(({ index }) => index)).toEqual([0, 1]);
		expect(holdingSparkSet(null)).toEqual([]);
		expect(holdingSparkSet({ tables: [] })).toEqual([]);
	});
});

describe("dealSparkDice", () => {
	it("deals the dice out a column at a time, table after table", () => {
		const tables = [table("Look"), table("Voice")];
		expect(sparkDiceCount(tables)).toBe(4);
		const rolled = dealSparkDice(tables, [1, 12, 5, 6]);
		expect(rolled.map(({ prompt }) => prompt)).toEqual(["Look-a1 Look-b12", "Voice-a5 Voice-b6"]);
		expect(rolled[1].results).toEqual([
			{ column: "Left", roll: 5, entry: "Voice-a5" },
			{ column: "Right", roll: 6, entry: "Voice-b6" }
		]);
	});
});

describe("a person", () => {
	const rolled = dealSparkDice([table("Look"), table("Voice")], [2, 3, 4, 5]);
	const traits = personTraits(rolled);

	it("has a trait for each table, named by it, with its dice", () => {
		expect(traits.map(({ name, prompt, rolls }) => ({ name, prompt, rolls }))).toEqual([
			{ name: "Look", prompt: "Look-a2 Look-b3", rolls: [2, 3] },
			{ name: "Voice", prompt: "Voice-a4 Voice-b5", rolls: [4, 5] }
		]);
	});

	it("leaves out a table whose dice found nothing", () => {
		expect(personTraits(dealSparkDice([table("Look"), table("Voice")], [13, 13, 4, 5])).map(({ name }) => name)).toEqual(["Voice"]);
	});

	it("reads as one line, with the Myth they've heard of last", () => {
		expect(personLine(traits)).toBe("Look: Look-a2 Look-b3 · Voice: Voice-a4 Voice-b5");
		expect(personLine(traits, "Has heard of the Heron")).toBe("Look: Look-a2 Look-b3 · Voice: Voice-a4 Voice-b5 · Has heard of the Heron");
	});

	it("is kept in a hex as one entry among its rolls", () => {
		const when = { age: 1, season: "spring", day: 1, phase: "morning" };
		const spark = personSpark(traits, { id: "p1", table: "A person", heard: "Has heard of the Heron", when });
		expect(spark).toEqual({
			id: "p1",
			page: "people",
			person: true,
			table: "A person",
			rolls: [2, 3, 4, 5],
			entries: ["Look: Look-a2 Look-b3", "Voice: Voice-a4 Voice-b5", "Has heard of the Heron"],
			prompt: "Look: Look-a2 Look-b3 · Voice: Voice-a4 Voice-b5 · Has heard of the Heron",
			traitCount: 2,
			when
		});
		const hex = { col: 3, row: 4 };
		expect(loreAt(recordSpark(emptyLore(), hex, spark), hex).sparks).toEqual([spark]);
	});

	it("keeps their name in the hex", () => {
		const spark = personSpark(traits, { id: "p1", table: "A person", name: "Hamo" });
		expect(spark.name).toBe("Hamo");
		const hex = { col: 3, row: 4 };
		expect(loreAt(recordSpark(emptyLore(), hex, spark), hex).sparks[0].name).toBe("Hamo");
		expect(personSpark(traits, { id: "p2", table: "A person" })).not.toHaveProperty("name");
	});
});

describe("editedPerson", () => {
	const traits = personTraits(dealSparkDice([table("Look"), table("Voice")], [2, 3, 4, 5]));
	const hamo = () => personSpark(traits, { id: "p1", table: "A person", heard: "Has heard of the Heron", name: "Hamo" });

	it("rewrites their name, traits and what they've heard, and the line the hex reads", () => {
		const edited = editedPerson(hamo(), { name: " Odo ", traits: ["Tall and grey", "Soft"], heard: "Knows the Wyrm" });
		expect(personView(edited)).toEqual({
			name: "Odo",
			traits: [
				{ label: "Look", text: "Tall and grey" },
				{ label: "Voice", text: "Soft" }
			],
			heard: "Knows the Wyrm"
		});
		expect(edited.prompt).toBe("Look: Tall and grey · Voice: Soft · Knows the Wyrm");
		expect(edited.rolls).toEqual(hamo().rolls);
	});

	it("keeps what a trait or what they've heard said when its box is left empty, and leaves them unnamed without a name", () => {
		const edited = editedPerson(hamo(), { name: "", traits: ["", "Soft"], heard: " " });
		expect(edited).not.toHaveProperty("name");
		expect(personView(edited).traits[0]).toEqual({ label: "Look", text: "Look-a2 Look-b3" });
		expect(personView(edited).heard).toBe("Has heard of the Heron");
	});

	it("keeps what they've heard as heard when it reads like a trait", () => {
		const edited = editedPerson(hamo(), { heard: "Rumour: the Wyrm walks" });
		expect(personView(edited).traits).toHaveLength(2);
		expect(personView(edited).heard).toBe("Rumour: the Wyrm walks");
		const hex = { col: 3, row: 4 };
		expect(personView(loreAt(recordSpark(emptyLore(), hex, edited), hex).sparks[0]).heard).toBe("Rumour: the Wyrm walks");
	});

	it("marks a person kept before people were marked, and counts their traits, once edited", () => {
		const { person: _person, traitCount: _count, ...old } = hamo();
		const edited = editedPerson(old, { heard: "Rumour: the Wyrm walks" });
		expect(edited).toMatchObject({ person: true, traitCount: 2 });
		expect(personView(edited).heard).toBe("Rumour: the Wyrm walks");
	});

	it("gives back the person it was handed when nothing changes", () => {
		const spark = hamo();
		expect(editedPerson(spark, { name: "Hamo", traits: ["Look-a2 Look-b3", ""], heard: "" })).toBe(spark);
	});
});

describe("personView", () => {
	const traits = personTraits(dealSparkDice([table("Look"), table("Voice")], [2, 3, 4, 5]));

	it("reads a person back into their name, a row for each trait, and what they've heard of", () => {
		const spark = personSpark(traits, { id: "p1", table: "A person", heard: "Has heard of the Heron", name: "Hamo" });
		expect(personView(spark)).toEqual({
			name: "Hamo",
			traits: [
				{ label: "Look", text: "Look-a2 Look-b3" },
				{ label: "Voice", text: "Voice-a4 Voice-b5" }
			],
			heard: "Has heard of the Heron"
		});
	});

	it("gives an unnamed person an empty name and nothing heard", () => {
		expect(personView(personSpark(traits, { id: "p1", table: "A person" }))).toMatchObject({ name: "", heard: null });
	});

	it("knows a person kept before people were marked by their entries", () => {
		const { person: _person, ...old } = personSpark(traits, { id: "p1", table: "A person" });
		expect(personView(old)?.traits).toHaveLength(2);
	});

	it("leaves one People table rolled on its own, and other pages' rolls, as rolls", () => {
		expect(personView({ id: "a", page: PEOPLE_PAGE, table: "Look", entries: ["Look-a2", "Look-b3"] })).toBeNull();
		expect(personView({ id: "b", page: "nature", table: "Land", entries: ["Land: Wet", "Sky: Grey"] })).toBeNull();
	});
});

describe("hexesWithPeople", () => {
	it("finds the hexes with someone kept in them, not those with other rolls", () => {
		const person = { id: "p", page: PEOPLE_PAGE, table: "A person", person: true, entries: ["Look: Tall", "Voice: Low"] };
		const roll = { id: "r", page: "nature", table: "Land", entries: ["Wet"] };
		const lore = { hexes: { "1,2": { note: "", sparks: [roll, person] }, "3,4": { note: "", sparks: [roll] }, "5,6": { note: "Quiet", sparks: [] } } };
		expect([...hexesWithPeople(lore)]).toEqual(["1,2"]);
		expect(hexesWithPeople(emptyLore()).size).toBe(0);
		expect(hexesWithPeople(null).size).toBe(0);
	});

	it("passes over a hex whose rolls aren't a list", () => {
		expect(hexesWithPeople({ hexes: { "1,2": { sparks: {} }, "3,4": { sparks: "bad" }, "5,6": null } }).size).toBe(0);
	});
});

describe("heardOfMyth", () => {
	it("finds the Realm's Myth by a die as big as the Realm has Myths", () => {
		const realm = { myths: [{ number: 1 }, { number: 4 }, { number: 6 }] };
		expect(heardOfMyth(realm, 2)).toEqual({ number: 4 });
		expect(heardOfMyth({ myths: [] }, 1)).toBeNull();
		expect(heardOfMyth(null, 1)).toBeNull();
	});
});
