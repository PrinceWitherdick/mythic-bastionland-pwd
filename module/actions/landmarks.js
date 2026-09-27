import { chooseDialog } from "../apps/ui.js";
import { loadArtIndex, mythEntry } from "../book-art/art-index.js";
import { promptsForEntry } from "../book-art/myth-tables.js";
import { postCard, t } from "../chat/cards.js";
import { MYTH_PROMPTS_VERSION } from "../rules/book-art.js";
import { mythRollTaken } from "../rules/gm-toolkit.js";
import { LANDMARK_EFFECTS, landmarkEffect, landmarkPrompt, offCourseShown, offCourseState, promptSpread, throwsOffCourse } from "../rules/landmarks.js";
import { featureAt } from "../rules/realm.js";
import { editFeature } from "../rules/realm-edits.js";
import { VIRTUES } from "../rules/virtues.js";
import { SYSTEM_ID } from "../system-id.js";
import { getCalendar } from "./calendar.js";
import { editRealm, getRealm } from "./realm.js";
import { rollRefereeTable } from "./referee-rolls.js";
import { chooseCompany, virtueLoss } from "./time.js";

/**
 * What a Landmark asks of the Company that finds it (p14): a Monument's
 * Sacrament, a Hazard pushed through, a Curse's blight, a Ruin's echo of a Myth
 * the Realm doesn't hold. The rules themselves are in rules/landmarks.js; here
 * they are rolled, written and told to the table.
 */

/** Where the Curse that threw the Company off course is kept: the calendar it struck in, or null. */
const OFF_COURSE_SETTING = "offCourse";

/**
 * Ask who among the Company takes a Landmark up on what it offers. A Referee
 * who closes the window is taken to have thought better of it, and one who
 * picks nobody is told that nothing came of it.
 * @param {object} ask As chooseCompany takes it.
 * @returns {Promise<Actor[]|null>} Those who took part, or null where none did.
 */
async function whoTakesPart(ask) {
	const company = await chooseCompany(ask);
	if (!company) return null;
	if (!company.length) {
		ui.notifications.info(t("realm.landmarks.nobody"));
		return null;
	}
	return company.map(({ actor }) => actor);
}

/** Register the blight a Curse leaves. Called during init. */
export function registerLandmarkSettings() {
	game.settings.register(SYSTEM_ID, OFF_COURSE_SETTING, {
		scope: "world",
		config: false,
		type: Object,
		default: null
	});
}

/** @returns {object|null} The calendar the Curse struck in, or null while the Company holds its course. */
export const getOffCourse = () => game.settings.get(SYSTEM_ID, OFF_COURSE_SETTING) ?? null;

/**
 * @param {object|null} calendar The Phase the Curse struck in.
 * @returns {Promise<unknown>|undefined} GMs only.
 */
const setOffCourse = (calendar) =>
	(game.user.isGM ? game.settings.set(SYSTEM_ID, OFF_COURSE_SETTING, calendar) : undefined);

/** Let go of a Curse's blight, once it's been rolled for or has lapsed. GMs only. */
export const clearOffCourse = () => setOffCourse(null);

/**
 * A Curse throws the Company off course, so travel in the next Phase counts as
 * travelling blind (p14). Called when a Wilderness Roll finds one. GMs only.
 * @param {import("../rules/time.js").Calendar} [calendar] When it struck. Now, by default.
 * @returns {Promise<unknown>|undefined}
 */
export function strikeOffCourse(calendar = getCalendar()) {
	return setOffCourse({ ...calendar });
}

/**
 * Where a Curse's blight stands, for a page that wants to say so.
 * @param {import("../rules/time.js").Calendar} [calendar] Now, by default.
 * @returns {{state: string|null, shown: boolean, line: string|null}}
 */
export function offCourseNow(calendar = getCalendar()) {
	const struck = getOffCourse();
	const state = offCourseState(struck, calendar);
	const shown = offCourseShown(struck, calendar);
	return { state, shown, line: shown ? t(`realm.landmarks.offCourse.${state}`) : null };
}

/**
 * Roll Travelling Blind (p18) for a Company thrown off course, and let the
 * Curse's blight go, since it only touches the one Phase. GMs only.
 * @returns {Promise<object|null>}
 */
export async function rollTravellingBlind() {
	if (!game.user.isGM) return null;
	const rolled = await rollRefereeTable("blind");
	await clearOffCourse();
	return rolled;
}

