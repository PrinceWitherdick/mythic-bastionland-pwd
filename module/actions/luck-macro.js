import { hotbarMacro } from "./hotbar-macro.js";

/**
 * A Luck Roll macro on everyone's hotbar: a d6 where a high roll favours the
 * players and a low one does not (Refereeing p16).
 *
 * The whole table has it, not just the GM, since a player often rolls the dice
 * the fiction points at. A player who loads before a GM has made the macro
 * gets their slot on a later load.
 */

/** The world setup step that gives a world the macro. */
export const LUCK_MACRO_STEP = "luckRollMacro";

const { seed: seedLuckMacro, ensure: ensureLuckHotbar } = hotbarMacro({
	macroFlag: "luckRollMacro",
	hotbarFlag: "luckRollHotbar",
	nameKey: "refereeRolls.tables.luck.name",
	img: "icons/magic/control/buff-luck-fortune-green.webp",
	command: "game.system.api.rollLuck();",
	ownership: () => ({ default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }),
	everyone: true
});

export { seedLuckMacro, ensureLuckHotbar };
