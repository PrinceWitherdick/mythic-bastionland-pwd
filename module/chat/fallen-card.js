/**
 * The ways on from a fallen Knight's card (p8). The card is public, since the
 * whole table sees a Knight fall, but only that Knight's player and the Referee
 * can act on it. One way is taken, once: its buttons are one choice, gone for
 * everybody once a way on has worked.
 */
import { carryOnFrom } from "../actions/fallen.js";
import { registerNpcKnightQueries } from "../actions/npc-knights.js";
import { FALLEN_PATHS } from "../rules/fallen.js";
import { registerCardButtons } from "./cards.js";

/**
 * Whether a user may take a way on from the card: the fallen Knight's player.
 * The Referee always may.
 * @param {ChatMessage} _message
 * @param {User} user
 * @param {HTMLElement|null} button
 * @returns {boolean}
 */
export function mayCarryOn(_message, user, button) {
	const knight = fromUuidSync(button?.dataset?.fallenKnight ?? "");
	return Boolean(knight?.testUserPermission?.(user, "OWNER"));
}

/**
 * Take the way on a button names.
 * @param {HTMLElement} button
 * @returns {Promise<boolean>} Whether it worked, and so is spent.
 */
export async function pressFallenPath(button) {
	const path = button.dataset.fallenPath;
	if (!FALLEN_PATHS.includes(path)) return false;
	const knight = await fromUuid(button.dataset.fallenKnight);
	return Boolean(knight && (await carryOnFrom(path, knight)));
}

/** Called during init. */
export function registerFallenCards() {
	// A player taking up their NPC Knight asks the Referee to make them one of the Company.
	registerNpcKnightQueries();
	registerCardButtons({
		selector: "[data-fallen-path]",
		// A second new Knight, or a Squire taken up besides a follower, would replace one Knight twice.
		once: true,
		oneChoice: true,
		mayPress: mayCarryOn,
		handler: pressFallenPath
	});
}
