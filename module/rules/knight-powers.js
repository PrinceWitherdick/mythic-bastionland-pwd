/**
 * What six Knights' Abilities do once used, found by the powers ABILITY_KITS
 * gives them: allies rallied by a Mortal Wound (p42), a seal letting somebody
 * else perform a Feat (p70), a wall broken through (p84), foes who strike
 * elsewhere paying for it (p128), a day spent mending (p156), and a return
 * from death (p158). Pure, so it can be tested without Foundry.
 */
import { isWorn } from "./restock.js";

/** The Feats a seal lets somebody who isn't a Knight perform, once (p70). */
export const SEALED_FEATS = Object.freeze(["smite", "deny"]);

/**
 * The possession of somebody else's a seal is on, while it's worn or wielded.
 * @param {Iterable<{type: string, system?: {sealed?: boolean, equipped?: boolean, broken?: boolean}}>|null|undefined} items
 * @returns {object|null}
 */
export function sealedPossession(items) {
	for (const item of items ?? []) {
		if (item?.system?.sealed && isWorn(item.system)) return item;
	}
	return null;
}

/**
 * Whether somebody performs a Feat only by a seal, so performing it spends the seal.
 * @param {{feats?: Record<string, boolean>}} system Their system data.
 * @param {Iterable<object>} items Their items.
 * @param {string} key The Feat.
 * @returns {boolean}
 */
export const featBySeal = (system, items, key) => SEALED_FEATS.includes(key) && !system?.feats?.[key] && Boolean(sealedPossession(items));

/**
 * The possessions a seal can go on: a weapon, a shield or a piece of armour,
 * not already sealed (p70).
 * @param {Iterable<{id: string, type: string, name: string, system?: object}>} items
 * @returns {{id: string, name: string}[]}
 */
export const sealable = (items) => [...(items ?? [])]
	.filter((item) => ["weapon", "armour"].includes(item.type) && !item.system?.sealed && !item.system?.trample)
	.map(({ id, name }) => ({ id, name }));

/**
 * What a full day in a cocoon mends (p156): VIG back to its most, no Mortal
 * Wound or Wound left, and every affliction of the body gone, those that cost
 * VIG or deal Damage. The mind's are left, and so are Scars.
 * @param {{virtues: {vig: {max: number}}, afflictions?: {virtue: string, damage?: boolean}[]}} system
 * @returns {object} The Actor update.
 */
export function mendedUpdate(system) {
	const afflictions = system.afflictions ?? [];
	const kept = afflictions.filter((each) => each.virtue !== "vig" && !each.damage);
	return {
		"system.virtues.vig.value": system.virtues.vig.max,
		"system.mortalWound": false,
		"system.wounded": false,
		...(kept.length === afflictions.length ? {} : { "system.afflictions": kept })
	};
}

/**
 * The update bringing somebody back from death as they were left (p158):
 * no longer Slain, every score as it stands. An Ultimate fate their death wrote
 * goes with it; one somebody wrote by hand stays.
 * @param {{fate?: string}} system
 * @param {(fate: string) => boolean} deathWrote Whether a fate is one a death writes.
 * @returns {object}
 */
export function risenUpdate(system, deathWrote) {
	return { "system.slain": false, ...(system.fate && deathWrote(system.fate) ? { "system.fate": "" } : {}) };
}

/**
 * GD regained, no more than its most.
 * @param {{value: number, max: number}} guard
 * @param {number} amount
 * @returns {number}
 */
export const guardAfter = (guard, amount) => Math.min(guard.max, guard.value + Math.max(0, amount));

/**
 * Who stands with somebody in a fight, by their Tokens' disposition: everybody
 * else on their side, alive and with GD to regain. None outside a Combat, or
 * where their Token has no side.
 * @template {{actor?: {uuid: string, system?: object}|null, disposition?: number|null}} T
 * @param {T[]} combatants Each with their Token's disposition.
 * @param {string} uuid Whose allies.
 * @param {number|null|undefined} side Their Token's disposition.
 * @returns {object[]} The allies' actors, each once.
 */
export function alliesBeside(combatants, uuid, side) {
	if (side === null || side === undefined) return [];
	const allies = new Map();
	for (const { actor, disposition } of combatants) {
		if (!actor || actor.uuid === uuid || disposition !== side) continue;
		if (actor.system?.slain || actor.system?.destroyed || !actor.system?.guard) continue;
		allies.set(actor.uuid, actor);
	}
	return [...allies.values()];
}

/**
 * The Knights whose stance makes a foe pay for striking somebody else (p128):
 * in the attacker's Combat, on another side, not among the Attack's targets,
 * with that stance in effect.
 * @param {{actor?: {uuid: string, items?: Iterable<object>}|null, disposition?: number|null}[]} combatants
 * @param {{uuid: string, side: number|null|undefined}} attacker
 * @param {string[]} targets The actor uuids the Attack is at.
 * @returns {{actor: object, ability: object}[]}
 */
export function drawingFire(combatants, attacker, targets) {
	if (!targets.length) return [];
	const found = new Map();
	for (const { actor, disposition } of combatants) {
		if (!actor || actor.uuid === attacker.uuid || targets.includes(actor.uuid) || found.has(actor.uuid)) continue;
		if (attacker.side !== null && attacker.side !== undefined && disposition === attacker.side) continue;
		const ability = [...(actor.items ?? [])].find((item) => item.type === "ability" && item.system?.drawsFire && item.system.inEffect);
		if (ability) found.set(actor.uuid, { actor, ability });
	}
	return [...found.values()];
}
