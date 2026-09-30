/**
 * A Knight's Property as the book prints it, such as "Old sword (d8 hefty),
 * mail (A1)", read into the items it lists: weapons with their dice and
 * qualities, armour with its value and type, other gear by name, and any
 * steed or other companion. Pure, so it can be tested without Foundry.
 */
import { RANGED_NAME } from "./arms-and-goods.js";
import { looksWooden } from "./armour.js";
import { ALTERNATE_QUALITIES, SPECIALIST_DICE } from "./attack.js";
import { countsAsHeftyMounted, parseAttacks, parseStatLine } from "./stat-blocks.js";
import { capitalise, paragraphs, parentheticals, splitOutside } from "./text.js";
import { VIRTUES } from "./virtues.js";

const COMMA = /^,/;
const JOINER = /^\s+(?:and|or)\s+/i;
const LEADING_JOINER = /^(?:and|or)\s+/i;
const ARMOUR_VALUE = /(?:^|[\s,])A(\d+)\b/;
const TRAMPLE = /(\d*d\d+)\s+trample/i;
/** Something that bursts over an area, as in "(... striking for d10 blast, ...)". */
const BLAST = /\b(\d*d\d+)\s+blast\b/i;
/** A companion's own attack, such as "d4 talons". */
const NATURAL_ATTACK = /^(\d*d\d+)\s+(.+)$/i;
/** How a Property line points at the d6 table on the Knight's page: "(see below)", or "as below" once. */
const SEE_BELOW = /\b(?:see|as) below\b/i;

/**
 * @param {string|null|undefined} name An item's name, such as "Round shield (d4, A1) painted with a lantern (see below)".
 * @returns {boolean} Whether it points at the table on its Knight's page.
 */
export const pointsBelow = (name) => SEE_BELOW.test(name ?? "");

/** "(see below)" standing alone, as in "Tattoos (see below)". */
export const WHOLE_ASIDE = /\s*\((?:see|as) below\)/gi;
/** A note that only points at that table, such as "see below" or "but see below". */
const ONLY_SEE_BELOW = /^(?:but\s+)?(?:see|as) below$/i;

/**
 * @param {string} text
 * @returns {string} Commas and spaces trimmed from both ends.
 */
const tidy = (text) => String(text ?? "").replace(/^[\s,;.]+|[\s,;.]+$/g, "");

/**
 * What a parenthesis on a Property line says the thing before it is: a
 * companion with a stat line, such as a steed; armour, such as "(A1)" or a
 * shield's "(d4, A1)"; a weapon, whose parenthesis starts with its dice; or
 * something thrown that bursts over an area, "striking for d10 blast".
 * @param {string} inner
 * @returns {"companion"|"armour"|"weapon"|"blast"|null}
 */
function groupKind(inner) {
	if (Number.isInteger(parseStatLine(inner)?.stats.vig)) return "companion";
	if (ARMOUR_VALUE.test(inner)) return "armour";
	if (/^\s*\d*d\d+/i.test(inner)) return "weapon";
	if (BLAST.test(inner)) return "blast";
	return null;
}

/**
 * The first parenthesis that says what the thing before it is, as the "(A1)"
 * in "Fur mantle (see below) over mail (A1)".
 * @param {string} text
 * @returns {{open: number, close: number, inner: string, kind: string}|null}
 */
function typedGroup(text) {
	for (const group of parentheticals(text)) {
		const kind = groupKind(group.inner);
		if (kind) return { ...group, kind };
	}
	return null;
}

/**
 * The armour type a piece's name suggests. Only one of each can be worn (p12).
 * @param {string} name
 * @returns {"coat"|"plates"|"helm"|"shield"}
 */
export function armourKind(name) {
	if (/shield|buckler/i.test(name)) return "shield";
	if (/helm|coif|hood|mask/i.test(name)) return "helm";
	if (/plate|splint|brigandine|scale|pauldron/i.test(name)) return "plates";
	return "coat";
}

/** @returns {string} Paragraphs of HTML, one for each piece of text given, tidied and capitalised. */
const tidyParagraphs = (...texts) => paragraphs(...texts.map((text) => capitalise(tidy(text))));

