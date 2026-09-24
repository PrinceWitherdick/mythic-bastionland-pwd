/**
 * Builds the pictures the system's own macros wear on the hotbar: every
 * game-icons.net icon MACRO_ICONS lists is fetched and set, in white, on an
 * ink tile filling the button, with its credit, in assets/icons/macros. The
 * GM Toolkit's disc, in assets/icons, is its portrait and isn't touched.
 * Icons are cached under node_modules/.cache, so running it again works
 * offline. Run after changing MACRO_ICONS:
 *
 *   npm run macro-icons              (use the cache)
 *   npm run macro-icons -- --refresh (fetch every icon again)
 */
import { join } from "node:path";
import { buildIconFolder, tilePicture } from "./lib/game-icon.js";
import { MACRO_ICONS, MACRO_ICON_CREDITS_FILE, macroIconCredits, macroIconNotice } from "../module/rules/macro-icons.js";

const root = join(import.meta.dirname, "..");

await buildIconFolder({
	icons: MACRO_ICONS,
	out: join(root, "assets", "icons", "macros"),
	cache: join(root, "node_modules", ".cache", "macro-icons"),
	agent: "macro-icons",
	refresh: process.argv.includes("--refresh"),
	picture: ({ key, name }, shapes) => tilePicture({ notice: macroIconNotice(key), label: name, shapes }),
	creditsFile: MACRO_ICON_CREDITS_FILE,
	credits: macroIconCredits
});
