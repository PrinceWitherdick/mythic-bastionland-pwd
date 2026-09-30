/**
 * Wood and Stone (Warfare, p11): a ship or structure is destroyed at 0GD, a
 * day of repairs brings its GD back, and colliding ships take d12 Damage,
 * or d6 for one much larger than the other. Siege towers are built the same
 * way. Pure, so it can be tested without Foundry.
 */
import { VIRTUES } from "./virtues.js";

/** What a Structure actor can be. */
export const STRUCTURE_KINDS = Object.freeze(["structure", "ship", "siege"]);

/** Every Virtue an NPC starts with, which a structure NPC never had cause to change. */
const DEFAULT_VIRTUE = 10;

/** Rowboat, Longship, Warship, and the like. */
const SHIP_NAME = /(?:ship|boat)\b|\b(?:barge|galley|raft)\b/i;
const CARRIES = /^carries\s+(.+?)\.?$/i;

/**
 * @param {object} args
 * @param {string} [args.name]
 * @param {string} [args.carries] What it carries, which only a ship does.
 * @param {boolean} [args.siege]  Printed under Artillery and Siegery.
 * @returns {string} One of STRUCTURE_KINDS.
 */
export function structureKind({ name = "", carries = "", siege = false } = {}) {
	if (siege) return "siege";
	if (carries || SHIP_NAME.test(name)) return "ship";
	return "structure";
}

/**
 * Split what a ship carries from the rest of its note, as in "carries a Warband".
 * @param {string} note The parts of an entry after its GD and Armour, joined by commas.
 * @returns {{carries: string, rest: string}}
 */
export function carriesFrom(note) {
	const parts = String(note ?? "").split(/\s*,\s*/).filter(Boolean);
	const index = parts.findIndex((part) => CARRIES.test(part));
	if (index < 0) return { carries: "", rest: parts.join(", ") };
	const carries = CARRIES.exec(parts[index])[1];
	parts.splice(index, 1);
	return { carries, rest: parts.join(", ") };
}

/** Siege engines, named for what they are (Artillery and Siegery, p11). */
const SIEGE_WORDS = /\b(?:siege|trebuchets?|stone throwers?|battering rams?|bolt launchers?|catapults?|ballistae?|mangonels?)\b/i;

/** Fire, as a weapon's name or note gives it. */
const FIRE_WORDS = /\b(?:fire|firepots?|flames?|flaming|burning|torch(?:es)?|incendiary|alight)\b/i;

/**
 * What an Attack brings that can harm a structure (Wood and Stone, p11):
 * siege weapons, fire, or a suitably large creature.
 * @param {object} args
 * @param {boolean} [args.fromSiege] Made by a siege engine, which is a Structure actor.
 * @param {boolean} [args.large]     Made by a creature that counts as a structure.
 * @param {string[]} [args.texts]    Each weapon's name and note.
 * @returns {{siege: boolean, fire: boolean, large: boolean}}
 */
export function structureHarm({ fromSiege = false, large = false, texts = [] } = {}) {
	return {
		siege: fromSiege || texts.some((text) => SIEGE_WORDS.test(text)),
		fire: texts.some((text) => FIRE_WORDS.test(text)),
		large
	};
}

/**
 * Whether an Attack harms a structure. Wood yields to fire, siege weapons and
 * large creatures; stone walls can't be breached by conventional means, so
 * only siege weapons are taken to harm them (p11).
 * @param {{siege?: boolean, fire?: boolean, large?: boolean}|null|undefined} harm From structureHarm.
 * @param {boolean} stone
 * @returns {boolean}
 */
export function harmsStructure(harm, stone = false) {
	if (!harm) return false;
	return stone ? Boolean(harm.siege) : Boolean(harm.siege || harm.fire || harm.large);
}

/**
 * The die a ship takes in a collision (p11).
 * @param {boolean} muchLarger Whether this ship is much larger than the other.
 * @returns {number} Faces of the die.
 */
export const collisionFaces = (muchLarger) => (muchLarger ? 6 : 12);

/**
 * Whether an NPC is really a structure: marked as one, with the Virtues every
 * NPC starts with, so nothing ever gave it any. A creature that only counts as
 * a structure, such as a colossus of stone, has Virtues of its own and stays.
 * @param {{type: string, system: object}} source An actor's data.
 * @returns {boolean}
 */
export function isStructureNpc({ type, system }) {
	if (type !== "npc" || !system?.structure || system.scale === "warband") return false;
	return VIRTUES.every((key) => system.virtues?.[key]?.value === DEFAULT_VIRTUE && system.virtues[key].max === DEFAULT_VIRTUE);
}

/** A paragraph that is only what a ship carries, as Import PDF wrote it. */
const CARRIES_PARAGRAPH = /<p>\s*carries\s+([^<]+?)\.?\s*<\/p>/i;

/**
 * Structure data for an NPC made into a Structure actor.
 * @param {string} name
 * @param {object} system The NPC's system data.
 * @returns {object} Every field of a Structure actor's system data.
 */
export function structureFromNpc(name, system) {
	let notes = system.notes ?? "";
	const carries = CARRIES_PARAGRAPH.exec(notes)?.[1]?.trim() ?? "";
	if (carries) notes = notes.replace(CARRIES_PARAGRAPH, "");
	return {
		kind: structureKind({ name, carries }),
		epithet: system.epithet ?? "",
		guard: { value: system.guard?.value ?? 0, max: system.guard?.max ?? 0 },
		armour: system.armour ?? 0,
		armourNote: system.armourNote ?? "",
		carries,
		notes
	};
}
