/**
 * Every Seer the book gives a stat block, as Actor data for a compendium, read
 * from the text Import PDF stored in the art index. They're grouped in a folder
 * per d6 and kept in roll order, as the Knights' table on p26 lists them. A
 * Seer that counts as a structure is one. Pure, so it can be tested without Foundry.
 */
import { isStructureBlock, npcFromStatBlock, structureFromStatBlock } from "./stat-blocks.js";
import { paragraphs } from "./text.js";

/**
 * @typedef {object} SeerNpcWords
 * @property {(d6: number) => string} folder Names the folder of Seers rolled with that d6.
 * @property {(knight: string, page: number) => string} knighted A note on the Knight they knighted, on whose page they're printed.
 * @property {string} attackName Names an attack printed without one.
 */

/**
 * "The True Knight" reads "the True Knight" inside a sentence.
 * @param {string} name
 * @returns {string}
 */
const midSentence = (name) => name.replace(/^The\b/, "the");

/**
 * Actor data for one Seer: an NPC, or a Structure for a Seer with only GD
 * that counts as one, with their picture as its portrait and token.
 * @param {object} seer From the art index, with `stats`.
 * @param {object|null} knight The Knight sharing their roll, from the art index.
 * @param {SeerNpcWords} words
 * @returns {{name: string, type: string, img?: string, prototypeToken?: object, system: object, items: object[], sort: number}}
 */
export function seerActor(seer, knight, words) {
	const block = { name: seer.name, stats: seer.stats, lines: seer.lines ?? [] };
	const structure = isStructureBlock(block);
	const { name, system, items } = structure
		? structureFromStatBlock(block, { attackName: words.attackName })
		: npcFromStatBlock(block, { attackName: words.attackName });
	const knighted = knight?.name && seer.page ? words.knighted(midSentence(knight.name), seer.page) : "";
	return {
		name,
		type: structure ? "structure" : "npc",
		...(seer.path ? { img: seer.path, prototypeToken: { texture: { src: seer.path } } } : {}),
		system: { ...system, notes: system.notes + paragraphs(knighted) },
		items,
		sort: (seer.d6 * 100) + seer.d12
	};
}

/**
 * The Seers with a stat block, a folder for each d6 that has any. A Seer
 * the book gives no stats, as one that doesn't exist, isn't an NPC.
 * @param {object|null} index The art index.
 * @param {SeerNpcWords} words
 * @returns {{name: string, documents: object[]}[]}
 */
export function seerFolders(index, words) {
	const seers = (index?.seers ?? [])
		.filter((seer) => seer?.name && seer.stats && Number.isInteger(seer.d6) && Number.isInteger(seer.d12))
		.sort((a, b) => (a.d6 - b.d6) || (a.d12 - b.d12));
	const knights = new Map((index?.knights ?? []).map((knight) => [knight.roll, knight]));
	const folders = new Map();
	for (const seer of seers) {
		if (!folders.has(seer.d6)) folders.set(seer.d6, { name: words.folder(seer.d6), documents: [] });
		folders.get(seer.d6).documents.push(seerActor(seer, knights.get(seer.roll) ?? null, words));
	}
	return [...folders.values()];
}
