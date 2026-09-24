import { hotbarMacro } from "./hotbar-macro.js";
import { macroIconPath } from "../rules/macro-icons.js";

/**
 * A GM Toolkit macro on each GM's hotbar, opening the toolkit as C does for a
 * GM who has it as their character. Only GMs may open it, so players are
 * given neither the macro nor a slot for it. It wears the toolkit's own mark
 * on the tile every macro on the bar wears, rather than the disc the toolkit
 * keeps as its portrait.
 */

/** The world setup step that gives a world the macro. */
export const TOOLKIT_MACRO_STEP = "gmToolkitMacro";

const { seed: seedToolkitMacro, ensure: ensureToolkitHotbar } = hotbarMacro({
	macroFlag: "gmToolkitMacro",
	hotbarFlag: "gmToolkitHotbar",
	nameKey: "gmToolkit.name",
	img: macroIconPath("gm-toolkit"),
	command: "game.system.api.openGmToolkit();"
});

export { seedToolkitMacro, ensureToolkitHotbar };
