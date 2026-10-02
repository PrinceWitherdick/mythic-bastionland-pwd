import { SYSTEM_ID } from "../system-id.js";
import { orderHotbar } from "./hotbar-macro.js";

/**
 * The system's macros lead each user's hotbar: a GM's opens with the GM
 * Toolkit, a player's with the Luck Roll and then their Places.
 */

/** The macros' flags, in the order they take the first slots. */
export const GM_HOTBAR_ORDER = Object.freeze(["gmToolkitMacro", "rulebookMacro", "endSessionMacro", "newSiteMacro", "luckRollMacro"]);
export const PLAYER_HOTBAR_ORDER = Object.freeze(["luckRollMacro", "placesMacro"]);

/** User flag set once this user's hotbar has been put in that order. */
export const HOTBAR_ORDER_FLAG = "hotbarOrder";

/**
 * User flag set once a GM ordered before the Rulebook took the second slot
 * has had it swapped with End the Session.
 */
export const RULEBOOK_SECOND_FLAG = "rulebookSecond";

/**
 * Put the system's macros first on this user's hotbar, once, so a user who
 * rearranges it afterwards keeps it their way. Run after every macro has its
 * slot. A user who loads before any GM has made the macros is ordered on a
 * later load.
 */
export async function ensureHotbarOrder() {
	const user = game.user;
	if (user.getFlag(SYSTEM_ID, HOTBAR_ORDER_FLAG)) return swapRulebookSecond();
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
	if (user.isGM) await user.setFlag(SYSTEM_ID, RULEBOOK_SECOND_FLAG, true);
}

/**
 * A GM ordered when End the Session came second and the Rulebook third gets
 * the two swapped, once. A GM who has moved either keeps their own layout.
 */
async function swapRulebookSecond() {
	const user = game.user;
	if (!user.isGM || user.getFlag(SYSTEM_ID, RULEBOOK_SECOND_FLAG)) return;
	const idOf = (flag) => game.macros.find((macro) => macro.getFlag(SYSTEM_ID, flag))?.id;
	const session = idOf("endSessionMacro");
	const rulebook = idOf("rulebookMacro");
	const hotbar = user.hotbar ?? {};
	if (session && rulebook && hotbar[2] === session && hotbar[3] === rulebook) {
		await user.update({ hotbar: { ...hotbar, 2: rulebook, 3: session } }, { diff: false, recursive: false, noHook: true });
	}
	await user.setFlag(SYSTEM_ID, RULEBOOK_SECOND_FLAG, true);
}
