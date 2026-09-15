/**
 * Warfare (p11), Arms & Goods (p12) and People & Realms (p13) list weapons,
 * armour, tools, beasts, Remedies, poisons, hirelings, Warbands, structures
 * and siege engines one entry at a time, as "Name: what it is" under a heading.
 * Nothing from those pages ships with the system; Import Book Art reads them
 * from the GM's own rulebook. Pure, so the reading can be tested without Foundry.
 */
import { ARMOUR_KINDS } from "../config.js";
import { textLines } from "./book-art.js";
import { countsAsHeftyMounted, npcFromStatBlock, parseArmour, parseStatLine } from "./stat-blocks.js";
import { capitalise, escapeHTML, joinLines, logicalLines } from "./text.js";

/** The pages read, in book order. */
export const GOODS_PAGES = Object.freeze([11, 12, 13]);

/** The kind a problem reading these pages is reported under. */
export const GOODS_KIND = "goods";

export const RARITIES = Object.freeze(["common", "uncommon", "rare"]);

/** What the pages list, in the order the importer files it. */
export const GOODS_KINDS = Object.freeze([
	"weapons",
	"armour",
	"tools",
	"remedies",
	"poisons",
	"beasts",
	"hirelings",
	"warbands",
	"structures"
]);

/** Where each kind is printed, for reporting one that couldn't be read. */
export const GOODS_KIND_PAGES = Object.freeze({
	weapons: 12,
	armour: 12,
	tools: 12,
	remedies: 12,
	poisons: 12,
	beasts: 12,
	hirelings: 13,
	warbands: 11,
	structures: 11
});

/** Kinds filed as items, and kinds filed as NPCs. */
export const GOODS_ITEM_KINDS = Object.freeze(["weapons", "armour", "tools", "remedies", "poisons"]);
export const GOODS_ACTOR_KINDS = Object.freeze(["beasts", "hirelings", "warbands", "structures"]);

/** The left column of these pages starts left of this, and the right column right of it. */
const COLUMN_SPLIT = 300;

/** Headings of the sections read, and what each holds. Any other heading ends a section. */
const SECTIONS = Object.freeze([
	{ heading: /^(?:COMMON|UNCOMMON|RARE) WEAPONS$/, kind: "weapons" },
	{ heading: /^(?:COMMON|UNCOMMON|RARE) ARMOUR$/, kind: "armour" },
	{ heading: /^TOOLS$/, kind: "tools" },
	{ heading: /^(?:COMMON|UNCOMMON|RARE) BEASTS$/, kind: "beasts" },
	{ heading: /^REMEDIES\b/, kind: "remedies" },
	{ heading: /^POISONS$/, kind: "poisons" },
	{ heading: /^(?:COMMON|UNCOMMON|RARE)$/, kind: "hirelings" },
	{ heading: /^WARBANDS$/, kind: "warbands" },
	{ heading: /^WOOD AND STONE$/, kind: "structures" },
	{ heading: /^ARTILLERY AND SIEGERY$/, kind: "siege" }
]);

/** Headings are capitals at the body's size, sometimes with a note in brackets. Small capitals within a line are set smaller. */
const HEADING = /^\p{Lu}[\p{Lu} &]+(?:\s*\([^)]*\))?$/u;
const HEADING_MIN_SIZE = 10;

/** Each entry starts "Name: what it is". */
const ENTRY = /^(\p{Lu}[^:]{1,40}):\s*(.*)$/u;

const DICE = /^(\d*d\d+)\b\s*(.*)$/i;

const WEAPON_QUALITIES = Object.freeze(["hefty", "long", "slow", "blast"]);

/** The book doesn't mark weapons as ranged, but these can only strike at a distance. */
const RANGED_NAME = /bow\b|sling|thrower|launcher|catapult|trebuchet/i;

const TRAMPLE = /\btrample\b/i;

/** @returns {string|null} The first rarity a text names, such as "uncommon" in "REMEDIES (All Uncommon)". */
const rarityIn = (text) => /\b(uncommon|common|rare)\b/i.exec(text)?.[1].toLowerCase() ?? null;

