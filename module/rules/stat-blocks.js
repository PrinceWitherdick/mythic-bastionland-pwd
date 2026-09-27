/**
 * NPC stat blocks, as the book prints them for each Myth's Cast and each Seer:
 *
 *     Name, Epithet
 *     VIG 12, CLA 9, SPI 14, 5GD
 *     A2 (what the Armour is)
 *     Weapon (d8 hefty, anything else about it) or other weapon (d6 blast)
 *     Special rules, what they want, what they're like.
 *
 * Some give only GD, such as a thing that counts as a structure. Pure, so
 * Import PDF and a stat block pasted onto a sheet read the same way.
 */
import { FEATS, NPC_SCALES } from "../config.js";
import { structureKind } from "./structures.js";
import { capitalise, logicalLines, paragraphs, parentheticals, splitOutside } from "./text.js";
import { VIRTUES, clampVirtue } from "./virtues.js";
import { afflictionsFromText, immunityFromText } from "./afflictions.js";

const STAT_LINE = /VIG\s*(\d+)\s*,\s*CLA\s*(\d+)\s*,\s*SPI\s*(\d+)\s*,\s*(\d+)\s*GD\b[\s,.;]*/i;
const GUARD_ONLY = /^(\d+)\s*GD\b[\s,.;]*/i;

/**
 * @typedef {object} Stats
 * @property {number|null} vig  Null when the stat block gives only GD.
 * @property {number|null} cla
 * @property {number|null} spi
 * @property {number} guard
 */

/**
 * Read "VIG 12, CLA 9, SPI 14, 5GD", or just "5GD", at the start of a line.
 * @param {string} text
 * @returns {{stats: Stats, rest: string}|null} `rest` is anything after the stats on the same line.
 */
export function parseStatLine(text) {
	const line = String(text ?? "").trim();
	const full = STAT_LINE.exec(line);
	if (full?.index === 0) {
		const [whole, vig, cla, spi, guard] = full;
		return {
			stats: { vig: clampVirtue(vig), cla: clampVirtue(cla), spi: clampVirtue(spi), guard: Number(guard) },
			rest: line.slice(whole.length).trim()
		};
	}
	const guardOnly = GUARD_ONLY.exec(line);
	if (!guardOnly) return null;
	return {
		stats: { vig: null, cla: null, spi: null, guard: Number(guardOnly[1]) },
		rest: line.slice(guardOnly[0].length).trim()
	};
}

/**
 * A stat line the way the book prints one, such as "VIG 12, CLA 9, SPI 14, 5GD".
 * @param {Stats|null} stats
 * @param {Record<string, string>} [labels] Each Virtue's abbreviation, and GD's as `guard`.
 * @returns {string|null}
 */
export function formatStatLine(stats, labels = { vig: "VIG", cla: "CLA", spi: "SPI", guard: "GD" }) {
	if (!stats) return null;
	const virtues = VIRTUES.filter((key) => Number.isInteger(stats[key])).map((key) => `${labels[key]} ${stats[key]}`);
	// Whatever has no GD of its own, such as a beast the book gives none, prints its Virtues alone.
	const guard = Number.isInteger(stats.guard) ? [`${stats.guard}${labels.guard}`] : [];
	return [...virtues, ...guard].join(", ");
}

/**
 * "The Wyvern, That Foul Twisted Reptile" is named "The Wyvern", with the rest
 * as their epithet.
 * @param {string} full
 * @returns {{name: string, epithet: string}}
 */
export function splitCastName(full) {
	const text = String(full ?? "").replace(/\s+/g, " ").trim();
	const comma = text.indexOf(",");
	if (comma < 0) return { name: text, epithet: "" };
	return { name: text.slice(0, comma).trim(), epithet: text.slice(comma + 1).trim() };
}

/**
 * @param {string} text
 * @returns {string[]} The text split at commas outside parentheses.
 */
const splitTopLevel = (text) => splitOutside(text, /^,/);

const ARMOUR = /^(?:or\s+)?A(\d+)\b\s*(.*)$/i;

