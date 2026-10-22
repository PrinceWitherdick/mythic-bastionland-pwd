// In a fight the players' side goes first, talking over its plan and acting
// in whichever order suits it (p8). Nobody rolls for it: a player's character
// comes into the Combat ahead of everybody else, and the tracker's own order
// among them is only where they start from. Whoever was caught unready still
// makes the Surprise Save (surprise.js), which passes over their first turn.

import { sidesWithCompany } from "./knights.js";

/** Where the players' side stands in the turn order. */
export const PLAYERS_FIRST = 2;

/** Where everybody else stands: after the players. */
export const OTHERS_AFTER = 1;

/**
 * Where a character comes into the turn order. In solo play the Referee plays
 * the Company too, so a Knight riding with it is on the players' side.
 * @param {Actor|null|undefined} actor
 * @returns {number}
 */
export function sideInitiative(actor) {
	return sidesWithCompany(actor) ? PLAYERS_FIRST : OTHERS_AFTER;
}

/**
 * Put a Combatant in its side's place as it joins, so nobody is asked to roll.
 * An initiative already given, by hand or carried over, is left alone.
 * @param {Combatant} combatant
 * @param {object} data The creation data.
 */
export function placeJoiningCombatant(combatant, data) {
	if (Number.isFinite(data?.initiative)) return;
	combatant.updateSource({ initiative: sideInitiative(combatant.actor) });
}

/**
 * Called during init. A Combatant takes its side's place as it joins, and
 * "Roll Initiative" in the tracker, for one or for all, gives the same place
 * rather than rolling a die for it.
 */
export function registerTurnOrder() {
	const BaseCombatant = CONFIG.Combatant.documentClass;
	CONFIG.Combatant.documentClass = class BastionlandCombatant extends BaseCombatant {
		/** @override */
		async _preCreate(data, options, user) {
			const allowed = await super._preCreate(data, options, user);
			if (allowed !== false) placeJoiningCombatant(this, data);
			return allowed;
		}
	};
	const BaseCombat = CONFIG.Combat.documentClass;
	CONFIG.Combat.documentClass = class BastionlandCombat extends BaseCombat {
		/**
		 * Set each Combatant's place, with no dice to roll and no card to post for them.
		 * @override
		 */
		async rollInitiative(ids, { updateTurn = true } = {}) {
			const updates = (typeof ids === "string" ? [ids] : ids)
				.map((id) => this.combatants.get(id))
				.filter((combatant) => combatant?.isOwner)
				.map((combatant) => ({ _id: combatant.id, initiative: sideInitiative(combatant.actor) }));
			if (!updates.length) return this;
			await this.updateEmbeddedDocuments("Combatant", updates, updateTurn ? { turnEvents: false } : { turnEvents: false, combatTurn: this.turn });
			return this;
		}
	};
}
