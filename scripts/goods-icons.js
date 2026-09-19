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
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { finishFolder, stopIfFailed } from "./lib/asset-folder.js";
import { fetchDrawing } from "./lib/charge-svg.js";
import { GOODS_ICONS, GOODS_ICON_CREDITS_FILE, goodsIconCredits, goodsIconNotice } from "../module/rules/goods-icons.js";

const root = join(import.meta.dirname, "..");
const out = join(root, "assets", "icons", "goods");
const cache = join(root, "node_modules", ".cache", "goods-icons");
const refresh = process.argv.includes("--refresh");
const ICON_URL = "https://game-icons.net/icons/000000/transparent/1x1/";

/** The Squire's portrait's colours and disc, so every picture sits beside it. */
const PARCHMENT = "#efe8d8";
const INK = "#231f1a";

/**
 * Icons fill their 512 box to 16 of its edge, so at this size a square one
 * still keeps clear of the rim, and a slim one sits no smaller than the Squire.
 */
const ICON_SCALE = 1.8;

/**
 * @param {string} icon Such as "lorc/broadsword".
 * @returns {Promise<string>} The icon as game-icons.net serves it: black on nothing.
 */
const fetchIcon = (icon) => fetchDrawing(`${icon}.svg`, { agent: "goods-icons", refresh, baseUrl: ICON_URL, cacheDir: cache });

/**
 * @param {string} svg An icon from fetchIcon.
 * @returns {string[]} The outlines it's drawn with.
 */
function outlines(svg) {
	if (!/viewBox="0 0 512 512"/.test(svg)) throw new Error("Not in a 512 box");
	const paths = [...svg.matchAll(/<path\b([^>]*)\/?>/g)].map((match) => match[1]);
	if (!paths.length) throw new Error("No outlines");
	return paths.map((attributes) => {
		const d = /\sd="([^"]+)"/.exec(attributes)?.[1];
		if (!d) throw new Error("An outline without a shape");
		return d;
	});
}

/**
 * @param {string} key
 * @param {string[]} shapes
 * @returns {string} The picture: the icon in parchment on an ink disc whose parchment rim shows as a hairline.
 */
function picture(key, shapes) {
	const label = key.split("-").join(" ");
	const paths = shapes.map((d) => `<path fill="${PARCHMENT}" d="${d}"/>`).join("");
	return [
		`<!-- ${goodsIconNotice(key)}`,
		"     Only the ground under it is ours, the same as the Squire's portrait. The CREDITS.md beside it lists every icon.",
		"",
		"     An XML comment may not hold two hyphens in a row: an SVG loaded through an img tag is parsed",
		"     strictly, and one stray pair breaks the whole picture. -->",
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1600" width="200" height="200" role="img" aria-label="${label}">`
			+ `<circle cx="800" cy="800" r="723.45" fill="${PARCHMENT}"/><circle cx="800" cy="800" r="712.60" fill="${INK}"/>`
			+ `<g transform="translate(800 800) scale(${ICON_SCALE}) translate(-256 -256)">${paths}</g></svg>`,
		""
	].join("\n");
}

mkdirSync(out, { recursive: true });
const written = new Set([GOODS_ICON_CREDITS_FILE]);
const failures = [];
// One at a time, to go easy on the site.
for (const [key, icon] of Object.entries(GOODS_ICONS)) {
	try {
		const content = picture(key, outlines(await fetchIcon(icon)));
		if (/<!--([\s\S]*?)-->/.exec(content)[1].includes("--")) throw new Error("Its credit holds two hyphens in a row");
		const name = `${key}.svg`;
		writeFileSync(join(out, name), content);
		written.add(name);
	} catch (error) {
		failures.push(`${key}: ${icon}: ${error.message}`);
	}
}

stopIfFailed(failures, "icons");
// Icons no longer listed go.
const removed = finishFolder(out, written, GOODS_ICON_CREDITS_FILE, goodsIconCredits());

console.log(`Wrote ${Object.keys(GOODS_ICONS).length} pictures and ${GOODS_ICON_CREDITS_FILE} to ${out}. Removed ${removed} old files.`);