/**
 * Armour at the start of a line: "A3 (what it is)", or more than one value,
 * such as "A2 in flight, A4 on ground (why)".
 * @param {string} line
 * @returns {{armour: number, note: string, printed: string, rest: string}|null}
 *   The first value counts. `printed` is the Armour as the book sets it, such
 *   as "A2 (mail)". `rest` is what follows it on the line, such as an attack.
 */
export function parseArmour(line) {
	const parts = splitTopLevel(String(line ?? ""));
	if (!/^A\d/.test(parts[0] ?? "")) return null;
	const end = parts.findIndex((part) => !ARMOUR.test(part));
	const armourParts = end < 0 ? parts : parts.slice(0, end);
	const rest = end < 0 ? [] : parts.slice(end);

	// Text after the Armour's parenthesis, or after a full stop, starts something
	// else, as in "A1 (mail). Can Focus." or "A3. Treat as a structure."
	const last = armourParts.at(-1);
	const group = parentheticals(last)[0];
	const endsAt = group ? group.close + 1 : last.search(/[.;]/);
	const after = endsAt > 0 ? last.slice(endsAt).replace(/^[\s.,;]+/, "") : "";
	if (after) {
		rest.unshift(after);
		armourParts[armourParts.length - 1] = last.slice(0, endsAt).trim();
	}

	const [, value, described] = ARMOUR.exec(armourParts[0]);
	const note = armourParts.length === 1 ? (/^\((.*)\)$/.exec(described)?.[1] ?? described) : armourParts.join(", ");
	return { armour: Number(value), note: note.trim(), printed: armourParts.join(", "), rest: rest.join(", ") };
}

/** Weapon qualities an attack's parenthesis can name. */
const QUALITIES = Object.freeze({
	hefty: /^hefty$/i,
	long: /^long$/i,
	slow: /^slow$/i,
	ranged: /^ranged$/i,
	blast: /^blast$/i,
	ignoresArmour: /^ignor(?:e|es|ing) armou?r$/i,
	nonLethal: /^(?:causes?\s+)?non-?lethal(?:\s+damage)?$/i,
	// A steed's charge, as in "charger (d8 trample)".
	trample: /^trample$/i,
	// A lance, "d10 long, count as hefty if mounted" (p12).
	heftyMounted: /^counts?\s+as\s+hefty\s+(?:if|when)\s+mounted$/i
});

/**
 * @param {string} text Such as a weapon's note.
 * @returns {boolean} Whether it says the weapon counts as Hefty when mounted, as a lance does.
 */
export const countsAsHeftyMounted = (text) => /\bcounts?\s+as\s+hefty\s+(?:if|when)\s+mounted\b/i.test(String(text ?? ""));

const qualityOf = (words) => Object.keys(QUALITIES).find((key) => QUALITIES[key].test(words.trim())) ?? null;

/**
 * Read the inside of an attack's parenthesis, such as "2d10 long, +d10 vs the
 * guilty". Returns null when it doesn't start with dice.
 * @param {string} inner
 */
function readAttackDetails(inner) {
	const [first, ...others] = splitTopLevel(inner);
	const dice = /^(\d*d\d+)\s*(.*)$/i.exec(first ?? "");
	if (!dice) return null;

	const details = { damage: dice[1].toLowerCase(), qualities: new Set(), notes: [] };
	let remainder = dice[2];
	// More dice and qualities only, as in "d6+d6" or "d12 slow". Anything
	// else, such as "+d10 vs the guilty", is a situation worth noting instead.
	if (/^(?:\s*\+\s*\d*d\d+|\s*(?:hefty|long|slow|ranged|blast|trample))*\s*$/i.test(remainder)) {
		for (const extra of remainder.matchAll(/\+\s*(\d*d\d+)/gi)) details.damage += `+${extra[1].toLowerCase()}`;
		remainder = remainder.replace(/\+\s*\d*d\d+/gi, "");
	}
	const words = remainder.trim().split(/\s+/).filter(Boolean);
	while (words.length && qualityOf(words[0])) details.qualities.add(qualityOf(words.shift()));
	if (words.length) details.notes.push(words.join(" "));

	for (const other of others) {
		const quality = qualityOf(other);
		if (quality) details.qualities.add(quality);
		else details.notes.push(other);
	}
	return details;
}

const LEADING_JOINER = /^[\s,;.]*(?:(?:or|and)\b)?[\s,;.]*/i;

