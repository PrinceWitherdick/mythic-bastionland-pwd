import { chooseDialog } from "../apps/ui.js";
import { loadArtIndex, mythEntry, seerEntry } from "../book-art/art-index.js";
import { postCard, t } from "../chat/cards.js";
import { OMEN_COUNT, REALM_FLAG, TERRAIN, terrainAt } from "../rules/realm.js";
import { hexAt, hexKey } from "../rules/realm-geometry.js";
import {
	WILDERNESS_MODES,
	companyHex,
	mythChoices,
	phaseEndCalls,
	wildernessOutcome,
	wildernessResult,
	wildernessSituation
} from "../rules/wilderness.js";
import { throwsOffCourse } from "../rules/landmarks.js";
import { cityOmenReplaces, worthyOfCityQuest } from "../rules/city-quest.js";
import { SYSTEM_ID } from "../system-id.js";
import { getCalendar } from "./calendar.js";
import { cityOmensSeen, rollCityOmen } from "./city-quest.js";
import { findCompanyToken } from "./company.js";
import { landmarkOfferView, nameLandmarkFromPrompt, strikeOffCourse } from "./landmarks.js";
import { getRealm, isRealmScene, sceneGeometry } from "./realm.js";

/**
 * Where the Company stands: the selected Tokens, or else every Token with a
 * player owner.
 * @param {Scene} scene
 * @param {object} g
 * @param {object} [options]
 * @param {boolean} [options.selected] Let the selected Tokens say, as a Referee acting on a hex does; off where nobody chose them.
 * @returns {{hex: object|null, split: boolean}}
 */
export function findCompany(scene, g, { selected: useSelected = true } = {}) {
	// One Token stands for the whole Company where the Realm has one (p7), so
	// there is nothing to work out and no way for the Company to be split.
	const company = findCompanyToken(scene);
	if (company) return { hex: hexAt(g, company.getCenterPoint()), split: false };

	const selected = useSelected && scene.id === canvas.scene?.id ? canvas.tokens.controlled.map((token) => token.document) : [];
	const tokens = selected.length ? selected : scene.tokens.filter((token) => token.actor?.hasPlayerOwner);
	return companyHex(tokens.map((token) => hexAt(g, token.getCenterPoint())));
}

/**
 * Where the Company stands, with a word to the Referee where nothing says so or
 * the Company is spread over more than one hex. Shared by everything that acts
 * on the hex the Company is in.
 * @param {Scene} scene
 * @param {object} g
 * @returns {{col: number, row: number}|null} Null when no Token says where they are.
 */
export function companyHexOrWarn(scene, g) {
	const company = findCompany(scene, g);
	if (!company.hex) {
		ui.notifications.warn(t("realm.wilderness.noToken"));
		return null;
	}
	if (company.split) ui.notifications.warn(t("realm.wilderness.split", { hex: t("realm.hex", company.hex) }));
	return company.hex;
}

/**
 * The Realm a command acts on, and where the Company stands in it. Everything
 * that acts on the Company's own hex begins here, so a Scene that is no Realm
 * and a Company with no Token on it are answered in the one place.
 * @param {Scene} scene
 * @param {{col: number, row: number}|null} [hex] Where to act, or the Company's own hex.
 * @returns {{realm: object, g: object, where: object}|null} Null with a word to the Referee.
 */
export function realmAndCompany(scene, hex = null) {
	if (!isRealmScene(scene)) {
		ui.notifications.warn(t("realm.wilderness.notRealm"));
		return null;
	}
	const g = sceneGeometry(scene);
	const where = hex ?? companyHexOrWarn(scene, g);
	if (!where) return null;
	return { realm: getRealm(scene).realm, g, where };
}

/**
 * The Realm the Company stands in, found without a word to anybody: the one on
 * the canvas, then the one the players are shown, then any other, each first
 * where the Company's own Token is.
 * @returns {Scene|null}
 */
