/**
 * What some of the Cast do to those they touch, and what can't touch them.
 * The Plague's infected "cause d6 VIG loss daily" (p29); others take a Virtue
 * each round. Such a loss is an affliction, carried by its victim until it's
 * cured, and taken again each morning or each round. Some of the Cast can't
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
 * @property {string} virtue One of VIRTUES.
 * @property {string} when   One of AFFLICTION_TIMES.
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

/**
 * The afflictions a stat block's text says its bearer causes.
 * @param {string} text Its notes, as plain text.
 * @param {string} name What to call the affliction, such as the Cast member's name.
 * @returns {Omit<Affliction, "id">[]}
 */
export function afflictionsFromText(text, name) {
	const found = [];
	for (const match of String(text ?? "").matchAll(LOSS)) {
		const virtue = virtueOf(match[2]);
		const when = timeOf(match[3]);
		if (!virtue || !when) continue;
		const dice = match[1].toLowerCase();
		found.push({ name, loss: dice.startsWith("d") ? `1${dice}` : dice, virtue, when });
	}
	return found;
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
	if ((list ?? []).some((each) => each.name === affliction.name && each.virtue === affliction.virtue && each.when === affliction.when)) return null;
	return [...(list ?? []), { id, ...affliction }];
}
