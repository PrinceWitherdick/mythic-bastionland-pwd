/**
 * Which Myths a Realm holds, apart from where they lie. Creating a Realm (p14)
 * places six Myths and rolls each of them on the Myths table (p27), but the
 * Myths are what a Realm is played for, so a Referee settles them for
 * themselves: one rolled again, all of them rolled again, or one chosen by
 * hand. A Realm never holds the same Myth twice. Pure, so it can be tested
 * without Foundry.
 */
import { spreads } from "./book-art.js";
import { MYTH_COUNT } from "./realm.js";

/** @type {readonly {d6: number, d12: number, roll: string}[]|null} Reckoned once: the table is the same in every copy of the book. */
let allRolls = null;

/** @returns {readonly {d6: number, d12: number, roll: string}[]} Every roll on the Myths table, in book order. */
export function mythRolls() {
	allRolls ??= Object.freeze(spreads().map(({ d6, d12, roll }) => Object.freeze({ d6, d12, roll })));
	return allRolls;
}

/**
 * @param {{d6: number, d12: number}} roll
 * @returns {string} What tells one roll from another, such as "3-7".
 */
export const mythRollKey = ({ d6, d12 }) => `${d6}-${d12}`;

/**
 * @param {{d6: number, d12: number}[]} myths The Myths a Realm holds.
 * @param {{d6: number, d12: number}} roll
 * @returns {object|null} The Myth of the Realm on that roll, if it has one.
 */
export const mythWithRoll = (myths, roll) => myths.find((myth) => mythRollKey(myth) === mythRollKey(roll)) ?? null;

/**
 * How many numbers a Realm's Myths go by: as many as it was set up with, six
 * by the book (p14), or more where a Myth has since been put under a higher one.
 * @param {{myths: {number: number}[], setup?: {myths?: number}}} realm
 * @returns {number}
 */
export function mythSlots(realm) {
	const setUp = realm.setup?.myths;
	return Math.max(Number.isInteger(setUp) ? setUp : MYTH_COUNT, ...realm.myths.map((myth) => myth.number));
}

/**
 * @param {{d6: number, d12: number}[]} [myths] The Myths a Realm holds.
 * @returns {{d6: number, d12: number, roll: string}[]} The rolls it hasn't got.
 */
export function freeMythRolls(myths = []) {
	const taken = new Set(myths.map(mythRollKey));
	return mythRolls().filter((roll) => !taken.has(mythRollKey(roll)));
}

/**
 * A Myth the Realm hasn't got, for one of its own to become.
 * @param {{pick: <T>(list: T[]) => T|undefined}} random
 * @param {{d6: number, d12: number}[]} [myths] The Myths a Realm holds, the one being rolled again among them.
 * @returns {{d6: number, d12: number, roll: string}|null} Null only where the Realm holds every Myth in the book.
 */
export function rollFreeMyth(random, myths = []) {
	const free = freeMythRolls(myths);
	return free.length ? random.pick(free) ?? null : null;
}

/**
 * Roll every one of a Realm's Myths again, no two alike. A Myth that was there
 * before can come up again: the dice don't remember, and the book doesn't say
 * they should.
 * @param {{shuffle: <T>(list: T[]) => T[]}} random
 * @param {{number: number, d6: number, d12: number}[]} [myths] The Myths a Realm holds.
 * @returns {object[]} The same Myths, each under its own number and in its own hex, on a new roll.
 */
export function rollMythsAgain(random, myths = []) {
	const rolls = random.shuffle([...mythRolls()]);
	// One the Referee wrote is rolled again too, and becomes one of the book's.
	return myths.slice(0, rolls.length).map(({ own: _own, ...myth }, index) => ({ ...myth, d6: rolls[index].d6, d12: rolls[index].d12 }));
}
