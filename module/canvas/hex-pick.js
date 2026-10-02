import { isRealmScene, sceneGeometry } from "../actions/realm.js";
import { t } from "../chat/cards.js";
import { reducesMotion } from "../client-settings.js";
import { INK_HEX, PAPER_HEX } from "../rules/colour.js";
import { markedHexLettering } from "../rules/realm-map.js";
import { hexCentre, hexVertices } from "../rules/realm-geometry.js";
import { cancelMapClick, takeMapClick, takingMapClick } from "./map-click.js";
import { traceHex } from "./trace-hex.js";

/**
 * Asking the GM for a hex of the Realm on the map: the hex under the pointer
 * is washed in red ochre with a word over it saying what a click there does,
 * and a left click takes it. A right click, Escape or leaving the Realm gives
 * up. The clicks are taken as carrying the Company takes them (map-click.js).
 */

/** Red ochre, the sheet's rubric ink, for the hex a click would take. */
const OCHRE_HEX = 0x9a3520;

/** How strongly the hex under the pointer is washed, breathing between the two. */
const WASH = Object.freeze({ least: 0.18, most: 0.4 });

/** How long one breath of the wash takes, in milliseconds. */
const BREATH_MS = 1400;

/** Who takes the map's next click while a hex is asked for. */
const OWNER = "hexPick";

/** @returns {boolean} Whether the GM is being asked to click a hex. */
export const isPickingHex = () => takingMapClick(OWNER);

/** Give up asking for a hex, answering with none. */
export function cancelHexPick() {
	if (isPickingHex()) cancelMapClick({ quiet: true });
}

/**
 * Wash a hex and write over it.
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @param {{wash: PIXI.Graphics, ring: PIXI.Graphics, word: PIXI.Text, label: (hex: {col: number, row: number}) => string}} marks
 */
function drawMarks(g, hex, { wash, ring, word, label }) {
	const { x, y } = hexCentre(g, hex);

	wash.clear();
	wash.beginFill(OCHRE_HEX, 1);
	wash.drawPolygon(hexVertices(g, hex));
	wash.endFill();

	ring.clear();
	ring.lineStyle({ width: g.size / 14, color: OCHRE_HEX, alpha: 0.95, join: PIXI.LINE_JOIN.ROUND });
	traceHex(ring, g, hex);

	word.text = label(hex);
	word.position.set(x, y);
}

/**
 * Ask the GM to click a hex of the Realm on the map.
 * @param {Scene} scene The Realm, which must be the Scene on the canvas.
 * @param {object} options
 * @param {string} options.message What the standing notification asks for; how to stop is added to it.
 * @param {(hex: {col: number, row: number}) => string} options.label What the word over the hex under the pointer says.
 * @returns {Promise<{col: number, row: number}|null>} The hex clicked, or null if the GM gave up or there's no map to click.
 */
export function pickHex(scene, { message, label }) {
	if (!game.user.isGM || !isRealmScene(scene)) return Promise.resolve(null);
	if (!canvas?.ready || canvas.scene?.id !== scene.id) return Promise.resolve(null);
	// Only one thing at a time takes the next click on the map. A call that can't ask for a hex
	// leaves whatever took the click before it alone.
	cancelMapClick({ quiet: true });

	const g = sceneGeometry(scene);
	const marks = (canvas.controls ?? canvas.stage).addChild(new PIXI.Container());
	const wash = marks.addChild(new PIXI.Graphics());
	wash.alpha = WASH.most;
	const ring = marks.addChild(new PIXI.Graphics());
	const { fontSize, strokeThickness } = markedHexLettering(g.size);
	const word = marks.addChild(new foundry.canvas.containers.PreciseText("", foundry.canvas.containers.PreciseText.getTextStyle({
		fontFamily: ["Bastionland Body", "Georgia", "serif"],
		fontSize,
		fontWeight: "bold",
		fill: INK_HEX,
		stroke: PAPER_HEX,
		strokeThickness,
		align: "center",
		wordWrap: true,
		wordWrapWidth: g.hexWidth * 0.9,
		dropShadow: false
	})));
	word.anchor.set(0.5);

	return new Promise((resolve) => {
		const note = ui.notifications.info(`${message} ${t("hexPick.stop")}`, { permanent: true });

		// The wash breathes, so the hex a click would take can't be missed; held still for those who want less motion.
		let breathe = null;
		if (!reducesMotion() && canvas.app?.ticker) {
			const start = performance.now();
			breathe = () => {
				const phase = (1 - Math.cos(((performance.now() - start) / BREATH_MS) * 2 * Math.PI)) / 2;
				wash.alpha = WASH.least + (WASH.most - WASH.least) * phase;
			};
			canvas.app.ticker.add(breathe);
		}

		takeMapClick({
			owner: OWNER,
			scene,
			marks,
			note,
			draw: (hex) => drawMarks(g, hex, { wash, ring, word, label }),
			onPick: resolve,
			onCancel: () => resolve(null),
			onEnd: () => {
				if (breathe) canvas?.app?.ticker?.remove(breathe);
			}
		});
	});
}
