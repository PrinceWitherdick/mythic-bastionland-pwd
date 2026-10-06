/**
 * Making a Knight (Beginnings & Glory p6, Knighthood p7). Plain data and
 * functions, so the Knight chooser's choices can be tested without Foundry.
 */
import { SYSTEM_ID } from "../system-id.js";
import { kitForPage, kittedAbility, kitWeapons } from "./ability-kits.js";
import { usesFrom } from "./ability-uses.js";
import { RANKS } from "./glory.js";
import { propertyGear } from "./property.js";
import { isStructureBlock, parseArmour } from "./stat-blocks.js";
import { escapeHTML, searchable } from "./text.js";
import { VIRTUES } from "./virtues.js";

const gloryFor = (rankKey) => RANKS.find((rank) => rank.key === rankKey).glory;

/**
 * The Starts a Company can begin with. Each sets the dice for Virtues and GD,
 * the Knights' Age, and their Rank, given as the Glory that reaches it.
 */
export const STARTS = Object.freeze([
	Object.freeze({ key: "wanderer", virtues: "1d12 + 1d6", guard: "1d6", age: "young", rank: "errant", glory: gloryFor("errant") }),
	Object.freeze({ key: "courtier", virtues: "1d12 + 6", guard: "2d6", age: "mature", rank: "gallant", glory: gloryFor("gallant") }),
	Object.freeze({ key: "ruler", virtues: "1d12 + 6", guard: "1d6 + 6", age: "mature", rank: "tenant", glory: gloryFor("tenant") })
]);

/** "If unsure, roll d12+d6" for Virtues and d6 for GD: the Wanderer's dice. */
export const DEFAULT_START = "wanderer";

/**
 * @param {string} key
 * @returns {object} The Start, or the default for an unknown key.
 */
export function startFor(key) {
	return STARTS.find((start) => start.key === key) ?? STARTS.find((start) => start.key === DEFAULT_START);
}

/** What every Knight carries besides their Property (p7). Names live under `bastionland.chooser.kit`. */
export const STANDARD_KIT = Object.freeze([
	Object.freeze({ key: "dagger", type: "weapon", system: Object.freeze({ damage: "d6" }) }),
	Object.freeze({ key: "torches", type: "gear" }),
	Object.freeze({ key: "rope", type: "gear" }),
	Object.freeze({ key: "rations", type: "gear" }),
	Object.freeze({ key: "camping", type: "gear" })
]);

/**
 * @param {string} name e.g. "The Lantern Knight".
 * @returns {string} "Lantern", for "Known as the ___ Knight".
 */
export function knightTypeFromName(name) {
	return String(name ?? "").trim().replace(/^the\s+/i, "").replace(/\s+knight$/i, "").trim();
}

/**
 * @param {string} type As typed or as the book names them.
 * @returns {string} "lantern" for "Lantern", " lantern " or "The Lantern Knight", so they match.
 */
export const knightTypeKey = (type) => knightTypeFromName(type).toLowerCase();

/**
 * The Knight their sheet's title calls them, as in "Eve the Silk Knight".
 * @param {{isSquire?: boolean, knightType?: string}} knight
 * @returns {string} "Silk", or "" for a Squire or a Knight not yet chosen.
 */
export function titleKnightType({ isSquire = false, knightType = "" } = {}) {
	return isSquire ? "" : knightTypeFromName(knightType);
}

/** Marks the prompts line, as fills that still printed it wrote it. */
const PROMPTS_CLASS = ' class="bastionland-seer__prompts"';

/** The Seer's stat line, as fills before the scores became data opened with. */
const STAT_LINE = /^<p><strong>[^<]*<\/strong><\/p>/;

