import { SYSTEM_ID } from "../system-id.js";
import { IMPORT_MACRO_ID } from "../book-art/macro.js";
import { IMPORT_SLOT, SESSION_SLOT, endHotbar, orderHotbar } from "./hotbar-macro.js";

/**
 * The system's macros lead each user's hotbar: a GM's opens with the GM
 * Toolkit and ends with Import PDF and End the Session, in the slots Foundry
 * labels 9 and 0; a player's opens with the Luck Roll, then their Places and the Timeline.
 */

/** The macros' flags, in the order they take the first slots. */
export const GM_HOTBAR_ORDER = Object.freeze(["gmToolkitMacro", "rulebookMacro", "newSiteMacro", "luckRollMacro"]);
export const PLAYER_HOTBAR_ORDER = Object.freeze(["luckRollMacro", "placesMacro", "timelineMacro"]);

/** User flag set once this user's hotbar has been put in that order. */
export const HOTBAR_ORDER_FLAG = "hotbarOrder";

/**
 * User flag set once a GM's Import PDF and End the Session have been put in
 * the first page's last two slots, and the rest of that page slid left.
 */
export const HOTBAR_ENDS_FLAG = "hotbarEnds";

/** @returns {Macro|undefined} The world's macro carrying this flag. */
const macroOf = (flag) => game.macros.find((macro) => macro.getFlag(SYSTEM_ID, flag));

/** @returns {Record<number, string|undefined>} A GM's macros for the first page's last slots, by slot. */
const gmEnds = () => ({ [IMPORT_SLOT]: game.macros.get(IMPORT_MACRO_ID)?.id, [SESSION_SLOT]: macroOf("endSessionMacro")?.id });

/** Replace this user's hotbar whole, as assignHotbarMacro does, so emptied slots are removed rather than merged back. */
async function setHotbar(hotbar) {
	if (foundry.utils.objectsEqual(hotbar, game.user.hotbar ?? {})) return;
	await game.user.update({ hotbar }, { diff: false, recursive: false, noHook: true });
}

/**
 * Put the system's macros first on this user's hotbar, once, so a user who
 * rearranges it afterwards keeps it their way. Run after every macro has its
 * slot. A user who loads before any GM has made the macros is ordered on a
 * later load.
 */
export async function ensureHotbarOrder() {
	const user = game.user;
	if (user.getFlag(SYSTEM_ID, HOTBAR_ORDER_FLAG)) return moveToEnds();
	const order = user.isGM ? GM_HOTBAR_ORDER : PLAYER_HOTBAR_ORDER;
	const ids = order
		.map(macroOf)
		.filter((macro) => macro && (user.isGM || macro.canExecute))
		.map((macro) => macro.id);
	if (!ids.length) return;

	const ordered = orderHotbar(user.hotbar ?? {}, ids);
	await setHotbar(user.isGM ? endHotbar(ordered, gmEnds()) : ordered);
	const flag = (key) => `flags.${SYSTEM_ID}.${key}`;
	await user.update({ [flag(HOTBAR_ORDER_FLAG)]: true, ...(user.isGM ? { [flag(HOTBAR_ENDS_FLAG)]: true } : {}) });
}

/**
 * A GM ordered before Import PDF and End the Session took the first page's
 * last two slots has them moved there, once, with the rest of the page slid
 * left to close the gaps. That also brings the Rulebook up to the second
 * slot for a GM ordered when End the Session came second.
 */
async function moveToEnds() {
	const user = game.user;
	if (!user.isGM || user.getFlag(SYSTEM_ID, HOTBAR_ENDS_FLAG)) return;
	await setHotbar(endHotbar(user.hotbar ?? {}, gmEnds()));
	await user.setFlag(SYSTEM_ID, HOTBAR_ENDS_FLAG, true);
}
