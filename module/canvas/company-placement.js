import { companyPicture, setCompanyHex } from "../actions/company.js";
import { isRealmScene, sceneGeometry } from "../actions/realm.js";
import { t } from "../chat/cards.js";
import { INK_HEX } from "../rules/colour.js";
import { hexAt, hexCentre, hexVertices, sameHex } from "../rules/realm-geometry.js";

/** The ink the hex under the Company is ringed in. */

/** How solid the Company looks while it's only being held over the map. */
const GHOST_ALPHA = 0.6;

/** How far the pointer may travel between a right button going down and coming up and still count as a click, not a pan. */
const CLICK_SLOP = 6;

/**
 * @typedef {object} Placement The Company being carried to a hex.
 * @property {Scene} scene
 * @property {PIXI.Container} marks What's drawn under the pointer: the ring and the Company.
 * @property {PIXI.Graphics} ring
 * @property {PIXI.Sprite} ghost
 * @property {object|null} note The standing notification saying what to do.
 * @property {{col: number, row: number}|null} hex Where the pointer is now.
 * @property {{x: number, y: number}|null} rightDown Where a right button went down, to tell a click from a pan.
 * @property {number|null} tearDown The `canvasTearDown` hook watching for the Realm going away.
 */

/** @type {Placement|null} The one Company this browser is carrying. */
let placing = null;

/** @returns {boolean} Whether the GM is carrying the Company about the map. */
export const isPlacingCompany = () => Boolean(placing);

/**
 * Draw the Company over a hex, or take it off the map while the pointer is
 * past the edge of the Realm.
 * @param {{col: number, row: number}|null} hex
 */
function drawGhost(hex) {
	if (!placing) return;
	placing.hex = hex;
	placing.marks.visible = Boolean(hex);
	if (!hex) return;
	const g = sceneGeometry(placing.scene);
	const { x, y } = hexCentre(g, hex);

	placing.ring.clear();
	placing.ring.lineStyle({ width: g.size / 24, color: INK_HEX, alpha: 0.8, join: PIXI.LINE_JOIN.ROUND });
	const [first, ...rest] = hexVertices(g, hex);
	placing.ring.moveTo(first.x, first.y);
	for (const corner of rest) placing.ring.lineTo(corner.x, corner.y);
	placing.ring.closePath();

	placing.ghost.position.set(x, y);
}

/** @returns {{col: number, row: number}|null} The hex under the pointer, or null past the edge of the Realm. */
function hexAtPointer() {
	if (!placing) return null;
	return hexAt(sceneGeometry(placing.scene), canvas.mousePosition);
}

/** Follow the pointer, redrawing only as it crosses into another hex. */
function onPointerMove() {
	if (!placing) return;
	const hex = hexAtPointer();
	if (hex ? sameHex(hex, placing.hex) : !placing.hex) return;
	drawGhost(hex);
}

/**
 * @param {Event} event
 * @returns {boolean} Whether the event happened over the map rather than over a window or the sidebar.
 */
const onBoard = (event) => event.target instanceof Element && event.target.id === "board";

/** Put the Company down and clear everything the carrying put up. */
function endPlacement() {
	if (!placing) return;
	canvas?.stage?.off("pointermove", onPointerMove);
	window.removeEventListener("pointerdown", onPointerDown, true);
	window.removeEventListener("pointerup", onPointerUp, true);
	window.removeEventListener("keydown", onKeyDown, true);
	if (placing.tearDown !== null) Hooks.off("canvasTearDown", placing.tearDown);
	if (placing.note) ui.notifications.remove(placing.note);
	placing.marks.destroy({ children: true });
	placing = null;
}

/**
 * Give up carrying the Company, leaving it off the map until the GM stands it
 * in a hex from the Hex panel.
 * @param {object} [options]
 * @param {boolean} [options.quiet] True when the Realm itself has gone, so there's nothing to say.
 */
export function cancelCompanyPlacement({ quiet = false } = {}) {
	if (!placing) return;
	endPlacement();
	if (!quiet) ui.notifications.info(t("company.placing.later"));
}

/**
 * Stand the Company in the hex it's being held over.
 * @param {{col: number, row: number}} hex
 * @returns {Promise<void>}
 */
