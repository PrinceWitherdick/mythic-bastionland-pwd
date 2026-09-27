/**
 * The button a Wilderness card carries when the roll found a Landmark that asks
 * something of the Company (p14): a Monument's Sacrament, a Hazard to push
 * through, a Ruin's echo of a Myth the Realm doesn't hold. The card is whispered
 * to the Referee, so only a GM sees the button at all.
 */
import { takeLandmarkOffer } from "../actions/landmarks.js";
import { LANDMARK_OFFERS } from "../rules/landmarks.js";
import { parseHexKey } from "../rules/realm-geometry.js";
import { registerCardButtons } from "./cards.js";

/** Called during init. */
export function registerLandmarkCards() {
	registerCardButtons({
		selector: "[data-landmark-offer]",
		gmOnly: true,
		handler: async (button) => {
			const offer = button.dataset.landmarkOffer;
			if (!LANDMARK_OFFERS.includes(offer)) return;
			// The card names the Realm it was rolled for; without one, whatever Scene is on the canvas.
			const scene = game.scenes.get(button.dataset.landmarkScene) ?? canvas.scene;
			await takeLandmarkOffer(offer, { scene, hex: parseHexKey(button.dataset.landmarkHex) });
		}
	});
}
