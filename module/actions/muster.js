/**
 * One button in the Combat tracker brings the Company onto the Scene the
 * Referee is looking at and into its fight: a Token for each Knight and Squire
 * not there yet, side by side in the middle of the view, and all of them added
 * to the Combat, which is made if there is none. It stands where a fight is
 * started from, so a fight no longer begins with a drag from the sidebar for
 * each Knight.
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
 * What a Knight's Token is made of, standing centred on a point of the Scene.
 * @param {Actor} actor
 * @param {{x: number, y: number}} centre
 * @param {number} grid The Scene's grid size.
 * @returns {Promise<object>}
 */
async function tokenAt(actor, centre, grid) {
	const token = await actor.getTokenDocument();
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
	const absent = absentFrom(standing.map((actor) => ({ id: actor.id, actor })), scene.tokens.map((token) => token.actorId));
	const grid = scene.grid?.size ?? canvas?.grid?.size ?? 100;
	const spots = musterRow(viewCentre(scene), absent.length, grid);
	const data = await Promise.all(absent.map(({ actor }, index) => tokenAt(actor, spots[index], grid)));
	const placed = data.length ? await scene.createEmbeddedDocuments("Token", data) : [];

	// The Combat being looked at where it's this Scene's, or one made for it.
	const viewed = game.combats.viewed;
	const combat = viewed && (!viewed.scene || viewed.scene.id === scene.id)
		? viewed
		: await CONFIG.Combat.documentClass.create({ scene: scene.id, active: true });
	const ids = new Set(standing.map((actor) => actor.id));
	const theirs = scene.tokens.filter((token) => ids.has(token.actorId));
	const joining = notYetFighting(theirs, combat.combatants.map((combatant) => combatant.tokenId));
	if (joining.length) {
		await combat.createEmbeddedDocuments("Combatant", joining.map((token) => ({ tokenId: token.id, sceneId: scene.id, actorId: token.actorId, hidden: token.hidden })));
	}

	// Everyone brought: those placed on the Scene, and those already on it who only joined the fight.
	const brought = [...new Map([...placed, ...joining].map((token) => [token.id, token])).values()];
	if (!brought.length) ui.notifications.info(t("muster.alreadyHere"));
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