async function placeHere(hex) {
	const scene = placing?.scene;
	endPlacement();
	if (!scene) return;
	const token = await setCompanyHex(scene, hex);
	if (token) ui.notifications.info(t("company.placed", { hex: t("realm.hex", hex) }));
}

/**
 * A left click on a hex stands the Company in it. The click is caught before
 * the canvas sees it, so the tool in hand — the Hex panel, a terrain brush —
 * doesn't act on the same click.
 * @param {PointerEvent} event
 */
function onPointerDown(event) {
	if (!placing || !onBoard(event)) return;
	// A right button is left to the canvas, so the map can still be dragged about while the Company is carried over it.
	if (event.button === 2) {
		placing.rightDown = { x: event.clientX, y: event.clientY };
		return;
	}
	if (event.button !== 0) return;
	const hex = hexAtPointer();
	// Past the edge of the Realm there's no hex to stand in, and nothing to take the click for.
	if (!hex) return;
	event.preventDefault();
	event.stopImmediatePropagation();
	placeHere(hex);
}

/**
 * A right click gives up carrying the Company; a right drag pans the map and
 * leaves it in hand.
 * @param {PointerEvent} event
 */
function onPointerUp(event) {
	if (!placing || event.button !== 2) return;
	const down = placing.rightDown;
	placing.rightDown = null;
	if (!down || !onBoard(event)) return;
	if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_SLOP) return;
	cancelCompanyPlacement();
}

/**
 * Escape gives up carrying the Company, before Foundry takes the key for its
 * own.
 * @param {KeyboardEvent} event
 */
function onKeyDown(event) {
	if (!placing || event.key !== "Escape") return;
	event.preventDefault();
	event.stopImmediatePropagation();
	cancelCompanyPlacement();
}

/**
 * Hand the GM the Company to put down where they please: it follows the
 * pointer across the Realm, half-there, and stands in the hex they click.
 *
 * This is what happens for the Starts whose Company doesn't begin anywhere the
 * book names — a Wanderer arriving, a Ruler's Holding, a Courtier's Realm with
 * no Seat of Power.
 *
 * @param {Scene} scene
 * @param {object} [options]
 * @param {string} [options.start] One of COMPANY_STARTS, for what the notification says.
 * @param {string} [options.img] The picture to carry; the Realm's own by default.
 * @returns {Promise<boolean>} False when there's no map to carry it over, so the caller can say so another way.
 */
export async function startCompanyPlacement(scene, { start, img } = {}) {
	cancelCompanyPlacement({ quiet: true });
	if (!game.user.isGM || !isRealmScene(scene)) return false;
	if (!canvas?.ready || canvas.scene?.id !== scene.id) return false;

	const texture = await foundry.canvas.loadTexture(img || companyPicture(scene));
	if (!texture) return false;
	// Loading gives the GM time to have moved on, or to have been handed a Company already.
	if (placing || canvas.scene?.id !== scene.id) return false;

	const marks = (canvas.controls ?? canvas.stage).addChild(new PIXI.Container());
	marks.eventMode = "none";
	marks.visible = false;
	const ring = marks.addChild(new PIXI.Graphics());
	const ghost = marks.addChild(new PIXI.Sprite(texture));
	ghost.anchor.set(0.5);
	ghost.alpha = GHOST_ALPHA;

	// As the Token will sit once it's placed: contained in the box around the hex, as Foundry fits a Token's picture.
	const g = sceneGeometry(scene);
	const scale = Math.min(g.hexWidth / texture.width, g.hexHeight / texture.height);
	ghost.width = texture.width * scale;
	ghost.height = texture.height * scale;

	const note = ui.notifications.info(`${t(`company.choose.${start}`)} ${t("company.placing.stop")}`, { permanent: true });
	placing = { scene, marks, ring, ghost, note, hex: null, rightDown: null, tearDown: null };
	placing.tearDown = Hooks.on("canvasTearDown", () => cancelCompanyPlacement({ quiet: true }));

	canvas.stage.on("pointermove", onPointerMove);
	window.addEventListener("pointerdown", onPointerDown, true);
	window.addEventListener("pointerup", onPointerUp, true);
	window.addEventListener("keydown", onKeyDown, true);
	drawGhost(hexAtPointer());
	return true;
}
