/**
 * The button a Wilderness card carries when the roll found a Landmark that asks
 * something of the Company (p14): a Monument's Sacrament, a Hazard to push
 * through, a Ruin's echo of a Myth the Realm isn't playing out now. The card is whispered
 * to the Referee, so only a GM sees the button at all.
 */
import { takeLandmarkOffer } from "../actions/landmarks.js";
import { LANDMARK_OFFERS } from "../rules/landmarks.js";
import { registerCardButtons, warn } from "./cards.js";
import { cardHexes } from "./card-hexes.js";

/** Called during init. */
export function registerLandmarkCards() {
	registerCardButtons({
		selector: "[data-landmark-offer]",
		gmOnly: true,
		handler: async (button, message) => {
			const offer = button.dataset.landmarkOffer;
			if (!LANDMARK_OFFERS.includes(offer)) return;
			// The card names the Realm it was rolled for; without one, whatever Scene is on the canvas.
			const scene = game.scenes.get(button.dataset.landmarkScene) ?? canvas.scene;
			// A card posted before the map grew names the hex as it was numbered then.
			const hex = cardHexes(message, scene).hex(button.dataset.landmarkHex);
			// The hex it names is gone, as land a Realm put back from its backup takes away.
			if (button.dataset.landmarkHex && !hex) {
				warn("realm.landmarks.offerGone");
				return;
			}
			await takeLandmarkOffer(offer, { scene, hex });
		}
	});
}
