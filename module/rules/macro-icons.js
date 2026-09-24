/**
 * The pictures the system's own macros wear on the hotbar. Foundry's own icons
 * are painted, and a row mixing them with this system's drawn marks reads as
 * two sets rather than one, so every macro is given a black-and-white
 * game-icons.net drawing instead, in white on an ink tile filling the button,
 * the way Stonetop's macros are drawn. White, not the parchment the sheets are
 * drawn in, since a button is small and sits among Foundry's dark furniture. The GM Toolkit's own mark is
 * here too: it keeps its disc as the toolkit's portrait, and wears the tile on
 * the bar with the rest. `npm run macro-icons` saves every icon to
 * assets/icons/macros. Pure, so it can be tested without Foundry.
 */
import { iconSet } from "./game-icons.js";
import { SYSTEM_PATH } from "../system-id.js";

/** Where the pictures are served from. */
export const MACRO_ICON_ROOT = `${SYSTEM_PATH}/assets/icons/macros`;

/** The credits file saved beside the pictures. */
export const MACRO_ICON_CREDITS_FILE = "CREDITS.md";

/**
 * Each macro's picture, keyed by the macro rather than the drawing, since the
 * folder holds one for each. The name is what a reader hears in its place.
 */
export const MACRO_ICONS = Object.freeze([
	{ key: "luck-roll", name: "Luck Roll", icon: "delapouite/perspective-dice-six-faces-random" },
	{ key: "new-site", name: "New Site", icon: "delapouite/cave-entrance" },
	{ key: "rulebook", name: "Rulebook", icon: "lorc/open-book" },
	// The same drawing the toolkit wears as its portrait, on a tile rather than its disc.
	{ key: "gm-toolkit", name: "GM Toolkit", icon: "skoll/read" },
	// The same drawing Stonetop's Import PDF macro wears.
	{ key: "import-pdf", name: "Import PDF", icon: "delapouite/spell-book" }
]);

/**
 * @param {string} key A MACRO_ICONS key.
 * @returns {string} The picture's file, as a macro's img.
 */
export const macroIconPath = (key) => `${MACRO_ICON_ROOT}/${key}.svg`;

/** What this set's pictures are credited as. */
const CREDITS = iconSet({
	icons: MACRO_ICONS,
	heading: "Macro pictures",
	blurb: ["Each is drawn in white on an ink tile filling the button, the way game icons dot net serves one; the artwork is otherwise unchanged. Each picture carries its credit too."]
});

/**
 * @param {string} key A MACRO_ICONS key.
 * @returns {{title: string, artist: string, url?: string, page: string}} Who drew it, and where it's from.
 */
export const macroIconCredit = CREDITS.credit;

/**
 * @param {string} key
 * @returns {string} The credit a picture carries. It holds no pair of hyphens,
 *   which would break the XML comment it goes in.
 */
export const macroIconNotice = CREDITS.notice;

/** @returns {string} The credits file, one line for each icon. */
export const macroIconCredits = CREDITS.credits;
