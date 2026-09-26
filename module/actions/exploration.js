import { inputDialog } from "../apps/ui.js";
import { loadArtIndex, mythEntry } from "../book-art/art-index.js";
import { keyChoices, postCard, t } from "../chat/cards.js";
import {
	FOLK_SOURCES,
	SEARCH_AIMS,
	SEARCH_SAVE_AIM,
	barriersSeen,
	folkloreFrom,
	folkloreToMark,
	surveyFrom
} from "../rules/exploration.js";
import { directionNames, sameHex } from "../rules/realm-geometry.js";
import { VIRTUES, typedD20 } from "../rules/virtues.js";
import { isRealmScene } from "./realm.js";
import { rollLabelledSave } from "./saves.js";
import { advancePhase } from "./time.js";
import { realmAndCompany } from "./wilderness.js";

/**
 * Exploration (p19): asking the people of a Realm what they know, spending a
 * Phase searching a Hex, and taking in the land from a vantage point. The rules
 * themselves are in rules/exploration.js; here they are asked for, rolled,
 * whispered to the Referee, and marked on the players' map.
 */

/**
 * @param {object} g The Realm's geometry, which says what each way out of a hex is called.
 * @param {number|null} direction An index into directionNames.
 */
const directionName = (g, direction) => (direction === null ? null : t(`realm.directions.${directionNames(g)[direction]}`));

/**
 * How far off something lies, as a teller would put it.
 * @param {object} g
 * @param {{distance: number, direction: number|null, here: boolean}} known
 * @returns {string}
 */
function whereItLies(g, { distance, direction, here }) {
	if (here) return t("explore.here");
	const where = directionName(g, direction);
	return t(distance === 1 ? "explore.awayOne" : "explore.away", { distance, direction: where });
}

/**
 * Gathering Folklore (p19): ask a Vassal, a roamer or a Seer what they know of
 * the Realm's Myths and Landmarks, and whisper the Referee what this one can
 * tell. Such vast knowledge isn't given freely, which is left to the table.
 * GMs only.
 * @param {object} [options]
 * @param {Scene} [options.scene]
 * @param {{col: number, row: number}} [options.hex] Where they're asked. The Company's hex by default.
 * @returns {Promise<object|null>} What they know, or null when nobody was asked.
 */
export async function gatherFolklore({ scene = canvas.scene, hex = null } = {}) {
	if (!game.user.isGM) return null;
	const place = realmAndCompany(scene, hex);
	if (!place) return null;
	const { realm, g, where } = place;

	const data = await inputDialog({
		title: t("explore.folklore.title"),
		icon: "fa-solid fa-comments",
		template: "folklore",
		context: {
			intro: t("explore.folklore.intro", { hex: t("realm.hex", where) }),
			sources: keyChoices(FOLK_SOURCES, "explore.folklore.sources")
		},
		ok: { label: t("explore.folklore.ask"), icon: "fa-solid fa-comments" }
	});
	if (!data || !FOLK_SOURCES.includes(data.source)) return null;

	// A teller who might name any of several Myths names one of them at random.
	const rolls = [];
	let folklore = folkloreFrom(realm, g, { source: data.source, home: where });
	const choices = folklore?.mythChoices ?? 0;
	if (choices > 1) {
		const roll = await new Roll(`1d${choices}`).evaluate();
		rolls.push(roll);
		// Only a die that fell on another Myth is worth reading the Realm again for.
		if (roll.total > 1) folklore = folkloreFrom(realm, g, { source: data.source, home: where, pick: roll.total - 1 });
	}

	const index = await loadArtIndex();
	const mark = folkloreToMark(folklore);
	const ids = [...mark.myths, ...mark.landmarks].map((known) => idOf(realm, known)).filter(Boolean);

	await postCard(null, "folklore", {
		scene: scene?.id ?? null,
		title: t("explore.folklore.title"),
		source: t(`explore.folklore.sources.${folklore.source}.label`),
		hex: t("realm.hex", where),
		myths: folklore.myths.map((known) => {
			const myth = realm.myths.find((candidate) => candidate.number === known.number);
			const { name, page } = myth ? mythEntry(index, myth) : { name: null, page: null };
			return {
				number: known.number,
				name,
				page,
				where: known.precise ? t("explore.folklore.precise", { hex: t("realm.hex", known.hex), where: whereItLies(g, known) }) : whereItLies(g, known)
			};
		}),
		landmarks: folklore.landmarks.map((known) => ({
			type: t(`realm.landmarks.${known.type}`),
			name: known.name || null,
			where: t("explore.folklore.at", { hex: t("realm.hex", known.hex), where: whereItLies(g, known) })
		})),
		nothing: folklore.myths.length || folklore.landmarks.length ? null : t("explore.folklore.nothing"),
		rumours: folklore.rumours ? t("explore.folklore.rumours") : null,
		secrets: folklore.secrets ? t("explore.folklore.secrets") : null,
		mark: ids.length ? { label: t("explore.mark"), ids: ids.join(",") } : null
	}, { rolls, mode: "gm" });
	return folklore;
}

