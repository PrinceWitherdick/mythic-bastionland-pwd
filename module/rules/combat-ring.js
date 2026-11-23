import { KNIGHT_TYPES } from "./knight-types.js";

/*
 * The combat buttons round a Token: click a Token that's in a Combat, and what
 * it does most in a fight comes up beside it, so nobody has to open a sheet
 * for it. Foundry's own Token HUD comes up on a right-click; these on a plain
 * left-click, laid out the same way, in two columns.
 *
 * What it holds, and only what that actor's sheet offers:
 *  - a Knight, a Squire or an NPC: Attack and Take Damage on the left, and the
 *    three Saves on the right, each showing the Virtue's score;
 *  - an NPC also Morale, under Take Damage (p10);
 *  - a Structure: Take Damage, and Attack if it carries a weapon, as its sheet
 *    offers. It has no Virtues, so no Saves.
 * Feats and Gambits are left off: they're in the Attack dialog and on its card.
 *
 * The Foundry half, the window and the clicks, is module/canvas/combat-ring.js.
 */

/** The Virtues a Save is rolled against, in the sheet's order. */
export const RING_SAVES = Object.freeze(["vig", "cla", "spi"]);

/** Tools a click on a Token means something else under: aiming, and measuring. */
const OTHER_TOOLS = new Set(["target", "ruler"]);

/**
 * @typedef {object} RingButton
 * @property {"attack"|"takeDamage"|"morale"|"save"} run What the button does: the sheet's own control of that name.
 * @property {string} icon Font Awesome classes, as on the sheet.
 * @property {string} [virtue] Which Save ("save").
 * @property {number} [value] That Virtue's score now ("save").
 */

/**
 * What an actor's buttons are.
 * @param {{type?: string, system?: object, items?: Iterable<{type?: string}>}|null} actor
 * @returns {{fight: RingButton[], saves: RingButton[]}} The left column, then the right.
 */
export function ringButtons(actor) {
	const fight = [];
	const saves = [];
	const type = actor?.type;
	const virtued = KNIGHT_TYPES.includes(type) || type === "npc";
	if (!virtued && type !== "structure") return { fight, saves };

	// A Structure attacks only with a weapon aboard, as its sheet offers it (a ship's ram, a tower's ballista).
	const armed = type !== "structure" || [...(actor.items ?? [])].some((item) => item?.type === "weapon");
	if (armed) fight.push({ run: "attack", icon: "fa-solid fa-swords" });
	fight.push({ run: "takeDamage", icon: "fa-solid fa-heart-crack" });
	if (type === "npc") fight.push({ run: "morale", icon: "fa-solid fa-flag" });

	if (virtued) {
		for (const virtue of RING_SAVES) {
			const value = Number(actor.system?.virtues?.[virtue]?.value);
			saves.push({ run: "save", virtue, value: Number.isFinite(value) ? value : 0, icon: "fa-solid fa-dice-d20" });
		}
	}
	return { fight, saves };
}

/**
 * @param {{fight?: RingButton[], saves?: RingButton[]}|null} buttons
 * @returns {boolean} Whether there's anything to put up.
 */
export const ringHasButtons = (buttons) => Boolean(buttons?.fight?.length || buttons?.saves?.length);

/**
 * The Combat a Token stands in, on the Scene it's on, while it hasn't been
 * marked defeated: a Combat begun on any Scene counts, so long as this Token
 * is one of its combatants.
 * @param {{id?: string, parent?: {id?: string}|null}|null} token The TokenDocument.
 * @param {Iterable<{combatants?: Iterable<object>}>} combats Every Combat in the world.
 * @returns {object|null} Its combatant, or null.
 */
export function ringCombatant(token, combats) {
	const sceneId = token?.parent?.id;
	if (!token?.id || !sceneId) return null;
	for (const combat of combats ?? []) {
		for (const combatant of combat?.combatants ?? []) {
			if (combatant?.tokenId !== token.id || combatant?.sceneId !== sceneId) continue;
			// Marked defeated in the tracker, they've nothing left to roll in this fight.
			if (combatant.isDefeated || combatant.defeated) return null;
			return combatant;
		}
	}
	return null;
}

/**
 * Whether a click that has just let go of a Token should put its buttons up.
 * @param {object} click
 * @param {string|null} [click.pressedOn] The Token whose buttons this same press put away, if any.
 * @param {string|null} click.tokenId
 * @param {string|null} [click.tool] The Token layer's tool.
 * @param {boolean} [click.modifiers] Shift, Ctrl, Alt or Meta held: adding to a selection isn't asking for buttons.
 * @param {boolean} [click.controlled] Whether the Token is selected once the click is done.
 * @returns {boolean}
 */
export function clickOpensRing({ pressedOn = null, tokenId, tool = null, modifiers = false, controlled = false }) {
	// Pressing a Token whose buttons are up puts them away, as a second right-click does Foundry's HUD.
	if (pressedOn && pressedOn === tokenId) return false;
	if (OTHER_TOOLS.has(tool) || modifiers) return false;
	return Boolean(controlled);
}

/**
 * How much bigger than Foundry's HUD scale to draw the buttons, so they're
 * never smaller on screen than their own size: zoomed out, Foundry's HUD
 * shrinks to specks, and these have words on them to read.
 * @param {number} zoom The canvas stage's scale.
 * @param {number} scale The scale Foundry's HUD placing gives it, the grid's size over 100.
 * @returns {number} 1 where the map's own scale already draws them at their size.
 */
export function ringGrowth(zoom, scale) {
	const onScreen = Number(zoom) * Number(scale);
	return onScreen > 0 && onScreen < 1 ? 1 / onScreen : 1;
}
