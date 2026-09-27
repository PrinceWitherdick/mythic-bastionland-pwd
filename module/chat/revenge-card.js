/**
 * A Humiliation's revenge card (p9). The whole table sees the foe brought
 * down, but only the Knight's player and the Referee can settle the Scar.
 */
import { takeRevenge } from "../actions/scars.js";
import { registerCardButtons } from "./cards.js";

/** Called during init. */
export function registerRevengeCards() {
	registerCardButtons({
		selector: "[data-revenge-scar]",
		handler: async (button) => takeRevenge(await fromUuid(button.dataset.revengeScar))
	});
}
