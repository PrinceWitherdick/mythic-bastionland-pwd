import { t } from "../chat/cards.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * The system's own macros, made in code rather than kept in the macros
 * compendium, since each one's whole script is a single call.
 *
 * A world is given each macro once, as a world setup step, and each user has
 * it placed on their hotbar once: a user who deletes the macro or moves it off
 * the bar keeps it that way.
 */

/** Slots on the first hotbar page, the one on screen until the user pages away. */
const FIRST_PAGE_SLOTS = 10;

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

/**
 * Declare one of the system's macros.
 * @param {object} options
 * @param {string} options.macroFlag Marks the macro, so a rename doesn't lose it.
 * @param {string} options.hotbarFlag User flag set once this user has been given a slot for it.
 * @param {string} options.nameKey Localisation key for the macro's name.
 * @param {string} options.img
 * @param {string} options.command
 * @param {() => object} [options.ownership] Who may run it, read when the macro is made rather
 *   than when this module loads, since Foundry's CONST isn't there that early.
 * @param {boolean} [options.everyone] Whether players get a hotbar slot for it too.
 * @returns {{seed: () => Promise<void>, ensure: () => Promise<void>}}
 */
export function hotbarMacro({ macroFlag, hotbarFlag, nameKey, img, command, ownership = null, everyone = false }) {
	/** @returns {Macro|undefined} The world's copy of this macro. */
	const find = () => game.macros.find((macro) => macro.getFlag(SYSTEM_ID, macroFlag));

	/** A world setup step: give the world the macro. */
	const seed = async () => {
		if (find()) return;
		await CONFIG.Macro.documentClass.create({
			name: t(nameKey),
			type: "script",
			img,
			command,
			...(ownership ? { ownership: ownership() } : {}),
			flags: { [SYSTEM_ID]: { [macroFlag]: true } }
		});
	};

	/**
	 * Keep the world's copy of the macro's script current, and give this user a
	 * hotbar slot for it. Run after world setup, so the active GM's slot comes
	 * the load the macro is made; anyone else gets theirs on a later load.
	 */
	const ensure = async () => {
		if (!everyone && !game.user.isGM) return;

		const macro = find();
		// Only a GM may rewrite the world's macro.
		if (game.user.isGM && macro && macro.command !== command) await macro.update({ command });
		// A macro the user can't run is no use on their bar.
		if (!(everyone ? macro?.canExecute : macro) || game.user.getFlag(SYSTEM_ID, hotbarFlag)) return;

		const slot = emptySlot(game.user.hotbar, macro.id);
		if (slot) await game.user.assignHotbarMacro(macro, slot);
		// Set even when the first page is full, so it never turns up later in a slot the user cleared for something else.
		await game.user.setFlag(SYSTEM_ID, hotbarFlag, true);
	};

	return { seed, ensure };
}
