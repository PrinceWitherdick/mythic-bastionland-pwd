/**
 * How often a Knight's Ability may be used, read off its own words: "once per
 * day", "twice each fight", "three times, renewed at sunset". Pure, so it can
 * be tested without Foundry. The words come from the GM's own book at import.
 */
import { stripHTML } from "./ledger.js";
import { countAfter, isCounted, isUsedUp, restockUpdates } from "./restock.js";

/** How many uses, as a count word or "N times". */
const COUNTS = Object.freeze({ once: 1, twice: 2, thrice: 3 });
const NUMBER_WORDS = Object.freeze({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 });
// "Once" as a count, not "at once", "once more" or the "once you have…" that opens a clause.
const COUNT = /(?<!\bat )\b(once|twice|thrice)\b(?! (?:you|they|it|he|she|we|i|the|this|that|more|again)\b)|\b(\d+|one|two|three|four|five|six) times\b/gi;

/** How far, in letters, a cadence may stand from its count and still be its own. */
const NEAR = 24;

/** When the uses come back, keyed by ABILITY_CADENCES. */
const EACH = String.raw`\b(?:per|each|every|a|an|once a)`;
const CADENCES = Object.freeze([
	["attack", new RegExp(`${EACH} attack\\b`, "gi")],
	["combat", new RegExp(`${EACH} (?:combat|fight|battle)\\b`, "gi")],
	["phase", new RegExp(`${EACH} phase\\b`, "gi")],
	["night", new RegExp(`${EACH} night\\b|\\bat (?:sunset|nightfall|dusk)\\b`, "gi")],
	["day", new RegExp(`${EACH} day\\b|\\bdaily\\b`, "gi")],
	["location", new RegExp(`${EACH} (?:location|place|hex)\\b`, "gi")],
	["season", new RegExp(`${EACH} season\\b`, "gi")]
]);

/**
 * @param {RegExpMatchArray} a
 * @param {RegExpMatchArray} b
 * @returns {number} The letters between two matches, none where they touch.
 */
function gap(a, b) {
	const [first, second] = a.index <= b.index ? [a, b] : [b, a];
	return Math.max(0, second.index - (first.index + first[0].length));
}

/**
 * @param {string} text An Ability's words, as plain text or HTML.
 * @returns {{quantity?: {value: number, max: number}, restock?: string}} Nothing
 *   unless both how many uses and when they come back are said, side by side.
 */
export function usesFrom(text) {
	const plain = stripHTML(text);
	for (const count of plain.matchAll(COUNT)) {
		const uses = count[1] ? COUNTS[count[1].toLowerCase()] : Number(count[2]) || NUMBER_WORDS[count[2].toLowerCase()];
		if (!uses) continue;
		// The cadence said nearest the count, as in "once per place, before nightfall".
		const found = CADENCES.map(([cadence, pattern]) => [cadence, Math.min(...[...plain.matchAll(pattern)].map((match) => gap(count, match)))])
			.filter(([, distance]) => distance <= NEAR)
			.sort((a, b) => a[1] - b[1]);
		if (found.length) return { quantity: { value: uses, max: uses }, restock: found[0][0] };
	}
	return {};
}

/** What an Ability can lend one Attack, each declared before the roll. */
export const ATTACK_GRANTS = Object.freeze(["blast", "ignoresArmour", "strongGambits"]);

/**
 * @typedef {object} AbilityOffer An Ability the Attack dialog offers.
 * @property {string} id
 * @property {string} name
 * @property {string[]} grants From ATTACK_GRANTS.
 * @property {boolean} counted Whether using it spends one of its uses.
 */

/**
 * @param {{restock?: string, quantity?: object}} system An Ability's system data.
 * @returns {boolean} Whether it has a use for the Attack being made: one left,
 *   or uses that come back with this Attack.
 */
const readyForAttack = (system) => system?.restock === "attack" || !isUsedUp(system);

/**
 * The Abilities that lend an Attack something, and have a use left for it.
 * @param {{id: string, name: string, type: string, system: object}[]} items An actor's items.
 * @returns {AbilityOffer[]}
 */
export function abilityOffers(items) {
	return items
		.filter((item) => item.type === "ability" && readyForAttack(item.system))
		.map((item) => ({
			id: item.id,
			name: item.name,
			grants: ATTACK_GRANTS.filter((key) => item.system?.grants?.[key]),
			counted: isCounted(item.system)
		}))
		.filter((offer) => offer.grants.length);
}

/**
 * What the Attack dialog declared for this blow: each grant ticked on its
 * own, or lent by an Ability ticked.
 * @param {{declare?: Record<string, boolean>, ability?: Record<string, boolean>}} choice The expanded form data.
 * @param {AbilityOffer[]} offers
 * @returns {{used: AbilityOffer[], blast: boolean, ignoresArmour: boolean, strongGambits: boolean}}
 */
export function declaredGrants(choice, offers) {
	const used = offers.filter((offer) => choice?.ability?.[offer.id]);
	const grants = Object.fromEntries(ATTACK_GRANTS.map((key) => [key, Boolean(choice?.declare?.[key]) || used.some((offer) => offer.grants.includes(key))]));
	return { used, ...grants };
}

/**
 * An Attack's updates to its maker's Abilities: those good once an Attack are
 * ready again, then one use is spent of each counted Ability it used.
 * @param {{id: string, type: string, system: object}[]} items An actor's items.
 * @param {string[]} usedIds Abilities used in this Attack.
 * @returns {{_id: string, "system.quantity.value": number}[]}
 */
export function abilityUpdatesAfterAttack(items, usedIds) {
	const abilities = items.filter((item) => item.type === "ability");
	const updates = new Map(restockUpdates(abilities, ["attack"]).map((update) => [update._id, update]));
	for (const item of abilities.filter((each) => usedIds.includes(each.id) && isCounted(each.system))) {
		const ready = updates.get(item.id)?.["system.quantity.value"];
		const quantity = ready === undefined ? item.system.quantity : { ...item.system.quantity, value: ready };
		updates.set(item.id, { _id: item.id, "system.quantity.value": countAfter(quantity, -1) });
	}
	return [...updates.values()];
}