/**
 * @typedef {object} Entry One "Name: what it is", with any lines wrapped below it.
 * @property {string} name
 * @property {string[]} printed What follows the colon, then each wrapped line.
 */

/**
 * A page's lines, the left column and then the right.
 * @param {object[]} items From `page.getTextContent()`.
 */
function pageLines(items) {
	const column = (inColumn) => textLines(items.filter((item) => inColumn(item.transform?.[4] ?? 0)));
	return [...column((x) => x < COLUMN_SPLIT), ...column((x) => x >= COLUMN_SPLIT)];
}

/**
 * Group lines into the sections read, each a list of entries. An entry carries
 * on over the lines set close below it, and a gap or a new column ends it.
 * @param {ReturnType<typeof textLines>} lines
 * @returns {{kind: string, rarity: string|null, entries: Entry[]}[]}
 */
function readSections(lines) {
	const sections = [];
	let section = null;
	let entry = null;
	let previous = null;
	for (const line of lines) {
		const gap = previous ? previous.y - line.y : Infinity;
		const follows = gap > 0 && gap <= line.size * 1.3;
		previous = line;

		if (line.size >= HEADING_MIN_SIZE && HEADING.test(line.text)) {
			const found = SECTIONS.find(({ heading }) => heading.test(line.text));
			section = found ? { kind: found.kind, rarity: rarityIn(line.text), entries: [] } : null;
			if (section) sections.push(section);
			entry = null;
			continue;
		}
		if (!section) continue;

		const start = ENTRY.exec(line.text);
		if (start) section.entries.push(entry = { name: start[1].trim(), printed: [start[2].trim()] });
		else if (entry && follows) entry.printed.push(line.text);
		else entry = null;
	}
	return sections;
}

/** @param {Entry} entry */
const entryText = ({ printed }) => printed.filter(Boolean).reduce(joinLines, "").trim();

/**
 * @typedef {object} Weapon
 * @property {string} name
 * @property {string} damage
 * @property {string[]} qualities Such as "hefty" and "ranged".
 * @property {string} note        Anything else printed, such as when it counts as hefty.
 * @property {string|null} rarity
 * @property {string|null} group  The line it came from when that named several, such as "Hefty Tools".
 * @property {boolean} siege
 */

/**
 * A weapon line, such as "d8 hefty (spear, mace, axe)". A line naming examples
 * in brackets gives one weapon for each.
 * @param {Entry} entry
 * @param {string|null} rarity
 * @param {object} [options]
 * @param {boolean} [options.siege]
 * @returns {Weapon[]}
 */
function readWeapons(entry, rarity, { siege = false } = {}) {
	const dice = DICE.exec(entryText(entry));
	if (!dice) return [];

	let rest = dice[2];
	const group = /\(([^)]*)\)/.exec(rest);
	const examples = group ? group[1].split(",").map((part) => part.trim()).filter(Boolean) : [];
	if (group) rest = rest.replace(group[0], "");

	const [first = "", ...others] = rest.split(",").map((part) => part.trim());
	const words = first.split(/\s+/).filter(Boolean);
	const isQuality = (word) => WEAPON_QUALITIES.includes(word.toLowerCase());
	const qualities = words.filter(isQuality).map((word) => word.toLowerCase());
	const note = [words.filter((word) => !isQuality(word)).join(" "), ...others].filter(Boolean).join(", ");

	const weapon = (name) => ({
		name,
		damage: dice[1].toLowerCase(),
		qualities: RANGED_NAME.test(name) ? [...qualities, "ranged"] : qualities,
		note,
		rarity,
		group: examples.length ? entry.name : null,
		siege
	});
	return examples.length ? examples.map((example) => weapon(capitalise(example))) : [weapon(entry.name)];
}

/**
 * An armour line, such as "d4, A1 (what it is)", named by its kind.
 * @param {Entry} entry
 * @param {string|null} rarity
 * @returns {{name: string, kind: string, rarity: string|null, armour: number, damage: string, note: string}[]}
 */
