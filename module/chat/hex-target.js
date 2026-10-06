/**
 * A hex a chat card names, as a chip beside its words: pointing at the chip
 * rings the hex in green on the map, and clicking it takes this user's map to
 * the Realm and the hex, ringing and pinging it there. Only the one who points
 * or clicks sees any of it.
 */
import { hexLabel } from "../actions/hex-names.js";
import { viewAndShowHex } from "../actions/travels.js";
import { ringHoveredHex } from "../canvas/shown-hex.js";
import { hexKey, parseHexKey } from "../rules/realm-geometry.js";
import { registerCardButtons } from "./cards.js";

const SELECTOR = "[data-hex-target]";

/**
 * What a card's template needs for the chip, through the bastionland.hex-target partial.
 * @param {{col: number, row: number}} hex
 * @param {Scene|null} scene The Realm it's in.
 * @returns {{key: string, scene: string, label: string}}
 */
export const hexTarget = (hex, scene) => ({ key: hexKey(hex), scene: scene?.id ?? "", label: hexLabel(hex, scene) });

/**
 * @param {HTMLElement} chip
 * @returns {{scene: Scene|null, hex: {col: number, row: number}|null}}
 */
function chipTarget(chip) {
	const scene = game.scenes.get(chip.dataset.hexScene) ?? null;
	return { scene, hex: parseHexKey(chip.dataset.hexTarget) };
}

/** Called during init. */
export function registerHexTargets() {
	registerCardButtons({
		selector: SELECTOR,
		handler: async (chip) => {
			const { scene, hex } = chipTarget(chip);
			// A card about another Realm brings that Realm up first.
			await viewAndShowHex(scene, hex);
		}
	});

	// The hover ring goes by itself once the pointer leaves the chip.
	Hooks.on("renderChatMessageHTML", (_message, html) => {
		if (!html.querySelector(SELECTOR)) return;
		html.addEventListener("pointerover", (event) => {
			const chip = event.target.closest(SELECTOR);
			if (!chip) return;
			const { scene, hex } = chipTarget(chip);
			if (scene && hex && canvas.scene?.id === scene.id) ringHoveredHex(scene, hex, chip);
		});
	});
}