/**
 * The prompts along the foot of the Seer's page, as fills that printed them on
 * the Seer page wrote them. They're a Spark Table for the Referee rather than
 * anything the Knight knows, so the page no longer shows them; this is kept only
 * to recognise the fills that did, and replace them.
 * @param {{lines?: string[]|null, prompts?: {label: string, value: string}[]|null}|null} seer From the art index.
 * @param {"plain"|"whole"} [older] Older still: plain text, or each prompt whole with a trailing "~".
 * @returns {string} HTML, or "" for a Seer whose prompts weren't read.
 */
function withPrompts(seer, older) {
	const prompts = (seer?.prompts ?? []).filter((prompt) => prompt?.label && prompt?.value);
	if (!prompts.length) return "";
	const pairs = prompts.map(({ label, value }) => `<strong>${escapeHTML(label)}</strong>: ${escapeHTML(value)}`);
	/** How each fill wrote the line, by how old it is. */
	const written = {
		plain: () => pairs.join(" ~ "),
		whole: () => pairs.map((pair, at) => `<span class="bastionland-seer__prompt">${pair}${at < pairs.length - 1 ? " ~" : ""}</span>`).join(" "),
		current: () => pairs.map((pair) => `<span class="bastionland-seer__prompt">${pair}</span>`)
			.join('<span class="bastionland-seer__sep"> <span>~</span> </span>')
	};
	const line = (written[older] ?? written.current)();
	return `${seerInfo(seer)}<p${PROMPTS_CLASS}>${line}</p>`;
}

/**
 * What the book says of a Seer, for the Seer page of their Knight's sheet: each
 * trait as a bullet. Their scores aren't printed here: they're kept as data, by
 * seerBook, and drawn as a stat line of their own. Nor are the prompts along
 * the foot of their page, which are the Referee's Spark Table.
 * @param {{lines?: string[]|null}|null} seer From the art index.
 * @returns {string} HTML, or "" when Import PDF couldn't read their text.
 */
export function seerInfo(seer) {
	const lines = (seer?.lines ?? []).filter(Boolean);
	return lines.length ? `<ul>${lines.map((line) => `<li>${escapeHTML(line)}</li>`).join("")}</ul>` : "";
}

/**
 * What the book gives a Seer, kept on their Knight as data rather than read
 * back out of the text: their scores, the Armour their first trait grants, and
 * whether they are a structure.
 * @param {{stats?: object|null, lines?: string[]|null}|null} seer From the art index.
 * @returns {{vig: number|null, cla: number|null, spi: number|null, guard: number|null,
 *   armour: number, structure: boolean}|null} Null for a Seer whose stats Import PDF couldn't read.
 */
export function seerBook(seer) {
	const stats = seer?.stats ?? null;
	if (!stats || !Number.isInteger(stats.guard)) return null;
	const lines = (seer.lines ?? []).filter(Boolean);
	return {
		...Object.fromEntries(VIRTUES.map((key) => [key, Number.isInteger(stats[key]) ? stats[key] : null])),
		guard: stats.guard,
		armour: parseArmour(lines[0] ?? "")?.armour ?? 0,
		structure: isStructureBlock({ stats, lines })
	};
}

/** "The Dice Seer", "dice seer" and "Dice" all name one Seer. */
const seerKey = (name) => searchable(String(name ?? "").trim()).replace(/^the\s+/, "").replace(/\s+seer$/, "").trim();

/**
 * The Seer who knighted a Knight, found in the art index by the Seer's name,
 * or else by the Knight's own roll, since each Seer shares their Knight's page.
 * @param {object|null} index The art index.
 * @param {{seer: string, knightType: string}} knight
 * @returns {object|null} The Seer's entry.
 */
export function seerForKnight(index, { seer = "", knightType = "" }) {
	const seers = index?.seers ?? [];
	const named = seerKey(seer);
	const byName = named && seers.find((entry) => seerKey(entry.name) === named);
	if (byName) return byName;
	const type = knightTypeKey(knightType);
	const knight = type && (index?.knights ?? []).find((entry) => entry.name && knightTypeKey(entry.name) === type);
	return (knight && seers.find((entry) => entry.roll === knight.roll)) || null;
}

