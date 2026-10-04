import { getRealm, hexHiddenByHand, isRealmScene, sceneGeometry } from "../actions/realm.js";
import { getSighted } from "../actions/sighted.js";
import { INK_HEX, PAPER_HEX } from "../rules/colour.js";
import { hexCentre, hexKey } from "../rules/realm-geometry.js";
import { sightedMarks } from "../rules/sighted.js";
import { SYSTEM_ID } from "../system-id.js";
import { marksLayer } from "./marks-layer.js";

/**
 * The marks of what the Company saw from afar (p197): an unnamed ring with a
 * question in it, standing in each hex where something was seen but not yet
 * reached. Drawn on every client, players' and GMs' alike, over the map; the
 * hex readout says what the Referee wrote of it.
 */

/** How much of a hex the ring fills across, and how thick its line is, in hex heights. */
const RING = Object.freeze({ radius: 0.17, line: 0.025 });

/** Above the Realm tools' own drawing, below Foundry's controls. */
const redraw = marksLayer(960);

/**
 * @param {object} g
 * @returns {object} The lettering of the question in every mark.
 */
const markStyle = (g) => foundry.canvas.containers.PreciseText.getTextStyle({
	fontFamily: ["Bastionland Body", "Georgia", "serif"],
	fontSize: Math.round(g.size * RING.radius * 1.3),
	fontWeight: "bold",
	fill: INK_HEX,
	align: "center",
	dropShadow: false
});

/**
 * One mark, standing in the middle of its hex.
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @param {object} style From markStyle.
 * @returns {PIXI.Container}
 */
function markGlyph(g, hex, style) {
	const { x, y } = hexCentre(g, hex);
	const mark = new PIXI.Container();
	mark.position.set(x, y);
	const radius = g.size * RING.radius;
	const ring = mark.addChild(new PIXI.Graphics());
	ring.lineStyle({ width: Math.max(2, g.size * RING.line), color: INK_HEX, alpha: 1 });
	ring.beginFill(PAPER_HEX, 0.9);
	ring.drawCircle(0, 0, radius);
	ring.endFill();
	const word = mark.addChild(new foundry.canvas.containers.PreciseText("?", style));
	word.anchor.set(0.5);
	return mark;
}

/**
 * Draw the marks on the Realm on the canvas again, after the Scene was drawn or
 * its Realm or marks changed. Anywhere else, there are none.
 */
export function drawSightedMarks() {
	if (!canvas?.ready || !canvas.interface) return;
	const scene = canvas.scene;
	const entry = isRealmScene(scene) ? getRealm(scene) : null;
	try {
		const g = entry && sceneGeometry(scene);
		const marks = entry ? sightedMarks(entry.realm, getSighted(scene), (at) => hexHiddenByHand(scene, at)) : [];
		const key = marks.length ? JSON.stringify([g, marks.map(({ hex }) => hexKey(hex))]) : "";
		redraw(key, (layer) => {
			const style = markStyle(g);
			for (const { hex } of marks) layer.addChild(markGlyph(g, hex, style));
		});
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't draw what the Company saw from afar`, error);
	}
}
