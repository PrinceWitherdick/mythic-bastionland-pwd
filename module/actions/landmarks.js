import { chooseDialog } from "../apps/ui.js";
import { loadArtIndex, mythEntry } from "../book-art/art-index.js";
import { postCard, t } from "../chat/cards.js";
import { mythRollTaken } from "../rules/gm-toolkit.js";
import { LANDMARK_EFFECTS, landmarkEffect, offCourseShown, offCourseState, throwsOffCourse } from "../rules/landmarks.js";
import { VIRTUES } from "../rules/virtues.js";
import { SYSTEM_ID } from "../system-id.js";
import { getCalendar } from "./calendar.js";
import { getRealm } from "./realm.js";
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
 * A Ruin's echo (p14): it hints at a random Myth the Realm doesn't currently
 * hold, though that Myth may yet return. The roll is whispered to the Referee,
 * who decides how the ruin hints at it. GMs only.
 * @param {Scene} scene The Realm.
 * @returns {Promise<{d6: number, d12: number, name: string}|null>}
 */
export async function echoRuin(scene) {
	if (!game.user.isGM || !scene) return null;
	const { realm } = getRealm(scene);

	let d6 = null;
	let d12 = null;
	// Six Myths of 72 are in the Realm, so one it doesn't hold turns up within a few rolls.
	for (let tries = 0; tries < 100; tries++) {
		d6 = await new Roll("1d6").evaluate();
		d12 = await new Roll("1d12").evaluate();
		if (!mythRollTaken(realm, { d6: d6.total, d12: d12.total })) break;
	}

	const rolled = { d6: d6.total, d12: d12.total };
	const { name, page, entry } = mythEntry(await loadArtIndex(), rolled);
	await postCard(null, "omen", {
		title: name,
		tagline: page ? t("realm.key.page", { page }) : null,
		img: entry?.path ?? null,
		omen: t("realm.landmarks.ruinEchoes"),
		text: null,
		hint: t("realm.landmarks.ruinHint")
	}, { rolls: [d6, d12], mode: "gm" });
	return { ...rolled, name };
}

/**
 * Carry out what a Landmark offers, by the offer's own name.
 * @param {string} offer One of LANDMARK_OFFERS.
 * @param {object} [options]
 * @param {Scene} [options.scene] The Realm, which a Ruin's echo needs.
 * @returns {Promise<unknown>} Nothing for an offer that doesn't exist.
 */
export function takeLandmarkOffer(offer, { scene = canvas.scene } = {}) {
	return OFFER_ACTIONS[offer]?.(scene) ?? Promise.resolve(null);
}

/** What each of LANDMARK_OFFERS does when it's taken up. */
const OFFER_ACTIONS = Object.freeze({
	restoreSpirit: () => restoreAtMonument(),
	pushThrough: () => pushThroughHazard(),
	echoMyth: (scene) => echoRuin(scene)
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
