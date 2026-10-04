/**
 * Leading from the front (Warfare, p11): someone in a Warband may add their own
 * Attack dice to its roll, and then takes whatever Damage it takes until their
 * next turn.
 */

import { worldKnights } from "./knights.js";

/**
 * Who might lead a Warband from the front: whoever leads it now, the
 * individuals whose Tokens are selected, this user's character, and the
 * Knights this user can see.
 * @param {Actor} warband
 * @returns {Actor[]}
 */
export function leaderCandidates(warband) {
	const current = warband.system.leader ? fromUuidSync(warband.system.leader) : null;
	const actors = [
		current,
		...(canvas?.tokens?.controlled ?? []).map((token) => token.actor),
		game.user.character,
		...worldKnights((actor) => actor.testUserPermission(game.user, "OBSERVER"))
	];
	const seen = new Set();
	return actors.filter((actor) => {
		if (!actor?.system?.virtues || actor.uuid === warband.uuid || actor.system.scale === "warband" || seen.has(actor.uuid)) return false;
		seen.add(actor.uuid);
		return true;
	});
}

/**
 * The leader's next turn has started, so they no longer share the Damage of
 * any Warband they led. The active GM makes the change.
 * @param {Combat} combat
 * @param {object} _prior
 * @param {{combatantId?: string}} current
 */
async function onTurnChange(combat, _prior, current) {
	if (!game.users.activeGM?.isSelf) return;
	const leader = combat.combatants.get(current?.combatantId)?.actor;
	if (!leader) return;

	// Unlinked Tokens keep their own copy of the Warband, so look at the combat's actors too.
	const led = new Map();
	for (const actor of [...game.actors, ...combat.combatants.map((combatant) => combatant.actor)]) {
		if (actor?.type === "npc" && actor.system.leader === leader.uuid) led.set(actor.uuid, actor);
	}
	await Promise.all([...led.values()].map((warband) => warband.update({ "system.leader": "" })));
}

/** Called during init. */
export function registerLeadingHooks() {
	Hooks.on("combatTurnChange", onTurnChange);
}