/** How many are carried, leading a name as in "3 javelins", or an aside as in "3 polished stones". */
const LEADING_COUNT = /^(\d+)\s+(?=\p{L})/u;
/** When a possession comes round again: "restock each new Season", or a flask found anew then. */
const RESTOCKS = Object.freeze([
	["season", /\brestock each new season\b|\bat the start of the next season\b/i],
	["day", /\b(?:one|a) (?:use|dose) each day\b/i]
]);
/** Something carried to be used once, as "use once only". */
const ONCE = /\buse once only\b/i;

/**
 * How many of a possession are carried and whether they come round again, as
 * the book's line says: "3 wax candles", "(restock …)", "one dose each day",
 * "(use once only …)". A possession that is
 * restocked or used once is counted as one when no number is given.
 * @param {string} text The possession as printed.
 * @param {number|null} [count] A number of them already read off it.
 * @returns {{quantity?: {value: number, max: number}, restock?: string}}
 */
function stockOf(text, count = null) {
	const restock = RESTOCKS.find(([, pattern]) => pattern.test(text))?.[0] ?? "";
	const carried = count ?? (restock || ONCE.test(text) ? 1 : null);
	return {
		...(carried === null ? {} : { quantity: { value: carried, max: carried } }),
		...(restock ? { restock } : {})
	};
}

/**
 * A name with the number carried taken off its front: "3 javelins" is
 * "Javelins", three of them.
 * @param {string} name
 * @returns {{name: string, count: number|null}}
 */
function countedName(name) {
	const match = LEADING_COUNT.exec(name);
	return match ? { name: capitalise(name.slice(match[0].length)), count: Number(match[1]) } : { name, count: null };
}

/**
 * A weapon's other way to fight, as a note on it says: "in melee or d6
 * ranged", or "or d6 each …as a pair".
 * @param {string} note
 * @returns {object|null} The alternate field's data, or null for a note that says nothing of the kind.
 */
function alternateFrom(note) {
	const text = tidy(note);
	const pair = /^or\s+(\d*)d(\d+)\s+each\s+when\s+wielded\s+as\s+a\s+pair$/i.exec(text);
	if (pair) return { label: "as a pair", damage: `2d${pair[2]}` };
	const other = /^in\s+melee\s+or\s+(\d*d\d+)\s+(.+)$/i.exec(text);
	if (!other) return null;
	const words = other[2].toLowerCase().split(/\s+/);
	const alternate = { label: words.filter((word) => !ALTERNATE_QUALITIES.includes(word)).join(" ") || words.at(-1), damage: other[1].toLowerCase() };
	for (const word of words) if (ALTERNATE_QUALITIES.includes(word)) alternate[word] = true;
	return alternate;
}

/**
 * When a piece of armour's Armour counts, from the words sharing its "A1":
 * "(A1 only when Wounded)", "(A1 when mounted)", "(A1 in verdant environments
 * only)"; or from an aside of its own, "no protection against fire".
 * @param {string} inner The parenthesis, as "A1 only when Wounded".
 * @returns {{condition: string, situation: string, said: string[]}|null} `said` are the notes it came from.
 */
function armourConditionFrom(inner) {
	const parts = splitOutside(inner, COMMA).map(tidy);
	const valued = parts.find((part) => ARMOUR_VALUE.test(part));
	const beside = tidy((valued ?? "").replace(ARMOUR_VALUE, " ").replace(/\b\d*d\d+\b/i, " "));
	if (beside && !ONLY_SEE_BELOW.test(beside)) {
		if (/^(?:only\s+)?when\s+wounded$/i.test(beside)) return { condition: "wounded", situation: "", said: [beside] };
		if (/^(?:only\s+)?(?:when|while)\s+mounted$/i.test(beside)) return { condition: "mounted", situation: "", said: [beside] };
		return { condition: "only", situation: tidy(beside.replace(/^only\s+|\s+only$/gi, "")), said: [beside] };
	}
	const against = parts.find((part) => /^no protection against\s+/i.test(part));
	if (against) return { condition: "except", situation: against.replace(/^no protection\s+/i, ""), said: [against] };
	return null;
}

/**
 * @typedef {object} Companion A creature carried as Property, such as a steed.
 * @property {string} name
 * @property {string} text The piece as printed, such as "Grey charger (VIG 12, ...)".
 * @property {{vig: number, cla: number, spi: number, guard: number}} stats
 * @property {number} armour
 * @property {string|null} trample Its trample's dice, such as "d6", joining its rider's charge (p10).
 * @property {{name: string, damage: string}[]} attacks Its own attacks, such as a hawk's "d4 talons".
 * @property {string[]} notes Anything else said of it.
 */