/**
 * The Tile a Myth or Landmark was drawn as, so the players' map can be marked.
 * @param {object} realm
 * @param {object} known From a Folklore.
 * @returns {string|null}
 */
function idOf(realm, known) {
	if (!known.number) return featureId(realm.landmarks, known.hex, known.type);
	return realm.myths.find((myth) => myth.number === known.number)?.id ?? null;
}

/**
 * Searching (p19): a whole Phase spent sweeping the Hex, searching it for
 * something known to be there, or reaching a vantage point. A search for
 * something known is a normal action, so the Company says who rolls and in
 * which Virtue. GMs only.
 * @param {object} [options]
 * @param {Scene} [options.scene]
 * @param {{col: number, row: number}} [options.hex]
 * @returns {Promise<string|null>} The aim searched for, or null when nothing was.
 */
export async function searchTheHex({ scene = canvas.scene, hex = null } = {}) {
	if (!game.user.isGM) return null;
	const place = realmAndCompany(scene, hex);
	if (!place) return null;
	const { realm, g, where } = place;

	const knights = game.actors.filter((actor) => actor.type === "knight" && actor.system?.virtues);
	const data = await inputDialog({
		title: t("explore.search.title"),
		icon: "fa-solid fa-magnifying-glass",
		template: "search-hex",
		context: {
			intro: t("explore.search.intro", { hex: t("realm.hex", where) }),
			aims: keyChoices(SEARCH_AIMS, "explore.search.aims"),
			knights: knights.map((knight, index) => ({ id: knight.id, name: knight.name, selected: index === 0 })),
			virtues: VIRTUES.map((key) => ({
				key,
				label: t(`virtues.${key}.label`),
				hint: t(`travelRules.sections.saves.lines.${key}.text`),
				selected: key === "cla"
			}))
		},
		ok: { label: t("explore.search.ok"), icon: "fa-solid fa-magnifying-glass" }
	});
	if (!data || !SEARCH_AIMS.includes(data.aim)) return null;

	if (data.aim === SEARCH_SAVE_AIM) await rollExplorationSave(knights.find((knight) => knight.id === data.who), data.virtue, data.what, typedD20(data.rolled));
	else await postSurvey({ scene, realm, g, where, vantage: data.aim === "vantage" });

	// Each of the three takes a whole Phase of the day, unless the Referee says otherwise.
	if (data.phase) await advancePhase();
	return data.aim;
}

/**
 * Vision (p19): what a Company at a vantage point can make out of the Hex it
 * stands in and the land around it. Takes no Phase of its own, since the
 * search that found the vantage point spent one. GMs only.
 * @param {object} [options]
 * @param {Scene} [options.scene]
 * @param {{col: number, row: number}} [options.hex]
 * @returns {Promise<object|null>}
 */
export async function lookFromVantage({ scene = canvas.scene, hex = null } = {}) {
	if (!game.user.isGM) return null;
	const place = realmAndCompany(scene, hex);
	if (!place) return null;
	return postSurvey({ ...place, scene, vantage: true });
}

/**
 * The three things the Company can do where it stands when it stops and looks
 * about (p19), each under the key a button carries. The Travel panel and a
 * hex's own window both offer them, so they're named in one place.
 */
export const EXPLORATION_ACTS = Object.freeze({
	folklore: gatherFolklore,
	search: searchTheHex,
	vantage: lookFromVantage
});

/**
 * Do whichever of them a button names. Exploring is the Referee's to carry out,
 * and each of the three says so again for itself.
 * @param {string} act One of EXPLORATION_ACTS' keys.
 * @param {object} [where]
 * @param {Scene} [where.scene] The Realm, or the one on the canvas.
 * @param {{col: number, row: number}} [where.hex] The hex, or the Company's own.
 * @returns {Promise<object|null>|null} Null for a key that names none of them.
 */
export function takeExplorationAct(act, { scene, hex } = {}) {
	return EXPLORATION_ACTS[act]?.({ scene, hex }) ?? null;
}

/**
 * Whisper the Referee what a sweep or a vantage point shows, with what can be
 * marked on the players' map.
 * @returns {Promise<object>} The survey.
 */
