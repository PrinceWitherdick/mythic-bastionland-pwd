/**
 * What some of the Cast do to those they touch, and what can't touch them.
 * The Plague's infected "cause d6 VIG loss daily" (p29); others take a Virtue
 * each round. Such a loss is an affliction, carried by its victim until it's
 * cured, and taken again each morning or each round. Some afflictions are
 * Damage rather than Virtue Loss, as a flask of acid burns every round until
 * it's washed off (p173). Some of the Cast can't
 * be harmed at all, or only by particular means, which the Referee weighs as
 * each blow lands. Pure, so it can be tested without Foundry.
 */
import { VIRTUES } from "./virtues.js";

/** When an affliction takes its toll: each morning, or each round of a fight. */
export const AFFLICTION_TIMES = Object.freeze(["day", "round"]);

/**
 * @typedef {object} Affliction
 * @property {string} id
 * @property {string} name   What it is, as the Myth calls it, e.g. "The Plague".
 * @property {string} loss   Dice, e.g. "1d6".
 * @property {string} virtue One of VIRTUES. Unused where it deals Damage.
 * @property {string} when   One of AFFLICTION_TIMES.
 * @property {boolean} [damage] Damage, which can Wound and Slay, rather than Virtue Loss.
 * @property {boolean} [ignoresArmour] Damage that ignores Armour.
 */

const VIRTUE_WORDS = Object.freeze({ vig: "vig(?:our)?", cla: "cla(?:rity)?", spi: "spi(?:rit)?" });
const TIME_WORDS = Object.freeze({ day: "daily|each day|every day|a day|each morning", round: "each round|every round|each turn|every turn" });

/** "d6 VIG loss daily", "lose 2d6 SPI each round", "d6 CLA every day". */
const LOSS = new RegExp(
	`(\\d*d\\d+)\\s+(${Object.values(VIRTUE_WORDS).join("|")})\\b(?:\\s+loss)?\\s*(?:is lost\\s+)?(${Object.values(TIME_WORDS).join("|")})`,
	"gi"
);

const virtueOf = (word) => VIRTUES.find((key) => new RegExp(`^(?:${VIRTUE_WORDS[key]})$`, "i").test(word)) ?? null;
const timeOf = (words) => AFFLICTION_TIMES.find((key) => new RegExp(`^(?:${TIME_WORDS[key]})$`, "i").test(words.trim())) ?? null;

/** "d8 Damage each round", "2d6 damage daily". */
const DAMAGE = new RegExp(`(\\d*d\\d+)\\s+damage\\s+(${Object.values(TIME_WORDS).join("|")})`, "gi");

/** Damage said to ignore Armour, in the words after it. */
const IGNORES_ARMOUR = /\bignor(?:e|es|ing)\s+(?:all\s+)?armou?r\b/i;

/** "Damage each round", as a weapon's note says what it keeps doing once it lands. */
const KEEPS_ON = new RegExp(`\\bdamage\\s+(${Object.values(TIME_WORDS).join("|")})`, "i");

/** @param {string} dice @returns {string} "1d8" for "d8". */
const counted = (dice) => {
	const lower = dice.toLowerCase();
	return lower.startsWith("d") ? `1${lower}` : lower;
};

/**
 * The words after a match, up to the end of its sentence or parenthesis.
 * @param {string} text
 * @param {RegExpMatchArray} match
 * @returns {string}
 */
const clauseAfter = (text, match) => text.slice(match.index + match[0].length).split(/[.)]/)[0];

/**
 * The afflictions a stat block's text says its bearer causes.
 * @param {string} text Its notes, as plain text.
 * @param {string} name What to call the affliction, such as the Cast member's name.
 * @returns {Omit<Affliction, "id">[]}
 */
export function afflictionsFromText(text, name) {
	const said = String(text ?? "");
	const found = [];
	for (const match of said.matchAll(LOSS)) {
		const virtue = virtueOf(match[2]);
		const when = timeOf(match[3]);
		if (!virtue || !when) continue;
		found.push({ name, loss: counted(match[1]), virtue, when });
	}
	for (const match of said.matchAll(DAMAGE)) {
		const when = timeOf(match[2]);
		if (!when) continue;
		found.push({ name, loss: counted(match[1]), virtue: VIRTUES[0], when, damage: true, ignoresArmour: IGNORES_ARMOUR.test(clauseAfter(said, match)) });
	}
	return found;
}

