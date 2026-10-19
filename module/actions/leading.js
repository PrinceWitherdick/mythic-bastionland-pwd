/**
 * Leading from the front (Warfare, p11): someone in a Warband may add their own
 * Attack dice to its roll, and then takes whatever Damage it takes until their
 * next turn.
 */

import { updateActors } from "./actor-updates.js";
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
 * Let go of the leaders of a fight's Warbands. Unlinked Tokens keep their own
 * copy of the Warband, so the combat's actors are looked at too.
 * @param {Combat} combat
 * @param {(leader: string, warband: Actor) => boolean} letGo Whether a Warband led by this uuid is let go.
 * @returns {Promise<unknown>}
 */
function clearLeaders(combat, letGo) {
	const led = new Map();
	for (const actor of [...game.actors, ...combat.combatants.map((combatant) => combatant.actor)]) {
		if (actor?.type === "npc" && actor.system.leader && letGo(actor.system.leader, actor)) led.set(actor.uuid, actor);
	}
	return updateActors([...led.values()].map((warband) => [warband, { "system.leader": "" }]));
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
	if (leader) await clearLeaders(combat, (led) => led === leader.uuid);
}

/**
 * The fight is over, so nobody in it leads a Warband from the front any longer,
 * even a leader whose next turn never came. A fight on another Scene keeps its
 * own leaders. The active GM makes the change.
 * @param {Combat} combat
 */
async function onCombatEnd(combat) {
	if (!game.users.activeGM?.isSelf) return;
	// An unlinked Token's Warband fights for the world's one too.
	const fought = new Set(combat.combatants.flatMap(({ actor }) => [actor?.uuid, actor?.isToken ? actor.token?.baseActor?.uuid : null]).filter(Boolean));
	await clearLeaders(combat, (leader, warband) => fought.has(leader) || fought.has(warband.uuid));
}

/** Called during init. */
export function registerLeadingHooks() {
	Hooks.on("combatTurnChange", onTurnChange);
	Hooks.on("deleteCombat", onCombatEnd);
}
