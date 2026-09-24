/**
 * Builds the pictures weapons, armour, gear, beasts, hirelings and structures
 * get: every game-icons.net icon GOODS_ICONS lists is fetched and set, in
 * parchment, on the ink disc the Squire's portrait has, with its credit, in
 * assets/icons/goods. Icons are cached under node_modules/.cache, so running
 * it again works offline. Run after changing GOODS_ICONS:
 *
 *   npm run goods-icons              (use the cache)
 *   npm run goods-icons -- --refresh (fetch every icon again)
 */
import { join } from "node:path";
import { buildIconFolder, discPicture } from "./lib/game-icon.js";
import { GOODS_ICONS, GOODS_ICON_CREDITS_FILE, goodsIconCredits, goodsIconNotice } from "../module/rules/goods-icons.js";

const root = join(import.meta.dirname, "..");

await buildIconFolder({
	// Listed by what carries the picture rather than by the drawing, so each is named after its key.
	icons: Object.entries(GOODS_ICONS).map(([key, icon]) => ({ key, name: key.split("-").join(" "), icon })),
	out: join(root, "assets", "icons", "goods"),
	cache: join(root, "node_modules", ".cache", "goods-icons"),
	agent: "goods-icons",
	refresh: process.argv.includes("--refresh"),
	picture: ({ key, name }, shapes) => discPicture({ notice: goodsIconNotice(key), label: name, shapes }),
	creditsFile: GOODS_ICON_CREDITS_FILE,
	credits: goodsIconCredits
});
