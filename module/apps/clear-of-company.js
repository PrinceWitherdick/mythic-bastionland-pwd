import { findCompanyToken } from "../actions/company.js";
import { isRealmScene } from "../actions/realm.js";
import { panelScreen, rectOnScreen } from "./map-screen.js";
import { viewport } from "./ui.js";

/**
 * A window opened as play goes on (Places, a character's sheet) moves aside
 * when it would cover the Company's Token, so the Token just moved stays in
 * sight beside it.
 */

/** The space between the Token and a window set beside it. */
const GAP = 12;

/**
 * @typedef {{left: number, top: number, right: number, bottom: number}} ScreenBox
 */

/**
 * Where a window opening over the Company's Token goes instead: beside the
 * Token, to whichever side moves it least, at the height it opened at. It
 * stays between the controls and the sidebar where it fits there, or else
 * anywhere on the screen.
 * @param {{left: number, top: number, width: number, height: number}} opened Where the window opened.
 * @param {ScreenBox} token The Token's box on the screen.
 * @param {ScreenBox} room The space between the controls and the sidebar.
 * @param {{width: number, height: number}} screen
 * @returns {{left: number}|null} Null where it doesn't cover the Token, or fits beside it nowhere.
 */
export function clearOfToken(opened, token, room, screen) {
	const covers = opened.left < token.right && opened.left + opened.width > token.left
		&& opened.top < token.bottom && opened.top + opened.height > token.top;
	if (!covers) return null;
	const sides = [token.right + GAP, token.left - GAP - opened.width];
	for (const [from, to] of [[room.left, room.right], [0, screen.width]]) {
		const fits = sides.filter((left) => left >= from && left + opened.width <= to);
		if (!fits.length) continue;
		const least = fits.reduce((best, left) => (Math.abs(left - opened.left) < Math.abs(best - opened.left) ? left : best));
		return { left: Math.round(least) };
	}
	return null;
}

/**
 * The Company's Token on the screen, as Foundry lines its HUD up with the
 * canvas, where it stands on the Realm in view and can be seen.
 * @returns {ScreenBox|null} Null with no Realm in view, no Company on it, or the Token off the screen or hidden from this user.
 */
export function companyOnScreen() {
	const scene = globalThis.canvas?.ready ? canvas.scene : null;
	if (!isRealmScene(scene)) return null;
	const token = findCompanyToken(scene);
	const bounds = token?.object?.bounds;
	if (!bounds || (token.hidden && !game.user?.isGM)) return null;
	const box = rectOnScreen(bounds);
	const { width, height } = viewport();
	return box.right > 0 && box.left < width && box.bottom > 0 && box.top < height ? box : null;
}

/**
 * Move a window that has just opened off the Company's Token, if it covers it.
 * Called once it's first drawn, so Foundry has put it where it goes.
 * @param {foundry.applications.api.ApplicationV2} app
 */
export function keepClearOfCompany(app) {
	const token = companyOnScreen();
	const box = token ? app.element?.getBoundingClientRect() : null;
	if (!box?.width) return;
	const place = clearOfToken({ left: box.left, top: box.top, width: box.width, height: box.height }, token, panelScreen(), viewport());
	if (place) app.setPosition(place);
}
