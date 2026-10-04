import { getJourney } from "../actions/journey.js";
import { read } from "../client-settings.js";
import { isRealmScene, sceneGeometry } from "../actions/realm.js";
import { PAPER_HEX, colourNumber } from "../rules/colour.js";
import { hexKey } from "../rules/realm-geometry.js";
import { visitedMarkHexes } from "../rules/travels.js";
import {
	DEFAULT_VISITED_MARK_COLOURS,
	DEFAULT_VISITED_MARK_STYLE,
	VISITED_MARK_STYLES,
	visitedMarkColours,
	visitedMarkPen,
	visitedMarkStrokes,
	visitedMarkStyle
} from "../rules/visited-mark-style.js";
import { SYSTEM_ID } from "../system-id.js";
import { refreshTravelsButtons } from "./travels-controls.js";

/**
 * The hexes the Company has been to, marked on the map: pencilled round with a
 * thin dashed line just inside, ticked, crossed or with the hex's edge drawn
 * over, in a colour of each person's choosing (rules/visited-mark-style.js).
 * Drawn on every client, and shown or hidden by each person for themselves.
 */

/** Whether this browser draws the marks. */
export const VISITED_MARKS_SETTING = "visitedMarksShown";

/** Which mark this browser draws, and the colour of each. */
export const VISITED_MARK_STYLE_SETTING = "visitedMarkStyle";
export const VISITED_MARK_COLOURS_SETTING = "visitedMarkColours";

/** Above the Realm tools' own drawing, below the marks of what was seen from afar. */
const Z_INDEX = 955;

/** @type {PIXI.Container|null} The marks on this canvas, made again for each Scene drawn. */
let layer = null;

/** Where the layer's marks stand, so a Scene change that leaves them as they were draws nothing again. */
let drawn = null;

/** Register the marks' settings. Called during init. */
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
			// The button beside the sidebar follows a change made on a Settings page.
			refreshTravelsButtons();
		}
	});
	// Chosen in the Visited Marks window, which Foundry's settings list opens.
	game.settings.register(SYSTEM_ID, VISITED_MARK_STYLE_SETTING, {
		name: "bastionland.settings.visitedMarkStyle.name",
		scope: "client",
		config: false,
		type: String,
		choices: Object.fromEntries(VISITED_MARK_STYLES.map((style) => [style, `bastionland.travels.marks.styles.${style}.label`])),
		default: DEFAULT_VISITED_MARK_STYLE,
		onChange: () => drawVisitedMarks()
	});
	game.settings.register(SYSTEM_ID, VISITED_MARK_COLOURS_SETTING, {
		name: "bastionland.settings.visitedMarkColours.name",
		scope: "client",
		config: false,
		type: Object,
		default: { ...DEFAULT_VISITED_MARK_COLOURS },
		onChange: () => drawVisitedMarks()
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

/** @returns {Record<string, string>} Each mark's colour as this browser keeps it. */
export const storedVisitedMarkColours = () => visitedMarkColours(read(VISITED_MARK_COLOURS_SETTING, null));

/**
 * @returns {{style: string, colour: string}} The mark this browser draws, and its colour.
 */
export function visitedMarkLook() {
	const style = visitedMarkStyle(read(VISITED_MARK_STYLE_SETTING, undefined));
	return { style, colour: storedVisitedMarkColours()[style] };
}

/**
 * Draw every hex's mark with one line.
 * @param {PIXI.Graphics} marks
 * @param {{points: {x: number, y: number}[], closed: boolean}[]} strokes
 */
function drawStrokes(marks, strokes) {
	for (const { points, closed } of strokes) {
		const [first, ...rest] = points;
		marks.moveTo(first.x, first.y);
		for (const { x, y } of rest) marks.lineTo(x, y);
		if (closed) marks.closePath();
	}
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
		const look = visitedMarkLook();
		const key = hexes.length ? JSON.stringify([g, look, hexes.map(hexKey).sort()]) : "";
		if (key === drawn) return;
		for (const mark of layer.removeChildren()) mark.destroy({ children: true });
		drawn = key;
		if (!hexes.length) return;
		const marks = layer.addChild(new PIXI.Graphics());
		const pen = visitedMarkPen(g, look.style);
		const strokes = hexes.flatMap((hex) => visitedMarkStrokes(g, hex, look.style));
		// The paper goes down under every mark first, so one hex's halo never covers its neighbour's line.
		if (pen.halo) {
			marks.lineStyle({ width: pen.halo, color: PAPER_HEX, alpha: 0.6, cap: "round", join: "round" });
			drawStrokes(marks, strokes);
		}
		marks.lineStyle({ width: pen.width, color: colourNumber(look.colour), alpha: pen.alpha, cap: "round", join: "round" });
		drawStrokes(marks, strokes);
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't mark the hexes the Company has been to`, error);
	}
}
