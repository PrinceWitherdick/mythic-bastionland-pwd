import { hexTarget } from "../chat/hex-target.js";
import { postCard, registerCardButtons, t, warn } from "../chat/cards.js";
import { featureAt } from "../rules/realm.js";
import { hexKey, parseHexKey, sameHex } from "../rules/realm-geometry.js";
import { companyPace } from "../rules/journey.js";
import { samePhase } from "../rules/time.js";
import { nextOmen } from "../rules/wilderness.js";
import { SYSTEM_ID } from "../system-id.js";
import { getCalendar } from "./calendar.js";
import { setCompanyHex } from "./company.js";
import { hexLabel } from "./hex-names.js";
import { settleBlindTravel } from "./night-travel.js";
import { COMPANY_MOVED_HOOK } from "./journey.js";
import { liveRealm } from "./myth-notes.js";
import { getRealm, isRealmScene } from "./realm.js";
import { rollRefereeTable, weatherIn } from "./referee-rolls.js";
import { gallop } from "./steeds.js";
import { markOmenOnEntering, wildernessRoll } from "./wilderness.js";

/**
 * What the book has happen as the Company comes into a hex, beyond the
 * questions of the dark and the fog (night-travel.js): a Myth's hex shows its
 * next Omen (p27), dire weather keeps the Company where it was (p18), a
 * Holding's mood is gauged on arriving (p18), and a second hex in a Phase is a
 * Gallop (p18). Each is told to the Referee on a card of their own, with a
 * button for what the book has them do, since a Token dragged by mistake
 * shouldn't spend an Omen or a steed's VIG.
 */

/** The hexes the Company has come into this Phase: {when, count}, or null. */
const PACE_SETTING = "companyPace";

/** What marks the arrival card's buttons. */
const ARRIVAL_SELECTOR = "[data-arrival]";

/**
 * The Myths whose hexes the move came into, that have an Omen yet to show:
 * none resolved, since a resolved Myth shows no more (p27).
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} entered
 * @returns {object[]}
 */
function mythsEntered(scene, entered) {
	const realm = liveRealm(scene);
	return entered.map((hex) => featureAt(realm, hex).myth).filter((myth) => myth && !nextOmen(myth).complete);
}

/**
 * Count the hexes come into this Phase, and say what pace that makes (p18).
 * @param {number} entered
 * @returns {Promise<{before: string, after: string}>}
 */
async function countPace(entered) {
	const now = getCalendar();
	const said = game.settings.get(SYSTEM_ID, PACE_SETTING);
	const before = samePhase(said?.when, now) ? Number(said.count) || 0 : 0;
	const count = before + entered;
	const pace = { before: companyPace(before), after: companyPace(count) };
	// Past a Cruise, more hexes make no other pace, so there's nothing new to keep.
	if (pace.before !== "beyond") await game.settings.set(SYSTEM_ID, PACE_SETTING, { when: { ...now }, count });
	return pace;
}

/**
 * What the Referee is told of a move, and the buttons that act on it.
 * @param {Scene} scene
 * @param {{entered: object[], ended: boolean, from: object|null}} move
 * @returns {Promise<{lines: string[], actions: object[]}>}
 */
async function arrivalNotes(scene, { entered, ended, from }) {
	const lines = [];
	const actions = [];
	const here = entered.at(-1) ?? null;

	// Dire weather keeps the Company in the hex it's in (p18).
	if (ended && here && from && !sameHex(from, here) && weatherIn(getCalendar()) === "dire") {
		lines.push(t("arrival.dire", { hex: hexLabel(from, scene) }));
		actions.push({ key: "stay", hex: hexKey(from), icon: "fa-solid fa-cloud-showers-heavy", label: t("arrival.stay") });
	}

	// Trek is a hex a Phase; a second is a Gallop, and a third only by boat or road (p18).
	const pace = await countPace(entered.length);
	if (pace.after !== pace.before && pace.after !== "trek") {
		lines.push(t(`arrival.${pace.after}`));
		if (pace.after === "gallop") actions.push({ key: "gallop", icon: "fa-solid fa-horse", label: t("arrival.gallopButton") });
	}

	// Entering a Myth's hex reveals its next Omen (p27).
	for (const myth of mythsEntered(scene, entered)) {
		lines.push(t("arrival.myth", { hex: hexLabel(myth.hex, scene) }));
		actions.push({ key: "omen", hex: hexKey(myth.hex), icon: "fa-solid fa-eye", label: t("arrival.omen") });
	}

	// A Holding reached has its Local Mood rolled (p18).
	const holding = ended && here ? featureAt(getRealm(scene).realm, here).holding : null;
	if (holding) {
		lines.push(t("arrival.holding", { hex: hexLabel(here, scene) }));
		actions.push({ key: "mood", icon: "fa-solid fa-masks-theater", label: t("arrival.mood") });
	}
	return { lines, actions };
}

