import { loadArtIndex, mythEntry, seerEntry } from "../book-art/art-index.js";
import { postCard, t } from "../chat/cards.js";
import { OMEN_COUNT, REALM_FLAG, TERRAIN, terrainAt } from "../rules/realm.js";
import { hexAt } from "../rules/realm-geometry.js";
import {
	companyHex,
	mythChoices,
	needsWildernessRoll,
	wildernessOutcome,
	wildernessResult,
	wildernessSituation
} from "../rules/wilderness.js";
import { throwsOffCourse } from "../rules/landmarks.js";
import { SYSTEM_ID } from "../system-id.js";
import { getCalendar } from "./calendar.js";
import { findCompanyToken } from "./company.js";
import { landmarkOfferView, strikeOffCourse } from "./landmarks.js";
import { getRealm, isRealmScene, sceneGeometry } from "./realm.js";

/**
 * Where the Company stands: the selected Tokens, or else every Token with a
 * player owner.
 * @param {Scene} scene
 * @param {object} g
 * @returns {{hex: object|null, split: boolean}}
 */
export function findCompany(scene, g) {
	// One Token stands for the whole Company where the Realm has one (p7), so
	// there is nothing to work out and no way for the Company to be split.
	const company = findCompanyToken(scene);
	if (company) return { hex: hexAt(g, company.getCenterPoint()), split: false };

	const selected = scene.id === canvas.scene?.id ? canvas.tokens.controlled.map((token) => token.document) : [];
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

/** @returns {boolean} Whether any player's Knight is a Knight-Radiant, worthy of the City Quest. */
const worthyOfCityQuest = () => game.actors.some((actor) => actor.type === "knight" && actor.hasPlayerOwner && actor.system.rank === "radiant");

/**
 * Ask whether the Company ends a travelling Phase or makes camp.
 * @param {{col: number, row: number}} hex
 * @returns {Promise<"travel"|"camp"|null>}
 */
async function chooseMode(hex) {
	const choice = await foundry.applications.api.DialogV2.wait({
		window: { title: t("realm.wilderness.title"), icon: "fa-solid fa-tree" },
		classes: ["bastionland-dialog"],
		content: `<p>${t("realm.wilderness.chooseMode", { hex: t("realm.hex", hex) })}</p>`,
		buttons: [
			{ action: "travel", label: t("realm.wilderness.modes.travel"), icon: "fa-solid fa-person-hiking", default: true },
			{ action: "camp", label: t("realm.wilderness.modes.camp"), icon: "fa-solid fa-campground" }
		],
		rejectClose: false
	});
	return choice === "travel" || choice === "camp" ? choice : null;
}

/**
 * Make the Wilderness Roll (p18) for the Company's hex on a Realm Scene: roll,
 * reveal a Landmark that's found, count the Omen a Myth shows, and whisper the
 * GMs what happened. GMs only.
 * @param {object} [options]
 * @param {Scene} [options.scene] The Realm. Defaults to the Scene on the canvas.
 * @param {{col: number, row: number}} [options.hex] Where the Company is. Defaults to where its Tokens stand.
 * @returns {Promise<object|null>} The outcome, or null when nothing was rolled.
 */
export async function wildernessRoll({ scene = canvas.scene, hex = null } = {}) {
	if (!game.user.isGM) return null;
	const place = realmAndCompany(scene, hex);
	if (!place) return null;
	const { realm, g, where } = place;

	const situation = wildernessSituation(realm, where);
	const rolls = [];
	let mode = "travel";
	let d6 = null;
	let pick = 0;
	if (needsWildernessRoll(situation)) {
		mode = await chooseMode(where);
		if (!mode) return null;
		const roll = await new Roll("1d6").evaluate();
		rolls.push(roll);
		d6 = roll.total;

		const result = wildernessResult(d6, { mode, hasLandmark: Boolean(situation.landmark), hasMyths: realm.myths.length > 0 });
		const choices = mythChoices(realm, situation, result);
		if (choices > 1) {
			const choice = await new Roll(`1d${choices}`).evaluate();
			rolls.push(choice);
			pick = choice.total - 1;
		}
	}
	const outcome = wildernessOutcome(realm, situation, { mode, d6, pick });
	const index = loadArtIndex();

	const updates = [];
	if (outcome.myth && !outcome.complete) updates.push({ _id: outcome.myth.id, [`flags.${SYSTEM_ID}.${REALM_FLAG}.omen`]: outcome.omen });
	const revealLandmark = outcome.result === "landmark" && !outcome.landmark.revealed;
	if (revealLandmark) updates.push({ _id: outcome.landmark.id, hidden: false });
	if (updates.length) await scene.updateEmbeddedDocuments("Tile", updates);

	const calendar = getCalendar();
	// A Curse throws the Company off course, so the next travelling Phase is blind (p14).
	if (outcome.landmark && throwsOffCourse(outcome.landmark.type)) await strikeOffCourse(calendar);

	const winter = calendar.season === "winter";
	await postCard(null, "wilderness", cardContext({ index: await index, realm, g, where, mode, outcome, revealLandmark, winter, scene }), { rolls, mode: "gm" });
	return outcome;
}

/**
 * @returns {object} What the Wilderness card shows.
 */
function cardContext({ index, realm, g, where, mode, outcome, revealLandmark, winter, scene }) {
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
		const { type, name, seer } = outcome.landmark;
		let seerLine = null;
		if (seer) {
			const reference = seerEntry(index, seer);
			seerLine = t("realm.wilderness.seer", { seer: reference.name, page: reference.page });
		}
		landmark = {
			type: t(`realm.landmarks.${type}`),
			name: name || null,
			seer: seerLine,
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
		cityQuest: outcome.result === "randomOmen" && worthyOfCityQuest() ? t("cityQuest.wildernessHint") : null,
		winter: winter ? t("time.winterReminder") : null
	};
}