/**
 * Where an attack's name starts in the text before its parenthesis. After a
 * comma a new name begins, unless it reads as one list, such as "Yapping,
 * biting, and scratching".
 * @param {string} before The text between the previous parenthesis and this one.
 * @returns {number}
 */
function nameStartIn(before) {
	const comma = before.lastIndexOf(",");
	const from = comma < 0 || /^\s*(?:and|or)\s/i.test(before.slice(comma + 1)) ? 0 : comma + 1;
	return from + before.slice(from).match(LEADING_JOINER)[0].length;
}

/**
 * @typedef {object} ParsedAttack
 * @property {string} name   As printed, or "" when the attack has no name.
 * @property {string} damage e.g. "2d10".
 * @property {string[]} qualities Keys of QUALITIES.
 * @property {string} note   Anything else in the parenthesis.
 * @property {true} [or]     Printed after "or", so it's used instead of the attack before it, as the sweep in
 *                           "Crush (2d12) or sweep (d12 blast)".
 */

/** Nothing but "or" between one attack and the next. */
const OR_BETWEEN = /^[\s,;]*or\s*$/i;

/**
 * Find the attacks on a line: a name followed by a parenthesis that starts
 * with dice, such as "Crush (2d12) or sweep (d12 blast)".
 * @param {string} line
 * @returns {{attacks: ParsedAttack[], rest: string}} `rest` is the line's other text.
 */
export function parseAttacks(line) {
	const text = String(line ?? "");
	const attacks = [];
	const leftovers = [];
	let cursor = 0;
	let previousClose = 0;

	for (const group of parentheticals(text)) {
		const details = readAttackDetails(group.inner);
		if (details) {
			const nameStart = previousClose + nameStartIn(text.slice(previousClose, group.open));
			const between = text.slice(cursor, nameStart);
			leftovers.push(between);
			attacks.push({
				name: text.slice(nameStart, group.open).trim(),
				damage: details.damage,
				qualities: [...details.qualities],
				note: details.notes.join(", "),
				...(attacks.length && OR_BETWEEN.test(between) ? { or: true } : {})
			});
			cursor = group.close + 1;
		}
		previousClose = group.close + 1;
	}
	leftovers.push(text.slice(cursor));

	const rest = leftovers
		.map((piece) => piece.replace(LEADING_JOINER, "").replace(/[\s,;]+$/, "").trim())
		.filter((piece) => /\p{L}/u.test(piece))
		.join(", ");
	return { attacks, rest };
}

const FEAT_NAMES = FEATS.map(({ key }) => key).join("|");
const FEAT_NAME = new RegExp(FEAT_NAMES, "gi");
const FEAT_LIST = new RegExp(`\\bcan\\s+((?:${FEAT_NAMES})(?:\\s*(?:,|and|or)\\s*(?:${FEAT_NAMES}))*)\\b`, "i");

/**
 * @param {string} text
 * @returns {string[]} Feats a line says the character can perform, such as "Can Focus."
 */
export function featsNamed(text) {
	const list = FEAT_LIST.exec(String(text ?? ""))?.[1] ?? "";
	return [...list.matchAll(FEAT_NAME)].map((match) => match[0].toLowerCase());
}

/** "Count as a structure", "treat as structure", or Armour that is "(structure)". */
const STRUCTURE = /\b(?:counts?|treat(?:ed)?)\s+as\s+(?:a\s+)?structure\b|\(structure\)/i;

/** A swarm's rule as its stat block prints it: "individual attacks are Impaired unless they are Blast attacks" (p61). */
const SWARM = /\bindividual\s+attacks\s+are\s+impaired\b/i;

/**
 * @param {string|null} name As printed.
 * @param {string[]} lines What follows the stats.
 * @returns {string} One of NPC_SCALES: a Warband by its name, a swarm by its rule.
 */
function castScale(name, lines) {
	if (/\bwarband\b/i.test(name ?? "")) return "warband";
	return SWARM.test(lines.join(" ")) ? "swarm" : NPC_SCALES[0];
}

