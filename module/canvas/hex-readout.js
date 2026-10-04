import { getHexVisits } from "../actions/journey.js";
import { getRealm, hexHiddenByHand, isRealmScene, sceneGeometry } from "../actions/realm.js";
import { getSighted } from "../actions/sighted.js";
import { realmKnown } from "../actions/solo.js";
import { t } from "../chat/cards.js";
import { hexSummary } from "../rules/realm.js";
import { SIGHTED_FLAG, hiddenThere, sightedAt } from "../rules/sighted.js";
import { hexAt, hexKey } from "../rules/realm-geometry.js";
import { read } from "../client-settings.js";
import { followMap, hotbarFloor, mapOnScreen, panelScreen } from "../apps/map-screen.js";
import { SYSTEM_ID } from "../system-id.js";

/** World setting: whether the readout leads with the hex's column and row, for everyone at the table. */
const COORDINATES_SETTING = "hexCoordinates";

/** Client setting: whether this browser shows the readout at all. Everyone else at the table keeps their own choice. */
const SHOWN_SETTING = "hexReadoutShown";

/** @type {HTMLElement|null} */
let chip = null;

/** What the chip last showed, so moving within a hex doesn't redraw it. */
let shown = null;

/** Whether the pointer is over the canvas, where there may be a hex to name. */
let pointer = false;

/** The chip's size, measured when its words change, so following the map doesn't lay the page out every frame. */
let size = null;

/** Stops the chip following the map as it's panned and zoomed. */
let unfollow = null;

/** Whether this browser names the hex under the pointer, kept here so a pointer move doesn't read the setting. */
let readoutShown = true;

/** How far below the map's foot the chip stands, and how far it keeps from the hotbar. */
const GAP = 12;

const onPointerMove = () => {
	pointer = true;
	updateHexReadout();
};

/** Off the map, such as onto the sidebar or a window, there's no hex to name. */
const onPointerLeave = () => {
	pointer = false;
	updateHexReadout();
};

/**
 * Where the readout stands: centred under the map's foot, or under Finish
 * where that stands there, while a Realm is drawn. Kept above the hotbar, where
 * it goes over Finish instead of onto it, and inside the room the interface
 * leaves at the sides.
 * @param {{left: number, top: number, right: number, bottom: number}} map Where the map is on screen.
 * @param {object} options
 * @param {number} options.width The chip's width.
 * @param {number} options.height The chip's height.
 * @param {{left: number, top: number, right: number, bottom: number}} options.screen The room the interface leaves.
 * @param {number} [options.floor] The top of the hotbar.
 * @param {{top: number, bottom: number}|null} [options.under] Finish, where it stands under the map.
 * @param {number} [options.gap]
 * @returns {{left: number, top: number}}
 */
export function readoutPlacement(map, { width, height, screen, floor = Infinity, under = null, gap = GAP }) {
	const left = Math.min(Math.max(screen.left, ((map.left + map.right) / 2) - (width / 2)), Math.max(screen.left, screen.right - width));
	const lowest = floor - gap - height;
	let top = Math.min((under ? under.bottom : map.bottom) + gap, lowest);
	if (under && top + height + gap > under.top && top < under.bottom + gap) top = under.top - gap - height;
	return { left: Math.round(left), top: Math.round(Math.max(screen.top, top)) };
}

/** @returns {{top: number, bottom: number}|null} Finish, where it stands under the map rather than beside Place the Company over it. */
function finishUnder(map) {
	const rect = document.getElementById("bastionland-realm-drawing-finish")?.getBoundingClientRect();
	return rect?.height && rect.top > (map.top + map.bottom) / 2 ? rect : null;
}

/** Stand the chip under the map's foot. */
function placeChip() {
	if (!chip || chip.hidden) return;
	const map = mapOnScreen();
	if (!map) return;
	size ??= chip.getBoundingClientRect();
	const { left, top } = readoutPlacement(map, { width: size.width, height: size.height, screen: panelScreen(), floor: hotbarFloor(), under: finishUnder(map) });
	chip.style.transform = `translate(${left}px, ${top}px)`;
}

