import { hotbarMacro } from "./hotbar-macro.js";
import { macroIconPath } from "../rules/macro-icons.js";

/**
 * An End the Session macro on each GM's hotbar, opening the window that walks
 * the book's end-of-session procedure (Refereeing p16), the way Stonetop's
 * End of Session macro stands on the bar. It's the Referee's alone, so players
 * are given neither the macro nor a slot for it.
 */

/** The world setup step that gives a world the macro. */
export const SESSION_MACRO_STEP = "endSessionMacro";

const { seed: seedSessionMacro, ensure: ensureSessionHotbar } = hotbarMacro({
	macroFlag: "endSessionMacro",
	hotbarFlag: "endSessionHotbar",
	nameKey: "sessionEnd.open",
	img: macroIconPath("end-session"),
	command: "game.system.api.openSessionEnd();"
});

export { seedSessionMacro, ensureSessionHotbar };
