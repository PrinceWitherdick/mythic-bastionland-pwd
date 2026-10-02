import { t } from "../chat/cards.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * The system's own macros, made in code since each one's whole script is a
 * single call. The macros compendium keeps a spare copy of each, flagged the
 * same way, for a GM who deletes theirs.
 *
 * A world is given each macro once, as a world setup step, and each user has
 * it placed on their hotbar once: a user who deletes the macro or moves it off
 * the bar keeps it that way.
 */

/**
 * The first page's last two slots, the ones Foundry labels 9 and 0. A GM's are
 * kept for Import PDF and End the Session, so the macros used in play fill the
 * page from the left.
 */
export const IMPORT_SLOT = 9;
export const SESSION_SLOT = 10;

/** The slots on the hotbar's first page. */
const PAGE_SLOTS = 10;

/**
 * Flag on a macro remembering the picture the system last gave it. A macro
 * still wearing that picture takes the next one the system draws; one wearing
 * anything else is a GM's own choice, and is left alone.
 */
const GIVEN_IMG_FLAG = "givenImg";

/**
 * @param {Record<number, string>} hotbar Macro ids by slot.
 * @param {string} macroId
 * @param {object} [options]
 * @param {boolean} [options.gm] Whether the hotbar is a GM's, who keeps slot 9 for Import PDF too.
 * @returns {number|null} The first empty slot on the first page short of the
 *   last (a GM's last two), or null when those are full or the macro is already on the hotbar somewhere.
 */
export function emptySlot(hotbar, macroId, { gm = true } = {}) {
	if (Object.values(hotbar ?? {}).includes(macroId)) return null;
	const end = gm ? IMPORT_SLOT : SESSION_SLOT;
	for (let slot = 1; slot < end; slot++) {
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
 * @param {() => boolean} [options.forGM] Whether a GM gets a hotbar slot for it, asked
 *   on each load. A GM still keeps the world's copy current either way.
 * @returns {{seed: () => Promise<void>, ensure: () => Promise<void>}}
 */
export function hotbarMacro({ macroFlag, hotbarFlag, nameKey, img, command, ownership = null, everyone = false, forGM = () => true }) {
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
			flags: { [SYSTEM_ID]: { [macroFlag]: true, [GIVEN_IMG_FLAG]: img } }
		});
	};

	/**
	 * Keep the world's copy of the macro's script and picture current, and give this user a
	 * hotbar slot for it. Run after world setup, so the active GM's slot comes
	 * the load the macro is made; anyone else gets theirs on a later load.
	 */
	const ensure = async () => {
		if (!everyone && !game.user.isGM) return;

		const macro = find();
		// Only a GM may rewrite the world's macro. The script always follows the system, so a
		// world made before it changed catches up; a GM's rename is kept. The picture follows
		// only while it is still the one the system gave, so a GM who puts their own on the
		// macro keeps it. A world made before the system remembered the picture it gave takes
		// the current one once, and is remembered from then on.
		if (game.user.isGM && macro) {
			const update = {};
			if (macro.command !== command) update.command = command;
			const given = macro.getFlag(SYSTEM_ID, GIVEN_IMG_FLAG) || null;
			if (!given || macro.img === given) {
				if (macro.img !== img) update.img = img;
				if (given !== img) update[`flags.${SYSTEM_ID}.${GIVEN_IMG_FLAG}`] = img;
			}
			if (Object.keys(update).length) await macro.update(update);
		}
		if (game.user.isGM && !forGM()) return;
		// A macro the user can't run is no use on their bar.
		if (!(everyone ? macro?.canExecute : macro) || game.user.getFlag(SYSTEM_ID, hotbarFlag)) return;

		const slot = emptySlot(game.user.hotbar, macro.id, { gm: game.user.isGM });
		if (slot) await game.user.assignHotbarMacro(macro, slot);
		// Set even when the first page is full, so it never turns up later in a slot the user cleared for something else.
		await game.user.setFlag(SYSTEM_ID, hotbarFlag, true);
	};

	return { seed, ensure };
}

/** The most slots a user's hotbar has, over all its pages. */
const HOTBAR_SLOTS = 50;

/** @returns {number|undefined} The first empty slot on any page. */
const firstEmpty = (hotbar) => Array.from({ length: HOTBAR_SLOTS }, (_, index) => index + 1).find((slot) => !hotbar[slot]);

/**
 * Put the given macros in the first slots, in order, wherever they were. A
 * user's own macro in one of those slots moves to the first empty slot rather
 * than being dropped.
 * @param {Record<number, string>} hotbar Macro ids by slot.
 * @param {string[]} firstIds
 * @returns {Record<number, string>} The new hotbar.
 */
export function orderHotbar(hotbar, firstIds) {
	const arranged = {};
	for (const [slot, id] of Object.entries(hotbar ?? {})) {
		if (id && !firstIds.includes(id)) arranged[slot] = id;
	}
	const displaced = [];
	firstIds.forEach((id, index) => {
		if (arranged[index + 1]) displaced.push(arranged[index + 1]);
		arranged[index + 1] = id;
	});
	for (const id of displaced) {
		const slot = firstEmpty(arranged);
		if (slot) arranged[slot] = id;
	}
	return arranged;
}

/**
 * Put macros in the first page's last slots, wherever they were, and slide the
 * rest of that page left to close its gaps. A user's own macro with no room
 * left on the page moves to the first empty slot after it rather than being dropped.
 * @param {Record<number, string>} hotbar Macro ids by slot.
 * @param {Record<number, string|undefined>} ends Macro ids by the slot each takes.
 *   A slot with none is left for the rest of the page.
 * @returns {Record<number, string>} The new hotbar.
 */
export function endHotbar(hotbar, ends) {
	const endIds = Object.values(ends).filter(Boolean);
	const arranged = {};
	const page = [];
	for (const [slot, id] of Object.entries(hotbar ?? {})) {
		if (!id || endIds.includes(id)) continue;
		if (Number(slot) <= PAGE_SLOTS) page.push([Number(slot), id]);
		else arranged[slot] = id;
	}
	for (const [slot, id] of Object.entries(ends)) {
		if (id) arranged[slot] = id;
	}
	page.sort(([a], [b]) => a - b);
	for (const [, id] of page) {
		const slot = firstEmpty(arranged);
		if (slot) arranged[slot] = id;
	}
	return arranged;
}