function companyRealm() {
	const realms = [...new Set([canvas?.scene, game.scenes.active, ...game.scenes])].filter((scene) => scene && isRealmScene(scene));
	return realms.find((scene) => findCompanyToken(scene)) ?? realms.find((scene) => findCompany(scene, sceneGeometry(scene)).hex) ?? null;
}

/**
 * What's in and around the hex the Company stands in, found as quietly as
 * companyRealm finds its Realm.
 * @param {Scene|null} [scene] The Realm, when it's already known.
 * @returns {{scene: Scene, situation: ReturnType<typeof wildernessSituation>}|null} Null when no Realm shows where they are.
 */
export function companySituation(scene = null) {
	const realm = scene ?? companyRealm();
	if (!realm || !isRealmScene(realm)) return null;
	const g = sceneGeometry(realm);
	const { hex } = findCompany(realm, g);
	return hex ? { scene: realm, situation: wildernessSituation(getRealm(realm).realm, g, hex) } : null;
}

/**
 * Ask whether the Company ends a travelling Phase or makes camp.
 * @param {{col: number, row: number}} hex
 * @returns {Promise<"travel"|"camp"|null>}
 */
async function chooseMode(hex) {
	const choice = await chooseDialog({
		title: t("realm.wilderness.title"),
		icon: "fa-solid fa-tree",
		message: t("realm.wilderness.chooseMode", { hex: t("realm.hex", hex) }),
		buttons: [
			{ action: "travel", label: t("realm.wilderness.modes.travel"), icon: "fa-solid fa-person-hiking", default: true },
			{ action: "camp", label: t("realm.wilderness.modes.camp"), icon: "fa-solid fa-campground" }
		]
	});
	return WILDERNESS_MODES.includes(choice) ? choice : null;
}

/**
 * Make the Wilderness Roll (p18) for the Company's hex on a Realm Scene: roll,
 * reveal a Landmark that's found, count the Omen a Myth shows, and whisper the
 * GMs what happened. GMs only.
 * @param {object} [options]
 * @param {Scene} [options.scene] The Realm. Defaults to the Scene on the canvas.
 * @param {{col: number, row: number}} [options.hex] Where the Company is. Defaults to where its Tokens stand.
 * @param {string|null} [options.phase] The Phase ending, when the roll is offered as it ends.
 * @param {"travel"|"camp"|null} [options.mode] How the Company spent the Phase, when the Referee
 *   has already said: then nothing more is asked.
 * @param {boolean} [options.atBarrier] The Phase was wasted trying to cross a Barrier.
 * @returns {Promise<object|null>} The outcome, or null when nothing was rolled.
 */
