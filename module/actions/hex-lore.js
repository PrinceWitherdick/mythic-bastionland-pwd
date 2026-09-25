import { loadArtIndex } from "../book-art/art-index.js";
import { postCard, t, warn } from "../chat/cards.js";
import {
	HEX_LORE_VERSION,
	HEX_PROMPT_MODES,
	forgetSpark,
	normaliseHexLore,
	normaliseRecord,
	recordSpark,
	setNote,
	takenEntries,
	wildernessSparkSet
} from "../rules/hex-lore.js";
import { hexSummary } from "../rules/realm.js";
import { hexKey } from "../rules/realm-geometry.js";
import { SPARK_PAGES } from "../rules/spark-tables.js";
import { serialWrites } from "../rules/queue.js";
import { SYSTEM_ID } from "../system-id.js";
import { getCalendar } from "./calendar.js";
import { getRealm, hexHiddenByHand, isRealmScene, sceneGeometry } from "./realm.js";
import { rollSpark } from "./referee-rolls.js";

/** The Scene flag holding what the GM has written about each hex of its Realm. */
export const HEX_LORE_FLAG = "hexLore";

/** Whether the Lay of the Land opens on a hex the Company has just reached. */
const PROMPT_SETTING = "hexLorePrompt";

/** Register what a hex the Company reaches opens for the GM. Called during init. */
export function registerHexLoreSettings() {
	game.settings.register(SYSTEM_ID, PROMPT_SETTING, {
		name: "bastionland.hexLore.settings.prompt.name",
		hint: "bastionland.hexLore.settings.prompt.hint",
		scope: "client",
		config: true,
		type: String,
		default: "open",
		// Settings are registered before the language files are ready, so these are keys for Foundry to localize.
		choices: Object.fromEntries(HEX_PROMPT_MODES.map((mode) => [mode, `bastionland.hexLore.settings.prompt.modes.${mode}`]))
	});
}

/** @returns {"never"|"open"} */
export function hexLorePromptMode() {
	const mode = game.settings.get(SYSTEM_ID, PROMPT_SETTING);
	return HEX_PROMPT_MODES.includes(mode) ? mode : "open";
}

/**
 * What the GM has written about a Realm's hexes.
 * @param {Scene|null} scene
 * @returns {import("../rules/hex-lore.js").HexLore} An empty store for a Scene that isn't a Realm.
 */
export function getHexLore(scene) {
	return normaliseHexLore(isRealmScene(scene) ? scene.getFlag(SYSTEM_ID, HEX_LORE_FLAG) : null);
}

/**
 * What's written about one hex. Reads that hex's record alone, since the panel
 * asks for it on every draw and a fully explored Realm holds 144 of them.
 * @param {Scene|null} scene
 * @param {{col: number, row: number}} hex
 * @returns {import("../rules/hex-lore.js").HexRecord|null}
 */
export function getHexRecord(scene, hex) {
	if (!isRealmScene(scene)) return null;
	return normaliseRecord(scene.getFlag(SYSTEM_ID, HEX_LORE_FLAG)?.hexes?.[hexKey(hex)]);
}

/** Hex lore writes, taken one at a time. */
const queueHexWrite = serialWrites();

/** @returns {string} An update path into the flag. */
const flagPath = (...parts) => `flags.${SYSTEM_ID}.${HEX_LORE_FLAG}.${parts.join(".")}`;

/**
 * Change what's recorded for one hex, writing that hex's own path so a change
 * to another hex, or to the Realm itself, isn't written over. GMs only.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {(lore: object) => object} edit
 * @returns {Promise<boolean>} Whether anything was written.
 */
export function editHexLore(scene, hex, edit) {
	if (!game.user.isGM || !isRealmScene(scene)) return Promise.resolve(false);
	return queueHexWrite(async () => {
		const lore = getHexLore(scene);
		const next = edit(lore);
		if (next === lore) return false;
		const key = hexKey(hex);
		const record = next.hexes[key] ?? null;
		await scene.update({
			[flagPath("version")]: HEX_LORE_VERSION,
			// A hex forgotten is a key taken out, rather than an empty record left behind.
			...(record ? { [flagPath("hexes", key)]: record } : { [flagPath("hexes", `-=${key}`)]: null })
		});
		return true;
	});
}

/** Write what's in a hex, in the GM's own words. @returns {Promise<boolean>} */
export const writeHexNote = (scene, hex, note) => editHexLore(scene, hex, (lore) => setNote(lore, hex, note));

/** Strike one roll out of a hex. @returns {Promise<boolean>} */
export const forgetHexSpark = (scene, hex, id) => editHexLore(scene, hex, (lore) => forgetSpark(lore, hex, id));

/** @returns {Promise<object[]>} The Spark Tables the GM's own import read, or an empty list. */
const sparkPages = async () => (await loadArtIndex())?.spark ?? [];

/**
 * Keep what was taken from each table in the hex, and whisper the GMs one card
 * for the lot.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {{page: object, table: object, results: {column: string, roll: number, entry: string|null}[]}[]} made
 * @param {Roll[]} [rolls] The dice behind them, for the card to carry.
 * @returns {Promise<object[]>} What was kept.
 */
