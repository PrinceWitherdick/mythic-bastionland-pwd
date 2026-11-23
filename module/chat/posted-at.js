/**
 * When a chat message was posted: the time of day, set by the server's clock
 * where it could be learnt. A message's own timestamp is the posting
 * computer's clock, which may run apart from the others'; the growth log a
 * Realm's expansions keep is stamped the same way as this, so a card asking
 * which expansions came after it reads this instead.
 */
import { wallNow } from "../server-now.js";
import { SYSTEM_ID } from "../system-id.js";

/** The flag a message carries with the time of day it was posted at. */
export const POSTED_AT_FLAG = "postedAt";

/**
 * @param {ChatMessage|{flags?: object, timestamp?: number}|null|undefined} message
 * @returns {number|undefined} When it was posted, or nothing for a message posted before messages
 *   carried it. Those came before any Realm's map could grow, as both came in 1.0.2, so every expansion
 *   logged is after them; their own timestamp, a time of day, can't be set against expansions 1.0.2
 *   stamped with the server's uptime.
 */
export function postedAt(message) {
	const at = message?.flags?.[SYSTEM_ID]?.[POSTED_AT_FLAG];
	return Number.isFinite(at) ? at : undefined;
}

/**
 * Stamp a message about to be made by this client with the time of day. A
 * hook can't wait, so one made before the server's clock is learnt, as the
 * world loads, is by this computer's own. One made again with the stamp it
 * had, as Undo brings back a card, keeps it, so its hexes still move with
 * every expansion since it was first posted.
 * @param {ChatMessage} message
 */
export function stampPostedAt(message) {
	if (postedAt(message) !== undefined) return;
	message.updateSource({ flags: { [SYSTEM_ID]: { [POSTED_AT_FLAG]: wallNow() } } });
}

/** Called during init. */
export function registerPostedAt() {
	Hooks.on("preCreateChatMessage", stampPostedAt);
}
