import { lapsedUpdates } from "../rules/stances.js";
import { causedBy } from "./ledger.js";

/**
 * End the stances that last until their Knight's next turn, as that turn
 * starts, the fight ends, they go down or they rest: a stance held only for the
 * fight's turns has nothing to hold out against after. Kept apart from
 * stances.js, whose imports reach Recovery, so Recovery can import it without
 * a loop.
 * @param {Actor|null|undefined} actor
 * @returns {Promise<void>}
 */
export async function lapseStances(actor) {
	const updates = lapsedUpdates(actor?.items?.contents);
	if (updates.length) await actor.updateEmbeddedDocuments("Item", updates, causedBy("ability"));
}