/**
 * Actor data for an NPC from a stat block. Scores the stat block doesn't give
 * are left out, so a new NPC keeps its defaults and an existing one its own.
 * A Cast entry named as a Warband, such as "Ghostly Riders, Warband", is one,
 * and one whose foes' individual attacks are Impaired is a swarm.
 * @param {object} block
 * @param {string|null} block.name  As printed, such as "The Wyvern, That Foul Twisted Reptile".
 * @param {Stats|null} [block.stats]
 * @param {string[]} [block.lines] What follows the stats, one written line each.
 * @param {object} [options]
 * @param {string} [options.attackName] Names an attack printed without one.
 * @returns {{name: string, system: object, items: object[]}}
 */
export function npcFromStatBlock({ name, stats = null, lines = [] }, { attackName = "Attack" } = {}) {
	const { name: shortName, epithet } = splitCastName(name);
	const track = (value) => ({ value, max: value });
	const system = {
		epithet,
		armour: 0,
		armourNote: "",
		scale: castScale(name, lines),
		structure: false,
		feats: Object.fromEntries(FEATS.map(({ key }) => [key, false])),
		notes: ""
	};
	const virtues = Object.fromEntries(VIRTUES.filter((key) => Number.isInteger(stats?.[key])).map((key) => [key, track(stats[key])]));
	if (Object.keys(virtues).length) system.virtues = virtues;
	if (Number.isInteger(stats?.guard)) system.guard = track(stats.guard);

	const items = [];
	const notes = [];
	let armourRead = false;
	for (const line of lines) {
		if (STRUCTURE.test(line)) system.structure = true;

		let text = line;
		const armour = armourRead ? null : parseArmour(text);
		if (armour) {
			armourRead = true;
			system.armour = armour.armour;
			system.armourNote = armour.note;
			text = armour.rest;
		}
		if (!text) continue;

		const { attacks, rest } = parseAttacks(text);
		for (const attack of attacks) {
			const weapon = weaponData(attack, attackName);
			// Attacks printed with "or" between them are one or the other, never together.
			if (attack.or) {
				const before = items.at(-1);
				before.system.either ||= before.name;
				weapon.system.either = before.system.either;
			}
			items.push(weapon);
		}
		if (!rest) continue;
		notes.push(rest);
		for (const feat of featsNamed(rest)) system.feats[feat] = true;
	}

	system.notes = paragraphs(...notes);
	// Only said where the stat block says so, so data from before stays as it was.
	const said = notes.join(" ");
	const immunity = immunityFromText(said);
	if (immunity) system.immunity = immunity;
	const inflicts = afflictionsFromText(said, shortName);
	if (inflicts.length) system.inflicts = inflicts.map((affliction, index) => ({ id: `inflicts${index}`, ...affliction }));
	return { name: shortName, system, items };
}

/**
 * Whether a stat block is a thing rather than a creature: only GD, and said to
 * count as a structure, as some Seers and Cast are. A creature with Virtues
 * that counts as a structure is still an NPC.
 * @param {{stats?: Stats|null, lines?: string[]}} block
 * @returns {boolean}
 */
export function isStructureBlock({ stats = null, lines = [] }) {
	return Number.isInteger(stats?.guard) && !Number.isInteger(stats?.vig) && lines.some((line) => STRUCTURE.test(line));
}

/**
 * Actor data for a Structure from a stat block, such as "The Chariot 5GD A2
 * (structure) 2d12 trample". Saying it's a structure is left out of its notes.
 * @param {object} block As npcFromStatBlock takes.
 * @param {object} [options]
 * @param {string} [options.attackName]
 * @returns {{name: string, system: object, items: object[]}}
 */
export function structureFromStatBlock(block, options) {
	const { name, system, items } = npcFromStatBlock(block, options);
	const notes = system.notes
		.replaceAll(/<p>(.*?)<\/p>/g, (_match, text) => {
			const rest = capitalise(text.replace(STRUCTURE, "").replace(/^[\s.,;]+|[\s,;]+$/g, "").trim());
			return /^[.]?$/.test(rest) ? "" : `<p>${rest}</p>`;
		});
	return {
		name,
		system: {
			kind: structureKind({ name }),
			epithet: system.epithet,
			guard: system.guard ?? { value: 0, max: 0 },
			armour: system.armour,
			// "A2 (structure)" says only what it counts as.
			armourNote: /^structure$/i.test(system.armourNote) ? "" : system.armourNote,
			notes
		},
		items
	};
}

