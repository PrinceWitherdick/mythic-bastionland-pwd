/**
 * How often a Knight's Ability may be used, read off its own words: "once per
 * day", "twice each fight", "three times, renewed at sunset". Pure, so it can
 * be tested without Foundry. The words come from the GM's own book at import.
 */
import { stripHTML } from "./text.js";
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

/**
 * What an Ability can lend one Attack, each declared before the roll: a Blast,
 * a blow that ignores Armour, Strong Gambits without an 8+, Damage taken off
 * SPI rather than VIG (p68), the weapon shattered as it lands (p92), a blow
 * made alone that nobody joins, dice joined into bigger ones before the roll
 * (p56), and what a Wound from it does besides: the VIG it costs taken back,
 * normal sleep, or a memory shown (p166).
 */
export const ATTACK_GRANTS = Object.freeze(["blast", "ignoresArmour", "strongGambits", "spirit", "drain", "sleep", "memory", "shatters", "alone", "combine"]);

/**
 * What a Wound from a blow can do besides, of which an Ability offering more
 * than one has one picked before each blow (p166).
 */
export const WOUND_EFFECTS = Object.freeze(["drain", "sleep", "memory"]);

/**
 * What a Knight may declare for a blow without an Ability lending it, as a
 * weapon may Blast or ignore Armour: the rest come with the Ability that lends them.
 */
export const OPEN_GRANTS = Object.freeze(["blast", "ignoresArmour", "strongGambits"]);

/**
 * @param {{type: string}} actor Whoever makes the Attack.
 * @returns {readonly string[]} The grants they may declare on their own: a
 *   Knight only OPEN_GRANTS, and the Referee's Cast, who keep no Abilities, any.
 */
export const declarableBy = (actor) => (actor?.type === "knight" ? OPEN_GRANTS : ATTACK_GRANTS);

/**
 * Grants that change how one blow is made or lands, so they're chosen blow by
 * blow: an Ability lending any of them, or a die, is offered unticked even
 * with no limit on its uses.
 */
export const CHOSEN_GRANTS = Object.freeze(["spirit", ...WOUND_EFFECTS, "shatters", "alone", "combine"]);

/**
 * What an Ability can do besides lending an Attack something, each a box on
 * its sheet: roll a joint Attack's whole pool again (p62), take an ally's
 * Mortal Wound (p66), flip a coin for a life (p120), and etch a rune for a
 * number at sunset (p100).
 */
export const ABILITY_POWERS = Object.freeze(["rerollPool", "deathWard", "coinFlip", "sigil"]);

/**
 * The only kind of Attack an Ability can be used in, as its words say: any, a
 * melee Attack (p68), or a mounted charge (p92).
 */
export const ABILITY_NEEDS = Object.freeze(["", "melee", "charge"]);

/**
 * @typedef {object} AbilityOffer An Ability the Attack dialog offers.
 * @property {string} id
 * @property {string} name
 * @property {string[]} grants From ATTACK_GRANTS.
 * @property {string[]} effects The WOUND_EFFECTS among its grants, where it has more than one to pick from.
 * @property {string} bonusDie A die it adds to the Attack, such as "d12", or "".
 * @property {string} needs One of ABILITY_NEEDS.
 * @property {boolean} counted Whether using it spends one of its uses.
 * @property {boolean} chosen Whether it's used blow by blow, lending a die or one of CHOSEN_GRANTS.
 */

/**
 * @param {{restock?: string, quantity?: object}} system An Ability's system data.
 * @returns {boolean} Whether it has a use for the Attack being made: one left,
 *   or uses that come back with this Attack.
 */
export const readyForAttack = (system) => system?.restock === "attack" || !isUsedUp(system);

/**
 * The Abilities that lend an Attack something, and have a use left for it.
 * @param {{id: string, name: string, type: string, system: object}[]} items An actor's items.
 * @returns {AbilityOffer[]}
 */
export function abilityOffers(items) {
	return items
		.filter((item) => item.type === "ability" && readyForAttack(item.system))
		.map((item) => {
			const grants = ATTACK_GRANTS.filter((key) => item.system?.grants?.[key]);
			const bonusDie = parseDieName(item.system?.bonusDie);
			const effects = grants.filter((key) => WOUND_EFFECTS.includes(key));
			return {
				id: item.id,
				name: item.name,
				grants,
				effects: effects.length > 1 ? effects : [],
				bonusDie,
				needs: ABILITY_NEEDS.includes(item.system?.needs) ? item.system.needs : "",
				counted: isCounted(item.system),
				chosen: Boolean(bonusDie) || grants.some((key) => CHOSEN_GRANTS.includes(key))
			};
		})
		.filter((offer) => offer.grants.length || offer.bonusDie);
}

/**
 * @param {unknown} die
 * @returns {string} "d12" for a die named so, or "" for anything else.
 */
const parseDieName = (die) => (typeof die === "string" && /^d\d+$/.test(die) ? die : "");

