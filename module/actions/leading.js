/**
 * Leading from the front (Warfare, p11): someone in a Warband may add their own
 * Attack dice to its roll, and then takes whatever Damage it takes until their
 * next turn.
 */

import { downBy } from "../rules/virtues.js";
import { updateActors } from "./actor-updates.js";
import { worldKnights } from "./knights.js";

/**
 * Who might lead a Warband from the front: whoever leads it now, the
 * individuals whose Tokens are selected, this user's character, and the
 * Knights this user can see. The Slain and the dying lead nobody (p8), and
 * one individual leads one Warband (p11).
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
		if (!actor?.system?.virtues || actor.uuid === warband.uuid || actor.system.scale === "warband" || downBy(actor.system) || seen.has(actor.uuid)) return false;
		if (leadsAnother(actor, warband)) return false;
		seen.add(actor.uuid);
		return true;
	});
}

/**
 * Every Warband somebody leads from the front that passes a test. Unlinked
 * Tokens keep their own copy of a Warband, so the Combats' actors and the
 * viewed Scene's are looked at too, each copy once.
 * @param {(leader: string, warband: Actor) => boolean} test
 * @param {Combat[]} [also] Combats to look in besides the world's, such as one just deleted.
 * @returns {Actor[]}
 */
function ledWarbands(test, also = []) {
	const combats = new Set([...(game.combats ?? []), ...also]);
	const actors = [
		...(game.actors ?? []),
		...[...combats].flatMap((combat) => [...combat.combatants].map((combatant) => combatant.actor)),
		...(globalThis.canvas?.scene?.tokens ?? []).map((token) => token.actor)
	];
	const led = new Map();
	for (const actor of actors) {
		// Only an NPC has a leader to name.
		if (actor?.system?.leader && test(actor.system.leader, actor)) led.set(actor.uuid, actor);
	}
	return [...led.values()];
}

/**
 * Whether somebody already leads a Warband other than this one.
 * @param {Actor} actor
 * @param {Actor} warband
 * @returns {boolean}
 */
function leadsAnother(actor, warband) {
	const same = new Set([warband.uuid, warband.isToken ? warband.token?.baseActor?.uuid : null].filter(Boolean));
	return ledWarbands((leader, other) => other.system.scale === "warband" && leader === actor.uuid && !same.has(other.uuid)
		&& !(other.isToken && same.has(other.token?.baseActor?.uuid))).length > 0;
}

/**
 * Let go of the leaders of some Warbands.
 * @param {Actor[]} warbands
 * @returns {Promise<unknown>}
 */
const release = (warbands) => updateActors(warbands.map((warband) => [warband, { "system.leader": "" }]));

/**
 * Let go of every Warband somebody leads from the front, as they go down for
 * good: the Slain and the dying lead nobody (p8), and their next turn, which
 * would let go of them, may never come once they're passed over as defeated.
 * @param {Actor} leader
 * @returns {Promise<unknown>}
 */
export function letGoOf(leader) {
	return release(ledWarbands((led, warband) => led === leader.uuid && warband.isOwner));
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
	if (leader) await release(ledWarbands((led) => led === leader.uuid));
}

/**
 * Everybody fighting in some Combats. An unlinked Token's Warband fights for
 * the world's one too.
 * @param {Combat[]} combats
 * @returns {Set<string>} Their actors' uuids.
 */
const fightersIn = (combats) => new Set(combats.flatMap((combat) => [...combat.combatants])
	.flatMap(({ actor }) => [actor?.uuid, actor?.isToken ? actor.token?.baseActor?.uuid : null]).filter(Boolean));

/**
 * The fight is over, so nobody in it leads a Warband from the front any longer,
 * even a leader whose next turn never came. A fight on another Scene keeps its
 * own leaders, and a Warband still fighting there keeps its leader whoever
 * fought here. The active GM makes the change.
 * @param {Combat} combat
 */
async function onCombatEnd(combat) {
	if (!game.users.activeGM?.isSelf) return;
	const fought = fightersIn([combat]);
	const fighting = fightersIn([...(game.combats ?? [])].filter((other) => other.id !== combat.id));
	await release(ledWarbands((leader, warband) => (fought.has(leader) || fought.has(warband.uuid)) && !fighting.has(warband.uuid), [combat]));
}

/** Called during init. */
export function registerLeadingHooks() {
	Hooks.on("combatTurnChange", onTurnChange);
	Hooks.on("deleteCombat", onCombatEnd);
}
