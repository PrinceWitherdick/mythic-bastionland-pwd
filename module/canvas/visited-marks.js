import { getJourney } from "../actions/journey.js";
import { isRealmScene, sceneGeometry } from "../actions/realm.js";
import { INK_HEX } from "../rules/colour.js";
import { hexCentre, hexKey, hexVertices } from "../rules/realm-geometry.js";
import { visitedMarkHexes } from "../rules/travels.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * The hexes the Company has been to, pencilled round on the map: a thin dashed
 * line just inside each one, leaving its middle to the Token, the Realm's
 * pictures and the marks of what was seen from afar. Drawn on every client,
 * and shown or hidden by each person for themselves.
 */

/** Whether this browser draws the marks. */
export const VISITED_MARKS_SETTING = "visitedMarksShown";

/** How far in from the hex's edge the line runs, its dashes and its weight, in parts of a hex. */
const MARK = Object.freeze({ inset: 0.12, dash: 0.11, gap: 0.07, line: 0.018, alpha: 0.45 });

/** Above the Realm tools' own drawing, below the marks of what was seen from afar. */
const Z_INDEX = 955;

/** @type {PIXI.Container|null} The marks on this canvas, made again for each Scene drawn. */
let layer = null;

/** Where the layer's marks stand, so a Scene change that leaves them as they were draws nothing again. */
let drawn = null;

/** Register the marks' setting. Called during init. */
export function registerVisitedMarksSetting() {
	game.settings.register(SYSTEM_ID, VISITED_MARKS_SETTING, {
		name: "bastionland.settings.visitedMarksShown.name",
		hint: "bastionland.settings.visitedMarksShown.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: () => {
			drawVisitedMarks();
			// The toggle among the Token tools follows a change made on a Settings page.
			ui.controls?.render?.({ reset: true });
		}
	});
}

/** @returns {boolean} Whether this browser shows the marks. */
export function visitedMarksShown() {
	try {
		return game.settings.get(SYSTEM_ID, VISITED_MARKS_SETTING) !== false;
	} catch {
		return true;
	}
}

/**
 * Show or hide the marks in this browser.
 * @param {boolean} shown
 * @returns {Promise<unknown>}
 */
export async function setVisitedMarksShown(shown) {
	if (visitedMarksShown() === Boolean(shown)) return null;
	return game.settings.set(SYSTEM_ID, VISITED_MARKS_SETTING, Boolean(shown));
}

/**
 * The dashes of one hex's mark: its outline drawn in toward the middle, broken
 * into short strokes the way a pencil goes round a place on a paper map.
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @returns {{from: {x: number, y: number}, to: {x: number, y: number}}[]}
 */
export function visitedMarkDashes(g, hex) {
	const centre = hexCentre(g, hex);
	const corners = hexVertices(g, hex).map(({ x, y }) => ({
		x: x + (centre.x - x) * MARK.inset,
		y: y + (centre.y - y) * MARK.inset
	}));
	const dash = g.size * MARK.dash;
	const gap = g.size * MARK.gap;
	const dashes = [];
	corners.forEach((from, index) => {
		const to = corners[(index + 1) % corners.length];
		const length = Math.hypot(to.x - from.x, to.y - from.y);
		// Each side starts and ends on a stroke, so the corners read as corners.
		const count = Math.max(1, Math.round((length + gap) / (dash + gap)));
		const step = (length + gap) / count;
		const along = (distance) => ({ x: from.x + ((to.x - from.x) * distance) / length, y: from.y + ((to.y - from.y) * distance) / length });
		for (let k = 0; k < count; k++) dashes.push({ from: along(k * step), to: along(Math.min(length, k * step + step - gap)) });
	});
	return dashes;
}

/**
 * Draw the marks on the Realm on the canvas again, after the Scene was drawn,
 * the Company moved, or the setting changed. Anywhere else, there are none.
 */
export function drawVisitedMarks() {
	if (!canvas?.ready || !canvas.interface) return;
	// Foundry destroys what hangs on its groups as the canvas is torn down, so each Scene drawn gets a layer of its own.
	if (!layer || layer.destroyed || layer.parent !== canvas.interface) {
		layer = new PIXI.Container();
		layer.eventMode = "none";
		layer.zIndex = Z_INDEX;
		canvas.interface.addChild(layer);
		drawn = null;
	}

	const scene = canvas.scene;
	try {
		const shown = isRealmScene(scene) && visitedMarksShown();
		const g = shown ? sceneGeometry(scene) : null;
		const hexes = shown ? visitedMarkHexes(getJourney(scene)) : [];
		const key = hexes.length ? JSON.stringify([g, hexes.map(hexKey).sort()]) : "";
		if (key === drawn) return;
		for (const mark of layer.removeChildren()) mark.destroy({ children: true });
		drawn = key;
		if (!hexes.length) return;
		const marks = layer.addChild(new PIXI.Graphics());
		marks.lineStyle({ width: Math.max(2, g.size * MARK.line), color: INK_HEX, alpha: MARK.alpha, cap: "round" });
		for (const hex of hexes) {
			for (const { from, to } of visitedMarkDashes(g, hex)) {
				marks.moveTo(from.x, from.y);
				marks.lineTo(to.x, to.y);
			}
		}
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't mark the hexes the Company has been to`, error);
	}
}
