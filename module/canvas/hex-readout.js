import { getRealm, hexHiddenByHand, isRealmScene, sceneGeometry } from "../actions/realm.js";
import { t } from "../chat/cards.js";
import { hexSummary } from "../rules/realm.js";
import { hexAt, hexKey } from "../rules/realm-geometry.js";
import { SYSTEM_ID } from "../system-id.js";

/** World setting: whether the readout leads with the hex's column and row, for everyone at the table. */
const COORDINATES_SETTING = "hexCoordinates";

/** @type {HTMLElement|null} */
let chip = null;

/** What the chip last showed, so moving within a hex doesn't redraw it. */
let shown = null;

const onPointerMove = () => updateHexReadout();

/** Register the readout's setting. Called during init. */
export function registerHexReadoutSetting() {
	game.settings.register(SYSTEM_ID, COORDINATES_SETTING, {
		name: "bastionland.realm.readout.settings.coordinates.name",
		hint: "bastionland.realm.readout.settings.coordinates.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
		onChange: () => updateHexReadout({ force: true })
	});
}

/** @returns {boolean} */
const showsCoordinates = () => game.settings.get(SYSTEM_ID, COORDINATES_SETTING) === true;

/**
 * @param {ReturnType<typeof hexSummary>} summary
 * @param {object} [options]
 * @param {boolean} [options.coordinates] Lead with the hex's column and row.
 * @returns {string} e.g. "Column 5, Row 7 · Forest · Castle, Seat of Power". Empty where the hex holds nothing worth naming.
 */
export function describeHex(summary, { coordinates = false } = {}) {
	const parts = coordinates ? [t("realm.hex", summary.hex)] : [];
	// Only a GM is told of what's hidden, so only a GM sees it marked.
	const marked = (text, revealed) => (revealed === false ? t("realm.readout.hidden", { name: text }) : text);
	if (summary.terrain) parts.push(marked(t(`realm.terrain.${summary.terrain}`), summary.terrainRevealed));
	if (summary.holding) {
		const name = summary.holding.name || t(`realm.holdings.${summary.holding.style}`);
		parts.push(marked(summary.holding.seat ? t("realm.readout.seat", { name }) : name, summary.holding.revealed));
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
	const summary = hexSummary(entry.realm, g, hex, { showHidden: game.user.isGM, hiddenByHand: hexHiddenByHand(scene, hex) });
	const text = describeHex(summary, { coordinates: showsCoordinates() });
	chip.textContent = text;
	chip.hidden = !text;
}
