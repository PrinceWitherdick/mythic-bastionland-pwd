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

/** Gambits in the order the character sheet prints them. */
export const GAMBITS = Object.freeze(["bolster", "move", "repel", "stop", "impair", "trap", "dismount", "other"]);
