import { hotbarMacro } from "./hotbar-macro.js";
import { macroIconPath } from "../rules/macro-icons.js";
import { t } from "../chat/cards.js";
import { SYSTEM_ID } from "../system-id.js";
import { OLD_TOOLKIT_NAME, theGmToolkit } from "./gm-toolkit.js";

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

/** The world setup step that renames a toolkit and macro made before the toolkit took the book's word, Referee. */
export const REFEREE_NAME_STEP = "refereeToolkitName";

/**
 * Give the toolkit and its macro the new name where they still carry the old
 * one the system gave them; a name the GM chose is kept.
 * @returns {Promise<void>}
 */
export async function renameOldToolkit() {
	const name = t("gmToolkit.name");
	const macro = game.macros?.find((one) => one.getFlag(SYSTEM_ID, "gmToolkitMacro"));
	for (const doc of [theGmToolkit(), macro]) if (doc?.name === OLD_TOOLKIT_NAME) await doc.update({ name });
}
