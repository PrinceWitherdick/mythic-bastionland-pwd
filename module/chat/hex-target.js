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
import { registerCardButtons, warn } from "./cards.js";
import { postedAt } from "./posted-at.js";
import { cardHexKey } from "../rules/realm-growth.js";
import { hexNumbering } from "../rules/hex-numbers.js";

const SELECTOR = "[data-hex-target]";

/**
 * What a card's template needs for the chip, through the bastionland.hex-target partial.
 * @param {{col: number, row: number}} hex
 * @param {Scene|null} scene The Realm it's in.
 * @returns {{key: string, scene: string, label: string, smallCaps: boolean}}
 */
export function hexTarget(hex, scene) {
	const label = hexLabel(hex, scene);
	return { key: hexKey(hex), scene: scene?.id ?? "", label, smallCaps: smallCapsLabel(label) };
}

/**
 * Whether words set in the Caps face are mostly its small capitals, and so are
 * centred on those: any lowercase and no figures, which stand as tall as capitals.
 * @param {string} label
 * @returns {boolean}
 */
export const smallCapsLabel = (label) => /\p{Ll}/u.test(String(label ?? "")) && !/\d/.test(String(label ?? ""));

/**
 * @param {HTMLElement} chip
 * @returns {{scene: Scene|null, hex: {col: number, row: number}|null}}
 */
function chipTarget(chip) {
	const scene = game.scenes.get(chip.dataset.hexScene) ?? null;
	// A card posted before the map grew names the hex as it was numbered then.
	const posted = postedAt(game.messages?.get(chip.closest("[data-message-id]")?.dataset.messageId));
	return { scene, hex: parseHexKey(cardHexKey(chip.dataset.hexTarget, posted, hexNumbering(scene))) };
}

/**
 * Whether this user may be taken to a chip's Realm: one already on their map,
 * or one they may at least glimpse. Foundry draws any Scene it's asked to, so
 * a player's chip mustn't open a Realm the Referee hasn't shown them.
 * @param {Scene} scene
 * @returns {boolean}
 */
const mayView = (scene) => game.user.isGM || canvas?.scene?.id === scene.id || Boolean(scene.testUserPermission?.(game.user, "LIMITED"));

/**
 * Ring the hex a chip names on the map while the pointer is over it, for every
 * such chip inside an element. The ring goes by itself once the pointer leaves.
 * @param {HTMLElement} element
 * @param {string} selector The chips.
 * @param {(chip: HTMLElement) => {scene: Scene|null, hex: {col: number, row: number}|null}} targetOf
 */
export function ringHexesOnHover(element, selector, targetOf) {
	element.addEventListener("pointerover", (event) => {
		const chip = event.target.closest?.(selector);
		if (!chip) return;
		const { scene, hex } = targetOf(chip);
		if (scene && hex && canvas?.scene?.id === scene.id) ringHoveredHex(scene, hex, chip);
	});
}

/** Called during init. */
export function registerHexTargets() {
	registerCardButtons({
		selector: SELECTOR,
		handler: async (chip) => {
			const { scene, hex } = chipTarget(chip);
			if (scene && !mayView(scene)) {
				warn("hexTarget.notShown");
				return;
			}
			// The hex it names is gone, as land a Realm put back from its backup takes away.
			if (scene && !hex) {
				warn("hexTarget.gone");
				return;
			}
			// A card about another Realm brings that Realm up first.
			await viewAndShowHex(scene, hex);
		}
	});

	Hooks.on("renderChatMessageHTML", (_message, html) => {
		if (html.querySelector(SELECTOR)) ringHexesOnHover(html, SELECTOR, chipTarget);
	});
}
