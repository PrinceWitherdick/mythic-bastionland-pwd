import { chooseDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { movedThisNight, nightMove } from "../rules/night-travel.js";
import { SYSTEM_ID } from "../system-id.js";
import { getCalendar } from "./calendar.js";
import { COMPANY_MOVED_HOOK } from "./journey.js";
import { rollRefereeTable } from "./referee-rolls.js";

/** The Company's Night on the move: a NightTravel, or null. */
const NIGHT_SETTING = "nightTravel";

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
 * The Company moves to a new Hex by night (p18): the first time in a Night, ask
 * whether it has a guide and light. Without them it travels blind, rolled now
 * and at each new Hex until the Night ends. What the Night costs is taken as it
 * ends. GMs only.
 * @returns {Promise<"blind"|"sighted"|null>} What the move was, or null by day or while unanswered.
 */
export async function travelAtNight() {
	if (!game.user.isGM) return null;
	const now = getCalendar();
	const said = nightSaid();
	const due = nightMove(said, now);
	if (due === "day") return null;
	if (due === "blind") {
		await rollRefereeTable("blind");
		return "blind";
	}
	if (due === "sighted") return "sighted";
	if (asking) return null;

	asking = true;
	try {
		// Seen on the move tonight, whatever the Referee answers.
		if (!movedThisNight(said, now)) await game.settings.set(SYSTEM_ID, NIGHT_SETTING, { when: { ...now }, blind: null });
		const choice = await chooseDialog({
			title: t("time.nightTravel.title"),
			icon: "fa-solid fa-moon",
			message: t("time.nightTravel.text"),
			buttons: [
				{ action: "sighted", label: t("time.nightTravel.sighted"), icon: "fa-solid fa-fire-flame-simple", default: true },
				{ action: "blind", label: t("time.nightTravel.blind"), icon: "fa-solid fa-eye-low-vision" }
			]
		});
		if (choice !== "sighted" && choice !== "blind") return null;
		const blind = choice === "blind";
		await game.settings.set(SYSTEM_ID, NIGHT_SETTING, { when: { ...now }, blind });
		if (blind) await rollRefereeTable("blind");
		return choice;
	} finally {
		asking = false;
	}
}

/**
 * Notice the Company coming to rest in a new Hex. Heard on the active GM's
 * client alone, since only one browser should ask.
 * @param {Scene} scene
 * @param {{ended: boolean}} move
 */
function noticeMove(scene, { ended }) {
	if (!ended) return;
	travelAtNight().catch((error) => console.error(`${SYSTEM_ID} | Couldn't ask about travelling at night`, error));
}

/** Register the Company's Night on the move, and follow its moves. Called during init. */
export function registerNightTravel() {
	game.settings.register(SYSTEM_ID, NIGHT_SETTING, { scope: "world", config: false, type: Object, default: null });
	Hooks.on(COMPANY_MOVED_HOOK, noticeMove);
}
