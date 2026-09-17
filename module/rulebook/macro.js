import { t } from "../chat/cards.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * A Rulebook macro on each GM's hotbar, doing what the hotkey does.
 *
 * Made in code rather than kept in the macros compendium, since its whole
 * script is one call. The world is given it once, as a world setup step, and
 * each GM has it placed on their hotbar once: a GM who deletes the macro or
 * moves it off the bar keeps it that way.
 */

/** The world setup step that gives a world the macro. */
export const RULEBOOK_MACRO_STEP = "rulebookMacro";

/** User flag set once this GM has been given a hotbar slot for it. */
const HOTBAR_FLAG = "rulebookHotbar";

/** Marks the macro, so a rename doesn't lose it. */
const MACRO_FLAG = "rulebookMacro";

const MACRO_COMMAND = "game.system.api.toggleRulebook();";
const MACRO_IMG = "icons/sundries/books/book-embossed-bound-brown.webp";

/** Slots on the first hotbar page, the one on screen until the GM pages away. */
const FIRST_PAGE_SLOTS = 10;

/** @returns {Macro|undefined} The world's Rulebook macro. */
function rulebookMacro() {
	return game.macros.find((macro) => macro.getFlag(SYSTEM_ID, MACRO_FLAG));
}

/** A world setup step: give the world its Rulebook macro. */
export async function seedRulebookMacro() {
	if (rulebookMacro()) return;
	await CONFIG.Macro.documentClass.create({
		name: t("rulebook.open"),
		type: "script",
		img: MACRO_IMG,
		command: MACRO_COMMAND,
		flags: { [SYSTEM_ID]: { [MACRO_FLAG]: true } }
	});
}

/**
 * Keep the world's Rulebook macro's script current, and give this GM a hotbar
 * slot for it. Run after world setup, so the active GM's slot comes the load
 * the macro is made; another GM gets theirs on a later load.
 */
export async function ensureRulebookHotbar() {
	if (!game.user.isGM) return;

	const macro = rulebookMacro();
	if (macro && macro.command !== MACRO_COMMAND) await macro.update({ command: MACRO_COMMAND });
	if (!macro || game.user.getFlag(SYSTEM_ID, HOTBAR_FLAG)) return;

	const slot = emptySlot(game.user.hotbar, macro.id);
	if (slot) await game.user.assignHotbarMacro(macro, slot);
	// Set even when the first page is full, so it never turns up later in a slot the GM cleared for something else.
	await game.user.setFlag(SYSTEM_ID, HOTBAR_FLAG, true);
}

/**
 * @param {Record<number, string>} hotbar Macro ids by slot.
 * @param {string} macroId
 * @returns {number|null} The first empty slot on the first page, or null when
 *   it's full or the macro is already on the hotbar somewhere.
 */
export function emptySlot(hotbar, macroId) {
	if (Object.values(hotbar ?? {}).includes(macroId)) return null;
	for (let slot = 1; slot <= FIRST_PAGE_SLOTS; slot++) {
		if (!hotbar?.[slot]) return slot;
	}
	return null;
}