/**
 * What a Knight's sheet fills in about their Seer on its own. The Seer is found by the name beside
 * "Knighted by", or by the Knight's roll while that's blank. The picture and what the book says are
 * filled only where they're empty or still hold what the book says of some Seer, so a new name
 * swaps them over but something picked or written by hand is kept. A Squire has no Seer yet (p7).
 * @param {object|null} index The art index.
 * @param {{isSquire?: boolean, seer?: string, knightType?: string, seerImg?: string, seerInfo?: string}} knight
 * @returns {object} An Actor update, empty when there's nothing to fill.
 */
export function seerAutoFill(index, knight) {
	if (knight.isSquire) return {};
	const named = String(knight.seer ?? "").trim();
	const seer = named ? seerForKnight(index, { seer: named }) : seerForKnight(index, { knightType: knight.knightType });
	if (!seer) return {};
	const seers = index?.seers ?? [];
	const fromBook = (value, of) => !value || seers.some((entry) => of(entry).includes(value));
	const update = {};
	if (!named && seer.name) update["system.seer"] = seer.name;
	if (seer.path && seer.path !== knight.seerImg && fromBook(knight.seerImg, (entry) => [entry.path])) {
		update["system.seerImg"] = seer.path;
	}
	const info = seerInfo(seer);
	// Fills made while the page still printed the prompts end with them: centred, or, older, without
	// their class, as plain text, or with each prompt whole. Every one is still the book's own text,
	// so the page takes the prompts back off them here.
	const asBookGave = (entry) => {
		const plain = withPrompts(entry, "plain");
		return [seerInfo(entry), withPrompts(entry), withPrompts(entry, "whole"), plain, plain.replace(PROMPTS_CLASS, "")];
	};
	// Fills before the scores became data opened with the Seer's stat line, which is dropped here
	// so those are known for the book's text too, and filled again without it.
	const written = String(knight.seerInfo ?? "").replace(STAT_LINE, "");
	if (info && info !== knight.seerInfo && fromBook(written, asBookGave)) {
		update["system.seerInfo"] = info;
		// The scores go with the text they came from, so the two never name different Seers.
		update["system.seerBook"] = seerBook(seer);
	}
	return update;
}

/**
 * @typedef {{id: string, name: string, knightType: string, slain?: boolean, isSquire?: boolean}} KnightRow
 *   A Knight actor in the world, as far as who's taken which Knight goes.
 */

/**
 * The other characters who are their Knight: alive, and not a Squire, who
 * isn't one yet. A slain Knight's Knight may be taken again.
 * @param {KnightRow[]} knights
 * @param {string|null} exceptId The Knight being chosen for.
 * @returns {KnightRow[]}
 */
const holders = (knights, exceptId) => knights.filter((knight) => knight.id !== exceptId && !knight.slain && !knight.isSquire);

/**
 * Knights other characters already are, so no two players are the same one.
 * @param {KnightRow[]} knights Knight actors in the world.
 * @param {{roll: string, name: string|null}[]} entries Knights from the art index.
 * @param {string|null} [exceptId] The Knight being chosen for.
 * @returns {Map<string, string>} Roll to the name of the character who took it.
 */
export function takenKnights(knights, entries, exceptId = null) {
	const rollsByType = new Map(entries
		.filter((entry) => entry.name)
		.map((entry) => [knightTypeKey(entry.name), entry.roll]));

	const taken = new Map();
	for (const knight of holders(knights, exceptId)) {
		const roll = rollsByType.get(knightTypeKey(knight.knightType));
		if (roll && !taken.has(roll)) taken.set(roll, knight.name);
	}
	return taken;
}

/**
 * Who already is the Knight typed in, art index or none.
 * @param {KnightRow[]} knights Knight actors in the world.
 * @param {string} knightType Such as "Lantern" or "The Lantern Knight".
 * @param {string|null} [exceptId] The Knight it's typed for.
 * @returns {string|null} Their name, or null where it's free or blank.
 */
