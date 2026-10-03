/**
 * Pictures the Referee can give the one Token that stands for the whole
 * Company (p7): game-icons.net icons of Knights, riders and banners, drawn
 * with a halo behind them so they read on a parchment Realm and a midnight one
 * alike, the same way the Holdings on the map are drawn. Each can be carried
 * in the Company's own colour, which recolours the icon and swaps the halo for
 * whichever of the paper and the ink still shows behind it.
 *
 * `npm run company-icons` saves every icon COMPANY_ICONS lists to
 * assets/icons/company. Pure, so it can be tested without Foundry.
 */
import { contrast, HEX_COLOR, INK } from "./colour.js";
import { iconSet } from "./game-icons.js";
import { TINCTURES } from "./heraldry.js";
import { fileName } from "./text.js";
import { SYSTEM_PATH } from "../system-id.js";

/** Where the pictures are served from. */
export const COMPANY_ICON_ROOT = `${SYSTEM_PATH}/assets/icons/company`;

/** The credits file saved beside the pictures. */
export const COMPANY_ICON_CREDITS_FILE = "CREDITS.md";

/** The folder under the system's art folder where a recoloured icon is saved. */
export const COMPANY_ART_FOLDER = "company";

/** The colour a shipped icon is drawn in: the sheets' ink. */
export const COMPANY_ICON_FILL = INK;

/** The pale hand behind it, so the ink reads on a midnight Realm too. */
export const COMPANY_ICON_HALO = "#f6f1e4";

/**
 * Every icon offered, in the order the gallery shows them: the four the
 * Knight search on game-icons.net turns up, then riders and banners for a
 * Company that would rather show its colours than its helm.
 */
export const COMPANY_ICONS = Object.freeze([
	{ key: "knight-banner", name: "Knight's banner", icon: "delapouite/knight-banner" },
	{ key: "mounted-knight", name: "Mounted Knight", icon: "skoll/mounted-knight" },
	{ key: "black-knight-helm", name: "Knight's helm", icon: "delapouite/black-knight-helm" },
	{ key: "chess-knight", name: "Chess knight", icon: "skoll/chess-knight" },
	{ key: "cloaked-rider", name: "Cloaked rider", icon: "caro-asercion/cloaked-figure-on-horseback" },
	{ key: "cavalry", name: "Cavalry", icon: "delapouite/cavalry" },
	{ key: "tattered-banner", name: "Tattered banner", icon: "lorc/tattered-banner" },
	{ key: "crossed-swords", name: "Crossed swords", icon: "lorc/crossed-swords" }
]);

/** The icon a Company carries when the Referee hasn't chosen one. */
export const DEFAULT_COMPANY_ICON = COMPANY_ICONS[0].key;

/**
 * @param {string} key A COMPANY_ICONS key.
 * @returns {string} The picture's file, as it ships: drawn in ink.
 */
export const companyIconPath = (key) => `${COMPANY_ICON_ROOT}/${key}.svg`;

/** The picture the Company carries when the Referee hasn't chosen one. */
export const COMPANY_IMAGE = companyIconPath(DEFAULT_COMPANY_ICON);

/**
 * The colours a Company's icon can be carried in: the ink it's drawn in, then
 * the heraldic tinctures, so a Company's colour is named the way its arms are.
 */
export const COMPANY_COLOURS = Object.freeze([
	{ key: "ink", color: COMPANY_ICON_FILL },
	...TINCTURES.map(({ key, color }) => ({ key, color }))
]);

/**
 * @param {string} key A COMPANY_COLOURS key.
 * @returns {string} Its colour, or the ink for a colour that isn't offered.
 */
export const companyColour = (key) => COMPANY_COLOURS.find((colour) => colour.key === key)?.color ?? COMPANY_ICON_FILL;

/**
 * @param {string} color The colour the icon is drawn in.
 * @returns {string} The halo behind it: whichever of the paper and the ink shows against it.
 */
export const companyHalo = (color) =>
	(contrast(color, COMPANY_ICON_HALO) >= contrast(color, COMPANY_ICON_FILL) ? COMPANY_ICON_HALO : COMPANY_ICON_FILL);

/**
 * Recolour a shipped icon. The drawing is untouched: only the two colours it's
 * painted with are swapped, which is what keeps the credit inside it true.
 * @param {string} svg A file from assets/icons/company.
 * @param {string} color
 * @returns {string} The same picture in that colour.
 */
