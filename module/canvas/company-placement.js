import { hexLabel } from "../actions/hex-names.js";
import { companyPicture, setCompanyHex } from "../actions/company.js";
import { isRealmScene, sceneGeometry } from "../actions/realm.js";
import { t } from "../chat/cards.js";
import { INK_HEX } from "../rules/colour.js";
import { hexCentre } from "../rules/realm-geometry.js";
import { SYSTEM_ID } from "../system-id.js";
import { cancelMapClick, takeMapClick, takingMapClick } from "./map-click.js";
import { traceHex } from "./trace-hex.js";

/** Called as the Company is taken up and as it is put down, so the button that hands it over knows whether it is in hand. */
export const COMPANY_PLACING_HOOK = `${SYSTEM_ID}.companyPlacing`;

/** How solid the Company looks while it's only being held over the map. */
const GHOST_ALPHA = 0.6;

/** Who takes the map's next click while the Company is carried. */
const OWNER = "company";

/** @returns {boolean} Whether the GM is carrying the Company about the map. */
export const isPlacingCompany = () => takingMapClick(OWNER);

/**
 * Draw the Company over a hex, ringed.
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @param {{ring: PIXI.Graphics, ghost: PIXI.Sprite}} marks
 */
function drawGhost(g, hex, { ring, ghost }) {
	const { x, y } = hexCentre(g, hex);
	ring.clear();
	ring.lineStyle({ width: g.size / 24, color: INK_HEX, alpha: 0.8, join: PIXI.LINE_JOIN.ROUND });
	traceHex(ring, g, hex);
	ghost.position.set(x, y);
}

/**
 * Give up carrying the Company, leaving it off the map until the GM takes it
 * up again from the button over the map, or stands it in a hex from the Hex
 * panel.
 * @param {object} [options]
 * @param {boolean} [options.quiet] True when the Realm itself has gone, so there's nothing to say.
 */
export function cancelCompanyPlacement({ quiet = false } = {}) {
	if (isPlacingCompany()) cancelMapClick({ quiet });
}

/**
 * Stand the Company in the hex it was carried to.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @returns {Promise<void>}
 */
async function placeHere(scene, hex) {
	const token = await setCompanyHex(scene, hex);
	if (token) ui.notifications.info(t("company.placed", { hex: hexLabel(hex, scene) }));
	// Once the Token is there, or once it turns out it could not be made.
	Hooks.callAll(COMPANY_PLACING_HOOK);
}

/**
 * Hand the GM the Company to put down where they please: it follows the
 * pointer across the Realm, half-there, and stands in the hex they click.
 *
 * This is what happens for the Starts whose Company doesn't begin anywhere the
 * book names — a Wanderer arriving, a Ruler's Holding, a Courtier's Realm with
 * no Seat of Power — and what the Place the Company button over the map hands
 * over for a Realm whose Company is nowhere on it.
 *
 * @param {Scene} scene
 * @param {object} [options]
 * @param {string} [options.start] One of COMPANY_STARTS, for what the notification says; "anywhere" when no Start led here.
 * @param {string} [options.img] The picture to carry; the Realm's own by default.
 * @returns {Promise<boolean>} False when there's no map to carry it over, so the caller can say so another way.
 */
export async function startCompanyPlacement(scene, { start = "anywhere", img } = {}) {
	if (!game.user.isGM || !isRealmScene(scene)) return false;
	if (!canvas?.ready || canvas.scene?.id !== scene.id) return false;
	// Only one thing at a time takes the next click on the map. A call that can't place the
	// Company leaves whatever took the click before it alone.
	cancelMapClick({ quiet: true });

	const texture = await foundry.canvas.loadTexture(img || companyPicture(scene));
	if (!texture) return false;
	// Loading gives the GM time to have moved on, or to have been handed a Company already.
	if (isPlacingCompany() || canvas.scene?.id !== scene.id) return false;

	const marks = (canvas.controls ?? canvas.stage).addChild(new PIXI.Container());
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
	takeMapClick({
		owner: OWNER,
		scene,
		marks,
		note,
		draw: (hex) => drawGhost(g, hex, { ring, ghost }),
		onPick: (hex) => placeHere(scene, hex),
		onCancel: ({ quiet }) => {
			Hooks.callAll(COMPANY_PLACING_HOOK);
			if (!quiet) ui.notifications.info(t("company.placing.later"));
		}
	});
	Hooks.callAll(COMPANY_PLACING_HOOK);
	return true;
}
