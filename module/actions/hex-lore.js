import { loadArtIndex, mythEntry, seerEntry, sparkPageOf } from "../book-art/art-index.js";
import { postCard, t, warn } from "../chat/cards.js";
import {
	HEX_LORE_VERSION,
	HEX_PROMPT_MODES,
	arrivalSparkSet,
	forgetRecord,
	forgetSpark,
	normaliseHexLore,
	normaliseRecord,
	recordSpark,
	rollsOnArrival,
	setNote,
	sparkFromRoll,
	takenEntries,
	wildernessSparkSet
} from "../rules/hex-lore.js";
import { OMEN_COUNT, barriersAround, featureAt, hexSummary, holdingName } from "../rules/realm.js";
import { hexKey } from "../rules/realm-geometry.js";
import { SPARK_PAGES } from "../rules/spark-tables.js";
import { SYSTEM_ID } from "../system-id.js";
import { calendarLabel, getCalendar } from "./calendar.js";
import { hexFlagEditor } from "./hex-flags.js";
import { recordToldHex } from "./hex-shared.js";
import { getRealm, hexHiddenByHand, isRealmScene, sceneGeometry } from "./realm.js";
import { rollSpark } from "./referee-rolls.js";

/** The Scene flag holding what the GM has written about each hex of its Realm. */
export const HEX_LORE_FLAG = "hexLore";

/**
 * @param {{when?: object|null}} spark One kept in a hex.
 * @returns {string|null} When in the game it was rolled, as the hex's windows show it.
 */
export const sparkWhen = (spark) => (spark.when ? t("hexLore.when", { when: calendarLabel(spark.when) }) : null);

/**
 * What the Realm says stands in a hex, for GMs: its Holding, Myth, Landmark
 * and the Barriers on its sides, those the players haven't found marked so.
 * @param {Scene} scene
 * @param {object} realm The Realm as this GM may know it.
 * @param {object} g The Realm's geometry.
 * @param {{col: number, row: number}} hex
 * @param {object|null} index The art index, for the Myth's and Seer's names.
 * @param {{full?: boolean}} [options] Full also names a Seat and the Myth's number, and marks a Holding, Myth or Landmark the players haven't found.
 * @returns {string[]}
 */
export function hexFeatureLines(scene, realm, g, hex, index, { full = false } = {}) {
	const { holding, myth, landmark } = featureAt(realm, hex);
	const hand = full ? (hexHiddenByHand(scene, hex) ?? {}) : {};
	const hidden = (text, isHidden) => (full && isHidden ? t("realm.readout.hidden", { name: text }) : text);
	const lines = [];
	if (holding) {
		const name = holdingName(holding, t);
		lines.push(hidden(full && holding.seat ? t("realm.readout.seat", { name }) : name, hand.holding || hand.seat));
	}
	if (myth) {
		const { name, page } = mythEntry(index, myth);
		const seen = t("realm.panel.omensSeen", { omen: myth.omen ?? 0, count: OMEN_COUNT });
		const text = `${t("realm.panel.reference", { name, page })} — ${seen}`;
		lines.push(hidden(full ? `${t("realm.readout.myth", { number: myth.number })}: ${text}` : text, !myth.revealed));
	}
	if (landmark) {
		const named = landmark.name || t(`realm.landmarks.${landmark.type}`);
		const seer = landmark.seer && seerEntry(index, landmark.seer);
		lines.push(hidden(seer ? `${named} — ${t("realm.panel.reference", { name: seer.name, page: seer.page })}` : named, !landmark.revealed));
	}
	for (const barrier of barriersAround(realm, g, hex, { showHidden: true })) {
		const words = t("realm.readout.barrier", { direction: t(`realm.directions.${barrier.direction}`) });
		lines.push(barrier.revealed ? words : t("realm.readout.hidden", { name: words }));
	}
	return lines;
}

/** Whether the Lay of the Land opens on a hex the Company has just reached. */
const PROMPT_SETTING = "hexLorePrompt";