/**
 * A piece of gear as printed, with any count taken off the front of its name
 * and read, as whether it's restocked is.
 * @param {string} text
 * @returns {{type: "gear", name: string, system?: object}}
 */
function gearItem(text) {
	const { name, count } = countedName(capitalise(tidy(text)));
	const system = stockOf(text, count);
	return Object.keys(system).length ? { type: "gear", name, system } : { type: "gear", name };
}

/**
 * The pieces of Property in one chunk: the text before a parenthesis, the
 * parenthesis, and whatever follows it. A second typed piece after the first,
 * as in "mail (A1) with open helm (A1)", is a piece of its own.
 * @param {string} chunk
 * @returns {{item?: object, companion?: Companion}[]}
 */
function readChunk(chunk) {
	const text = chunk.replace(LEADING_JOINER, "").trim();
	const group = typedGroup(text);
	const kind = group?.kind;
	const name = kind ? capitalise(tidy(text.slice(0, group.open))) : "";
	if (!kind || !name) return [{ item: gearItem(text) }];
	const tail = text.slice(group.close + 1);
	const more = typedGroup(tail) ? tail.replace(/^\s*(?:with|and|plus)\s+/i, "") : "";
	const own = more ? text.slice(0, group.close + 1) : text;
	const after = more ? "" : tidy(tail.replace(WHOLE_ASIDE, ""));
	// The table on the Knight's page belongs to whatever says "see below", found by its name.
	const label = pointsBelow(own) && !pointsBelow(name) ? `${name} (see below)` : name;
	const aside = (note) => !ONLY_SEE_BELOW.test(tidy(note));
	const rest = more ? readChunk(more) : [];

	if (kind === "companion") {
		const { stats, rest: said } = parseStatLine(group.inner);
		const parts = splitOutside(said, COMMA);
		const trample = parts.map((part) => TRAMPLE.exec(part)?.[1]).find(Boolean) ?? null;
		const armour = Number(parts.map((part) => /^A(\d+)$/.exec(part)?.[1]).find(Boolean) ?? 0);
		const attacks = parts
			.filter((part) => !TRAMPLE.test(part))
			.map((part) => NATURAL_ATTACK.exec(tidy(part)))
			.filter(Boolean)
			.map(([, damage, what]) => ({ name: capitalise(tidy(what)), damage: damage.toLowerCase() }));
		const other = (part) => !TRAMPLE.test(part) && !/^A\d+$/.test(part) && !NATURAL_ATTACK.test(tidy(part));
		const notes = [...parts.filter((part) => other(part) && aside(part)), after].map(tidy).filter(Boolean);
		// Its NPC is named without the pointer to the table, which stays on the Knight's line.
		const companion = { name: tidy(name.replace(WHOLE_ASIDE, "")), text: capitalise(tidy(own)), stats, armour, trample: trample?.toLowerCase() ?? null, attacks, notes };
		return [{ companion }, ...rest];
	}

	if (kind === "armour") {
		const armour = Number(ARMOUR_VALUE.exec(group.inner)[1]);
		// A shield's Attack die comes first, as in "(d4, A1)", or right after its Armour, as in "(A1 d4)".
		// Dice later on are something else it does.
		const die = /^\s*(\d*d\d+)\b/i.exec(group.inner) ?? /\bA\d+\s+(\d*d\d+)\b/i.exec(group.inner);
		const damage = die?.[1].toLowerCase() ?? "";
		const counts = armourConditionFrom(group.inner);
		const note = splitOutside((die ? group.inner.replace(die[1], " ") : group.inner).replace(ARMOUR_VALUE, " "), COMMA)
			.filter(aside).map(tidy)
			.filter((part) => part && !counts?.said.includes(part))
			.join(", ");
		const kind = armourKind(name);
		const item = {
			type: "armour",
			name: label,
			system: {
				kind,
				armour,
				damage,
				equipped: true,
				...(kind === "shield" && /buckler/i.test(name) ? { buckler: true } : {}),
				...(looksWooden(name, { type: "armour", kind }) ? { wooden: true } : {}),
				...(counts ? { condition: counts.condition, situation: counts.situation } : {}),
				description: tidyParagraphs(note, after)
			}
		};
		return [{ item }, ...rest];
	}

	if (kind === "blast") {
		// Titan beads or phoenix feathers: an Attack of their own, and the book says how many are carried.
		const counted = countedName(label);
		const count = counted.count ?? (Number(LEADING_COUNT.exec(tidy(group.inner))?.[1]) || null);
		const system = {
			damage: BLAST.exec(group.inner)[1].toLowerCase(),
			blast: true,
			equipped: true,
			...stockOf(own, count),
			// Each one thrown is gone until they're restocked.
			usedUp: Boolean(count),
			description: tidyParagraphs(...splitOutside(group.inner, COMMA).filter((note) => aside(note) && !/^(?:striking for\s+)?\d*d\d+\s+blast$/i.test(tidy(note))), after)
		};
		return [{ item: { type: "weapon", name: counted.name, system } }, ...rest];
	}

	const [attack] = parseAttacks(`${name} (${group.inner})`).attacks;
	if (!attack) return [{ item: gearItem(own) }, ...rest];
	let notes = attack.note ? splitOutside(attack.note, COMMA).filter(aside) : [];
	// "+d8 dropping from above": a specialist weapon's extra die, and when it applies (p12).
	const special = notes.map((note) => /^\+\s*(d\d+)\s+(.+)$/i.exec(note)).find((match) => match && SPECIALIST_DICE.includes(match[1].toLowerCase()));
	const qualities = new Set(attack.qualities);
	if (RANGED_NAME.test(name)) qualities.add("ranged");
	// "2d8 hefty when mounted": Hefty only on horseback, as a lance is (p12).
	if (qualities.has("hefty") && notes.some((note) => /^when mounted$/i.test(tidy(note)))) {
		qualities.delete("hefty");
		qualities.add("heftyMounted");
		notes = notes.filter((note) => !/^when mounted$/i.test(tidy(note)));
	}
	// "d8 long, or hefty if mounted"
	const lance = (note) => countsAsHeftyMounted(note) || /^or\s+hefty\s+(?:if|when)\s+mounted$/i.test(tidy(note));
	if (notes.some(lance)) {
		qualities.add("heftyMounted");
		notes = notes.filter((note) => !lance(note));
	}
	for (const quality of ["long", "slow"]) {
		const onFoot = new RegExp(`^${quality} on foot$`, "i");
		if (!notes.some((note) => onFoot.test(tidy(note)))) continue;
		qualities.add(quality);
		notes = notes.filter((note) => !onFoot.test(tidy(note)));
	}
	// "in melee or d6 ranged": another way to fight with it.
	const alternateNote = notes.find((note) => alternateFrom(note));
	notes = notes.filter((note) => note !== alternateNote);
	const counted = countedName(label);
	const system = {
		damage: attack.damage,
		equipped: true,
		specialist: special ? { die: special[1].toLowerCase(), situation: tidy(special[2]) } : { die: "", situation: "" },
		...(alternateNote ? { alternate: alternateFrom(alternateNote) } : {}),
		...(looksWooden(name, { type: "weapon" }) ? { wooden: true } : {}),
		...stockOf(own, counted.count),
		description: tidyParagraphs(...notes.filter((note) => !special || note !== special[0]), after)
	};
	for (const quality of ["hefty", "long", "slow", "ranged", "blast", "ignoresArmour", "trample", "heftyMounted"]) system[quality] = qualities.has(quality);
	// Explosives and the like go with each Attack; a javelin can be picked up again.
	if (system.blast && counted.count) system.usedUp = true;
	return [{ item: { type: "weapon", name: counted.name, system } }, ...rest];
}