/** Register the readout's setting. Called during init. */
export function registerHexReadoutSetting() {
	game.settings.register(SYSTEM_ID, COORDINATES_SETTING, {
		name: "bastionland.realm.readout.settings.coordinates.name",
		hint: "bastionland.realm.readout.settings.coordinates.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
		onChange: () => updateHexReadout({ force: true })
	});
	game.settings.register(SYSTEM_ID, SHOWN_SETTING, {
		name: "bastionland.settings.hexReadoutShown.name",
		hint: "bastionland.settings.hexReadoutShown.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: (value) => {
			readoutShown = value !== false;
			updateHexReadout({ force: true });
		}
	});
}

/** @returns {boolean} */
const showsCoordinates = () => game.settings.get(SYSTEM_ID, COORDINATES_SETTING) === true;

/**
 * @param {ReturnType<typeof hexSummary>} summary
 * @param {object} [options]
 * @param {boolean} [options.coordinates] Lead with the hex's column and row.
 * @param {{note: string}|null} [options.sighted] Something seen standing there from afar and not yet reached (p197).
 * @param {boolean} [options.visited] The Company has been there.
 * @returns {string} e.g. "(5, 7) Forest · Castle, Seat of Power · visited". Empty where the hex holds nothing worth naming.
 */
export function describeHex(summary, { coordinates = false, sighted = null, visited = false } = {}) {
	const parts = [];
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
	// Everybody sees that something stands there, in the Referee's words, but not what it is.
	if (sighted) parts.push(sighted.note ? t("seenFromAfar.readoutNote", { note: sighted.note }) : t("seenFromAfar.readout"));
	if (visited) parts.push(t("realm.readout.visited"));
	const text = parts.join(" · ");
	if (!coordinates) return text;
	const where = t("realm.readout.coordinates", summary.hex);
	return text ? `${where} ${text}` : where;
}

/** Show the hex under the pointer on a Realm Scene. Called when the canvas is ready. */
export function attachHexReadout() {
	detachHexReadout();
	if (!isRealmScene(canvas.scene)) return;
	readoutShown = read(SHOWN_SETTING, true) !== false;
	chip = document.createElement("div");
	chip.className = "bastionland-hex-readout";
	chip.hidden = true;
	document.body.append(chip);
	canvas.stage.on("pointermove", onPointerMove);
	canvas.app?.view?.addEventListener("pointerleave", onPointerLeave);
	unfollow = followMap(placeChip);
}

/** Take the readout down, as the canvas goes. */
export function detachHexReadout() {
	canvas?.stage?.off("pointermove", onPointerMove);
	canvas?.app?.view?.removeEventListener("pointerleave", onPointerLeave);
	unfollow?.();
	unfollow = null;
	chip?.remove();
	chip = null;
	shown = null;
	pointer = false;
	size = null;
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
	const hex = g && pointer && readoutShown ? hexAt(g, canvas.mousePosition) : null;
	if (!hex) {
		chip.hidden = true;
		shown = null;
		return;
	}
	// Within the hex already shown, the chip stays where it stands: following the map moves it.
	if (!force && shown === hexKey(hex)) return;
	shown = hexKey(hex);
	const handHidden = hexHiddenByHand(scene, hex);
	// In solo play the Referee reads it as the Company knows it.
	const summary = hexSummary(realmKnown(entry.realm), g, hex, { showHidden: game.user.isGM, hiddenByHand: handHidden });
	// A mark stands only while something there is still hidden. Most hexes have none, so the flag is read whole only where one does.
	const marked = Boolean(scene.flags?.[SYSTEM_ID]?.[SIGHTED_FLAG]?.[shown]);
	const sighted = marked && hiddenThere(entry.realm, hex, () => handHidden) ? sightedAt(getSighted(scene), hex) : null;
	const visited = Boolean(getHexVisits(scene, hex));
	const text = describeHex(summary, { coordinates: showsCoordinates(), sighted, visited });
	chip.textContent = text;
	chip.hidden = !text;
	size = null;
	placeChip();
}
