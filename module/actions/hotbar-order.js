import { SYSTEM_ID } from "../system-id.js";
import { orderHotbar } from "./hotbar-macro.js";

/**
 * The system's macros lead each user's hotbar: a GM's opens with the GM
 * Toolkit, a player's with the Luck Roll, the one macro players are given.
 */

/** The macros' flags, in the order they take the first slots. */
export const GM_HOTBAR_ORDER = Object.freeze(["gmToolkitMacro", "rulebookMacro", "luckRollMacro", "newSiteMacro"]);
export const PLAYER_HOTBAR_ORDER = Object.freeze(["luckRollMacro"]);

/** User flag set once this user's hotbar has been put in that order. */
export const HOTBAR_ORDER_FLAG = "hotbarOrder";

/**
 * Put the system's macros first on this user's hotbar, once, so a user who
 * rearranges it afterwards keeps it their way. Run after every macro has its
 * slot. A user who loads before any GM has made the macros is ordered on a
 * later load.
 */
export async function ensureHotbarOrder() {
	const user = game.user;
	if (user.getFlag(SYSTEM_ID, HOTBAR_ORDER_FLAG)) return;
	const order = user.isGM ? GM_HOTBAR_ORDER : PLAYER_HOTBAR_ORDER;
	const ids = order
		.map((flag) => game.macros.find((macro) => macro.getFlag(SYSTEM_ID, flag)))
		.filter((macro) => macro && (user.isGM || macro.canExecute))
		.map((macro) => macro.id);
	if (!ids.length) return;

	const hotbar = orderHotbar(user.hotbar ?? {}, ids);
	// Replaced whole, as assignHotbarMacro does, so emptied slots are removed rather than merged back.
	if (!foundry.utils.objectsEqual(hotbar, user.hotbar ?? {})) {
		await user.update({ hotbar }, { diff: false, recursive: false, noHook: true });
	}
	await user.setFlag(SYSTEM_ID, HOTBAR_ORDER_FLAG, true);
}
