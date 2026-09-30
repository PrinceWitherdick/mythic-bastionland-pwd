import { loadArtIndex, mythEntry, sparkTablesOf } from "../book-art/art-index.js";
import { postCard, t, warn } from "../chat/cards.js";
import {
	CIVILISATION_PAGE,
	HOLDING_PEOPLE,
	PEOPLE_PAGE,
	dealSparkDice,
	heardOfMyth,
	holdingSparkSet,
	personSpark,
	personTraits,
	sparkDiceCount
} from "../rules/people.js";
import { featureAt } from "../rules/realm.js";
import { midSentence } from "../rules/text.js";
import { getCalendar } from "./calendar.js";
import { keepHexSparkRecords } from "./hex-lore.js";
import { getRealm, isRealmScene } from "./realm.js";

/**
 * @typedef {object} RolledPerson
 * @property {object} page The People page, as the art index holds it.
 * @property {ReturnType<typeof dealSparkDice>} rolled Every table on the page, in the page's order.
 * @property {ReturnType<typeof personTraits>} traits The tables that gave something, named.
 * @property {Roll} roll The d12s behind them, thrown together.
 */

/**
 * Throw a d12 for each column of each table, all together, and whatever other
 * dice are asked for after them.
 * @param {object[]} tables
 * @param {string[]} [others] Such as "1d4".
 * @returns {Promise<{roll: Roll, d12s: number[], others: number[]}>}
 */
async function throwTables(tables, others = []) {
	const count = sparkDiceCount(tables);
	const roll = await new Roll([...Array.from({ length: count }, () => "1d12"), ...others].join(" + ")).evaluate();
	const dice = roll.dice.map((die) => die.total);
	return { roll, d12s: dice.slice(0, count), others: dice.slice(count) };
}

/** @returns {string} Where a page of Spark Tables is, for a card. */
const pageReference = (page) => t("spark.tagline", { page: page.name || t(`spark.pages.${page.key}`), number: page.page });

/**
 * A person's lines on a card.
 * @param {ReturnType<typeof personTraits>} traits
 * @returns {{name: string, prompt: string, rolls: number[]}[]}
 */
const traitLines = (traits) => traits.map(({ name, prompt, rolls }) => ({ name, prompt, rolls }));

/**
 * Roll every People Spark Table at once (p24), as the Referee does to make a
 * ruler or a stranger (p200, p202). Nothing is posted.
 * @returns {Promise<RolledPerson|null>} Null, with a word to the user, where Import PDF hasn't read the page.
 */
export async function rollPersonTables() {
	const page = sparkTablesOf(await loadArtIndex(), PEOPLE_PAGE);
	if (!page) {
		warn("people.missing");
		return null;
	}
	const { roll, d12s } = await throwTables(page.tables);
	const rolled = dealSparkDice(page.tables, d12s);
	return { page, rolled, traits: personTraits(rolled), roll };
}

/**
 * Post a person rolled on the People tables.
 * @param {RolledPerson} person
 * @param {object} [options]
 * @param {string|null} [options.hex] Where they were rolled, for the card's heading.
 * @param {"gm"} [options.mode] Left out, the card goes as the user's chat mode says.
 * @returns {Promise<ChatMessage|null>}
 */
export function postPerson({ page, traits, roll }, { hex = null, mode } = {}) {
	return postCard(null, "people", {
		title: t("people.title"),
		tagline: hex ? t("people.taglineHex", { hex, reference: pageReference(page) }) : pageReference(page),
		people: [{ traits: traitLines(traits) }]
	}, { rolls: [roll], mode });
}

/**
 * Roll a person met in a hex, keep them there as the Lay of the Land keeps its
 * rolls, and whisper the GMs the card. GMs only.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}} options.hex
 * @returns {Promise<RolledPerson|null>}
 */
export async function rollHexPerson({ scene, hex }) {
	if (!game.user.isGM || !isRealmScene(scene)) return null;
	const person = await rollPersonTables();
	if (!person) return null;
	await Promise.all([
		keepHexSparkRecords(scene, hex, [personSpark(person.traits, {
			id: foundry.utils.randomID(),
			table: t("people.kept", { page: person.page.page }),
			when: getCalendar()
		})]),
		postPerson(person, { hex: t("realm.hex", hex), mode: "gm" })
	]);
	return person;
}

/**
 * Roll up a Holding in one go, as the Referee does on a short break (p181):
 * the Holding itself on the Civilisation tables, two or three people there,
 * and for each of them one of the Realm's Myths, at random, they've heard of (p200).
 * Everything is kept in the hex, and the GMs are whispered one card. GMs only.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}} options.hex
 * @returns {Promise<{holding: object[], people: object[]}|null>} What was rolled, or null where nothing was.
 */
export async function rollUpHolding({ scene, hex }) {
	if (!game.user.isGM || !isRealmScene(scene)) return null;
	const { realm } = getRealm(scene);
	const here = featureAt(realm, hex).holding;
	if (!here) {
		warn("people.holding.none");
		return null;
	}
	const index = await loadArtIndex();
	const civilisation = sparkTablesOf(index, CIVILISATION_PAGE);
	const people = sparkTablesOf(index, PEOPLE_PAGE);
	const set = holdingSparkSet(civilisation);
	if (!set.length || !people) {
		warn("people.holding.missing");
		return null;
	}

	const count = await new Roll(HOLDING_PEOPLE).evaluate();
	const folk = count.total;
	const myths = realm.myths ?? [];
	const tables = [...set.map(({ table }) => table), ...Array.from({ length: folk }, () => people.tables).flat()];
	const { roll, d12s, others } = await throwTables(tables, myths.length ? Array.from({ length: folk }, () => `1d${myths.length}`) : []);

	const rolled = dealSparkDice(tables, d12s);
	const place = rolled.slice(0, set.length).filter(({ prompt }) => prompt);
	const when = getCalendar();
	const reference = pageReference(civilisation);
	const persons = Array.from({ length: folk }, (_, number) => {
		const start = set.length + number * people.tables.length;
		const traits = personTraits(rolled.slice(start, start + people.tables.length));
		const myth = myths.length ? heardOfMyth(realm, others[number]) : null;
		const known = myth ? mythEntry(index, myth) : null;
		return { number: number + 1, traits, known };
	});

	const sparks = [
		...place.map(({ table, results, prompt }) => ({
			id: foundry.utils.randomID(),
			page: civilisation.key,
			table: table.name,
			rolls: results.map((result) => result.roll),
			entries: results.map((result) => result.entry).filter(Boolean),
			prompt,
			when
		})),
		...persons.map(({ number, traits, known }) => personSpark(traits, {
			id: foundry.utils.randomID(),
			table: t("people.holding.kept", { number, count: folk }),
			heard: known ? t("people.heardOf", { name: midSentence(known.name) }) : null,
			when
		}))
	];
	await keepHexSparkRecords(scene, hex, sparks);

	await postCard(null, "people", {
		title: here.name || t(`realm.holdings.${here.style}`),
		tagline: t("people.holding.tagline", { hex: t("realm.hex", hex) }),
		sparks: place.map(({ table, results, prompt }) => ({ name: table.name, reference, prompt, results: results.filter((result) => result.entry) })),
		people: persons.map(({ number, traits, known }) => ({
			label: t("people.holding.person", { number, count: folk }),
			traits: traitLines(traits),
			heard: known ? t("people.heardOfPage", { name: midSentence(known.name), page: known.page }) : null
		})),
		note: myths.length ? null : t("people.holding.noMyths")
	}, { rolls: [count, roll], mode: "gm" });
	return { holding: place, people: persons };
}
