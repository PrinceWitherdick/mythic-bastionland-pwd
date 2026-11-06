/**
 * What some Knights' possessions do when used, as their Property line or the
 * table under it words it: ease a Mortal Wound once (p40), take an affliction
 * into itself (p94), restore a Virtue or all of them (p68), call for a Save
 * when eaten (p164), cost whoever grabs or strikes first (p74, p82), or
 * Impair a foe's first Attack (p42). Read by a few words, as the book prints
 * no stats for them. Pure, so it can be tested without Foundry.
 */
import { VIRTUES } from "./virtues.js";

/** What a possession can do when used. Blank for nothing. */
export const POSSESSION_EFFECTS = Object.freeze(["", "easesMortal", "absorbsAffliction", "restoresOne", "restoresAll", "saveOnUse", "harmsOther", "firstAttackImpaired"]);

/** The effects used from the possession's row, rather than seen elsewhere. */
export const USED_EFFECTS = Object.freeze(["easesMortal", "absorbsAffliction", "restoresOne", "restoresAll", "saveOnUse", "harmsOther"]);

const VIRTUE = "(VIG|CLA|SPI)";

/** Each effect by the words that say it, in the order they're tried. */
const READINGS = Object.freeze([
	["easesMortal", /\bmortal wound as a (?:normal )?wound\b/i],
	["absorbsAffliction", /\babsorbs?\b[^.;]*\bailment\b/i],
	["restoresAll", /^restore all virtues$/i],
	["restoresOne", /^restore (?:one|a) virtue$/i],
	["saveOnUse", new RegExp(`\\b${VIRTUE} Save or\\b`, "i")],
	["harmsOther", new RegExp(`\\b(?:who|that|anyone)\\b[^.;]*?\\b(?:lose|loses|takes?)\\s+(\\d*d\\d+)\\s+(?:${VIRTUE}|Damage)\\b`, "i")],
	["firstAttackImpaired", /\bfirst\b[^.,;]*\bImpaired\b/i]
]);

/**
 * @typedef {object} EffectData
 * @property {string} effect One of POSSESSION_EFFECTS.
 * @property {string} [effectDie] Dice it rolls, as a d6 a grabber takes.
 * @property {string} [effectVirtue] The Virtue it rolls a Save in or takes, blank for Damage.
 */

/**
 * What a possession does when used, from the words printed for it.
 * @param {string|null|undefined} text Its line, or the table entry about it.
 * @returns {EffectData|{}} Nothing for words that say no such thing.
 */
export function effectOf(text) {
	const words = String(text ?? "").trim();
	for (const [effect, pattern] of READINGS) {
		const match = pattern.exec(words);
		if (!match) continue;
		if (effect === "saveOnUse") return { effect, effectVirtue: match[1].toLowerCase() };
		if (effect === "harmsOther") return { effect, effectDie: match[1].toLowerCase(), effectVirtue: match[2]?.toLowerCase() ?? "" };
		return { effect };
	}
	return {};
}

/**
 * The effect fields a table result writes, every one, so rolling again leaves none behind.
 * @param {EffectData} data
 * @returns {Record<string, string>}
 */
export const effectFields = ({ effect, effectDie = "", effectVirtue = "" }) => ({ effect, effectDie, effectVirtue });

/**
 * @param {string} virtue
 * @returns {boolean} Whether it's a Virtue, rather than blank for Damage.
 */
export const isVirtue = (virtue) => VIRTUES.includes(virtue);
