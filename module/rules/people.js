/**
 * Rolling up people and the Holdings they live in from the Spark Tables. The
 * Referee in the examples of play makes a ruler or a stranger by rolling the
 * People tables (p24) in one go and reading the results together (p200,
 * p202), and takes a short break to roll a Holding, a few of its people, and
 * the Myths each of them has heard of (p181). Pure, so it can be tested
 * without Foundry.
 */
import { SPARK_PAGES, SPARK_TABLES_PER_PAGE, sparkPrompt } from "./spark-tables.js";

/** The Spark Table page a person is rolled from. */
export const PEOPLE_PAGE = SPARK_PAGES[2].key;

/** The Spark Table page a Holding is rolled from. */
export const CIVILISATION_PAGE = SPARK_PAGES[1].key;

/** "A few characters there" (p181): two or three people at a Holding. */
export const HOLDING_PEOPLE = "1d2 + 1";

/**
 * Where the tables that describe the Holding itself stand on the Civilisation
 * page (p23), which prints its nine three to a row: the whole first row, for
 * the place from outside, its grounds and its hall, and the last table of the
 * page, for what the talk is there. As with the wilderness set, no table name
 * from the book ships, so they're found by their place on the page.
 */
const HOLDING_POSITIONS = Object.freeze([0, 1, 2, 8]);

/**
 * The tables to roll in one go for a Holding, from the Civilisation page.
 * @param {{tables: object[]}|null|undefined} page A page of the art index's spark payload.
 * @returns {{index: number, table: object}[]} Empty when the page was never read. A
 *   page missing some of its tables gives the first three it did read instead,
 *   since the places above only mean anything on a page read whole.
 */
export function holdingSparkSet(page) {
	const tables = page?.tables ?? [];
	if (!tables.length) return [];
	const places = tables.length === SPARK_TABLES_PER_PAGE ? HOLDING_POSITIONS : [0, 1, 2];
	return places.filter((index) => tables[index]).map((index) => ({ index, table: tables[index] }));
}

/**
 * How many d12s rolling these tables takes: one for each column of each.
 * @param {{columns: string[]}[]} tables
 * @returns {number}
 */
export const sparkDiceCount = (tables) => tables.reduce((sum, table) => sum + table.columns.length, 0);

/**
 * Deal out d12s thrown together to the tables they were thrown for, a die to
 * each column in turn, and read each table's entries.
 * @param {{columns: string[], rows: string[][]}[]} tables
 * @param {number[]} dice At least one for each column of each table, in order.
 * @returns {{table: object, results: {column: string, roll: number, entry: string|null}[], prompt: string}[]}
 */
export function dealSparkDice(tables, dice) {
	let used = 0;
	return tables.map((table) => {
		const rolls = dice.slice(used, used + table.columns.length);
		used += table.columns.length;
		const results = sparkPrompt(table, rolls);
		return { table, results, prompt: results.map(({ entry }) => entry).filter(Boolean).join(" ") };
	});
}

/**
 * A person as the People tables made them: a trait for each table that gave
 * one, named by the table, such as "Voice: Soothing Blunt".
 * @param {ReturnType<typeof dealSparkDice>} rolled The People page's tables, rolled.
 * @returns {{name: string, prompt: string, rolls: number[], results: object[]}[]}
 */
export function personTraits(rolled) {
	return rolled
		.filter(({ prompt }) => prompt)
		.map(({ table, results, prompt }) => ({ name: table.name, prompt, rolls: results.map((result) => result.roll), results }));
}

/**
 * A person in one line, as a hex's list of rolls shows it.
 * @param {ReturnType<typeof personTraits>} traits
 * @param {string|null} [heard] What they know of the Realm's Myths, in words, as its own last part.
 * @returns {string}
 */
export const personLine = (traits, heard = null) => [...traits.map(({ name, prompt }) => `${name}: ${prompt}`), heard].filter(Boolean).join(" · ");

/**
 * A person as a hex keeps them: one entry in its list of rolls, in the same
 * shape as a Spark Table roll, so they're listed, searched and struck out
 * wherever the hex's rolls are.
 * @param {ReturnType<typeof personTraits>} traits
 * @param {object} options
 * @param {string} options.id
 * @param {string} options.table What the hex's lists show beside them, such as "A person".
 * @param {string|null} [options.heard] The Myth they've heard of, in words.
 * @param {object|null} [options.when] The world's calendar when they were rolled.
 * @param {string|null} [options.name] What they're called.
 * @returns {import("./hex-lore.js").HexSpark}
 */
export function personSpark(traits, { id, table, heard = null, when = null, name = null }) {
	const spark = {
		id,
		page: PEOPLE_PAGE,
		person: true,
		table,
		rolls: traits.flatMap((trait) => trait.rolls),
		entries: [...traits.map(({ name: trait, prompt }) => `${trait}: ${prompt}`), heard].filter(Boolean),
		prompt: personLine(traits, heard),
		when
	};
	if (name) spark.name = name;
	return spark;
}

/** A trait as a person's entry holds it, "Voice: Soothing Blunt": the table, then what it gave. */
const TRAIT_ENTRY = /^([^:]+):\s+(.+)$/;

/**
 * A person kept in a hex, read back into their parts for a tidy list: their
 * name, a row for each trait, and what they've heard of the Realm's Myths.
 * People kept before they were marked as such are known by their entries, a
 * trait to each; a roll on one People table on its own isn't a person.
 * @param {import("./hex-lore.js").HexSpark} spark
 * @returns {{name: string, traits: {label: string, text: string}[], heard: string|null}|null}
 *   Null for anything but a person.
 */
export function personView(spark) {
	const entries = spark?.entries ?? [];
	const traits = [];
	const others = [];
	for (const entry of entries) {
		const match = TRAIT_ENTRY.exec(entry);
		if (match) traits.push({ label: match[1].trim(), text: match[2].trim() });
		else others.push(entry);
	}
	const person = spark?.person === true || (spark?.page === PEOPLE_PAGE && traits.length >= 2);
	if (!person) return null;
	return { name: spark.name ?? "", traits, heard: others.join(" ") || null };
}

/**
 * The Myth of the Realm someone has heard of, by a die as big as the Realm has
 * Myths, as the Referee rolls one for each Knight to have heard of (p200).
 * @param {{myths: object[]}|null} realm
 * @param {number} roll From 1.
 * @returns {object|null} Null where the Realm has no Myths.
 */
export const heardOfMyth = (realm, roll) => realm?.myths?.[roll - 1] ?? null;