/** Whether a hex's land and one feature of it are rolled the first time the Company rests there. */
const FIRST_ARRIVAL_SETTING = "hexLoreFirstArrival";

/** Register what a hex the Company reaches opens for the GM, and what's rolled there. Called during init. */
export function registerHexLoreSettings() {
	game.settings.register(SYSTEM_ID, FIRST_ARRIVAL_SETTING, {
		name: "bastionland.hexLore.settings.firstArrival.name",
		hint: "bastionland.hexLore.settings.firstArrival.hint",
		// The world's, not each browser's: it writes to the hex, and one GM rolls.
		scope: "world",
		config: true,
		type: Boolean,
		default: true
	});
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

/**
 * Change what's recorded for hexes, in one write. GMs only.
 * @type {(scene: Scene, edit: (lore: object) => object) => Promise<boolean>}
 */
const editHexLore = hexFlagEditor({ flag: HEX_LORE_FLAG, version: HEX_LORE_VERSION, read: getHexLore });

/** Write what's in a hex, in the GM's own words. @returns {Promise<boolean>} */
export const writeHexNote = (scene, hex, note) => editHexLore(scene, (lore) => setNote(lore, hex, note));

/** Strike one roll out of a hex. @returns {Promise<boolean>} */
export const forgetHexSpark = (scene, hex, id) => editHexLore(scene, (lore) => forgetSpark(lore, hex, id));

/** Forget the note and every roll kept for a hex. @returns {Promise<boolean>} */
export const forgetHexRecord = (scene, hex) => editHexLore(scene, (lore) => forgetRecord(lore, hex));

/** Keep rolls in a hex in one write, however many there are. @returns {Promise<boolean>} */
export const keepHexSparkRecords = (scene, hex, sparks) => editHexLore(scene, (lore) => sparks.reduce((next, spark) => recordSpark(next, hex, spark), lore));

/** @returns {object|null} A roll on a table, ready to keep, dated now. */
const sparkNow = ({ page, table, results }) => sparkFromRoll({ page, table, results, id: foundry.utils.randomID(), when: getCalendar() });

/** @returns {Promise<object|null>} One page of Spark Tables the GM's own import read. */
const sparkPage = async (key) => sparkPageOf(await loadArtIndex(), key);

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
		const spark = sparkNow({ page, table, results });
		if (!spark) continue;
		sparks.push(spark);
		const taken = results.filter((result) => result.entry);
		cards.push({ name: table.name, reference: t("spark.tagline", { page: page.name, number: page.page }), prompt: spark.prompt, results: taken });
	}
	if (sparks.length) await keepHexSparkRecords(scene, hex, sparks);
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
 * Keep a roll already made on one Spark Table in a hex, with no card: the
 * Spark Tables window posts its own. GMs only.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}} options.hex
 * @param {object} options.page The page of Spark Tables, as the art index holds it.
 * @param {object} options.table
 * @param {{roll: number, entry: string|null}[]} options.results
 * @returns {Promise<boolean>} Whether anything was kept.
 */
export async function keepTableRoll({ scene, hex, page, table, results }) {
	if (!game.user.isGM || !isRealmScene(scene)) return false;
	const spark = sparkNow({ page, table, results });
	return spark ? keepHexSparkRecords(scene, hex, [spark]) : false;
}

/**
 * The tables a wilderness hex is rolled on: the first of each row of the
 * Nature page (p22), for the lay of the land, its weather, and one feature of it.
 * @returns {Promise<{page: object, set: {index: number, table: object}[]}|null>}
 *   Null, with a word to the GM, where Import PDF hasn't read them.
 */