/**
 * What a Knight's Property turns into: weapons with their dice and qualities,
 * armour with its value and type, other gear by name, and a steed or other
 * companion. A line with nothing typed in it, such as a curious trinket, stays
 * one piece of gear.
 * Where two pieces are the same armour type, only the first is worn.
 * @param {string[]} lines As the book prints them, such as "Old sword (d8 hefty), mail (A1)".
 * @returns {{items: object[], companions: Companion[]}} Item data, and the companions.
 */
export function propertyItems(lines) {
	const items = [];
	const companions = [];
	for (const line of lines ?? []) {
		const text = String(line ?? "").trim();
		if (!text) continue;
		const typed = splitOutside(text, COMMA).some((part) => typedGroup(part));
		const chunks = typed ? splitOutside(text, COMMA).flatMap((part) => splitOutside(part, JOINER)) : [text];
		for (const { item, companion } of chunks.flatMap(readChunk)) {
			if (item) items.push(item);
			if (companion) companions.push(companion);
		}
	}
	const worn = new Set();
	for (const item of items) {
		if (item.type !== "armour") continue;
		if (worn.has(item.system.kind)) item.system.equipped = false;
		worn.add(item.system.kind);
	}
	return { items, companions };
}

/**
 * A Knight's Property as the items they start with. A steed or other companion
 * stays one piece of gear, as printed, for the Referee to make into an NPC.
 * @param {string[]} lines As the book prints them.
 * @returns {object[]} Item data.
 */