/**
 * Tell the Referee what the Company's move calls for. Heard on the active GM's
 * client alone. A move it didn't choose, such as a blind drift, calls for nothing.
 * @param {Scene} scene
 * @param {{entered?: object[], ended?: boolean, from?: object|null, chosen?: boolean}} moved
 * @returns {Promise<ChatMessage|null>}
 */
export async function noticeArrival(scene, { entered = [], ended = false, from = null, chosen = true }) {
	if (!game.user.isGM || !chosen || !isRealmScene(scene) || !entered.length) return null;
	const { lines, actions } = await arrivalNotes(scene, { entered, ended, from });
	if (!lines.length) return null;
	const here = entered.at(-1);
	return postCard(null, "arrival", {
		title: t("arrival.title"),
		target: hexTarget(here, scene),
		lines,
		actions
	}, { mode: "gm", flags: { [SYSTEM_ID]: { arrival: scene.id } } });
}

/**
 * The move as it ended: where a blind roll sent the Company back, it came no
 * further than the hex before; where it drifted, into the hex it drifted to.
 * @param {{entered?: object[], from?: object|null}} moved
 * @param {{col: number, row: number}|null} landing
 * @returns {object}
 */
function landedMove(moved, landing) {
	if (!landing) return moved;
	const before = (moved.entered ?? []).slice(0, -1);
	const back = sameHex(landing, before.at(-1) ?? moved.from);
	return { ...moved, entered: back ? before : [...before, landing] };
}

/**
 * Follow one of the Company's moves: first whether it travelled blind and
 * where that left it, then what coming there calls for, so the card speaks of
 * the hex the Company is in. GMs only.
 * @param {Scene} scene
 * @param {object} moved As the journey tells of it.
 * @returns {Promise<ChatMessage|null>}
 */
async function followMove(scene, moved) {
	const landing = await settleBlindTravel(scene, moved);
	return noticeArrival(scene, landedMove(moved, landing));
}

/**
 * What each of the arrival card's buttons does. GMs only.
 * @type {Record<string, (scene: Scene, hex: {col: number, row: number}|null) => Promise<unknown>>}
 */
const ARRIVAL_ACTIONS = {
	// Back where it was, put there rather than gone there by choice.
	stay: (scene, hex) => (hex ? setCompanyHex(scene, hex, { forced: true }) : null),
	gallop: () => gallop(),
	async omen(scene, hex) {
		if (!hex) return null;
		const outcome = await wildernessRoll({ scene, hex });
		if (outcome) await markOmenOnEntering(scene, hex);
		return outcome;
	},
	mood: () => rollRefereeTable("mood")
};

/** Register what the Company's moves are counted in, follow its moves, and wire the card. Called during init. */
export function registerArrivals() {
	game.settings.register(SYSTEM_ID, PACE_SETTING, { scope: "world", config: false, type: Object, default: null });
	Hooks.on(COMPANY_MOVED_HOOK, (scene, move) => {
		followMove(scene, move).catch((error) => console.error(`${SYSTEM_ID} | Couldn't follow the Company's move`, error));
	});
	registerCardButtons({
		selector: ARRIVAL_SELECTOR,
		gmOnly: true,
		// Each does its work once: an Omen revealed twice, or a second gallop, would cost twice.
		once: true,
		handler: async (button, message) => {
			const scene = game.scenes.get(message?.flags?.[SYSTEM_ID]?.arrival ?? "");
			if (!isRealmScene(scene)) {
				warn("arrival.realmGone");
				return false;
			}
			const act = ARRIVAL_ACTIONS[button.dataset.arrival];
			const hex = button.dataset.arrivalHex ? parseHexKey(button.dataset.arrivalHex) : null;
			return Boolean(act && (await act(scene, hex)));
		}
	});
}