/**
 * Actor data for whatever a stat block describes: a Structure for a thing with
 * only GD that counts as a structure, and otherwise an NPC.
 * @param {object} block As npcFromStatBlock takes.
 * @param {object} [options]
 * @param {string} [options.attackName]
 * @returns {{type: "npc"|"structure", name: string, system: object, items: object[]}}
 */
export function actorFromStatBlock(block, options) {
	if (isStructureBlock(block)) return { type: "structure", ...structureFromStatBlock(block, options) };
	return { type: "npc", ...npcFromStatBlock(block, options) };
}

/** How many are carried, leading an attack's name as in "3 firepots". */
const LEADING_COUNT = /^(\d+)\s+(?=\p{L})/u;

/** An attack used once a day, as "once per day each". */
const ONCE_A_DAY = /\bonce (?:per|a) day\b/i;

/** Another way to fight with the same thing, as the "or d12 blast" in "Crush (2d12 or d12 blast)". */
const OR_DICE = /^or\s+(\d*d\d+)\s*(.*)$/i;

/** Qualities an attack's other way to fight can have, as rules/attack.js lists them. */
const ALTERNATE_WORDS = Object.freeze(["hefty", "long", "slow", "ranged", "blast"]);

/**
 * An attack's other way to fight, from the part of its note that starts "or"
 * and dice, as "or d12 blast".
 * @param {string} part
 * @returns {object|null} The alternate field's data.
 */
function alternateFrom(part) {
	const match = OR_DICE.exec(part.trim());
	if (!match) return null;
	const words = match[2].toLowerCase().split(/\s+/).filter(Boolean);
	const alternate = { label: words.filter((word) => !ALTERNATE_WORDS.includes(word)).join(" ") || words.at(-1) || "or", damage: match[1].toLowerCase() };
	for (const word of words) if (ALTERNATE_WORDS.includes(word)) alternate[word] = true;
	return alternate;
}

/**
 * @param {ParsedAttack} attack
 * @param {string} fallbackName
 * @returns {object} Weapon item data. "3 firepots" are three Firepots, counted;
 *   "once per day" is one, restocked each day; "or d12 blast" is another way to fight.
 */
function weaponData(attack, fallbackName) {
	const system = { damage: attack.damage, equipped: true };
	for (const key of Object.keys(QUALITIES)) system[key] = attack.qualities.includes(key);

	const parts = splitOutside(attack.note, /^,/);
	const alternateAt = parts.findIndex((part) => alternateFrom(part));
	if (alternateAt >= 0) system.alternate = alternateFrom(parts.splice(alternateAt, 1)[0]);

	const counted = LEADING_COUNT.exec(attack.name);
	const name = counted ? attack.name.slice(counted[0].length) : attack.name;
	const daily = ONCE_A_DAY.test(attack.note);
	const count = counted ? Number(counted[1]) : daily ? 1 : null;
	if (count !== null) system.quantity = { value: count, max: count };
	if (daily) system.restock = "day";
	// Each use of a daily attack, or each firepot thrown, is gone until restocked, as on a Knight's Property.
	if (daily || (counted && system.blast)) system.usedUp = true;

	system.description = paragraphs(capitalise(parts.join(", ")));
	return { type: "weapon", name: capitalise(name) || fallbackName, system };
}

/**
 * Read a stat block pasted as plain text, such as one copied out of a PDF. The
 * full stat line is found wherever it is; anything before it is the name.
 * @param {string} text
 * @returns {{name: string|null, stats: Stats, lines: string[]}|null} Null without a stat line.
 */
export function statBlockFromText(text) {
	const printed = String(text ?? "").split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
	for (const [index, line] of printed.entries()) {
		const match = STAT_LINE.exec(line);
		if (!match) continue;
		const parsed = parseStatLine(line.slice(match.index));
		const nameParts = [...printed.slice(0, index), line.slice(0, match.index).trim()].filter(Boolean);
		const after = printed.slice(index + 1);
		if (parsed.rest) after.unshift(parsed.rest);
		return { name: nameParts.join(" ") || null, stats: parsed.stats, lines: logicalLines(after) };
	}
	return null;
}