/**
 * A Monument's Sacrament (p14): travellers may spend a Phase to restore SPI here
 * as if they were consuming a Sacrament. The Phase isn't moved on, as a Remedy
 * doesn't move it either: the Referee turns the calendar when they're ready.
 * GMs only.
 * @returns {Promise<object[]|null>} The card's entries, or null if nobody took part.
 */
export async function restoreAtMonument() {
	if (!game.user.isGM) return null;
	const virtue = LANDMARK_EFFECTS.monument.virtue;
	const abbr = t(`virtues.${virtue}.abbr`);
	const company = await whoTakesPart({
		title: t("realm.landmarks.effects.monument.offer"),
		icon: LANDMARK_EFFECTS.monument.icon,
		intro: t("realm.landmarks.monumentIntro", { virtue: abbr }),
		ok: t("recovery.restore", { virtue: abbr })
	});
	if (!company) return null;

	const entries = [];
	const updates = [];
	for (const actor of company) {
		const value = actor.system.virtues[virtue].max;
		updates.push(actor.update({ [`system.virtues.${virtue}.value`]: value }));
		entries.push({ name: actor.name, lines: [t("recovery.restored", { virtue: t(`virtues.${virtue}.label`), value })] });
	}
	await Promise.all(updates);
	await postCard(null, "report", {
		title: t("realm.landmarks.effects.monument.offer"),
		tagline: t("realm.landmarks.monument"),
		entries,
		hint: t("realm.landmarks.monumentHint")
	});
	return entries;
}

/**
 * Push through a Hazard (p14): everybody who does loses d6 in a Virtue, usually
 * VIG. The Referee is asked which, since the book leaves it to the moment. GMs
 * only.
 * @returns {Promise<object[]|null>}
 */
export async function pushThroughHazard() {
	if (!game.user.isGM) return null;
	const usual = LANDMARK_EFFECTS.hazard.virtue;
	const virtue = await chooseDialog({
		title: t("realm.landmarks.effects.hazard.offer"),
		icon: LANDMARK_EFFECTS.hazard.icon,
		message: t("realm.landmarks.hazardWhich"),
		buttons: VIRTUES.map((key) => ({
			action: key,
			label: t(`virtues.${key}.label`),
			default: key === usual
		}))
	});
	if (!VIRTUES.includes(virtue)) return null;

	const company = await whoTakesPart({
		title: t("realm.landmarks.effects.hazard.offer"),
		icon: LANDMARK_EFFECTS.hazard.icon,
		intro: `${t("realm.landmarks.hazardIntro", { virtue: t(`virtues.${virtue}.abbr`) })} ${t("time.hardship.intro")}`,
		ok: t("time.hardship.roll")
	});
	if (!company) return null;
	// No hardship of the book's list, but the same d6 in a Virtue (p14).
	return virtueLoss(company, virtue, { title: t("realm.landmarks.effects.hazard.offer") });
}

/**
 * Roll the Myth a Ruin echoes: any the Realm doesn't currently hold.
 * @param {import("../rules/realm.js").Realm} realm
 * @returns {Promise<{echo: {d6: number, d12: number}, rolls: Roll[]}>}
 */
async function rollRuinEcho(realm) {
	let d6 = null;
	let d12 = null;
	// Six Myths of 72 are in the Realm, so one it doesn't hold turns up within a few rolls.
	for (let tries = 0; tries < 100; tries++) {
		d6 = await new Roll("1d6").evaluate();
		d12 = await new Roll("1d12").evaluate();
		if (!mythRollTaken(realm, { d6: d6.total, d12: d12.total })) break;
	}
	return { echo: { d6: d6.total, d12: d12.total }, rolls: [d6, d12] };
}

/**
 * The prompt a spread of the book prints for a Landmark of this type.
 * @param {object|null} index The art index.
 * @param {{d6: number, d12: number}} spread
 * @param {string} type One of LANDMARK_TYPES.
 * @returns {Promise<{prompt: string|null, myth: string, page: number, entry: object|null}>}
 */
async function spreadPrompt(index, spread, type) {
	const { name, page, entry } = mythEntry(index, spread);
	const prompts = await promptsForEntry(index, entry, { page, versionFloor: MYTH_PROMPTS_VERSION });
	return { prompt: landmarkPrompt(prompts, type), myth: name, page, entry };
}

/**
 * A Ruin's echo (p14): it hints at a random Myth the Realm doesn't currently
 * hold, though that Myth may yet return. A Ruin keeps the Myth it echoes once
 * rolled, so asking again tells the same story. The Myth is whispered to the
 * Referee with the ruin its page suggests, who decides how the ruin hints at
 * it. GMs only.
 * @param {Scene} scene The Realm.
 * @param {{col: number, row: number}|null} [hex] Where the Ruin is, so it keeps the Myth.
 * @returns {Promise<{d6: number, d12: number, name: string}|null>}
 */
