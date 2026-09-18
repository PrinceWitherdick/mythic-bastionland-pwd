import { findCompanyToken } from "../actions/company.js";
import { getHexRecord, hexLorePromptMode } from "../actions/hex-lore.js";
import { isRealmScene, sceneGeometry } from "../actions/realm.js";
import { openHexLore } from "../apps/HexLore.js";
import { t } from "../chat/cards.js";
import { hexAt, hexKey } from "../rules/realm-geometry.js";

/**
 * Where a Company has just come to rest, waiting to be offered to the GM:
 * the hexes of each Scene, by the Scene's id, so a Scene is forgotten in one go.
 * @type {Map<string, Map<string, {scene: Scene, hex: {col: number, row: number}}>>}
 */
const arrived = new Map();

/**
 * Hexes this browser has already offered, by Scene id. Closing the window
 * without writing anything shouldn't mean being asked again at the next step
 * back into the hex, so an offer stands until the world is reloaded.
 * @type {Map<string, Set<string>>}
 */
const offered = new Map();

/** How long to wait for the rest of a Company before offering what it reached. */
const GATHER = 250;

/** Whether the arrivals so far are already waiting their turn to be offered. */
let gathering = false;

/** Offer the hexes that have just been arrived in. */
function offerArrivals() {
	const waiting = [...arrived.values()].flatMap((hexes) => [...hexes.values()]);
	arrived.clear();
	const mode = hexLorePromptMode();
	if (mode === "never") return;

	let opened = false;
	for (const { scene, hex } of waiting) {
		const seen = offered.get(scene.id) ?? new Set();
		const key = hexKey(hex);
		if (seen.has(key)) continue;
		if (getHexRecord(scene, hex)) continue;
		offered.set(scene.id, seen.add(key));
		// A window thrown open over a Realm the GM isn't looking at is a jump, not a help.
		if (mode === "open" && !opened && scene.id === canvas.scene?.id) {
			openHexLore({ scene, hex });
			opened = true;
			continue;
		}
		ui.notifications.info(t("hexLore.prompt", { hex: t("realm.hex", hex), scene: scene.name }));
	}
}

/**
 * Offer what's been arrived in, once the Company has finished arriving. Four
 * Tokens land on the same hex within moments of each other, so the arrivals are
 * gathered first and offered together.
 */
function offer() {
	if (gathering) return;
	gathering = true;
	setTimeout(() => {
		gathering = false;
		offerArrivals();
	}, GATHER);
}

/**
 * Whether a movement has come to rest. Foundry hands a long move to the
 * `moveToken` hook a leg at a time, and reads the same three fields to decide
 * whether the Token is still on its way: what's left to walk, and whether walls
 * cut the walk short. A leg with nothing pending behind it is the last one.
 * @param {object} movement The movement from the `moveToken` hook.
 * @returns {boolean} True once the Token has stopped where it's going to stop.
 */
function atRest(movement) {
	if (!movement) return false;
	return Boolean(movement.constrained) || !movement.pending?.waypoints?.length;
}

/**
 * Notice a player's Token coming to rest in a hex of a Realm. Every client is
 * told about the move, and each GM's browser decides for itself what to do
 * about it, because the setting that decides is that browser's own. Nothing is
 * written here: the offer is only an offer.
 * @param {TokenDocument} token
 * @param {object} movement The movement from the `moveToken` hook.
 */
function noticeArrival(token, movement) {
	if (!game.user.isGM || hexLorePromptMode() === "never") return;
	const scene = token.parent;
	if (!isRealmScene(scene)) return;
	// With a Company Token on the map that Token alone is the Company. Without
	// one, any player's Token arriving somewhere counts.
	const company = findCompanyToken(scene);
	if (company ? token.id !== company.id : !token.actor?.hasPlayerOwner) return;
	// Taking a move back isn't arriving anywhere.
	if (movement?.method === "undo") return;
	// One drag across five hexes arrives once, at the end of it.
	if (!atRest(movement)) return;

	const hex = hexAt(sceneGeometry(scene), token.getCenterPoint());
	if (!hex) return;
	const hexes = arrived.get(scene.id) ?? new Map();
	arrived.set(scene.id, hexes.set(hexKey(hex), { scene, hex }));
	offer();
}

/** Watch for a Company arriving somewhere new. Called during init. */
export function registerHexPrompt() {
	Hooks.on("moveToken", noticeArrival);
}

/**
 * Forget what was offered on a Scene that has gone.
 * @param {string} sceneId
 */
export function forgetHexArrivals(sceneId) {
	offered.delete(sceneId);
	arrived.delete(sceneId);
}
