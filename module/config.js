/**
 * Fixed lists the sheets and data models share. Labels for every key live in
 * the language file under the matching `bastionland.` path.
 */

/** Each Life has 3 Ages (Time, p17). */
export const AGES = Object.freeze(["young", "mature", "old"]);

/** One of each armour type can be worn at once (Arms & Goods, p12). */
export const ARMOUR_KINDS = Object.freeze(["coat", "plates", "helm", "shield"]);

/** Item types listed under Property, in sheet order. */
export const PROPERTY_TYPES = Object.freeze(["weapon", "armour", "gear"]);

/** The three Feats every Knight knows (p10) and the Virtue each one tests. */
export const FEATS = Object.freeze([
	Object.freeze({ key: "smite", virtue: "vig" }),
	Object.freeze({ key: "focus", virtue: "cla" }),
	Object.freeze({ key: "deny", virtue: "spi" })
]);

/**
 * The fields of a Knight that hold another Actor by UUID, in the order the
 * sheet and the Ledger read them: what each is called below `bastionland.`,
 * and whether whoever it names is kept in the Knight's own folder.
 */
export const LINKED_ACTORS = Object.freeze([
	Object.freeze({ key: "steed", label: "steed.label", kept: true }),
	Object.freeze({ key: "squire", label: "squire.label", kept: true }),
	Object.freeze({ key: "serves", label: "ledger.subjects.serves" }),
	Object.freeze({ key: "domain", label: "ledger.subjects.domain" }),
	Object.freeze({ key: "successor", label: "successor.label" })
]);

/** Conditions marked by hand, and those that follow from a Virtue at 0 (Harm & Scars, p9). */
export const MARKED_CONDITIONS = Object.freeze(["fatigued", "exposed", "mortalWound"]);
export const DERIVED_CONDITIONS = Object.freeze(["exhausted", "impaired"]);

/** An NPC is one person or creature, or a Warband of two dozen or so fighting as one (Warfare, p11). */
export const NPC_SCALES = Object.freeze(["individual", "warband"]);

/** What the NPC chooser lists: each Myth with its Cast, each Seer, and the City Quest's Cast. Keys of the art index. */
export const NPC_SOURCES = Object.freeze(["myths", "seers", "cityQuest"]);

/** Gambits in the order the character sheet prints them. */
export const GAMBITS = Object.freeze(["bolster", "move", "repel", "stop", "impair", "trap", "dismount", "other"]);

/** Gambits whose chat card adds a rule the sheet's short line leaves out (p10). */
export const GAMBIT_DETAILS = Object.freeze(["move", "dismount"]);
