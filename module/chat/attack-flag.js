import { attackersOf } from "../rules/attack.js";
import { SYSTEM_ID } from "../system-id.js";

/*
 * Where an Attack card keeps its state. Kept apart from attack-card.js so the
 * modules that card imports, such as the duel's, can read a card too.
 */

/** The flag an Attack card's state is kept under. */
export const ATTACK_FLAG = "attack";

/**
 * @param {ChatMessage|undefined} message
 * @returns {import("../rules/attack.js").AttackState|null} The Attack the card holds, if it's an Attack card.
 */
export const attackOf = (message) => message?.flags?.[SYSTEM_ID]?.[ATTACK_FLAG] ?? null;

/**
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {Actor} actor
 * @returns {boolean} Whether the Attack was aimed at this actor.
 */
export function targeted(attack, actor) {
	return (attack.targets ?? []).some(({ uuid }) => fromUuidSync(uuid)?.actor?.uuid === actor.uuid);
}

/**
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {User} [user] Whoever asks; this user when left out.
 * @returns {boolean} Whether they own one of those making the Attack, whose
 *   dice, pooled in a joint Attack, any of them may spend on Gambits (p8).
 */
export function ownsAnAttacker(attack, user = game.user) {
	return attackersOf(attack).some((uuid) => fromUuidSync(uuid)?.testUserPermission?.(user, "OWNER"));
}