export function knightTypeTakenBy(knights, knightType, exceptId = null) {
	const key = knightTypeKey(knightType);
	if (!key) return null;
	return holders(knights, exceptId).find((knight) => knightTypeKey(knight.knightType) === key)?.name ?? null;
}

/**
 * The actor update for the choices made. Virtues and GD are only set once
 * rolled, and each sets both its current and maximum value. The Knight's
 * portrait becomes the actor's picture, and the square cut around their face
 * becomes their token, but only when those were imported.
 * @param {object} choice
 * @param {object} choice.start              From STARTS.
 * @param {Record<string, number|null>} [choice.virtues]
 * @param {number|null} [choice.guard]
 * @param {object|null} [choice.knight]      A Knight from the art index.
 * @param {object|null} [choice.seer]        Their Seer from the art index.
 * @returns {object}
 */
export function knightUpdate({ start, virtues = {}, guard = null, knight = null, seer = null }) {
	const update = { "system.age": start.age, "system.glory": start.glory };
	for (const key of VIRTUES) {
		const value = virtues[key];
		if (!Number.isInteger(value)) continue;
		update[`system.virtues.${key}.value`] = value;
		update[`system.virtues.${key}.max`] = value;
	}
	if (Number.isInteger(guard)) {
		update["system.guard.value"] = guard;
		update["system.guard.max"] = guard;
	}
	if (knight) {
		Object.assign(update, knightChoice(knight, seer));
		if (knight.path) update.img = knight.path;
		if (knight.token) update["prototypeToken.texture.src"] = knight.token;
	}
	return update;
}

/**
 * The actor update naming which Knight a character is, and the Seer who
 * knighted them. Nothing else: no scores, no picture.
 * @param {object} knight      A Knight from the art index.
 * @param {object|null} [seer] Their Seer from the art index.
 * @returns {object}
 */
export function knightChoice(knight, seer = null) {
	return {
		"system.knightType": knightTypeFromName(knight.name),
		"system.seer": seer?.name ?? "",
		// The Knight's notes on their Seer stay; what the book says follows the new Seer.
		"system.seerImg": seer?.path ?? "",
		"system.seerInfo": seerInfo(seer),
		// As in seerAutoFill, the scores go with the text they came from.
		"system.seerBook": seerBook(seer)
	};
}

/**
 * Items a Knight starts with: their Property as weapons, armour and gear,
 * their Ability and Passion, any weapon their Ability gives, and the standard kit.
 * @param {object|null} knight   A Knight from the art index.
 * @param {Record<string, string>} kitNames Names for STANDARD_KIT, by key.
 * @param {Record<string, string>} [abilityWeaponNames] Names for the weapons ABILITY_KITS give, by key.
 * @returns {object[]} Item data for `createEmbeddedDocuments`.
 */
export function knightItems(knight, kitNames, abilityWeaponNames = {}) {
	const items = propertyGear(knight?.property);
	// What their Ability does, as the page they're printed on has it.
	const kit = knight?.ability ? kitForPage(knight.page) : null;
	for (const type of ["ability", "passion"]) {
		const part = knight?.[type];
		if (!part) continue;
		// An Ability limited to so many uses, as its words say, starts counted.
		const system = { description: `<p>${escapeHTML(part.text)}</p>`, ...(type === "ability" ? usesFrom(part.text) : {}) };
		items.push({ type, name: part.name, system: type === "ability" ? kittedAbility(system, kit) : system });
	}
	items.push(...kitWeapons(kit, (key) => abilityWeaponNames[key] ?? key, SYSTEM_ID));
	for (const { key, type, system } of STANDARD_KIT) {
		items.push(system ? { type, name: kitNames[key], system: { ...system } } : { type, name: kitNames[key] });
	}
	return items;
}
