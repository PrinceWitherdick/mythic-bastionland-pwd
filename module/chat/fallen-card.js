/**
 * The ways on from a fallen Knight's card (p8). The card is public, since the
 * whole table sees a Knight fall, but only that Knight's player and the Referee
 * can act on it.
 */
import { carryOnFrom } from "../actions/fallen.js";
import { registerNpcKnightQueries } from "../actions/npc-knights.js";
import { FALLEN_PATHS } from "../rules/fallen.js";
import { registerCardButtons } from "./cards.js";

/** Called during init. */
export function registerFallenCards() {
	// A player taking up their NPC Knight asks the Referee to make them one of the Company.
	registerNpcKnightQueries();
	registerCardButtons({
		selector: "[data-fallen-path]",
		handler: async (button) => {
			const path = button.dataset.fallenPath;
			if (!FALLEN_PATHS.includes(path)) return;
			const knight = await fromUuid(button.dataset.fallenKnight);
			if (knight) await carryOnFrom(path, knight);
		}
	});
}