export function propertyGear(lines) {
	const { items, companions } = propertyItems(lines);
	return [...items, ...companions.map(({ text }) => ({ type: "gear", name: text }))];
}

/**
 * Knights made before their Property was read carry each line as one piece of
 * gear, so their mail and shields add no Armour. Each such line, untouched
 * since, becomes the weapons, armour and gear it lists. A piece of armour is
 * worn only if nothing of its type is worn already (p12). The pieces take the
 * line's place in the list.
 * @param {{id: string, type: string, name: string, sort?: number, system: object}[]} items A Knight's items.
 * @returns {{remove: string[], create: object[]}} The ids of the gear to remove, and item data to make.
 */
export function retypedProperty(items) {
	const remove = [];
	const create = [];
	const worn = new Set(items.filter((item) => item.type === "armour" && item.system.equipped).map((item) => item.system.kind));
	for (const item of items) {
		if (item.type !== "gear" || item.system.description || item.system.remedy) continue;
		const retyped = propertyGear([item.name]);
		if (!retyped.some((piece) => piece.type !== "gear")) continue;
		for (const [index, piece] of retyped.entries()) {
			piece.sort = (item.sort ?? 0) + index;
			if (piece.type === "armour") {
				piece.system.equipped = !worn.has(piece.system.kind);
				worn.add(piece.system.kind);
			}
		}
		remove.push(item.id);
		create.push(...retyped);
	}
	return { remove, create };
}

/**
 * What the Property reader now knows of a possession beyond its dice and
 * Armour: how many, when restocked, when its Armour counts, another way to
 * fight with it, and whether it's wooden or a buckler. Knights made before it
 * read these get them from their book lines, filled in only where the item
 * still has nothing of its own, so nothing a player set is undone.
 * @param {{id: string, type: string, name: string, system: object}[]} items A Knight's items.
 * @param {string[]} lines Their Property as the book prints it.
 * @returns {{_id: string, [key: string]: unknown}[]} Item updates.
 */
export function possessionDetails(items, lines) {
	const plain = (name) => String(name ?? "").replace(LEADING_COUNT, "").trim().toLowerCase();
	const pieces = propertyItems(lines).items;
	const updates = [];
	for (const item of items) {
		const piece = pieces.find((candidate) => candidate.type === item.type && plain(candidate.name) === plain(item.name));
		if (!piece?.system) continue;
		const had = item.system ?? {};
		const got = piece.system;
		const update = {};
		if (got.quantity && !Number.isInteger(had.quantity?.value)) update["system.quantity"] = got.quantity;
		if (got.restock && !had.restock) update["system.restock"] = got.restock;
		if (got.usedUp && !had.usedUp) update["system.usedUp"] = true;
		if (got.wooden && !had.wooden) update["system.wooden"] = true;
		if (got.buckler && !had.buckler) update["system.buckler"] = true;
		if (got.alternate && !had.alternate?.damage) update["system.alternate"] = got.alternate;
		if (got.condition && !had.condition) {
			update["system.condition"] = got.condition;
			update["system.situation"] = got.situation;
		}
		// "3 javelins" is "Javelins" now its count is kept.
		if (LEADING_COUNT.test(item.name) && update["system.quantity"]) update.name = piece.name;
		if (Object.keys(update).length) updates.push({ _id: item.id, ...update });
	}
	return updates;
}

