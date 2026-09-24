import { t } from "../chat/cards.js";
import { companyStart } from "../rules/company.js";
import { COMPANY_IMAGE } from "../rules/company-icons.js";
import { hexAt, hexTopLeft } from "../rules/realm-geometry.js";
import { SYSTEM_ID } from "../system-id.js";
import { getRealm, isRealmScene, sceneGeometry } from "./realm.js";

/** The Token flag that marks the one Token standing for the whole Company (p7). */
export const COMPANY_FLAG = "company";

/** The Scene flag keeping the picture chosen for a Company that the Referee hasn't placed yet. */
export const COMPANY_IMG_FLAG = "companyImg";

/** The Scene flag keeping the hex the Company stood in, so a Token deleted by mistake can be put back. */
export const COMPANY_LAST_HEX_FLAG = "companyLastHex";

/**
 * The Token standing for the Company on a Realm.
 * @param {Scene|null} scene
 * @returns {TokenDocument|null}
 */
export function findCompanyToken(scene) {
	return scene?.tokens?.find((token) => token.getFlag(SYSTEM_ID, COMPANY_FLAG)) ?? null;
}

/**
 * The picture a Company carries on a Realm: the one chosen when the Realm was
 * made, or the icon a Company carries when nothing was chosen.
 * @param {Scene|null} scene
 * @returns {string}
 */
export function companyPicture(scene) {
	return scene?.getFlag?.(SYSTEM_ID, COMPANY_IMG_FLAG) || COMPANY_IMAGE;
}

/**
 * The hex the Company stands in, from its own Token.
 * @param {Scene|null} scene
 * @returns {{col: number, row: number}|null} Null when there's no Company Token, or it's off the map.
 */
export function companyTokenHex(scene) {
	const token = findCompanyToken(scene);
	if (!token || !isRealmScene(scene)) return null;
	return hexAt(sceneGeometry(scene), token.getCenterPoint());
}

/**
 * The hex the Company stood in when its Token went, kept on the Scene.
 * @param {Scene|null} scene
 * @returns {{col: number, row: number}|null}
 */
export function lastCompanyHex(scene) {
	const hex = scene?.getFlag?.(SYSTEM_ID, COMPANY_LAST_HEX_FLAG);
	return Number.isInteger(hex?.col) && Number.isInteger(hex?.row) ? { col: hex.col, row: hex.row } : null;
}

/**
 * Keep where the Company stood, and what it carried, against the Token being
 * deleted. Written as the Token goes, so putting them back needs nothing else.
 * @param {Scene} scene
 * @param {TokenDocument} token The Token on its way out.
 * @returns {Promise<void>}
 */
export async function rememberCompany(scene, token) {
	if (!game.user.isGM || !isRealmScene(scene)) return;
	const hex = hexAt(sceneGeometry(scene), token.getCenterPoint());
	const img = token.texture?.src;
	await scene.update({
		[`flags.${SYSTEM_ID}.${COMPANY_LAST_HEX_FLAG}`]: hex,
		...(img ? { [`flags.${SYSTEM_ID}.${COMPANY_IMG_FLAG}`]: img } : {})
	});
}

/**
 * Put a deleted Company back where it stood, with the picture it carried.
 * @param {Scene} scene
 * @returns {Promise<TokenDocument|null>} Null when there's nowhere to put them,
 *   or one already stands on the Realm.
 */
export async function standCompanyAgain(scene) {
	if (!game.user.isGM || findCompanyToken(scene)) return null;
	const hex = lastCompanyHex(scene);
	return hex ? setCompanyHex(scene, hex) : null;
}

/**
 * What a Company Token is made of.
 *
 * It has no Actor on purpose. Foundry gives a Token without one to everybody
 * as its owner, so every player can move the Company without any actor being
 * made, owned or shared out — and the Knights' own sheets stay where the book
 * keeps them, one per Knight.
 *
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @param {{img: string, name: string}} looks
 * @returns {object}
 */
function companyTokenData(g, hex, { img, name }) {
	const { x, y } = hexTopLeft(g, hex);
	return {
		name,
		x: Math.round(x),
		y: Math.round(y),
		width: 1,
		height: 1,
		texture: { src: img },
		actorId: null,
		actorLink: false,
		disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
		lockRotation: true,
		sight: { enabled: false },
		flags: { [SYSTEM_ID]: { [COMPANY_FLAG]: true } }
	};
}

/**
 * Stand the Company in a hex, making its Token the first time and moving it
 * after that. GMs only.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {object} [looks]
 * @param {string} [looks.img]  Only used when the Token is made. Defaults to the picture chosen with the Realm.
 * @param {string} [looks.name] Only used when the Token is made.
 * @returns {Promise<TokenDocument|null>}
 */
export async function setCompanyHex(scene, hex, { img, name } = {}) {
	if (!game.user.isGM || !isRealmScene(scene) || !hex) return null;
	const g = sceneGeometry(scene);
	const standing = findCompanyToken(scene);

	if (standing) {
		const { x, y } = hexTopLeft(g, hex);
		await standing.update({ x: Math.round(x), y: Math.round(y) });
		return standing;
	}

	const data = companyTokenData(g, hex, { img: img || companyPicture(scene), name: name || t("company.name") });
	const [made] = await scene.createEmbeddedDocuments("Token", [data]);
	return made ?? null;
}

/**
 * Put the Company where its Start says it begins (p6). Only a Courtier's
 * Start names a place, the Seat of Power; for the others the Referee places
 * it, so the picture is kept on the Scene until they do.
 * @param {Scene} scene
 * @param {object} options
 * @param {string} options.start One of COMPANY_STARTS.
 * @param {string} [options.img]
 * @param {string} [options.name]
 * @returns {Promise<TokenDocument|null>} Null when the Referee chooses where.
 */
export async function placeCompanyAtStart(scene, { start, img, name }) {
	if (!game.user.isGM || !isRealmScene(scene)) return null;
	const hex = companyStart(getRealm(scene)?.realm, start);
	if (hex) return setCompanyHex(scene, hex, { img, name });
	if (img && img !== COMPANY_IMAGE) await scene.setFlag(SYSTEM_ID, COMPANY_IMG_FLAG, img);
	return null;
}