export async function echoRuin(scene, hex = null) {
	if (!game.user.isGM || !scene) return null;
	const { realm } = getRealm(scene);
	const ruin = hex ? featureAt(realm, hex).landmark : null;
	const kept = ruin?.type === "ruin" ? ruin.echo ?? null : null;
	const { echo, rolls } = kept ? { echo: kept, rolls: [] } : await rollRuinEcho(realm);
	if (!kept && ruin?.type === "ruin") await editRealm(scene, (current, g) => editFeature(current, g, hex, { echo }));

	const { prompt, myth, page, entry } = await spreadPrompt(await loadArtIndex(), echo, "ruin");
	await postCard(null, "omen", {
		title: myth,
		tagline: page ? t("realm.key.page", { page }) : null,
		img: entry?.path ?? null,
		omen: t("realm.landmarks.ruinEchoes"),
		text: prompt ? t("realm.landmarks.ruinPrompt", { prompt }) : null,
		hint: t("realm.landmarks.ruinHint")
	}, { rolls, mode: "gm" });
	return { ...echo, name: myth };
}

/**
 * Give a Landmark met for the first time, and still without a name, the prompt
 * the book prints for its type along the foot of a spread (p14, p16): its
 * Seer's for a Sanctum, the Myth it echoes for a Ruin, and a spread rolled for
 * any other. The prompt becomes its name, kept on the map for the Referee to
 * change. A Ruin rolls the Myth it echoes here too. GMs only.
 * @param {Scene} scene The Realm.
 * @param {object} landmark As the Realm holds it.
 * @returns {Promise<{name: string, myth: string, page: number}|null>} Null where
 *   it has a name already, or no prompt could be read.
 */
export async function nameLandmarkFromPrompt(scene, landmark) {
	if (!game.user.isGM || !scene || !landmark || landmark.name) return null;
	let echo = landmark.type === "ruin" ? landmark.echo ?? null : null;
	if (landmark.type === "ruin" && !echo) ({ echo } = await rollRuinEcho(getRealm(scene).realm));
	let rolled = null;
	if (!(landmark.type === "sanctum" && landmark.seer) && landmark.type !== "ruin") {
		const [d6, d12] = await Promise.all([new Roll("1d6").evaluate(), new Roll("1d12").evaluate()]);
		rolled = { d6: d6.total, d12: d12.total };
	}
	const { prompt, myth, page } = await spreadPrompt(await loadArtIndex(), promptSpread({ ...landmark, echo }, rolled), landmark.type);
	const changes = { ...(prompt ? { name: prompt } : {}), ...(echo && !landmark.echo ? { echo } : {}) };
	if (Object.keys(changes).length) await editRealm(scene, (current, g) => editFeature(current, g, landmark.hex, changes));
	return prompt ? { name: prompt, myth, page } : null;
}

/**
 * Carry out what a Landmark offers, by the offer's own name.
 * @param {string} offer One of LANDMARK_OFFERS.
 * @param {object} [options]
 * @param {Scene} [options.scene] The Realm, which a Ruin's echo needs.
 * @param {{col: number, row: number}|null} [options.hex] Where the Landmark is, so a Ruin keeps its Myth.
 * @returns {Promise<unknown>} Nothing for an offer that doesn't exist.
 */
export function takeLandmarkOffer(offer, { scene = canvas.scene, hex = null } = {}) {
	return OFFER_ACTIONS[offer]?.(scene, hex) ?? Promise.resolve(null);
}

/** What each of LANDMARK_OFFERS does when it's taken up. */
const OFFER_ACTIONS = Object.freeze({
	restoreSpirit: () => restoreAtMonument(),
	pushThrough: () => pushThroughHazard(),
	echoMyth: (scene, hex) => echoRuin(scene, hex)
});

/**
 * What a Landmark of this type offers, for a card or a page to show.
 * @param {string} type One of LANDMARK_TYPES.
 * @returns {{text: string, offer: {key: string, label: string, icon: string}|null, offCourse: boolean}|null}
 */
export function landmarkOfferView(type) {
	const effect = landmarkEffect(type);
	if (!effect) return null;
	return {
		text: t(`realm.landmarks.effects.${type}.text`),
		offer: effect.offer
			? { key: effect.offer, label: t(`realm.landmarks.effects.${type}.offer`), icon: effect.icon }
			: null,
		offCourse: throwsOffCourse(type)
	};
}