/** @param {string} name */
export const isSteed = (name) => /steed|horse|charger|stallion|\bmare\b|destrier|palfrey|courser|gelding|mount|pony/i.test(String(name ?? ""));

/**
 * NPC data for a companion, with its trample and any attacks of its own as weapons.
 * @param {Companion} companion
 * @param {object} [options]
 * @param {string} [options.trampleName] Names the trample weapon.
 * @returns {{type: "npc", name: string, system: object, items: object[]}}
 */
export function companionActorData({ name, stats, armour, trample, attacks = [], notes }, { trampleName = "Trample" } = {}) {
	const track = (value) => ({ value, max: value });
	const virtues = Object.fromEntries(VIRTUES.filter((key) => Number.isInteger(stats[key])).map((key) => [key, track(stats[key])]));
	const weapon = (weaponName, damage, system = {}) => ({ type: "weapon", name: weaponName, system: { damage, ...system, equipped: true } });
	return {
		type: "npc",
		name,
		system: {
			virtues,
			...(Number.isInteger(stats.guard) ? { guard: track(stats.guard) } : {}),
			armour,
			notes: tidyParagraphs(...notes)
		},
		items: [
			...(trample ? [weapon(trampleName, trample, { trample: true })] : []),
			...attacks.map((attack) => weapon(attack.name, attack.damage))
		]
	};
}

/**
 * @typedef {object} CarriedCompanion A companion a Knight carries as a line of gear.
 * @property {string} itemId The gear line.
 * @property {Companion} companion
 * @property {boolean} steed The Knight's steed, whose trample joins a mounted charge (p10).
 * @property {boolean} keepLine Whether the line stays once the companion is an NPC. The steed's goes,
 *   as the sheet shows the Steed on its own, unless the line points at the page's table.
 */

/**
 * The companions a Knight carries as lines of gear, untouched since they were
 * made, to be made into NPCs. The first steed among them is the one they ride.
 * @param {{id: string, type: string, name: string, system: object}[]} items A Knight's items.
 * @param {object} [options]
 * @param {boolean} [options.steedOnly] Only the steed.
 * @returns {CarriedCompanion[]}
 */
export function knightCompanions(items, { steedOnly = false } = {}) {
	const found = [];
	for (const item of items) {
		if (item.type !== "gear" || item.system.description) continue;
		const { items: pieces, companions } = propertyItems([item.name]);
		if (pieces.length || companions.length !== 1) continue;
		const [companion] = companions;
		const steed = isSteed(companion.name) && !found.some((carried) => carried.steed);
		if (steedOnly && !steed) continue;
		found.push({ itemId: item.id, companion, steed, keepLine: !steed || pointsBelow(item.name) });
	}
	return found;
}

/**
 * Whose companion an NPC is: the Knight who rides it, or the one it was made
 * for. A companion's own sheet names them, so its name needn't carry them.
 * Being ridden comes first, as that is the link the Knight's sheet keeps.
 * @template {{type: string, id?: string, uuid?: string, system?: {steed?: string}}} T
 * @param {Iterable<T>} actors Every actor in the world.
 * @param {object} companion
 * @param {string} [companion.uuid] The companion's uuid, which their Knight rides.
 * @param {string} [companion.companionOf] The id in its companion flag, if it has one.
 * @returns {T|null}
 */
export function ownerOf(actors, { uuid, companionOf } = {}) {
	if (!uuid && !companionOf) return null;
	// One pass, since the callers hand this every actor in the world and one of
	// them asks it for each of them in turn.
	let made = null;
	for (const actor of actors) {
		if (actor.type !== "knight") continue;
		if (uuid && actor.system?.steed === uuid) return actor;
		if (companionOf && !made && actor.id === companionOf) made = actor;
	}
	return made;
}

/**
 * The name a companion once carried its Knight in, without them: companions
 * used to be called "Charger (Sir Bardolf)", where their sheet now says who
 * owns them.
 * @param {string} name The companion's name.
 * @param {string} [owner] The name of the Knight it belongs to.
 * @returns {string} The name alone, or the name unchanged if it never held theirs.
 */
export function nameWithoutOwner(name, owner) {
	if (!owner) return name;
	const suffix = ` (${owner})`;
	if (!name.endsWith(suffix)) return name;
	return name.slice(0, -suffix.length).trim() || name;
}
