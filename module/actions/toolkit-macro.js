import { hotbarMacro } from "./hotbar-macro.js";

/**
 * A GM Toolkit macro on each GM's hotbar, opening the toolkit as C does for a
 * GM who has it as their character. Only GMs may open it, so players are
 * given neither the macro nor a slot for it.
 */

/** The world setup step that gives a world the macro. */
export const TOOLKIT_MACRO_STEP = "gmToolkitMacro";

const { seed: seedToolkitMacro, ensure: ensureToolkitHotbar } = hotbarMacro({
	macroFlag: "gmToolkitMacro",
	hotbarFlag: "gmToolkitHotbar",
	nameKey: "gmToolkit.name",
	img: "systems/mythic-bastionland-pwd/assets/icons/gm-toolkit.svg",
	command: "game.system.api.openGmToolkit();"
});

export { seedToolkitMacro, ensureToolkitHotbar };
