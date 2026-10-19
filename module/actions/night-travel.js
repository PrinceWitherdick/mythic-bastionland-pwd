import { chooseDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { offCourseState } from "../rules/landmarks.js";
import { blindLanding, fogMove, movedThisNight, nightMove } from "../rules/night-travel.js";
import { SYSTEM_ID } from "../system-id.js";
import { getCalendar } from "./calendar.js";
import { findCompanyToken, setCompanyHex } from "./company.js";
import { hexLabel } from "./hex-names.js";
import { getOffCourse } from "./off-course.js";
import { isRealmScene, sceneGeometry } from "./realm.js";
import { rollRefereeTable } from "./referee-rolls.js";
import { fogHidesTheWay } from "./sky-weather.js";

/** The Company's Night on the move: a NightTravel, or null. */
const NIGHT_SETTING = "nightTravel";

/** The Company's Phase on the move in fog, as a NightTravel: {when, blind}, or null. */
const FOG_SETTING = "fogTravel";

/** Whether the Referee is being asked already, so a Company of several Tokens is asked once. */
let asking = false;

/** @returns {import("../rules/night-travel.js").NightTravel|null} */
const nightSaid = () => game.settings.get(SYSTEM_ID, NIGHT_SETTING) ?? null;

/**
 * Whether the Company has moved to a new Hex in this Night, so the Night's end
 * expects it to have travelled rather than slept.
 * @param {import("../rules/time.js").Calendar} [now]
 * @returns {boolean}
 */
export const companyMovedThisNight = (now = getCalendar()) => movedThisNight(nightSaid(), now);

/**
 * @typedef {object} CompanyMove A move of the Company's Token, as the journey tells of it.
 * @property {Scene} scene
 * @property {{col: number, row: number}|null} from The hex it set off from.
 * @property {{col: number, row: number}[]} entered The hexes it came into, in order.
 * @property {{col: number, row: number}|null} [landing] Where a blind roll put the Company, once one has.
 */

/**
 * Roll Travelling Blind (p18) for a move, and put the Company where the roll
 * leaves it: back where it set off, or a hex to one side. Where the move isn't
 * the Company Token's, or isn't known, the card says it and the Referee moves them.
 * @param {CompanyMove|null} move
 * @returns {Promise<{col: number, row: number}|null>} Where the Company was put, or null where it stays.
 */
export async function rollBlindMove(move) {
	const read = await rollRefereeTable("blind");
	const scene = move?.scene;
	if (!read || !move || !isRealmScene(scene) || !findCompanyToken(scene)) return null;
	const to = move.entered.at(-1) ?? null;
	const from = move.entered.at(-2) ?? move.from;
	const landing = blindLanding(sceneGeometry(scene), from, to, read);
	if (!landing) return null;
	// Put there, not gone there by choice, so landing doesn't ask about travelling blind again.
	await setCompanyHex(scene, landing, { forced: true });
	move.landing = landing;
	ui.notifications.info(t("time.nightTravel.landed", { hex: hexLabel(landing, scene) }));
	return landing;
}

/**
 * Travel where the way can't be seen: roll the blind move, pass a sighted one,
 * or ask the Referee once whether the Company can see its way, and keep the answer.
 * @param {object} options
 * @param {string} options.setting Where the answer is kept.
 * @param {string} options.due What the move calls for: "ask", "blind", `see`, or anything else for nothing.
 * @param {string} options.see The answer that sees the way.
 * @param {import("../rules/time.js").Calendar} options.now
 * @param {{title: string, icon: string, message: string, see: string, seeIcon: string, blind: string}} options.words The question.
 * @param {() => Promise<unknown>} [options.first] Written before asking.
 * @param {CompanyMove|null} [options.move] The move that called for it, where the roll may move the Company.
 * @returns {Promise<string|null>} "blind", `see`, or null when nothing was due or it went unanswered.
 */
async function askTravelBlind({ setting, due, see, now, words, first, move = null }) {
	if (due === "blind") {
		await rollBlindMove(move);
		return "blind";
	}
	if (due === see) return see;
	if (due !== "ask" || asking) return null;

	asking = true;
	try {
		await first?.();
		const choice = await chooseDialog({
			title: words.title,
			icon: words.icon,
			message: words.message,
			buttons: [
				{ action: see, label: words.see, icon: words.seeIcon, default: true },
				{ action: "blind", label: words.blind, icon: "fa-solid fa-eye-low-vision" }
			]
		});
		if (choice !== see && choice !== "blind") return null;
		const blind = choice === "blind";
		await game.settings.set(SYSTEM_ID, setting, { when: { ...now }, blind });
		if (blind) await rollBlindMove(move);
		return choice;
	} finally {
		asking = false;
	}
}

/**
 * The Company moves to a new Hex by night (p18): the first time in a Night, ask
 * whether it has a guide and light. Without them it travels blind, rolled now
 * and at each new Hex until the Night ends. What the Night costs is taken as it
 * ends. GMs only.
 * @param {CompanyMove|null} [move] The move that called for it, where a blind roll may move the Company.
 * @returns {Promise<"blind"|"sighted"|null>} What the move was, or null by day or while unanswered.
 */
export async function travelAtNight(move = null) {
	if (!game.user.isGM) return null;
	const now = getCalendar();
	const said = nightSaid();
	return askTravelBlind({
		setting: NIGHT_SETTING,
		due: nightMove(said, now),
		see: "sighted",
		now,
		words: {
			title: t("time.nightTravel.title"),
			icon: "fa-solid fa-moon",
			message: t("time.nightTravel.text"),
			see: t("time.nightTravel.sighted"),
			seeIcon: "fa-solid fa-fire-flame-simple",
			blind: t("time.nightTravel.blind")
		},
		// Seen on the move tonight, whatever the Referee answers.
		first: () => movedThisNight(said, now) ? null : game.settings.set(SYSTEM_ID, NIGHT_SETTING, { when: { ...now }, blind: null }),
		move
	});
}

/**
 * The Company moves to a new Hex while fog hides the way (p197): the first time
 * in a Phase, ask whether it can keep its course. Without a way to, it travels
 * blind, rolled now and at each new Hex until the Phase ends. GMs only.
 * @param {CompanyMove|null} [move] The move that called for it, where a blind roll may move the Company.
 * @returns {Promise<"blind"|"course"|null>} What the move was, or null without fog, by night, or while unanswered.
 */
export async function travelInFog(move = null) {
	if (!game.user.isGM) return null;
	const now = getCalendar();
	return askTravelBlind({
		setting: FOG_SETTING,
		due: fogMove(game.settings.get(SYSTEM_ID, FOG_SETTING) ?? null, now, fogHidesTheWay(now)),
		see: "course",
		now,
		words: {
			title: t("skyWeather.fog.travel.title"),
			icon: "fa-solid fa-smog",
			message: t("skyWeather.fog.travel.text"),
			see: t("skyWeather.fog.travel.course"),
			seeIcon: "fa-solid fa-compass",
			blind: t("skyWeather.fog.travel.blind")
		},
		move
	});
}

/**
 * A move in the Phase after a Curse struck is travelling blind (p14), whatever
 * the light, so it's rolled for and the dark and fog aren't asked about. GMs only.
 * @param {CompanyMove} move
 * @returns {Promise<boolean>} Whether the Curse's blight called for the roll.
 */
async function travelCursed(move) {
	const now = getCalendar();
	if (!game.user.isGM || offCourseState(getOffCourse(), now) !== "live") return false;
	// A cursed Night is still a Night on the move, which its end expects to have cost the Company.
	if (now.phase === "night" && !movedThisNight(nightSaid(), now)) {
		await game.settings.set(SYSTEM_ID, NIGHT_SETTING, { when: { ...now }, blind: null });
	}
	await rollBlindMove(move);
	return true;
}

/**
 * Settle whether the Company coming to rest in a new Hex travelled blind, and
 * where the roll put it if so. Asked on the active GM's client alone, since
 * only one browser should ask. A drift it didn't choose isn't a try at a new
 * Hex, so it asks nothing.
 * @param {Scene} scene
 * @param {{ended: boolean, entered?: object[], from?: object|null, chosen?: boolean}} moved
 * @returns {Promise<{col: number, row: number}|null>} Where a blind roll put the Company, or null where it stays.
 */
export async function settleBlindTravel(scene, { ended, entered = [], from = null, chosen = true }) {
	if (!ended || !chosen) return null;
	const move = { scene, from, entered, landing: null };
	// By night the dark hides the way, and by day fog may (p197).
	const ask = getCalendar().phase === "night" ? travelAtNight : travelInFog;
	if (!(await travelCursed(move))) await ask(move);
	return move.landing;
}

/** Register the Company's Night on the move, and its Phase in fog. Called during init. */
export function registerNightTravel() {
	game.settings.register(SYSTEM_ID, NIGHT_SETTING, { scope: "world", config: false, type: Object, default: null });
	game.settings.register(SYSTEM_ID, FOG_SETTING, { scope: "world", config: false, type: Object, default: null });
}