function readArmour(entry, rarity) {
	const kind = ARMOUR_KINDS.find((key) => key === entry.name.toLowerCase());
	const text = entryText(entry);
	const dice = /^(\d*d\d+)\s*,\s*/i.exec(text);
	const armour = parseArmour(dice ? text.slice(dice[0].length) : text);
	if (!kind || !armour) return [];
	return [{ name: entry.name, kind, rarity, armour: armour.armour, damage: dice?.[1].toLowerCase() ?? "", note: armour.note }];
}

/**
 * A line of tools, such as "Common Tools: saw, shovel", one tool each.
 * @param {Entry} entry
 * @returns {{name: string, rarity: string|null}[]}
 */
function readTools(entry) {
	const rarity = rarityIn(entry.name);
	return entryText(entry).split(",").map((tool) => tool.trim()).filter(Boolean).map((tool) => ({ name: capitalise(tool), rarity }));
}

/**
 * A Remedy, and the Virtue its text says it recovers.
 * @param {Entry} entry
 * @param {string|null} rarity
 * @returns {{name: string, rarity: string|null, virtue: string|null, note: string}[]}
 */
function readRemedies(entry, rarity) {
	const note = entryText(entry);
	const virtue = /\brecover\s+(VIG|CLA|SPI)\b/i.exec(note)?.[1].toLowerCase() ?? null;
	return [{ name: entry.name, rarity, virtue, note }];
}

/**
 * A beast, hireling or Warband: a stat line, then its Armour, attacks and
 * anything else, as a Cast stat block would give them.
 * @param {Entry} entry
 * @param {string|null} rarity
 * @param {object} options
 * @param {boolean} options.virtues Whether the stat line must give Virtues, or may give only GD.
 * @returns {{name: string, rarity: string|null, stats: import("./stat-blocks.js").Stats, lines: string[]}[]}
 */
