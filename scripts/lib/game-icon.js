/**
 * What the scripts that build a folder of game-icons.net pictures share:
 * reading the outlines out of an icon the site serves, and drawing one either
 * on the ink disc the Squire's portrait is drawn on, for the pictures an item
 * or a beast carries, on the ink tile a hotbar button wears, or haloed the way
 * the Company's Token is; and the run that fetches a whole folder of them.
 * Used by scripts/goods-icons.js, scripts/macro-icons.js and
 * scripts/company-icons.js, which are left holding only what is their own.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { finishFolder, stopIfFailed } from "./asset-folder.js";
import { fetchDrawing } from "./charge-svg.js";
import { INK } from "../../module/rules/colour.js";

/** Where game-icons.net serves an icon as black on nothing. */
const ICON_URL = "https://game-icons.net/icons/000000/transparent/1x1/";

/** The Squire's portrait's parchment, so every picture made here sits beside it. */
export const PARCHMENT = "#efe8d8";

/**
 * A hotbar button is small and sits among Foundry's own dark furniture, where
 * parchment goes muddy, so the glyph on a tile is drawn in white instead.
 */
const WHITE = "#fff";

/**
 * Icons fill their 512 box to 16 of its edge, so at this size a square one
 * still keeps clear of the rim, and a slim one sits no smaller than the Squire.
 */
const ICON_SCALE = 1.8;

/**
 * @param {string} svg An icon as game-icons.net serves it: black on nothing.
 * @returns {string[]} The outlines it's drawn with.
 */
export function iconOutlines(svg) {
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
 * @param {object} options
 * @param {string} options.notice The icon's credit, which the picture carries.
 * @param {string} options.label What the picture is of, for anyone reading the page aloud.
 * @param {string[]} options.shapes The outlines from iconOutlines.
 * @returns {string} The picture: the icon in parchment on an ink disc whose parchment rim shows as a hairline.
 */
export function discPicture({ notice, label, shapes }) {
	const paths = shapes.map((d) => `<path fill="${PARCHMENT}" d="${d}"/>`).join("");
	return [
		`<!-- ${notice}`,
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

/**
 * @param {object} options
 * @param {string} options.notice The icon's credit, which the picture carries.
 * @param {string} options.label What the picture is of, for anyone reading the page aloud.
 * @param {string[]} options.shapes The outlines from iconOutlines.
 * @returns {string} The picture as a hotbar button wears it: the icon in white, filling
 *   an ink tile to its edges, the way game-icons.net serves one and Stonetop's macros are drawn.
 */
export function tilePicture({ notice, label, shapes }) {
	const paths = shapes.map((d) => `<path fill="${WHITE}" d="${d}"/>`).join("");
	return [
		`<!-- ${notice}`,
		"     Only the ground under it is ours. The CREDITS.md beside it lists every icon.",
		"",
		"     An XML comment may not hold two hyphens in a row: an SVG loaded through an img tag is parsed",
		"     strictly, and one stray pair breaks the whole picture. -->",
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="${label}">`
			+ `<path d="M0 0h512v512H0z" fill="${INK}"/>${paths}</svg>`,
		""
	].join("\n");
}

/** Every Company picture is drawn in the same box, so one is the size of another. */
const COMPANY_BOX = 256;

/** How wide the icon is drawn in that box, leaving the halo room to show at the edges. */
const COMPANY_ICON_SIZE = 232;

/** How far the halo stands out from the icon, in the box's units. */
const COMPANY_HALO = 7;

/**
 * @param {object} options
 * @param {string} options.notice The icon's credit, which the picture carries.
 * @param {string} options.label What the picture is of, for anyone reading the page aloud.
 * @param {string[]} options.shapes The outlines from iconOutlines.
 * @param {string} options.fill The colour the icon is drawn in.
 * @param {string} options.halo The pale hand behind it.
 * @returns {string} The picture: the icon inked and haloed, as the Company's Token wears it.
 *   The halo is painted behind the shape, so the holes the drawing leaves stay open.
 */
export function haloPicture({ notice, label, shapes, fill, halo }) {
	const scale = COMPANY_ICON_SIZE / 512;
	const inset = (COMPANY_BOX - COMPANY_ICON_SIZE) / 2;
	// A stroke is drawn in the icon's own units, so the halo is widened by however far the icon was shrunk.
	const width = (2 * COMPANY_HALO) / scale;
	const paths = shapes.map((d) =>
		`<path d="${d}" fill="${fill}" stroke="${halo}" stroke-width="${width.toFixed(1)}" stroke-linejoin="round" paint-order="stroke"/>`).join("");
	return [
		`<!-- ${notice}`,
		"     Only the halo behind it is ours. The CREDITS.md beside it lists every icon.",
		"",
		"     An XML comment may not hold two hyphens in a row: an SVG loaded through an img tag is parsed",
		"     strictly, and one stray pair breaks the whole picture. -->",
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COMPANY_BOX} ${COMPANY_BOX}" width="${COMPANY_BOX}" height="${COMPANY_BOX}" role="img" aria-label="${label}">`
			+ `<g transform="translate(${inset} ${inset}) scale(${scale.toFixed(4)})">${paths}</g></svg>`,
		""
	].join("\n");
}

/**
 * Throws if a picture's comments would break it.
 * @param {string} content A picture as it will be written.
 */
export function checkComments(content) {
	// A pair of hyphens inside an XML comment breaks the whole picture.
	for (const [, comment] of content.matchAll(/<!--([\s\S]*?)-->/g)) {
		if (comment.includes("--")) throw new Error("Its credit holds two hyphens in a row");
	}
}

/**
 * Fetch a whole folder of pictures and write them, the one thing each of the
 * icon scripts did for itself: every icon in turn, whatever the script draws
 * it as, then the credits beside them and whatever is no longer listed swept
 * away. A picture that can't be made is gathered up rather than stopping the
 * rest, and the run fails at the end if any did.
 * @param {object} options
 * @param {{key: string, name: string, icon: string}[]} options.icons What to fetch, in order.
 * @param {string} options.out The folder written to.
 * @param {string} options.cache Where a fetched icon is kept, so a second run works offline.
 * @param {string} options.agent What this script calls itself to the site.
 * @param {boolean} options.refresh Whether to fetch every icon again.
 * @param {(entry: object, shapes: string[]) => string} options.picture How this script draws one.
 * @param {string} options.creditsFile The credits written beside them.
 * @param {() => string} options.credits Those credits.
 * @returns {Promise<void>}
 */
export async function buildIconFolder({ icons, out, cache, agent, refresh, picture, creditsFile, credits }) {
	mkdirSync(out, { recursive: true });
	const written = new Set([creditsFile]);
	const failures = [];
	// One at a time, to go easy on the site.
	for (const entry of icons) {
		try {
			const svg = await fetchDrawing(`${entry.icon}.svg`, { agent, refresh, baseUrl: ICON_URL, cacheDir: cache });
			const content = picture(entry, iconOutlines(svg));
			checkComments(content);
			const file = `${entry.key}.svg`;
			writeFileSync(join(out, file), content);
			written.add(file);
		} catch (error) {
			failures.push(`${entry.key}: ${entry.icon}: ${error.message}`);
		}
	}

	stopIfFailed(failures, "icons");
	// Icons no longer listed go.
	const removed = finishFolder(out, written, creditsFile, credits());
	console.log(`Wrote ${icons.length} pictures and ${creditsFile} to ${out}. Removed ${removed} old files.`);
}
