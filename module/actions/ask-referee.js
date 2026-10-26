import { postCard, registerCardButtons, t, warn } from "../chat/cards.js";
import { SYSTEM_ID } from "../system-id.js";
import { EXPLORATION_ACTS, takeExplorationAct } from "./exploration.js";
import { rollRefereeTable } from "./referee-rolls.js";
import { gallop } from "./steeds.js";
import { advancePhase } from "./time.js";
import { wildernessRoll } from "./wilderness.js";

// The rules beside the map offer the Referee a button for each thing the
// Company may do there: search the Hex, look from a vantage point, ask
// somebody, gallop, or make the Wilderness Roll. Exploring is the Referee's to
// carry out (p19), so a player sees "Ask the Referee" in its place, which
// whispers the Referee a card with the same button on it.

/** What a player may ask for: an act of exploring, or a roll from the rules. */
const ASKABLE = Object.freeze({ act: Object.keys(EXPLORATION_ACTS), roll: ["gallop", "wilderness", "phase"] });

/** Marks the button on the Referee's card, as "act:search". */
const ASK_SELECTOR = "[data-ask-referee]";

/**
 * @param {string} kind "act" or "roll".
 * @param {string} key
 * @returns {boolean} Whether a player may ask the Referee for it.
 */
export const askable = (kind, key) => Boolean(ASKABLE[kind]?.includes(key));

/**
 * Do what one of the rules' buttons names, as the Referee: the panel's own
 * buttons and the cards players send both come here.
 * @param {string} kind "act" or "roll".
 * @param {string} key
 * @param {{scene?: Scene}} [where]
 * @returns {Promise<unknown>|null}
 */
export function doFromRules(kind, key, { scene = canvas?.scene } = {}) {
	if (!game.user.isGM) return null;
	if (kind === "act") return takeExplorationAct(key, { scene });
	if (key === "gallop") return gallop();
	// Something that takes a whole Phase, such as a Remedy (p9): its end is offered as any Phase's is.
	if (key === "phase") return advancePhase();
	return key === "wilderness" ? wildernessRoll({ scene }) : rollRefereeTable(key);
}

/**
 * A player asks the Referee for something the rules beside the map offer:
 * whispered to the Referee, naming who asks, with the button that does it.
 * @param {string} kind "act" or "roll".
 * @param {string} key
 * @param {string} label The button's words, as the rules put them.
 * @returns {Promise<ChatMessage|null>}
 */
export function askReferee(kind, key, label) {
	if (!askable(kind, key)) return null;
	const asker = game.user.character?.name ?? game.user.name;
	return postCard(null, "note", {
		icon: "fa-solid fa-hand",
		text: t("askReferee.asks", { name: asker, what: label }),
		action: { data: "ask-referee", icon: "fa-solid fa-dice-d6", label }
	}, { mode: "gm", flags: { [SYSTEM_ID]: { askReferee: { kind, key, scene: canvas?.scene?.id ?? null } } } });
}

/** Wire up the Referee's button on a player's card. Called during init. */
export function registerAskReferee() {
	// Whoever asked sees their own whisper too, but without the Referee's button.
	registerCardButtons({
		selector: ASK_SELECTOR,
		gmOnly: true,
		// A player posts it, asking.
		fromPlayers: true,
		// Done once: a second gallop would cost the steeds twice, a second Phase pass the calendar.
		once: true,
		handler: async (_button, message) => {
			const asked = message?.flags?.[SYSTEM_ID]?.askReferee;
			if (!asked || !askable(asked.kind, asked.key)) return false;
			// Done where they asked it: the Realm then on the canvas, if it's still there.
			const scene = (asked.scene && game.scenes.get(asked.scene)) || canvas?.scene;
			if (!scene) {
				warn("askReferee.noScene");
				return false;
			}
			return Boolean(await doFromRules(asked.kind, asked.key, { scene }));
		}
	});
}
