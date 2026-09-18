import { t, warn } from "../chat/cards.js";
import { COMPANY_IMAGE, companyStart } from "../rules/company.js";
import { createRandom, randomSeed } from "../rules/random.js";
import { hexAt, hexTopLeft } from "../rules/realm-geometry.js";
import { SYSTEM_ID } from "../system-id.js";
import { getRealm, isRealmScene, sceneGeometry } from "./realm.js";

/** The Token flag that marks the one Token standing for the whole Company (p7). */
export const COMPANY_FLAG = "company";

/**
 * The Token standing for the Company on a Realm.
 * @param {Scene|null} scene
 * @returns {TokenDocument|null}
 */
export function findCompanyToken(scene) {
	return scene?.tokens?.find((token) => token.getFlag(SYSTEM_ID, COMPANY_FLAG)) ?? null;
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
 * @param {string} [looks.img]  Only used when the Token is made.
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

	const data = companyTokenData(g, hex, { img: img || COMPANY_IMAGE, name: name || t("company.name") });
	const [made] = await scene.createEmbeddedDocuments("Token", [data]);
	return made ?? null;
}

/**
 * Put the Company where its Start says it begins (p6), and say where that was.
 * @param {Scene} scene
 * @param {object} options
 * @param {string} options.start One of COMPANY_STARTS.
 * @param {string} [options.img]
 * @param {string} [options.name]
 * @param {string} [options.seed] So the same Realm begins the same way.
 * @returns {Promise<{token: TokenDocument, hex: object, place: string}|null>}
 */
export async function placeCompanyAtStart(scene, { start, img, name, seed }) {
	if (!game.user.isGM || !isRealmScene(scene)) return null;
	const entry = getRealm(scene);
	if (!entry) return null;

	const g = sceneGeometry(scene);
	const { hex, place } = companyStart(entry.realm, g, start, createRandom(seed || randomSeed()));
	const token = await setCompanyHex(scene, hex, { img, name });
	return token ? { token, hex, place } : null;
}

/**
 * Move the Company to a hex from the Hex panel, telling the GM where it went.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @returns {Promise<TokenDocument|null>}
 */
export async function companyHere(scene, hex) {
	const made = !findCompanyToken(scene);
	const token = await setCompanyHex(scene, hex);
	if (!token) {
		warn("company.notPlaced");
		return null;
	}
	ui.notifications.info(t(made ? "company.placed" : "company.moved", { hex: t("realm.hex", hex) }));
	return token;
}