export async function wildernessHexTables() {
	const page = await sparkPage(SPARK_PAGES[0].key);
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

/** Whether a missing Nature page has been mentioned yet, so the word is said once and not at every hex. */
let warnedArrivalSet = false;

/** @returns {boolean} Whether this browser rolls a hex the Company first rests in. */
export const rollsFirstArrivals = () =>
	Boolean(game.user.isGM && game.users?.activeGM?.isSelf && game.settings.get(SYSTEM_ID, FIRST_ARRIVAL_SETTING));

/**
 * Roll the land of a hex and one feature of it the first time the Company rests
 * there, and keep them, so the GM has the blanks filled as the Company arrives
 * (p19) and finds them unchanged when it comes back. Only the active GM rolls,
 * and only a Wilderness hex with nothing kept in it yet.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}} options.hex
 * @returns {Promise<object[]>} What was rolled, or nothing.
 */
export async function rollFirstArrival({ scene, hex }) {
	if (!rollsFirstArrivals() || !isRealmScene(scene)) return [];
	const holding = featureAt(getRealm(scene).realm, hex).holding;
	if (!rollsOnArrival({ record: getHexRecord(scene, hex), holding })) return [];
	const page = await sparkPage(SPARK_PAGES[0].key);
	const set = arrivalSparkSet(page);
	if (!set.length) {
		if (!warnedArrivalSet) warn("hexLore.setMissing");
		warnedArrivalSet = true;
		return [];
	}
	// Looked at again now the page is in, in case another arrival filled the hex meanwhile.
	if (getHexRecord(scene, hex)) return [];
	return rollInto(scene, hex, set.map(({ table }) => ({ page, table })));
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
	const roll = await throwForGms(Array.from({ length: count }, () => "1d12").join(" + "));
	return roll.dice.map((die) => die.total);
}

/**
 * Roll a formula where only the GMs see the dice, with no card.
 * @param {string} formula
 * @returns {Promise<Roll>}
 */
export async function throwForGms(formula) {
	const roll = await new Roll(formula).evaluate();
	const gms = game.users.filter((user) => user.isGM).map((user) => user.id);
	// Dice So Nice throws them on the GMs' screens; without it, the rattle alone.
	if (game.dice3d) game.dice3d.showForRoll(roll, game.user, true, gms);
	else foundry.audio.AudioHelper.play({ src: CONFIG.sounds.dice, autoplay: true, loop: false }, false);
	return roll;
}

/**
 * Tell the players what's in a hex. The card carries what the GM wrote and
 * nothing else of the Realm's: a Myth or Landmark still hidden can't ride out
 * in it, because the rest is built from what a player would see there anyway.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}} options.hex
 * @param {string} [options.note] What's in the note box now, saved first: a click
 *   straight from typing lands before the box's own change is written.
 * @param {boolean} [options.quiet] Tell without the "told" notification, for a caller telling many at once.
 * @returns {Promise<ChatMessage|null>}
 */
export async function tellPlayersAboutHex({ scene, hex, note, quiet = false }) {
	if (!game.user.isGM || !isRealmScene(scene)) return null;
	if (typeof note === "string" && note.trim() !== (getHexRecord(scene, hex)?.note ?? "")) {
		await writeHexNote(scene, hex, note);
	}
	const record = getHexRecord(scene, hex);
	if (!record?.note) {
		warn("hexLore.nothingToTell");
		return null;
	}
	const { realm } = getRealm(scene);
	const seen = hexSummary(realm, sceneGeometry(scene), hex, { showHidden: false, hiddenByHand: hexHiddenByHand(scene, hex) });
	const named = [
		seen.holding && holdingName(seen.holding, t),
		seen.landmark && (seen.landmark.name || t(`realm.landmarks.${seen.landmark.type}`))
	].filter(Boolean);
	const where = t("realm.hex", hex);
	const message = await postCard(null, "hex-lore", {
		hex: where,
		terrain: seen.terrain ? t(`realm.terrain.${seen.terrain}`) : null,
		features: named.length ? named.join(", ") : null,
		note: record.note
	}, { mode: "public" });
	if (message) {
		// The players keep what they were told, as it was told, beside their own record of the hex.
		try {
			await recordToldHex(scene, hex, { note: record.note, messageId: message.id });
		} catch (error) {
			console.error(`${SYSTEM_ID} | Couldn't keep what the players were told of ${where}`, error);
		}
		if (!quiet) ui.notifications.info(t("hexLore.told", { hex: where }));
	}
	return message;
}
