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
	// A melee blow at somebody known to lie: +d10, through their Armour.
	28: { ability: { bonusDie: "d10", grants: { ignoresArmour: true }, needs: "melee", situational: true } },
	// A vow before a fight with a prize: a die on every melee Attack until it's over.
	32: { ability: { lastingDie: "d6", needs: "melee" } },
	// Having just brought a foe down, the next melee blow bursts as a Blast.
	34: { ability: { grants: { blast: true }, needs: "melee", situational: true } },
	// In a big enough melee, every Gambit counts as Strong: ticked once each side of their Combat has three.
	38: { ability: { grants: { strongGambits: true }, situational: true, crowd: 3 } },
	// After a Gambit spent on Moving, Armour 4 until their next turn, not on top of their own.
	40: { ability: { armourFloor: 4, lapses: "turn", onMove: true } },
	// An arrow steeped in somebody's blood: +d12 against them.
	50: { ability: { bonusDie: "d12", needs: "ranged", situational: true } },
	// A melee blow made standing still: +d10 past Armour and every immunity, at a cost if the foe stays up.
	54: { ability: { bonusDie: "d10", grants: { ignoresArmour: true, ignoresImmunity: true, backlash: true }, needs: "still", situational: true } },
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
	// A horn that doubles the VIG everyone loses to Damage for the rest of the battle.
	72: { ability: { wildHorn: true } },
	// +d8 in melee at a wounded foe, and the allies' SPI back if it brings them down.
	74: { ability: { bonusDie: "d8", grants: { rally: true }, needs: "melee", situational: true } },
	// Dug in at the start of their turn: the shield's Armour doubled, and +d6 striking with it.
	78: { ability: { bonusDie: "d6", needs: "shield", doublesShield: true, lapses: "turn" } },
	// In deep water: a point of Armour, and +d6 to every Attack.
	82: { ability: { bonusDie: "d6", armourBonus: 1 } },
	// A sworn quest: +d12 at whoever stands in its way, and no GD back until it's done.
	94: { ability: { bonusDie: "d12", situational: true, oath: true } },
	// Each Wound a melee weapon deals adds a d8 to it for the rest of the fight.
	98: { ability: { lastingDie: "d8", needs: "melee", tempers: true } },
	// A rune etched at sunset for a number.
	100: { ability: { sigil: true } },
	// A shockwave on landing from a fall, which spends a use of the Ability, should it be given a limit.
	106: { ability: { weapon: "shockwave" }, weapons: [{ key: "shockwave", system: { damage: "d8", blast: true, noHand: true } }] },
	// A burst of light that burns whatever dwells in darkness nearby, as often as the Ability allows.
	112: { ability: { weapon: "radiance" }, weapons: [{ key: "radiance", system: { damage: "d12", blast: true, noHand: true, equipped: false } }] },
	// Two more things a Strong Gambit with a blade may do.
	114: { ability: { severs: true } },
	// A Wound or Scar taken is given back to whoever dealt it.
	116: { ability: { mirror: true } },
	// A coin flipped for a life.
	120: { ability: { coinFlip: true } },
	// Branches taken up as javelins or greatspears.
	152: {
		weapons: [
			{ key: "branchJavelin", system: { damage: "d6", hefty: true, wooden: true, equipped: false } },
			{ key: "branchSpear", system: { damage: "d10", long: true, wooden: true, equipped: false } }
		]
	},
	// A bite whose Wound does one of three things, picked before it: VIG taken back, sleep, or a memory shown.
	166: { ability: { grants: { drain: true, sleep: true, memory: true } }, weapons: [{ key: "bite", system: { damage: "d6", noHand: true } }] }
});

/** The pages given kits after ABILITY_KITS_STEP first ran, which a later step catches existing Knights up on. */
export const BOOK_EFFECT_PAGES = Object.freeze([28, 32, 34, 38, 40, 50, 54, 72, 74, 78, 82, 94, 98, 112, 114, 116, 152]);

/**
 * The pages whose kits were given more since BOOK_EFFECT_PAGES: an Ability
 * that counts the sides (p38), tempers its weapon (p98), or is spent by the
 * weapon it gives (p106, p112).
 */
export const LINKED_KIT_PAGES = Object.freeze([38, 98, 106, 112]);

/**
 * The Ability fields LINKED_KIT_PAGES were given: the only ones their step fills,
 * so a setting the Referee cleared on an older kit isn't put back. Their weapons
 * were given by earlier steps, so one the Referee deleted isn't made again.
 */
export const LINKED_KIT_FIELDS = Object.freeze(["tempers", "crowd", "weapon"]);

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
 * @param {object} [options]
 * @param {readonly string[]|null} [options.fields] Fill only these Ability fields (grants by their own key).
 * @param {boolean} [options.weapons=true] Whether the kit's weapons not carried are wanted at all.
 * @returns {{update: object|null, missing: string[]}} An item update for the Ability, and the kit weapons not carried.
 */
export function kitCatchUp(items, kit, abilityName, systemId, { fields = null, weapons = true } = {}) {
	const ability = items.find((item) => item.type === "ability" && item.name === abilityName);
	const carried = new Set(items.map((item) => item.flags?.[systemId]?.[KIT_FLAG]).filter(Boolean));
	const missing = ability && weapons ? (kit?.weapons ?? []).map(({ key }) => key).filter((key) => !carried.has(key)) : [];
	if (!ability || !kit?.ability) return { update: null, missing };
	const update = {};
	const wanted = (key) => !fields || fields.includes(key);
	const { grants = {}, ...rest } = kit.ability;
	for (const [key, value] of Object.entries(grants)) {
		if (wanted(key) && !ability.system.grants?.[key]) update[`system.grants.${key}`] = value;
	}
	for (const [key, value] of Object.entries(rest)) {
		if (wanted(key) && !ability.system[key]) update[`system.${key}`] = value;
	}
	return { update: Object.keys(update).length ? { _id: ability.id, ...update } : null, missing };
}
