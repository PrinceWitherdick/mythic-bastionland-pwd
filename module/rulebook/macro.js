import { hotbarMacro } from "../actions/hotbar-macro.js";

/**
 * A Rulebook macro on each GM's hotbar, doing what the hotkey does. Only GMs
 * are given it, and each gets their slot once.
 */

/** The world setup step that gives a world the macro. */
export const RULEBOOK_MACRO_STEP = "rulebookMacro";

const { seed: seedRulebookMacro, ensure: ensureRulebookHotbar } = hotbarMacro({
	macroFlag: "rulebookMacro",
	hotbarFlag: "rulebookHotbar",
	nameKey: "rulebook.open",
	img: "icons/sundries/books/book-embossed-bound-brown.webp",
	command: "game.system.api.toggleRulebook();"
});

export { seedRulebookMacro, ensureRulebookHotbar };