/**
 * When a weapon's Damage keeps on after it lands, as its note says: "Damage
 * each round until washed" (p173).
 * @param {string} note The weapon's note, as plain text.
 * @returns {""|"day"|"round"} Blank for a weapon whose Damage is done once it lands.
 */
export function keepsOnFrom(note) {
	const match = KEEPS_ON.exec(String(note ?? ""));
	return (match && timeOf(match[1])) || "";
}

/**
 * The affliction a weapon leaves on whoever its Damage reaches, burning on
 * each round or each day until washed off or otherwise cured (p173).
 * @param {{name: string, system: {damage?: string, lingers?: string, ignoresArmour?: boolean}}} weapon
 * @returns {Omit<Affliction, "id">|null} Null for a weapon whose Damage is done once it lands.
 */
export function lingeringAffliction({ name, system }) {
	const dice = /^\s*(\d*d\d+)/i.exec(String(system?.damage ?? ""))?.[1];
	if (!dice || !AFFLICTION_TIMES.includes(system?.lingers)) return null;
	return { name, loss: counted(dice), virtue: VIRTUES[0], when: system.lingers, damage: true, ignoresArmour: Boolean(system.ignoresArmour) };
}

/** Immunities as a Cast member's line puts them: nothing can harm it, it can only be harmed by one thing, or it ignores all Damage. */
const IMMUNITY = /[^.]*\b(?:cannot|can't|can not|can only)\s+be\s+(?:harmed|hurt|damaged|wounded)\b[^.]*\.?|[^.]*\bignores all damage\b[^.]*\.?/i;

/**
 * What a stat block says keeps its bearer from harm, as one sentence.
 * @param {string} text Its notes, as plain text.
 * @returns {string} Blank where it says nothing of the kind.
 */
export function immunityFromText(text) {
	return IMMUNITY.exec(String(text ?? ""))?.[0].trim() ?? "";
}

/**
 * @param {{afflictions?: Affliction[]}} system
 * @param {string} when One of AFFLICTION_TIMES.
 * @returns {Affliction[]} Those that take their toll at that time.
 */
export const afflictionsAt = (system, when) => (system?.afflictions ?? []).filter((affliction) => affliction.when === when);

/**
 * An affliction added to a victim's list, unless they already carry one of the
 * same name, which only takes its toll once.
 * @param {Affliction[]} list
 * @param {Omit<Affliction, "id">} affliction
 * @param {string} id
 * @returns {Affliction[]|null} The new list, or null where nothing changed.
 */
export function withAffliction(list, affliction, id) {
	const same = (each) => each.name === affliction.name && each.when === affliction.when && Boolean(each.damage) === Boolean(affliction.damage)
		&& (affliction.damage || each.virtue === affliction.virtue);
	if ((list ?? []).some(same)) return null;
	return [...(list ?? []), { id, ...affliction }];
}

/**
 * Weapons of a Cast member already in the world whose Damage burns on, as its
 * stat block now reads (p173), marked so, where nothing marks them already.
 * @param {{id: string, type: string, name: string, system: object}[]} items Their items in the world.
 * @param {{type: string, name: string, system?: object}[]} printed Their items as the stat block gives them.
 * @returns {{_id: string, "system.lingers": string}[]}
 */
export function lingeringUpdates(items, printed) {
	return items.filter((item) => item.type === "weapon" && !item.system.lingers).flatMap((item) => {
		const match = printed.find((each) => each.type === "weapon" && each.name === item.name && each.system?.lingers);
		return match ? [{ _id: item.id, "system.lingers": match.system.lingers }] : [];
	});
}

/**
 * An affliction's toll split by kind: Virtue Loss, which never Wounds (p9),
 * and Damage, which can.
 * @param {Affliction[]} afflictions
 * @returns {{losses: Affliction[], damage: Affliction[]}}
 */
export const tollsByKind = (afflictions) => ({
	losses: afflictions.filter((affliction) => !affliction.damage),
	damage: afflictions.filter((affliction) => affliction.damage)
});
