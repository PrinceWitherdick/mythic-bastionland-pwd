import { getRealm, isRealmScene, sceneGeometry } from "../actions/realm.js";
import { t } from "../chat/cards.js";
import { hexSummary } from "../rules/realm.js";
import { hexAt, hexKey } from "../rules/realm-geometry.js";

/** @type {HTMLElement|null} */
let chip = null;

/** What the chip last showed, so moving within a hex doesn't redraw it. */
let shown = null;

const onPointerMove = () => updateHexReadout();

/**
 * @param {ReturnType<typeof hexSummary>} summary
 * @returns {string} e.g. "Column 5, Row 7 · Forest · Castle, Seat of Power".
 */
function describe(summary) {
	const parts = [t("realm.hex", summary.hex)];
	if (summary.terrain) parts.push(t(`realm.terrain.${summary.terrain}`));
	if (summary.holding) {
		const name = summary.holding.name || t(`realm.holdings.${summary.holding.style}`);
		parts.push(summary.holding.seat ? t("realm.readout.seat", { name }) : name);
	}
	if (summary.myth) parts.push(t(summary.myth.revealed ? "realm.readout.myth" : "realm.readout.hiddenMyth", { number: summary.myth.number }));
	if (summary.landmark) {
		const type = t(`realm.landmarks.${summary.landmark.type}`);
		const named = summary.landmark.name ? `${type}: ${summary.landmark.name}` : type;
		parts.push(summary.landmark.revealed ? named : t("realm.readout.hidden", { name: named }));
	}
	return parts.join(" · ");
}

/** Show the hex under the pointer on a Realm Scene. Called when the canvas is ready. */
export function attachHexReadout() {
	detachHexReadout();
	if (!isRealmScene(canvas.scene)) return;
	chip = document.createElement("div");
	chip.className = "bastionland-hex-readout";
	chip.hidden = true;
	document.body.append(chip);
	canvas.stage.on("pointermove", onPointerMove);
}

/** Take the readout down, as the canvas goes. */
export function detachHexReadout() {
	canvas?.stage?.off("pointermove", onPointerMove);
	chip?.remove();
	chip = null;
	shown = null;
}

/**
 * Update the readout for where the pointer is.
 * @param {object} [options]
 * @param {boolean} [options.force] Redraw even if the pointer hasn't left the hex, such as after the Realm changed.
 */
export function updateHexReadout({ force = false } = {}) {
	if (!chip) return;
	const scene = canvas.scene;
	const entry = getRealm(scene);
	const g = entry && sceneGeometry(scene);
	const hex = g ? hexAt(g, canvas.mousePosition) : null;
	if (!hex) {
		chip.hidden = true;
		shown = null;
		return;
	}
	if (!force && shown === hexKey(hex)) return;
	shown = hexKey(hex);
	chip.textContent = describe(hexSummary(entry.realm, g, hex, { showHidden: game.user.isGM }));
	chip.hidden = false;
}
