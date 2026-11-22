/**
 * One button in the Combat tracker brings the Company onto the Scene the
 * Referee is looking at and into its fight: a Token for each Knight and Squire
 * not there yet, side by side in the middle of the view, and all of them added
 * to the Combat, which is made if there is none. It stands where a fight is
 * started from, so a fight no longer begins with a drag from the sidebar for
 * each Knight. A Myth's Cast is brought the same way from the Referee Toolkit.
 */

import { t, warn } from "../chat/cards.js";
import { absentFrom, musterRow, notYetFighting } from "../rules/muster.js";
import { inCompany } from "./knights.js";

/** The button's action in the tracker. */
const MUSTER_ACTION = "bastionlandMuster";

/**
 * @param {Scene} scene
 * @returns {{x: number, y: number}} The middle of what the Referee sees of the Scene, or of the Scene itself.
 */
function viewCentre(scene) {
	const pivot = canvas?.scene === scene ? canvas.stage?.pivot : null;
	if (pivot) return { x: pivot.x, y: pivot.y };
	const { sceneX = 0, sceneY = 0, sceneWidth = 0, sceneHeight = 0 } = scene.dimensions ?? {};
	return { x: sceneX + sceneWidth / 2, y: sceneY + sceneHeight / 2 };
}

/**
 * What a Token is made of, standing centred on a point of the Scene.
 * @param {TokenDocument} token The actor's prototype, as `getTokenDocument` gives it.
 * @param {{x: number, y: number}} centre
 * @param {number} grid The Scene's grid size.
 * @returns {object}
 */
function tokenAt(token, centre, grid) {
	const corner = { x: centre.x - ((token.width ?? 1) * grid) / 2, y: centre.y - ((token.height ?? 1) * grid) / 2 };
	const { x, y } = token.getSnappedPosition?.(corner) ?? corner;
	return { ...token.toObject(), x: Math.round(x), y: Math.round(y) };
}

/**
 * Bring the Company onto a Scene and into its Combat. GMs only.
 * @param {Scene} [scene] The Scene on the canvas by default.
 * @returns {Promise<{placed: TokenDocument[], joined: TokenDocument[]}|null>} The Tokens made, and those added to the Combat.
 */
export async function bringCompany(scene = canvas?.scene) {
	if (!game.user.isGM || !scene) return null;
	const standing = game.actors.filter((actor) => inCompany(actor) && !actor.system.slain);
	if (!standing.length) {
		warn("muster.nobody");
		return null;
	}
	return bringToFight(standing, scene, { already: "muster.alreadyHere" });
}

/**
 * Bring some of a Myth's Cast onto a Scene and into its Combat, as the Company
 * is brought. GMs only.
 * @param {Actor[]} actors
 * @param {object} [options]
 * @param {Scene} [options.scene] The Scene on the canvas by default.
 * @param {boolean} [options.hidden] Placed and fighting hidden from the players, as an Alt-drag places a Token.
 * @returns {Promise<{placed: TokenDocument[], joined: TokenDocument[]}|null>}
 */
export async function bringCast(actors, { scene = canvas?.scene, hidden = false } = {}) {
	if (!game.user.isGM) return null;
	if (!scene) {
		warn("muster.noScene");
		return null;
	}
	const standing = actors.filter((actor) => actor && !actor.system?.slain);
	if (!standing.length) return null;
	return bringToFight(standing, scene, { hidden, already: "muster.castHere" });
}

/**
 * Put a Token on a Scene for each of those given who has none there yet, side
 * by side in the middle of the view, and add all their Tokens to the Combat
 * being looked at where it's this Scene's, or one made for it.
 * @param {Actor[]} actors Those to bring, none of them Slain.
 * @param {Scene} scene
 * @param {object} options
 * @param {string} options.already Said when everybody was there and fighting already.
 * @param {boolean} [options.hidden]
 * @returns {Promise<{placed: TokenDocument[], joined: TokenDocument[]}>}
 */
async function bringToFight(actors, scene, { already, hidden = false }) {
	const absent = absentFrom(actors.map((actor) => ({ id: actor.id, actor })), scene.tokens.map((token) => token.actorId));
	const grid = scene.grid?.size ?? canvas?.grid?.size ?? 100;
	// Made in the Scene, so each snaps to the Scene's own grid and not Foundry's default square one.
	const prototypes = await Promise.all(absent.map(({ actor }) => actor.getTokenDocument({}, { parent: scene })));
	const spots = musterRow(viewCentre(scene), prototypes.map((token) => token.width ?? 1), grid);
	const data = prototypes.map((token, index) => tokenAt(token, spots[index], grid));
	if (hidden) for (const token of data) token.hidden = true;
	const placed = data.length ? await scene.createEmbeddedDocuments("Token", data) : [];

	const viewed = game.combats.viewed;
	const combat = viewed && (!viewed.scene || viewed.scene.id === scene.id)
		? viewed
		: await CONFIG.Combat.documentClass.create({ scene: scene.id, active: true });
	const ids = new Set(actors.map((actor) => actor.id));
	const theirs = scene.tokens.filter((token) => ids.has(token.actorId));
	const joining = notYetFighting(theirs, combat.combatants.map((combatant) => combatant.tokenId));
	if (joining.length) {
		await combat.createEmbeddedDocuments("Combatant", joining.map((token) => ({ tokenId: token.id, sceneId: scene.id, actorId: token.actorId, hidden: token.hidden })));
	}

	// Everyone brought: those placed on the Scene, and those already on it who only joined the fight.
	const brought = [...new Map([...placed, ...joining].map((token) => [token.id, token])).values()];
	if (!brought.length) ui.notifications.info(t(already));
	else ui.notifications.info(t("muster.brought", { names: brought.map((token) => token.name).join(", ") }));
	return { placed, joined: joining };
}

/**
 * Add the button to the Combat tracker's controls, in the tracker's own dress.
 * @param {HTMLElement|{0: HTMLElement}} html The tracker as drawn.
 */
function addMusterButton(html) {
	const root = html instanceof HTMLElement ? html : html?.[0];
	if (!game.user.isGM || !root || root.querySelector(`[data-action="${MUSTER_ACTION}"]`)) return;
	const controls = root.querySelector(".encounter-controls");
	const left = controls?.querySelector(".control-buttons.left");
	if (!left) return;
	const button = document.createElement("button");
	button.type = "button";
	button.className = "inline-control combat-control icon fa-solid fa-chess-knight";
	button.dataset.action = MUSTER_ACTION;
	const label = t("muster.button");
	button.dataset.tooltip = label;
	button.setAttribute("aria-label", label);
	button.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		return bringCompany();
	});
	left.append(button);
	// The round's title stays in the middle: the other side gets a blank of the same width.
	const spacer = document.createElement("div");
	spacer.className = "spacer";
	controls.querySelector(".control-buttons.right")?.prepend(spacer);
}

/** Called during init. */
export function registerMuster() {
	Hooks.on("renderCombatTracker", (_app, html) => addMusterButton(html));
}
