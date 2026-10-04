/**
 * What some Knights' Abilities do, set on the Ability as the Knight is made:
 * which grants it lends an Attack, what else it can do, and any weapon it
 * gives that their Property doesn't list, such as a bite. Found by the page
 * the Knight is printed on, since the words themselves come from the GM's own
 * book at import. Pure, so it can be tested without Foundry.
 */

/**
 * @typedef {object} KitWeapon A weapon an Ability gives.
 * @property {string} key    Its name, under `bastionland.abilityKits.`
 * @property {object} system Its weapon data.
 *
 * @typedef {object} AbilityKit
 * @property {object} [ability]   Ability data laid over what the book's words gave it.
 * @property {KitWeapon[]} [weapons]
 */

/** @type {Readonly<Record<number, AbilityKit>>} By the page the Knight is printed on. */
export const ABILITY_KITS = Object.freeze({
	// Dice joined into bigger ones before an Attack with allies.
	56: { ability: { grants: { combine: true } } },
	// A chain lashed with both ends, a d6 each.
	60: { weapons: [{ key: "chain", system: { damage: "2d6" } }] },
	// A joint Attack's whole pool rolled again, once.
	62: { ability: { rerollPool: true } },
	// An ally's Mortal Wound taken in their place.
	66: { ability: { deathWard: true } },
	// A blow made alone that harms SPI rather than VIG.
	68: { ability: { grants: { spirit: true, alone: true }, needs: "melee" } },
	// A lone mounted charge with a lance: +d12, Blast, Strong Gambits, and the lance shatters.
	92: { ability: { grants: { blast: true, strongGambits: true, shatters: true, alone: true }, bonusDie: "d12", needs: "charge" } },
	// A rune etched at sunset for a number.
	100: { ability: { sigil: true } },
	// A shockwave on landing from a fall.
	106: { weapons: [{ key: "shockwave", system: { damage: "d8", blast: true, noHand: true } }] },
	// A coin flipped for a life.
	120: { ability: { coinFlip: true } },
	// A bite whose Wound does one of three things, picked before it: VIG taken back, sleep, or a memory shown.
	166: { ability: { grants: { drain: true, sleep: true, memory: true } }, weapons: [{ key: "bite", system: { damage: "d6", noHand: true } }] }
});

/** The flag on a weapon an Ability gave: its key in the kit. */
export const KIT_FLAG = "abilityKit";

/** Every weapon key the kits use, each named under `bastionland.abilityKits.` */
export const KIT_WEAPON_KEYS = Object.freeze([...new Set(Object.values(ABILITY_KITS).flatMap((kit) => (kit.weapons ?? []).map(({ key }) => key)))]);

/**
 * @param {number|null|undefined} page The page a Knight is printed on.
 * @returns {AbilityKit|null}
 */
export const kitForPage = (page) => ABILITY_KITS[page] ?? null;

/**
 * The Ability data a kit lays over what the book's words gave it.
 * @param {object} system The Ability's system data as made so far.
 * @param {AbilityKit|null} kit
 * @returns {object}
 */
export function kittedAbility(system, kit) {
	if (!kit?.ability) return system;
	const { grants, ...rest } = kit.ability;
	return { ...system, ...rest, ...(grants ? { grants: { ...(system.grants ?? {}), ...grants } } : {}) };
}

/**
 * Item data for the weapons a kit gives.
 * @param {AbilityKit|null} kit
 * @param {(key: string) => string} nameOf Each weapon's name, by its key.
 * @param {string} systemId Whose flags mark them as the kit's.
 * @returns {object[]}
 */
export function kitWeapons(kit, nameOf, systemId) {
	return (kit?.weapons ?? []).map(({ key, system }) => ({
		type: "weapon",
		name: nameOf(key),
		system: { equipped: true, ...system },
		flags: { [systemId]: { [KIT_FLAG]: key } }
	}));
}

/**
 * What a Knight made before the kits needs to catch up: their Ability's
 * settings, where it's still at the defaults, and the weapons it gives that
 * they don't carry yet.
 * @param {{id: string, type: string, name: string, system: object, flags?: object}[]} items The Knight's items.
 * @param {AbilityKit|null} kit
 * @param {string} abilityName The Ability the book gives them, which the kit is for.
 * @param {string} systemId
 * @returns {{update: object|null, missing: string[]}} An item update for the Ability, and the kit weapons not carried.
 */
export function kitCatchUp(items, kit, abilityName, systemId) {
	const ability = items.find((item) => item.type === "ability" && item.name === abilityName);
	const carried = new Set(items.map((item) => item.flags?.[systemId]?.[KIT_FLAG]).filter(Boolean));
	const missing = ability ? (kit?.weapons ?? []).map(({ key }) => key).filter((key) => !carried.has(key)) : [];
	if (!ability || !kit?.ability) return { update: null, missing };
	const update = {};
	const { grants = {}, ...rest } = kit.ability;
	for (const [key, value] of Object.entries(grants)) {
		if (!ability.system.grants?.[key]) update[`system.grants.${key}`] = value;
	}
	for (const [key, value] of Object.entries(rest)) {
		if (!ability.system[key]) update[`system.${key}`] = value;
	}
	return { update: Object.keys(update).length ? { _id: ability.id, ...update } : null, missing };
}
