/**
 * The way back onto the map for a Company that isn't on it: a button held over
 * the top edge of a Realm Scene, shown to the Referee alone and only while
 * that Realm has no Company Token — before one has ever been placed, or after
 * the Token was deleted. Pressing it hands them the Company to carry under the
 * pointer and click into a hex, as the Starts the book names no place for do.
 */
import { findCompanyToken } from "../actions/company.js";
import { isRealmScene } from "../actions/realm.js";
import { COMPANY_PLACING_HOOK, isPlacingCompany, startCompanyPlacement } from "../canvas/company-placement.js";
import { t } from "../chat/cards.js";
import { companyButtonPlacement } from "../rules/company.js";
import { followMap, forgetNavigationFloor, mapOnScreen, mapPanelScale, navigationFloor } from "./map-screen.js";

/** @type {HTMLButtonElement|null} The one button, while it's up. */
let button = null;

/** @type {(() => void)|null} Stops it following the map, while it's up. */
let unfollow = null;

/** @type {{width: number, height: number}|null} Its size, which doesn't change once it's laid out, so a pan doesn't measure it again. */
let size = null;

/** What it's taken for until it has been laid out, so it's never left to fall where the interface would put it. */
const UNMEASURED = Object.freeze({ width: 180, height: 34 });

/** Called as the button comes up or goes down, for the Finish button that stands beside it while it's up. */
export const COMPANY_BUTTON_HOOK = "bastionlandCompanyButton";

/** @returns {boolean} Whether the Referee is looking at a Realm whose Company is nowhere on it, and isn't already carrying them. */
function wanted() {
	return Boolean(game.user?.isGM && canvas?.ready && isRealmScene(canvas.scene) && !findCompanyToken(canvas.scene) && !isPlacingCompany());
}

/** Take the Company up, and stand the button down while it's in hand. */
async function takeTheCompany() {
	const scene = canvas?.scene;
	closeCompanyButton();
	// A Company that can't be picked up after all — no picture to carry, or a GM
	// who moved on while it loaded — never reaches the placing hook, so the button
	// is stood back up here rather than left off the map until the canvas is ready again.
	if (!(await startCompanyPlacement(scene))) showCompanyButton();
}

/**
 * Where the button stands over the map: worked out afresh rather than read
 * off its style, so whatever stands beside it is placed right however the two
 * are ordered on a pan.
 * @param {ReturnType<typeof mapOnScreen>} [map]
 * @returns {{left: number, top: number, width: number, height: number}|null} In CSS pixels, the interface scale
 *   included, or null while the button is down.
 */
export function companyButtonBox(map = mapOnScreen()) {
	if (!button || !map) return null;
	size ??= button.offsetWidth ? { width: button.offsetWidth, height: button.offsetHeight } : null;
	// Measured again on the next pan if it hasn't been laid out yet, but placed either way.
	const { width, height } = size ?? UNMEASURED;
	const scale = mapPanelScale();
	const { left, top } = companyButtonPlacement(map, { width, height, ceiling: navigationFloor(), scale });
	return { left, top, width: width * scale, height: height * scale };
}

/** Hold the button over the middle of the map's top edge, clear of the scene navigation. */
function place(map = mapOnScreen()) {
	const box = companyButtonBox(map);
	if (!box) return;
	button.style.left = `${box.left}px`;
	button.style.top = `${box.top}px`;
}

/**
 * Show the button over the Realm on the canvas, or take it down where it
 * doesn't belong. Called as the canvas becomes ready, and again whenever
 * anything it depends on changes.
 */
export function showCompanyButton() {
	if (!wanted()) return closeCompanyButton();
	if (!button) {
		button = document.createElement("button");
		button.type = "button";
		button.id = "bastionland-company-button";
		button.className = "bastionland bastionland-company-button";
		button.innerHTML = `<i class="fa-solid fa-flag" inert></i> ${foundry.utils.escapeHTML(t("company.placing.button"))}`;
		button.dataset.tooltip = t("company.placing.hint");
		button.addEventListener("click", () => takeTheCompany());
		(document.getElementById("interface") ?? document.body).append(button);
		place();
		unfollow = followMap(() => place());
		Hooks.callAll(COMPANY_BUTTON_HOOK);
		return;
	}
	place();
}

/** Take the button down. */
export function closeCompanyButton() {
	const was = button;
	button?.remove();
	button = null;
	unfollow?.();
	unfollow = null;
	size = null;
	forgetNavigationFloor();
	if (was) Hooks.callAll(COMPANY_BUTTON_HOOK);
}

/**
 * The hooks the button watches: the Company being carried, and its Token
 * coming or going. The map moving is followed only while the button is up,
 * which is never for a player. Called during init.
 */
export function registerCompanyButton() {
	Hooks.on(COMPANY_PLACING_HOOK, () => showCompanyButton());
	// A Token is out of the Scene's collection only once its own hooks have run, so the
	// Realm is read on the turn after — once for a batch, however many Tokens it carries.
	let looking = false;
	const onToken = (token) => {
		if (token?.parent?.id !== canvas?.scene?.id || looking) return;
		looking = true;
		setTimeout(() => {
			looking = false;
			showCompanyButton();
		}, 0);
	};
	Hooks.on("createToken", onToken);
	Hooks.on("deleteToken", onToken);
}
