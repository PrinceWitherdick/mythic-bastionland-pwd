/**
 * Every Myth's Cast and the City Quest's, as Actor data for a compendium, read
 * from the text Import PDF stored in the art index. Each Myth gets a folder of
 * its own inside a folder per d6, in roll order as the Myths table lists them
 * (p27). A stat block that counts as a structure is one. Pure, so it can be
 * tested without Foundry.
 */
import { SYSTEM_ID } from "../system-id.js";
import { spreads } from "./book-art.js";
import { CITY_QUEST_PAGES } from "./city-quest.js";
import { CAST_FLAG, CITY_CAST } from "./myth-cast.js";
import { actorFromStatBlock } from "./stat-blocks.js";
import { midSentence, paragraphs } from "./text.js";

/**
 * @typedef {object} CastNpcWords
 * @property {(d6: number) => string} folder Names the folder of Myths rolled with that d6.
 * @property {(roll: string) => string} unnamedMyth Names a Myth whose name wasn't read.
 * @property {string} cityQuest Names the City Quest, in a note on its Cast.
 * @property {(myth: string, page: number) => string} castOf A note on the Cast they're in, and its page.
 * @property {string} attackName Names an attack printed without one.
 */

/**
 * Actor data for one of a Cast: an NPC, or a Structure for a stat block with
 * only GD that counts as one, wearing the Myth's picture. It's marked as that
 * Myth's, so dragged into the world it joins the Cast on the GM Toolkit.
 * @param {import("./book-art.js").CastEntry} entry As the book prints it.
 * @param {object} cast
 * @param {string} cast.key Which Cast: the Myth's roll, or `CITY_CAST`.
 * @param {string} cast.name The Myth's name, or the City Quest's.
 * @param {number} cast.page Where the Cast is printed.
 * @param {string|null} [cast.img] The Myth's picture.
 * @param {number} sort
 * @param {CastNpcWords} words
 * @returns {{name: string, type: string, img?: string, prototypeToken?: object, system: object, items: object[], flags: object, sort: number}}
 */
export function castActor(entry, { key, name: castName, page, img = null }, sort, words) {
	const printed = String(entry.name ?? "");
	const block = { name: printed, stats: entry.stats ?? null, lines: entry.lines ?? [] };
	const { type, name, system, items } = actorFromStatBlock(block, { attackName: words.attackName });
	return {
		name: name || printed,
		type,
		...(img ? { img, prototypeToken: { texture: { src: img } } } : {}),
		system: { ...system, notes: system.notes + paragraphs(words.castOf(midSentence(castName), page)) },
		items,
		flags: { [SYSTEM_ID]: { [CAST_FLAG]: { myth: key, from: printed } } },
		sort
	};
}

/**
 * @param {import("./book-art.js").CastEntry[]|null|undefined} cast
 * @param {object} of Which Cast, as castActor takes it.
 * @param {CastNpcWords} words
 * @returns {object[]} Actor data for each entry with a name, in the order printed.
 */
const castDocuments = (cast, of, words) => (cast ?? [])
	.filter((entry) => String(entry?.name ?? "").trim())
	.map((entry, index) => castActor(entry, of, (index + 1) * 100, words));

/**
 * The Myths' Casts: a folder per d6 that has a Myth with a Cast, each holding
 * a folder per Myth.
 * @param {object|null} index The art index.
 * @param {CastNpcWords} words
 * @returns {{name: string, documents: object[], folders: object[]}[]}
 */
export function mythCastFolders(index, words) {
	const groups = new Map();
	for (const { d6, d12, roll, mythPage } of spreads()) {
		const myth = (index?.myths ?? []).find((entry) => entry?.roll === roll);
		const name = myth?.name || words.unnamedMyth(roll);
		const documents = castDocuments(myth?.cast, { key: roll, name, page: mythPage, img: myth?.path ?? null }, words);
		if (!documents.length) continue;
		if (!groups.has(d6)) groups.set(d6, { name: words.folder(d6), documents: [], folders: [] });
		groups.get(d6).folders.push({ name, documents, sort: d12 * 100 });
	}
	return [...groups.values()];
}

/**
 * @param {object|null} index The art index.
 * @param {CastNpcWords} words
 * @returns {object[]} The City Quest's Cast, in the order printed.
 */
export const cityCastActors = (index, words) => castDocuments(index?.cityQuest?.cast, { key: CITY_CAST, name: words.cityQuest, page: CITY_QUEST_PAGES.cast }, words);

/**
 * @param {{documents: object[], folders?: object[]}[]} folders
 * @returns {number} How many actors they hold, however deep.
 */
export const countDocuments = (folders) => folders.reduce((total, folder) => total + folder.documents.length + countDocuments(folder.folders ?? []), 0);