export async function wildernessRoll({ scene = canvas.scene, hex = null, phase = null, mode: known = null, atBarrier = false } = {}) {
	if (!game.user.isGM) return null;
	const place = realmAndCompany(scene, hex);
	if (!place) return null;
	const { realm, g, where } = place;

	const around = wildernessSituation(realm, g, where);
	// A Phase wasted at a Barrier was spent out at it, so it still causes the roll even setting out from a Holding (p18).
	const situation = atBarrier ? { ...around, holding: null } : around;
	const calls = phaseEndCalls(situation);
	// A Phase ending in a Holding passes with no word, since a Holding isn't Wilderness.
	if (phase && calls === "none") return null;
	const rolls = [];
	let mode = known ?? "travel";
	let d6 = null;
	let pick = 0;
	// A Company worthy of the City Quest meets an Omen of the City in place of a random Myth's (p172).
	let city = false;
	if (calls === "roll") {
		mode = known ?? (await chooseMode(where));
		if (!mode) return null;
		const roll = await new Roll("1d6").evaluate();
		rolls.push(roll);
		d6 = roll.total;

		const result = wildernessResult(d6, { mode, hasLandmark: Boolean(situation.landmark), hasMyths: realm.myths.length > 0 });
		city = cityOmenReplaces(result, worthyOfCityQuest(game.actors), cityOmensSeen());
		const choices = city ? 1 : mythChoices(realm, situation, result);
		if (choices > 1) {
			const choice = await new Roll(`1d${choices}`).evaluate();
			rolls.push(choice);
			pick = choice.total - 1;
		}
	}
	const rolled = wildernessOutcome(realm, situation, { mode, d6, pick });
	// No Myth's Omen is spent when the City's stands in for it.
	const outcome = city ? { result: rolled.result, d6: rolled.d6 } : rolled;
	const index = loadArtIndex();

	const updates = [];
	if (outcome.myth && !outcome.complete) updates.push({ _id: outcome.myth.id, [`flags.${SYSTEM_ID}.${REALM_FLAG}.omen`]: outcome.omen });
	const revealLandmark = outcome.result === "landmark" && !outcome.landmark.revealed;
	if (revealLandmark) updates.push({ _id: outcome.landmark.id, hidden: false });
	if (updates.length) await scene.updateEmbeddedDocuments("Tile", updates);
	// A Landmark met for the first time takes its name from a prompt of the book's (p14).
	const named = outcome.result === "landmark" ? await nameLandmarkFromPrompt(scene, outcome.landmark) : null;
	if (named) outcome.landmark = { ...outcome.landmark, name: named.name };

	const calendar = getCalendar();
	// A Curse throws the Company off course, so the next travelling Phase is blind (p14).
	if (outcome.landmark && throwsOffCourse(outcome.landmark.type)) await strikeOffCourse(calendar);

	const winter = calendar.season === "winter";
	await postCard(null, "wilderness", cardContext({ index: await index, realm, g, where, mode, outcome, revealLandmark, winter, scene, city, named }), { rolls, mode: "gm" });
	if (city) await rollCityOmen();
	return outcome;
}

/**
 * @returns {object} What the Wilderness card shows.
 */
function cardContext({ index, realm, g, where, mode, outcome, revealLandmark, winter, scene, city, named }) {
	const terrain = terrainAt(realm, g, where);

	let myth = null;
	if (outcome.myth) {
		const { name, page, entry } = mythEntry(index, outcome.myth);
		myth = {
			number: outcome.myth.number,
			name,
			page,
			img: entry?.path ?? null,
			complete: outcome.complete,
			omen: t("realm.wilderness.omen", { omen: outcome.omen, count: OMEN_COUNT }),
			omenText: outcome.complete ? null : entry?.omens?.[outcome.omen - 1] ?? null
		};
	}

	let landmark = null;
	if (outcome.landmark) {
		const { type, name, seer, hex } = outcome.landmark;
		let seerLine = null;
		if (seer) {
			const reference = seerEntry(index, seer);
			seerLine = t("realm.wilderness.seer", { seer: reference.name, page: reference.page });
		}
		landmark = {
			type: t(`realm.landmarks.${type}`),
			name: name || null,
			seer: seerLine,
			promptFrom: named ? t("realm.landmarks.promptFrom", { myth: named.myth, page: named.page }) : null,
			key: hexKey(hex),
			revealed: revealLandmark,
			// What this sort of Landmark asks of the travellers who found it (p14).
			...landmarkOfferView(type)
		};
	}

	return {
		// A Ruin's echo reads the Myths of the Realm the roll was made for, whichever Scene is on the canvas.
		scene: scene?.id ?? null,
		hex: t("realm.hex", where),
		terrain: terrain ? t(`realm.terrain.${TERRAIN[terrain - 1]}`) : null,
		mode: outcome.d6 === null ? null : t(`realm.wilderness.modes.${mode}`),
		d6: outcome.d6,
		result: t(`realm.wilderness.results.${outcome.result}`),
		myth,
		tied: outcome.tied ? t("realm.wilderness.tied", { numbers: outcome.tied.map((tied) => tied.number).join(", ") }) : null,
		landmark,
		// A Company worthy of the City Quest meets an Omen of the City in place of a random Myth's (p172).
		cityQuest: city ? t("cityQuest.wildernessHint") : null,
		winter: winter ? t("time.winterReminder") : null
	};
}
