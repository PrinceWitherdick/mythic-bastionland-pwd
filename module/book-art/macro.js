import { SYSTEM_MACRO_FLAGS, arrangeHotbar } from "../actions/hotbar-macro.js";
import { t } from "../chat/cards.js";
import { MACROS_PACK, SYSTEM_ID } from "../system-id.js";

/** Import PDF keeps this id in the compendium and in each world. */
export const IMPORT_MACRO_ID = "mbImportBookArt1";

/** User flag set once Import PDF has been given this GM's last hotbar slot. */
export const IMPORT_HOTBAR_FLAG = "importBookArtHotbar";

/** The name the macro shipped under before, which a world's copy drops for the new one. */
const OLD_MACRO_NAME = "Import Book Art";

/** Set once a world has been given its copy of the macro. */
export const MACRO_SEEDED_SETTING = "bookArtMacroSeeded";

/** Register the settings Import PDF relies on. Called during init. */
export function registerBookArtSettings() {
	game.settings.register(SYSTEM_ID, MACRO_SEEDED_SETTING, {
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});
}

/**
 * Give the world its own copy of Import PDF, once. A GM who deletes the
 * copy keeps it deleted. While the copy exists, its script and icon follow the
 * compendium so a system update reaches it, but a GM's rename is kept.
 * Only the active GM does this, so two GMs never both create it.
 */
export async function ensureImportMacro() {
	if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;

	const pack = game.packs.get(MACROS_PACK);
	const source = await pack?.getDocument(IMPORT_MACRO_ID).catch(() => null);
	if (!source) {
		// Foundry quietly creates an empty compendium when its database was never built.
		ui.notifications.warn(t("bookArt.packMissing"));
		return;
	}

	const existing = game.macros.get(IMPORT_MACRO_ID);
	if (existing) {
		const update = {};
		if (existing.command !== source.command) update.command = source.command;
		if (existing.img !== source.img) update.img = source.img;
		if (existing.name === OLD_MACRO_NAME) update.name = source.name;
		if (!foundry.utils.isEmpty(update)) await existing.update(update);
		return;
	}

	if (game.settings.get(SYSTEM_ID, MACRO_SEEDED_SETTING)) return;

	// Created directly rather than through importFromCompendium, which also
	// switches the sidebar to the Macro Directory.
	const data = game.macros.fromCompendium(source, { keepId: true });
	await CONFIG.Macro.documentClass.create(data, { keepId: true });
	await game.settings.set(SYSTEM_ID, MACRO_SEEDED_SETTING, true);
}

/**
 * Give Import PDF the last slot on the first page of each GM's hotbar, the
 * one Foundry labels 0, and slide the system's other macros left into any gaps
 * that leaves. Done once per GM, after the other macros have their slots, so a
 * GM who moves it afterwards keeps it moved.
 */
export async function ensureImportHotbar() {
	if (!game.user.isGM || game.user.getFlag(SYSTEM_ID, IMPORT_HOTBAR_FLAG)) return;
	const macro = game.macros.get(IMPORT_MACRO_ID);
	if (!macro) return;

	const others = game.macros
		.filter((entry) => SYSTEM_MACRO_FLAGS.some((flag) => entry.getFlag(SYSTEM_ID, flag)))
		.map((entry) => entry.id);
	const hotbar = arrangeHotbar(game.user.hotbar ?? {}, macro.id, others);
	// Replaced whole, as assignHotbarMacro does, so emptied slots are removed rather than merged back.
	if (!foundry.utils.objectsEqual(hotbar, game.user.hotbar ?? {})) {
		await game.user.update({ hotbar }, { diff: false, recursive: false, noHook: true });
	}
	await game.user.setFlag(SYSTEM_ID, IMPORT_HOTBAR_FLAG, true);
}
