/**
 * What every set of game-icons.net pictures this system ships shares: who drew
 * them, how each one is credited in the picture itself, and the CREDITS.md
 * written beside them. The sets themselves are goods-icons.js, for items,
 * beasts and structures, and company-icons.js, for the Company's Token. Pure,
 * so it can be tested without Foundry.
 */
import { capitalise } from "./text.js";

/** The licence every icon is shared under. */
export const ICON_LICENCE = Object.freeze({ short: "CC BY 3.0", url: "https://creativecommons.org/licenses/by/3.0/" });

/** game-icons.net's artists, by the folder their icons are in, as the site credits them. */
export const ARTISTS = Object.freeze({
	"caro-asercion": { name: "Caro Asercion" },
	"carl-olsen": { name: "Carl Olsen", url: "https://twitter.com/unstoppableCarl" },
	cathelineau: { name: "Cathelineau" },
	delapouite: { name: "Delapouite", url: "https://delapouite.com" },
	"heavenly-dog": { name: "HeavenlyDog", url: "http://www.gnomosygoblins.blogspot.com" },
	lorc: { name: "Lorc", url: "https://lorcblog.blogspot.com" },
	lucasms: { name: "Lucas" },
	sbed: { name: "sbed", url: "http://opengameart.org/content/95-game-icons" },
	skoll: { name: "Skoll" }
});

/**
 * @param {string} icon Such as "lorc/broadsword".
 * @returns {{title: string, artist: string, url?: string, page: string}} Who drew it, and where it's from.
 */
export function iconCredit(icon) {
	const [folder, name] = icon.split("/");
	const artist = ARTISTS[folder];
	if (!artist) throw new Error(`No artist for ${icon}`);
	return { title: capitalise(name.split("-").join(" ")), artist: artist.name, url: artist.url, page: `https://game-icons.net/1x1/${folder}/${name}.html` };
}

/**
 * @param {string} icon
 * @returns {string} The credit a picture carries, as the Squire's portrait does. It holds
 *   no pair of hyphens, which would break the XML comment it goes in.
 */
export function iconNotice(icon) {
	const { title, artist, url, page } = iconCredit(icon);
	return `"${title}" by ${artist}${url ? ` (${url})` : ""}, from game icons dot net (${page}), ${ICON_LICENCE.short} (${ICON_LICENCE.url}).`;
}

/**
 * @param {string} heading The file's title, without its hash.
 * @param {string[]} blurb Lines saying what was done to the icons.
 * @param {Array<{file: string, icon: string}>} entries Each picture, in the order they're listed.
 * @returns {string} The CREDITS.md written beside the pictures.
 */
export function iconCredits(heading, blurb, entries) {
	const lines = entries.map(({ file, icon }) => {
		const { title, artist, url, page } = iconCredit(icon);
		return `- \`${file}\`: [${title}](${page}) by ${url ? `[${artist}](${url})` : artist}`;
	});
	return [
		`# ${heading}`,
		"",
		`Icons from [game-icons.net](https://game-icons.net), shared under [${ICON_LICENCE.short}](${ICON_LICENCE.url}).`,
		...blurb,
		"",
		...lines,
		""
	].join("\n");
}

/**
 * The three readings every set of pictures offers, made once from the set's own
 * list rather than written out again by each of them. A key nothing is listed
 * under is refused by name, whichever set it was asked of.
 * @param {object} options
 * @param {Array<{key: string, icon: string}>} options.icons The set, in the order it's listed.
 * @param {string} options.heading The credits file's title, without its hash.
 * @param {string[]} options.blurb Lines saying what was done to the icons.
 * @returns {{credit: (key: string) => object, notice: (key: string) => string, credits: () => string}}
 */
export function iconSet({ icons, heading, blurb }) {
	/** @returns {string} The drawing that key is listed under. */
	const drawing = (key) => {
		const found = icons.find((choice) => choice.key === key);
		if (!found) throw new Error(`No picture for ${key}`);
		return found.icon;
	};
	return {
		credit: (key) => iconCredit(drawing(key)),
		notice: (key) => iconNotice(drawing(key)),
		credits: () => iconCredits(heading, blurb, icons.map(({ key, icon }) => ({ file: `${key}.svg`, icon })))
	};
}