/**
 * The grants an Ability ticked in the Attack dialog lends this blow: all of
 * them, but of several things a Wound could do, only the one picked (p166),
 * or the first where none was.
 * @param {AbilityOffer} offer
 * @param {{effect?: Record<string, string>}} choice The expanded form data.
 * @returns {string[]}
 */
function grantsUsed(offer, choice) {
	if (!offer.effects?.length) return offer.grants;
	const picked = offer.effects.includes(choice?.effect?.[offer.id]) ? choice.effect[offer.id] : offer.effects[0];
	return offer.grants.filter((key) => key === picked || !offer.effects.includes(key));
}

/**
 * What the Attack dialog declared for this blow: each grant ticked on its
 * own, or lent by an Ability ticked, and the dice those Abilities add. Of what
 * a Wound does besides, only one is had (p166): the Ability's, or else the one picked.
 * @param {{declare?: Record<string, boolean|string>, ability?: Record<string, boolean>, effect?: Record<string, string>}} choice
 *   The expanded form data, `declare.onWound` the one of WOUND_EFFECTS picked on its own.
 * @param {AbilityOffer[]} offers
 * @param {readonly string[]} [open] The grants they may declare on their own, from declarableBy.
 * @returns {{used: AbilityOffer[], dice: {die: string, name: string}[]} & Record<string, boolean>} The used Abilities,
 *   their dice, and each of ATTACK_GRANTS.
 */
export function declaredGrants(choice, offers, open = ATTACK_GRANTS) {
	const used = offers.filter((offer) => choice?.ability?.[offer.id]);
	const lent = used.flatMap((offer) => grantsUsed(offer, choice));
	const picked = choice?.declare?.onWound;
	const onWound = WOUND_EFFECTS.includes(picked) && open.includes(picked) && !lent.some((key) => WOUND_EFFECTS.includes(key)) ? picked : null;
	const ticked = (key) => open.includes(key) && !WOUND_EFFECTS.includes(key) && Boolean(choice?.declare?.[key]);
	const grants = Object.fromEntries(ATTACK_GRANTS.map((key) => [key, ticked(key) || key === onWound || lent.includes(key)]));
	const dice = used.filter((offer) => offer.bonusDie).map((offer) => ({ die: offer.bonusDie, name: offer.name }));
	return { used, dice, ...grants };
}

/**
 * Why an Ability ticked for a blow can't be used in it, as its words limit it:
 * only in melee (p68), or only on a mounted charge (p92).
 * @param {AbilityOffer[]} used
 * @param {{melee: boolean, charging: boolean}} blow How the Attack is made.
 * @returns {{name: string, needs: string}|null} The first Ability refused, or null.
 */
export function unmetNeed(used, { melee, charging }) {
	const refused = used.find(({ needs }) => (needs === "melee" && !melee) || (needs === "charge" && !charging));
	return refused ? { name: refused.name, needs: refused.needs } : null;
}

/** The highest number a rune can be etched for: the most a d20 shows. */
export const SIGIL_MAX = 20;

/**
 * The number a rune is etched for, while it has turns left (p100).
 * @param {{sigil?: boolean, sigilNumber?: number|null, quantity?: object}} system An Ability's system data.
 * @returns {number|null} Null with no rune etched, or none of its turns left.
 */
export function etchedNumber(system) {
	if (!system?.sigil || !Number.isInteger(system.sigilNumber) || isUsedUp(system)) return null;
	return system.sigilNumber;
}

/**
 * The numbers a rune may be etched for tonight: any a die shows, but not
 * last night's, since a different one is chosen each sunset (p100).
 * @param {number|null} [last] Last night's number.
 * @returns {number[]}
 */
export const sigilChoices = (last = null) => Array.from({ length: SIGIL_MAX }, (_value, index) => index + 1).filter((number) => number !== last);

/**
 * An Ability's update once its rune is etched for a number: as many turns as the number (p100).
 * @param {number} number
 * @returns {object}
 */
export const etchUpdate = (number) => ({ "system.sigilNumber": number, "system.quantity": { value: number, max: number }, "system.restock": "" });

/**
 * An Ability's update as the sun sets on its rune: the number is gone, and
 * remembered so tonight's is another.
 * @param {{sigilNumber?: number|null}} system
 * @returns {object|null} Null where no rune was etched.
 */
export function fadedUpdate(system) {
	if (!Number.isInteger(system?.sigilNumber)) return null;
	return { "system.sigilNumber": null, "system.sigilLast": system.sigilNumber, "system.quantity": { value: null, max: null } };
}

/**
 * An actor's Abilities that can do one of ABILITY_POWERS.
 * @param {{type: string, system: object}[]} items An actor's items.
 * @param {string} power One of ABILITY_POWERS.
 * @returns {object[]} Those items.
 */
export const abilitiesWith = (items, power) => (items ?? []).filter((item) => item.type === "ability" && item.system?.[power]);

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
