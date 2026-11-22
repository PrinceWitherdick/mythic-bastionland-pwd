/**
 * When a chat message was posted, by the server's clock. A message's own
 * timestamp is the posting computer's clock, which may run apart from the
 * server's; the growth log a Realm's expansions keep is the server's, so a
 * card asking which expansions came after it reads this instead.
 */
import { serverNow } from "../server-now.js";
import { SYSTEM_ID } from "../system-id.js";

/** The flag a message carries with the server's time it was posted at. */
export const POSTED_AT_FLAG = "postedAt";

/**
 * @param {ChatMessage|{flags?: object, timestamp?: number}|null|undefined} message
 * @returns {number|undefined} When it was posted, by the server's clock; by the poster's for a message
 *   posted before messages carried it.
 */
export function postedAt(message) {
	const at = message?.flags?.[SYSTEM_ID]?.[POSTED_AT_FLAG];
	return Number.isFinite(at) ? at : message?.timestamp;
}

/**
 * Stamp a message about to be made by this client with the server's time.
 * @param {ChatMessage} message
 */
export function stampPostedAt(message) {
	message.updateSource({ flags: { [SYSTEM_ID]: { [POSTED_AT_FLAG]: serverNow() } } });
}

/** Called during init. */
export function registerPostedAt() {
	Hooks.on("preCreateChatMessage", stampPostedAt);
}