export function tintCompanyIcon(svg, color) {
	const fill = String(color).toLowerCase();
	if (!HEX_COLOR.test(fill)) throw new TypeError(`Not a colour: ${color}`);
	if (!svg.includes(`fill="${COMPANY_ICON_FILL}"`)) throw new Error("Not a Company icon");
	return svg
		.replaceAll(`fill="${COMPANY_ICON_FILL}"`, `fill="${fill}"`)
		.replaceAll(`stroke="${COMPANY_ICON_HALO}"`, `stroke="${companyHalo(fill)}"`);
}

/**
 * @param {string} key A COMPANY_ICONS key.
 * @param {string} color
 * @returns {string} What a recoloured icon is saved as, so the same choice made
 *   twice writes one file rather than filling the folder.
 */
export const companyIconFile = (key, color) => `${key}-${String(color).toLowerCase().replace("#", "")}.svg`;

/**
 * Read a Company picture back: which icon it is, and what colour it's in.
 * @param {string} path
 * @returns {{key: string, color: string}|null} Null for a picture of the Referee's own.
 */
export function companyIconFromPath(path) {
	const file = String(path ?? "").split("/").pop() ?? "";
	const shipped = COMPANY_ICONS.find(({ key }) => file === `${key}.svg`);
	if (shipped) return { key: shipped.key, color: COMPANY_ICON_FILL };
	const [, key, hex] = /^(.+)-([0-9a-f]{6})\.svg$/i.exec(file) ?? [];
	const tinted = COMPANY_ICONS.find((choice) => choice.key === key);
	return tinted ? { key: tinted.key, color: `#${hex.toLowerCase()}` } : null;
}

/**
 * The gallery: every icon, with the file it ships as.
 * @returns {Array<{key: string, name: string, path: string}>}
 */
export const companyPictureChoices = () => COMPANY_ICONS.map(({ key, name }) => ({ key, name, path: companyIconPath(key) }));

/** How many of the Referee's own pictures the gallery keeps; the one used longest ago goes first. */
export const OWN_COMPANY_PICTURES = 12;

/**
 * The Referee's own pictures with one more taken: it goes to the front, once,
 * and the gallery's own icons, recoloured or not, are never kept, since they
 * have tiles already.
 * @param {unknown} kept The pictures already kept, newest first.
 * @param {string} [path] The picture just carried.
 * @returns {string[]}
 */
export function keepOwnCompanyPicture(kept, path) {
	const list = (Array.isArray(kept) ? kept : []).filter((p) => typeof p === "string" && p && !companyIconFromPath(p));
	const own = String(path ?? "").trim();
	if (!own || companyIconFromPath(own)) return list.slice(0, OWN_COMPANY_PICTURES);
	return [own, ...list.filter((p) => p !== own)].slice(0, OWN_COMPANY_PICTURES);
}

/**
 * The Referee's own pictures with one struck out of them.
 * @param {unknown} kept
 * @param {string} path
 * @returns {string[]}
 */
export const forgetOwnCompanyPicture = (kept, path) => keepOwnCompanyPicture(kept).filter((p) => p !== path);

/**
 * The Referee's own pictures as gallery tiles, named by their file.
 * @param {string[]} kept As keepOwnCompanyPicture leaves them.
 * @returns {Array<{name: string, path: string}>}
 */
export const ownCompanyPictureChoices = (kept) => kept.map((path) => ({ name: (fileName(path) || path).replace(/\.[^.]+$/, ""), path }));

/** What this set's pictures are credited as. */
const CREDITS = iconSet({
	icons: COMPANY_ICONS,
	heading: "Company pictures",
	blurb: ["Each is inked and given a pale halo so it reads on light and dark paper; the artwork is otherwise unchanged. Each picture carries its credit too."]
});

/**
 * @param {string} key A COMPANY_ICONS key.
 * @returns {{title: string, artist: string, url?: string, page: string}} Who drew it, and where it's from.
 */
export const companyIconCredit = CREDITS.credit;

/**
 * @param {string} key
 * @returns {string} The credit a picture carries. It holds no pair of hyphens,
 *   which would break the XML comment it goes in.
 */
export const companyIconNotice = CREDITS.notice;

/** @returns {string} The credits file, one line for each icon. */
export const companyIconCredits = CREDITS.credits;
