import { foggedForMe, foggedForPlayers, realmFogHoldingsShow, realmFogLook } from "../actions/realm-fog.js";
import { isRealmScene, sceneGeometry } from "../actions/realm.js";
import { scenePaper } from "../compat.js";
import { HEX_COLOR, PAPER_HEX, colourNumber } from "../rules/colour.js";
import { LEVEL_ID, realmFlag } from "../rules/realm-documents.js";
import { FOG_OVERLAP, FOG_SORT_LAYER, fogAlpha, fogCoverKey, fogPolygon, tokenFogged } from "../rules/realm-fog.js";
import { hexAt, hexKey, parseHexKey } from "../rules/realm-geometry.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * The Fog of War on the canvas: plain paper over each hex still in the fog,
 * so it looks like the sheet before anything was drawn on it. It lies among
 * what Foundry draws of the Scene, over the map's picture and every Tile and
 * under its Drawings, so the Barriers, the Tokens, the grid's lines and the
 * system's own marks are all drawn over it. A Referee not playing alone sees
 * through it, as a thin veil over what the players can't see.
 */

/** @type {PIXI.Graphics|null} Foundry destroys what hangs on the canvas as it's torn down, so this is made again when it has gone. */
let cover = null;

/** What the cover was last drawn from, from fogCoverKey. */
let drawn = "";

/**
 * @param {Scene} scene
 * @returns {number} The colour of the Scene's paper, which is what the fog looks like.
 */
function paperColour(scene) {
	const colour = scenePaper(scene, LEVEL_ID)?.colour?.toLowerCase?.();
	return HEX_COLOR.test(colour) ? colourNumber(colour) : PAPER_HEX;
}

/** @returns {boolean} Whether this client's Referee has the fog brush in hand. */
const brushInHand = () => Boolean(canvas.realm?.active && canvas.realm.tool === "fog");

/** @returns {PIXI.Graphics} The cover, on the canvas as it is now. */
function coverOnCanvas() {
	if (cover && !cover.destroyed && cover.parent === canvas.primary) return cover;
	cover = new foundry.canvas.primary.PrimaryGraphics({ name: `${SYSTEM_ID}.realmFog` });
	cover.elevation = 0;
	cover.sortLayer = FOG_SORT_LAYER;
	cover.eventMode = "none";
	canvas.primary.addChild(cover);
	drawn = "";
	return cover;
}

/**
 * Take the fog off the canvas, as for a Scene with none.
 * @returns {boolean} Whether there was any to take off.
 */
export function clearRealmFog() {
	const had = Boolean(cover && !cover.destroyed);
	if (had) {
		cover.parent?.removeChild(cover);
		cover.destroy();
	}
	cover = null;
	drawn = "";
	return had;
}

/**
 * Draw the fog on the Realm on the canvas again, after the Scene was drawn,
 * the Company moved, the fog was lifted or brought back, or the brush was
 * picked up or put down. Drawn again only when it would look different.
 * @returns {boolean} Whether it looks different now: drawn again, or taken off.
 */
export function drawRealmFog() {
	if (!canvas?.ready || !canvas.primary) return false;
	const scene = canvas.scene;
	try {
		const look = realmFogLook(scene);
		if (look === "none") return clearRealmFog();
		const g = sceneGeometry(scene);
		const fogged = foggedForPlayers(scene);
		const alpha = fogAlpha(look, { brush: brushInHand() });
		const paper = paperColour(scene);
		const key = fogCoverKey({ alpha, paper, g, fogged });
		if (!key) return clearRealmFog();
		const graphics = coverOnCanvas();
		if (key === drawn) return false;
		drawn = key;
		graphics.clear();
		// Fog laid edge to edge at full strength overlaps a little so no seam shows between two hexes;
		// a veil the Referee sees through doesn't, as the overlap would show twice as thick.
		const grow = alpha < 1 ? 0 : FOG_OVERLAP;
		graphics.beginFill(paper, alpha);
		for (const foggedKey of fogged) {
			const hex = parseHexKey(foggedKey);
			if (hex) graphics.drawPolygon(fogPolygon(g, hex, grow));
		}
		graphics.endFill();
		return true;
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't draw the Fog of War`, error);
		return true;
	}
}

/** The Tiles of a Realm that are its Holdings: each one's icon, and the crown over the Seat. */
const HOLDING_KINDS = new Set(["holding", "seat"]);

/** Where a Holding's icon is drawn while the Realm's Holdings show through the fog: just over it. */
export const HOLDINGS_SORT_LAYER = FOG_SORT_LAYER + 10;

/**
 * @param {Tile} tile
 * @returns {boolean} Whether it's a Holding or Seat of a Realm whose Holdings show through its fog.
 */
const holdingThroughFog = (tile) => HOLDING_KINDS.has(realmFlag(tile?.document)?.kind) && realmFogHoldingsShow(tile.document.parent);

/**
 * @param {typeof Tile} Base The class Foundry, or a module, draws Tiles with.
 * @returns {typeof Tile} One that draws a Realm's Holdings over its fog, while it says they show through.
 */
export const liftingHoldings = (Base) =>
	class extends Base {
		/** @override */
		_refreshState() {
			super._refreshState();
			// Foundry puts every Tile back among the Tiles on each refresh.
			if (this.mesh && holdingThroughFog(this)) this.mesh.sortLayer = HOLDINGS_SORT_LAYER;
		}
	};

/**
 * @param {Token} token
 * @returns {boolean} Whether the fog keeps the Token off this client's map: one standing in a hex it
 *   can't see into, that isn't the Company and isn't theirs. Read where the Token rests, not where it's
 *   drawn on its way there.
 */
export function tokenInFog(token) {
	const document = token?.document;
	const scene = document?.parent;
	const fogged = foggedForMe(scene);
	if (!fogged.size) return false;
	const point = document.getCenterPoint?.() ?? token.center;
	const hex = point ? hexAt(sceneGeometry(scene), point) : null;
	return tokenFogged({
		fogged: Boolean(hex) && fogged.has(hexKey(hex)),
		company: Boolean(token.isCompany),
		owner: Boolean(document.isOwner)
	});
}

/**
 * Have the Tokens and the Holdings on the canvas look at the fog again, after
 * it was lifted, brought back, or turned on or off.
 */
export function refreshFoggedPlaceables() {
	if (!canvas?.ready || !isRealmScene(canvas.scene)) return;
	for (const token of canvas.tokens?.placeables ?? []) token.renderFlags?.set({ refreshVisibility: true });
	for (const tile of canvas.tiles?.placeables ?? []) {
		if (HOLDING_KINDS.has(realmFlag(tile.document)?.kind)) tile.renderFlags?.set({ refreshState: true });
	}
}
