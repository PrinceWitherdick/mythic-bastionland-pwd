/**
 * The button a Folklore or Survey card carries: what the Company was told or
 * saw is drawn on the players' copy of the map (p19). Both cards are whispered
 * to the Referee, so only a GM sees the button at all.
 */
import { markOnPlayersMap } from "../actions/exploration.js";
import { cardHexes } from "./card-hexes.js";
import { registerCardButtons } from "./cards.js";

/** Called during init. */
export function registerExplorationCards() {
	registerCardButtons({
		selector: "[data-explore-mark]",
		gmOnly: true,
		handler: async (button, message) => {
			const ids = button.dataset.exploreMark.split(",").filter(Boolean);
			// The card names the Realm it was made for; without one, whatever Scene is on the canvas.
			const scene = game.scenes.get(button.dataset.exploreScene) ?? canvas.scene;
			// The hexes a vantage point took in, for the Fog of War to lift from, as they're numbered now;
			// their keys hold commas, so ";" parts them.
			const card = cardHexes(message, scene);
			const lift = (button.dataset.exploreLift ?? "").split(";").map(card.hex).filter(Boolean);
			await markOnPlayersMap(scene, ids, { lift });
		}
	});
}