function readCharacters(entry, rarity, { virtues }) {
	const [first, ...wrapped] = entry.printed;
	const parsed = parseStatLine(first);
	if (!parsed || (virtues && parsed.stats.vig === null)) return [];
	// Beasts print their attack's dice first, as in "d6 bite".
	const rest = parsed.rest.replace(/^(\d*d\d+)\s+([^,(]+)$/i, (_match, dice, attack) =>
		`${capitalise(attack.trim())} (${dice}${TRAMPLE.test(attack) ? " trample" : ""})`);
	return [{ name: entry.name, rarity, stats: parsed.stats, lines: logicalLines([rest, ...wrapped].filter(Boolean)) }];
}

/**
 * A structure, ship or siege tower: GD, any Armour, and what else it does.
 * @param {Entry} entry
 * @returns {{name: string, guard: number, armour: number, note: string}[]}
 */
function readStructures(entry) {
	const parsed = parseStatLine(entryText(entry));
	if (!parsed || parsed.stats.vig !== null) return [];
	const armour = parseArmour(parsed.rest);
	return [{ name: entry.name, guard: parsed.stats.guard, armour: armour?.armour ?? 0, note: armour ? armour.rest : parsed.rest }];
}

/**
 * Read everything the pages list.
 * @param {object[][]} pages The text items of each page, from `page.getTextContent()`.
 * @returns {Record<string, object[]>} A list for each of GOODS_KINDS. Poisons have no name of their own.
 */
export function goodsFromPages(pages) {
	const goods = Object.fromEntries(GOODS_KINDS.map((kind) => [kind, []]));
	for (const items of pages) {
		for (const { kind, rarity, entries } of readSections(pageLines(items))) {
			for (const entry of entries) {
				switch (kind) {
					case "weapons":
						goods.weapons.push(...readWeapons(entry, rarity));
						break;
					case "armour":
						goods.armour.push(...readArmour(entry, rarity));
						break;
					case "tools":
						goods.tools.push(...readTools(entry));
						break;
					case "remedies":
						goods.remedies.push(...readRemedies(entry, rarity));
						break;
					case "poisons":
						goods.poisons.push({ rarity: rarityIn(entry.name), note: entryText(entry) });
						break;
					case "beasts":
						goods.beasts.push(...readCharacters(entry, rarity, { virtues: true }));
						break;
					case "hirelings":
						goods.hirelings.push(...readCharacters(entry, rarity, { virtues: false }));
						break;
					case "warbands":
						goods.warbands.push(...readCharacters(entry, rarity, { virtues: true }));
						break;
					case "structures":
						goods.structures.push(...readStructures(entry));
						break;
					case "siege":
						goods.weapons.push(...readWeapons(entry, null, { siege: true }));
						goods.structures.push(...readStructures(entry));
						break;
				}
			}
		}
	}
	return goods;
}

/** @returns {string} Each text that isn't empty as a paragraph. */
const paragraphs = (...texts) => texts.filter(Boolean).map((text) => `<p>${escapeHTML(text)}</p>`).join("");

/**
 * Item and NPC data for the compendiums Import Book Art fills.
 * @param {Record<string, object[]>} goods From goodsFromPages.
 * @param {object} labels Words in the world's language.
 * @param {Record<string, string>} labels.rarities By RARITIES key.
 * @param {string} labels.siege      Describes a siege engine.
 * @param {(rarity: string) => string} labels.poison Names a poison of a rarity.
 * @param {string} labels.rollVirtues Noted on hirelings, whose entries give only GD.
 * @param {string} labels.attack     Names an attack printed without one.
 * @returns {{items: Record<string, object[]>, actors: Record<string, object[]>}}
 *   `items` is keyed by GOODS_ITEM_KINDS, and `actors` by GOODS_ACTOR_KINDS.
 */
export function goodsDocuments(goods, labels) {
	const rarity = (key) => labels.rarities[key] ?? "";
	const describe = (...texts) => paragraphs(texts.filter(Boolean).join(" · "));
	const flags = (qualities) => Object.fromEntries(["hefty", "long", "slow", "ranged", "blast"].map((key) => [key, qualities.includes(key)]));

	const npc = (block, { scale = null, notes = [] } = {}) => {
		const data = npcFromStatBlock(block, { attackName: labels.attack });
		const system = { ...data.system, notes: paragraphs(...notes) + data.system.notes };
		if (scale) system.scale = scale;
		return { type: "npc", name: data.name, system, items: data.items };
	};

	return {
		items: {
			weapons: goods.weapons.map((weapon) => ({
				type: "weapon",
				name: weapon.name,
				system: {
					damage: weapon.damage,
					...flags(weapon.qualities),
					heftyMounted: countsAsHeftyMounted(weapon.note),
					equipped: true,
					description: describe(weapon.siege ? labels.siege : rarity(weapon.rarity), weapon.group) + paragraphs(capitalise(weapon.note))
				}
			})),
			armour: goods.armour.map((armour) => ({
				type: "armour",
				name: armour.name,
				system: {
					kind: armour.kind,
					armour: armour.armour,
					damage: armour.damage,
					equipped: true,
					description: describe(rarity(armour.rarity)) + paragraphs(capitalise(armour.note))
				}
			})),
			tools: goods.tools.map((tool) => ({ type: "gear", name: tool.name, system: { description: describe(rarity(tool.rarity)) } })),
			remedies: goods.remedies.map((remedy) => ({
				type: "gear",
				name: remedy.name,
				system: { remedy: remedy.virtue ?? "", description: describe(rarity(remedy.rarity)) + paragraphs(remedy.note) }
			})),
			poisons: goods.poisons.map((poison) => ({
				type: "gear",
				name: labels.poison(poison.rarity),
				system: { description: paragraphs(poison.note) }
			}))
		},
		actors: {
			beasts: goods.beasts.map((beast) => npc(beast, { notes: [rarity(beast.rarity)] })),
			hirelings: goods.hirelings.map((hireling) => npc(hireling, { notes: [rarity(hireling.rarity), labels.rollVirtues] })),
			warbands: goods.warbands.map((warband) => npc(warband, { scale: "warband" })),
			structures: goods.structures.map((structure) => ({
				type: "npc",
				name: structure.name,
				system: {
					guard: { value: structure.guard, max: structure.guard },
					armour: structure.armour,
					structure: true,
					notes: paragraphs(capitalise(structure.note))
				},
				items: []
			}))
		}
	};
}