async function postSurvey({ scene, realm, g, where, vantage }) {
	const survey = surveyFrom(realm, g, where, { vantage });
	const { here } = survey;
	const landmark = here.landmark;
	const barriers = barriersSeen(survey);
	// A vantage point shows the Barriers hemming the Hex in, and a sweep the
	// Landmark the Hex holds. Neither hands over what hides in the hexes around.
	const ids = [
		...(landmark && !landmark.revealed ? [featureId(realm.landmarks, here.hex, landmark.type)] : []),
		...realm.barriers.filter((barrier) => !barrier.revealed && barriers.includes(barrier.edge)).map((barrier) => barrier.id)
	].filter(Boolean);

	await postCard(null, "survey", {
		scene: scene?.id ?? null,
		title: t(vantage ? "explore.survey.vantageTitle" : "explore.survey.sweepTitle"),
		hex: t("realm.hex", here.hex),
		terrain: here.terrain ? t(`realm.terrain.${here.terrain}`) : null,
		holding: here.holding ? t(here.holding.seat ? "explore.survey.seat" : "explore.survey.holding", { name: here.holding.name || t(`realm.holdings.${here.holding.style}`) }) : null,
		myth: here.myth ? t("explore.survey.myth", { number: here.myth.number }) : null,
		landmark: landmark ? t("explore.survey.landmark", { type: t(`realm.landmarks.${landmark.type}`), name: landmark.name || "" }).trim() : null,
		around: survey.around.map((step) => ({
			direction: directionName(g, step.direction),
			hex: t("realm.hex", step.hex),
			terrain: step.terrain ? t(`realm.terrain.${step.terrain}`) : t("explore.survey.unknownLand"),
			barrier: step.barrier ? t("explore.survey.barrier") : null,
			holding: step.holding ? t("explore.survey.someHolding") : null
		})),
		hint: t(vantage ? "explore.survey.vantageHint" : "explore.survey.sweepHint"),
		mark: ids.length ? { label: t("explore.mark"), ids: ids.join(",") } : null
	}, { mode: "gm" });
	return survey;
}

/**
 * @param {object[]} landmarks
 * @param {{col: number, row: number}} hex
 * @param {string} type
 * @returns {string|null} The Tile the Landmark was drawn as.
 */
const featureId = (landmarks, hex, type) =>
	landmarks.find((landmark) => sameHex(landmark.hex, hex) && landmark.type === type)?.id ?? null;

/**
 * A search for something known to be there is a normal action (p16), so it
 * calls for a Save in the Virtue the Company chooses. Failure doesn't
 * necessarily lose them the goal: it puts something in the way (p19).
 * @param {Actor|undefined} actor
 * @param {string} virtue
 * @param {string} what What they're searching for, as the Referee wrote it.
 * @param {number|null} [rolled] The d20 when the player rolled it at the table.
 * @returns {Promise<object|null>}
 */
async function rollExplorationSave(actor, virtue, what, rolled = null) {
	if (!actor || !VIRTUES.includes(virtue)) {
		ui.notifications.warn(t("explore.search.noOne"));
		return null;
	}
	return rollLabelledSave(actor, virtue, {
		label: t("explore.search.saveTitle"),
		outcome: String(what ?? "").trim() || t("explore.search.searching"),
		hint: ({ passed }) => t(passed ? "explore.search.found" : "explore.search.obstacle")
	}, { rolled });
}

/**
 * Show the players what the Company was told or saw: the Myths, Landmarks and
 * Barriers named are drawn on their copy of the map. A Myth or a Landmark is a
 * Tile and a Barrier is a Drawing (module/rules/realm-documents.js), so each id
 * is looked for in both collections rather than the Tiles alone. GMs only.
 * @param {Scene} scene
 * @param {string[]} ids Tile and Drawing ids.
 * @returns {Promise<number>} How many were marked.
 */
export async function markOnPlayersMap(scene, ids) {
	if (!game.user.isGM || !isRealmScene(scene)) return 0;
	let marked = 0;
	for (const [type, collection] of [["Tile", scene.tiles], ["Drawing", scene.drawings]]) {
		const updates = ids
			.map((id) => collection?.get(id))
			.filter((drawn) => drawn?.hidden)
			.map((drawn) => ({ _id: drawn.id, hidden: false }));
		if (!updates.length) continue;
		await scene.updateEmbeddedDocuments(type, updates);
		marked += updates.length;
	}
	ui.notifications.info(t(marked ? "explore.marked" : "explore.markedNothing", { count: marked }));
	return marked;
}