async function keepSparks(scene, hex, made, rolls = []) {
	const cards = [];
	const sparks = [];
	for (const { page, table, results } of made) {
		const taken = results.filter((result) => result.entry);
		if (!taken.length) continue;
		const prompt = taken.map(({ entry }) => entry).join(" ");
		sparks.push({
			id: foundry.utils.randomID(),
			page: page.key,
			table: table.name,
			rolls: taken.map((result) => result.roll),
			entries: taken.map((result) => result.entry),
			prompt,
			when: getCalendar()
		});
		cards.push({ name: table.name, reference: t("spark.tagline", { page: page.name, number: page.page }), prompt, results: taken });
	}
	// Keeping them takes one write, however many there are.
	if (sparks.length) await editHexLore(scene, hex, (lore) => sparks.reduce((next, spark) => recordSpark(next, hex, spark), lore));
	if (cards.length) await postCard(null, "hex-sparks", { hex: t("realm.hex", hex), sparks: cards }, { rolls, mode: "gm" });
	return cards;
}

/**
 * Roll each table given, keep every roll in the hex, and whisper the GMs one
 * card for the lot.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {{page: object, table: object}[]} chosen
 * @returns {Promise<object[]>} What was rolled.
 */
async function rollInto(scene, hex, chosen) {
	const rolls = [];
	const made = [];
	// The dice are thrown one table at a time, so they land in the order the card reads.
	for (const { page, table } of chosen) {
		const { roll, results } = await rollSpark(table);
		rolls.push(roll);
		made.push({ page, table, results });
	}
	return keepSparks(scene, hex, made, rolls);
}

/**
 * Roll one Spark Table for a hex and keep it there. GMs only.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}} options.hex
 * @param {string} options.page One of SPARK_PAGES' keys.
 * @param {number} options.index Where the table stands on that page.
 * @returns {Promise<object[]>}
 */
export async function rollHexSpark({ scene, hex, page: key, index }) {
	if (!game.user.isGM || !isRealmScene(scene)) return [];
	const page = (await sparkPages()).find((candidate) => candidate.key === key);
	const table = page?.tables?.[index];
	if (!table) return [];
	return rollInto(scene, hex, [{ page, table }]);
}

/**
 * The tables a wilderness hex is rolled on: the first of each row of the
 * Nature page (p22), for the lay of the land, its weather, and one feature of it.
 * @returns {Promise<{page: object, set: {index: number, table: object}[]}|null>}
 *   Null, with a word to the GM, where Import PDF hasn't read them.
 */
export async function wildernessHexTables() {
	const page = (await sparkPages()).find((candidate) => candidate.key === SPARK_PAGES[0].key);
	const set = wildernessSparkSet(page);
	if (set.length) return { page, set };
	warn("hexLore.setMissing");
	return null;
}

/**
 * Roll a wilderness hex in one go, keeping every roll. GMs only.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}} options.hex
 * @returns {Promise<object[]>}
 */
export async function rollHexSparkSet({ scene, hex }) {
	if (!game.user.isGM || !isRealmScene(scene)) return [];
	const tables = await wildernessHexTables();
	if (!tables) return [];
	return rollInto(scene, hex, tables.set.map(({ table }) => ({ page: tables.page, table })));
}

/**
 * Keep the entries the GM took from the wilderness tables, by dice or by hand. GMs only.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}} options.hex
 * @param {object} options.page The Nature page, as wildernessHexTables gave it.
 * @param {{table: object, rows: (number|null)[]}[]} options.taken The row taken in each column, from 1.
 * @returns {Promise<object[]>} What was kept.
 */
export async function keepHexSparks({ scene, hex, page, taken }) {
	if (!game.user.isGM || !isRealmScene(scene)) return [];
	return keepSparks(scene, hex, taken.map(({ table, rows }) => ({ page, table, results: takenEntries(table, rows) })));
}

/**
 * Throw a d12 for each column asked for where only the GMs see them, with no
 * card: what they land on is only a suggestion until it's kept.
 * @param {number} count
 * @returns {Promise<number[]>} One d12 for each column.
 */
export async function throwSparkDice(count) {
	const roll = await new Roll(Array.from({ length: count }, () => "1d12").join(" + ")).evaluate();
	const gms = game.users.filter((user) => user.isGM).map((user) => user.id);
	// Dice So Nice throws them on the GMs' screens; without it, the rattle alone.
	if (game.dice3d) game.dice3d.showForRoll(roll, game.user, true, gms);
	else foundry.audio.AudioHelper.play({ src: CONFIG.sounds.dice, autoplay: true, loop: false }, false);
	return roll.dice.map((die) => die.total);
}

/**
 * Tell the players what's in a hex. The card carries what the GM wrote and
 * nothing else of the Realm's: a Myth or Landmark still hidden can't ride out
 * in it, because the rest is built from what a player would see there anyway.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}} options.hex
 * @returns {Promise<ChatMessage|null>}
 */
export async function tellPlayersAboutHex({ scene, hex }) {
	if (!game.user.isGM || !isRealmScene(scene)) return null;
	const record = getHexRecord(scene, hex);
	if (!record?.note) {
		warn("hexLore.nothingToTell");
		return null;
	}
	const { realm } = getRealm(scene);
	const seen = hexSummary(realm, sceneGeometry(scene), hex, { showHidden: false, hiddenByHand: hexHiddenByHand(scene, hex) });
	const named = [
		seen.holding && (seen.holding.name || t(`realm.holdings.${seen.holding.style}`)),
		seen.landmark && (seen.landmark.name || t(`realm.landmarks.${seen.landmark.type}`))
	].filter(Boolean);
	return postCard(null, "hex-lore", {
		hex: t("realm.hex", hex),
		terrain: seen.terrain ? t(`realm.terrain.${seen.terrain}`) : null,
		features: named.length ? named.join(", ") : null,
		note: record.note
	}, { mode: "public" });
}
