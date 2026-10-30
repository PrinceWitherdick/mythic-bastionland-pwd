import { SYSTEM_ID } from "../system-id.js";
import { IMPORT_MACRO_ID } from "../book-art/macro.js";
import { IMPORT_SLOT, SESSION_SLOT, endHotbar, orderHotbar, slotWanted } from "./hotbar-macro.js";

/**
 * The system's macros lead each user's hotbar: a GM's opens with the GM
 * Toolkit and ends with Import PDF and End the Session, in the slots Foundry
 * labels 9 and 0; a player's opens with the Attack, then their Places and the
 * Timeline, and ends with the Luck Roll in the slot labelled 0.
 */

/** The macros' flags, in the order they take the first slots. */
export const GM_HOTBAR_ORDER = Object.freeze(["gmToolkitMacro", "rulebookMacro", "newSiteMacro", "luckRollMacro", "attackMacro"]);
export const PLAYER_HOTBAR_ORDER = Object.freeze(["attackMacro", "placesMacro", "timelineMacro"]);

/** User flag set once this user's hotbar has been put in that order. */
export const HOTBAR_ORDER_FLAG = "hotbarOrder";

/**
 * User flag set once a GM's Import PDF and End the Session have been put in
 * the first page's last two slots, and the rest of that page slid left.
 */
export const HOTBAR_ENDS_FLAG = "hotbarEnds";

/**
 * User flag set once this user's hotbar has been put in order with the Attack
 * macro among the rest, a player's Luck Roll moving to the end for it.
 */
export const HOTBAR_ATTACK_FLAG = "hotbarAttack";

/** @returns {Macro|undefined} The world's macro carrying this flag. */
const macroOf = (flag) => game.macros.find((macro) => macro.getFlag(SYSTEM_ID, flag));

/** @returns {Macro|undefined} The macro, if this user may run it. */
const runnable = (macro) => (macro && (game.user.isGM || macro.canExecute) ? macro : undefined);

/** @returns {Record<number, string|undefined>} This user's macros for the first page's last slots, by slot. */
const endsFor = (user) => (user.isGM
	? { [IMPORT_SLOT]: game.macros.get(IMPORT_MACRO_ID)?.id, [SESSION_SLOT]: macroOf("endSessionMacro")?.id }
	: { [SESSION_SLOT]: runnable(macroOf("luckRollMacro"))?.id });

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
 *
 * A user ordered before there was an Attack macro is ordered again, once, when
 * it comes: then only what is still on their bar moves, so a macro they took
 * off it stays off.
 */
export async function ensureHotbarOrder() {
	const user = game.user;
	const ordered = Boolean(user.getFlag(SYSTEM_ID, HOTBAR_ORDER_FLAG));
	const attack = runnable(macroOf("attackMacro"));
	if (ordered && (!attack || user.getFlag(SYSTEM_ID, HOTBAR_ATTACK_FLAG))) return moveToEnds();

	const hotbar = user.hotbar ?? {};
	const onBar = (id) => !ordered || Object.values(hotbar).includes(id);
	const ids = (user.isGM ? GM_HOTBAR_ORDER : PLAYER_HOTBAR_ORDER)
		.filter(slotWanted)
		.map((flag) => runnable(macroOf(flag))?.id)
		.filter((id) => id && onBar(id));
	const ends = Object.fromEntries(Object.entries(endsFor(user)).map(([slot, id]) => [slot, id && onBar(id) ? id : undefined]));
	if (!ids.length && !Object.values(ends).some(Boolean)) return;

	await setHotbar(endHotbar(orderHotbar(hotbar, ids), ends));
	const flag = (key) => `flags.${SYSTEM_ID}.${key}`;
	await user.update({
		[flag(HOTBAR_ORDER_FLAG)]: true,
		...(user.isGM ? { [flag(HOTBAR_ENDS_FLAG)]: true } : {}),
		...(attack ? { [flag(HOTBAR_ATTACK_FLAG)]: true } : {})
	});
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
	await setHotbar(endHotbar(user.hotbar ?? {}, endsFor(user)));
	await user.setFlag(SYSTEM_ID, HOTBAR_ENDS_FLAG, true);
}
