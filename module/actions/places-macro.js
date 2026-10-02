import { hotbarMacro } from "./hotbar-macro.js";
import { isSolo } from "./solo.js";
import { macroIconPath } from "../rules/macro-icons.js";

/**
 * A Places macro on each player's hotbar, opening the Company's record of the
 * hexes it has been to. A GM has the Places page of their Toolkit instead, so
 * only a GM playing alone, who is the Company too, gets a slot for it.
 */

/** The world setup step that gives a world the macro. */
export const PLACES_MACRO_STEP = "placesMacro";

const { seed: seedPlacesMacro, ensure: ensurePlacesHotbar } = hotbarMacro({
	macroFlag: "placesMacro",
	hotbarFlag: "placesHotbar",
	nameKey: "travels.macro.name",
	img: macroIconPath("places"),
	command: "game.system.api.openPlaces();",
	ownership: () => ({ default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }),
	everyone: true,
	forGM: () => isSolo()
});

export { seedPlacesMacro, ensurePlacesHotbar };
