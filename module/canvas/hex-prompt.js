import { findCompanyToken } from "../actions/company.js";
import { hexLorePromptMode } from "../actions/hex-lore.js";
import { isRealmScene, sceneGeometry } from "../actions/realm.js";
import { openHexLore } from "../apps/HexLore.js";
import { hexAt, hexKey } from "../rules/realm-geometry.js";

/**
 * Where a Company has just come to rest, waiting to be offered to the GM:
 * the hexes of each Scene, by the Scene's id, so a Scene is forgotten in one go.
 * @type {Map<string, Map<string, {scene: Scene, hex: {col: number, row: number}}>>}
 */
const arrived = new Map();

/**
 * The hex each Scene's Company was last met in, by Scene id. Shuffling a Token
 * about within the hex it already stands in isn't arriving anywhere, so the
 * window only follows a step into a hex the Company wasn't in a moment ago.
 * @type {Map<string, string>}
 */
const standing = new Map();

/**
 * The hex a Realm's Company reached while the GM was looking at something else,
 * by Scene id, waiting for them to look at that Realm. Later moves overwrite
 * it, so what waits is always where the Company stands now.
 * @type {Map<string, {col: number, row: number}>}
 */
const waitingOn = new Map();

/** How long to wait for the rest of a Company before offering what it reached. */
const GATHER = 250;

/** Whether the arrivals so far are already waiting their turn to be offered. */
let gathering = false;

/**
 * Open the Lay of the Land on the hexes just arrived in: everything the GM
 * knows about the place, and every way of finding out more, in one window
 * rather than a notice that says only that they've moved. The window is a help
 * offered, never a write: nothing is recorded here.
 */
function offerArrivals() {
	const waiting = [...arrived.values()].flatMap((hexes) => [...hexes.values()]);
	arrived.clear();
	if (hexLorePromptMode() === "never") return;

	let opened = false;
	for (const { scene, hex } of waiting) {
		// A window thrown open over a Realm the GM isn't looking at is a jump, not
		// a help, so that Realm's arrival waits until they look at it.
		if (scene.id !== canvas.scene?.id) {
			waitingOn.set(scene.id, hex);
			continue;
		}
		// One window serves however many Tokens walked in at once.
		if (opened) continue;
		opened = showArrival(scene, hex);
	}
}

/**
 * Open the Lay of the Land where the Company has come to rest, unless they were
 * already standing there when the GM last saw them.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @returns {boolean} Whether the window was opened on it.
 */
function showArrival(scene, hex) {
	const key = hexKey(hex);
	if (standing.get(scene.id) === key) return false;
	standing.set(scene.id, key);
	// Already open, and it moves to the new hex rather than opening again.
	openHexLore({ scene, hex });
	return true;
}

/**
 * Open what a Realm's Company reached while the GM was looking elsewhere, now
 * that they're looking at the Realm. Nothing waits from before this browser
 * loaded, so coming back to a world opens no window. Called as the canvas
 * becomes ready.
 */
export function offerWaitingArrival() {
	const scene = canvas?.scene;
	if (!game.user.isGM || !isRealmScene(scene) || hexLorePromptMode() === "never") return;
	const hex = waitingOn.get(scene.id);
	if (!hex) return;
	waitingOn.delete(scene.id);
	showArrival(scene, hex);
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
 * about it, because the setting that decides is that browser's own.
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
	standing.delete(sceneId);
	waitingOn.delete(sceneId);
	arrived.delete(sceneId);
}
