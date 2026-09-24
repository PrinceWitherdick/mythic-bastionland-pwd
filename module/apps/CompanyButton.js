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
import { TEXT_SIZE_HOOK } from "../client-settings.js";
import { companyButtonPlacement } from "../rules/company.js";
import { mapOnScreen, mapPanelScale } from "./map-screen.js";

/** @type {HTMLButtonElement|null} The one button, while it's up. */
let button = null;

/** @type {{width: number, height: number}|null} Its size, which doesn't change once it's laid out, so a pan doesn't measure it again. */
let size = null;

/** @type {number|null} The measured scene navigation floor, kept until the navigation itself changes. */
let floor = null;

/** What it's taken for until it has been laid out, so it's never left to fall where the interface would put it. */
const UNMEASURED = Object.freeze({ width: 180, height: 34 });

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
 * The foot of the scene navigation's own buttons. Its element is no guide: it
 * is stretched down half the screen whatever it holds, so what the button has
 * to stay clear of is measured from the menus of scenes inside it, each of
 * which collapses to nothing when it's empty or folded away.
 *
 * Measuring it forces the browser to lay the page out, so the figure is kept
 * and only taken again once the navigation itself has changed.
 * @returns {number} In CSS pixels, or 0 with no navigation on screen.
 */
function navigationFloor() {
	if (floor !== null) return floor;
	const menus = document.getElementById("scene-navigation")?.querySelectorAll(".scene-navigation-menu") ?? [];
	floor = 0;
	for (const menu of menus) {
		const { bottom, height } = menu.getBoundingClientRect();
		if (height) floor = Math.max(floor, bottom);
	}
	return floor;
}

/** Hold the button over the middle of the map's top edge, clear of the scene navigation. */
function place(map = mapOnScreen()) {
	if (!button || !map) return;
	size ??= button.offsetWidth ? { width: button.offsetWidth, height: button.offsetHeight } : null;
	// Measured again on the next pan if it hasn't been laid out yet, but placed either way.
	const { left, top } = companyButtonPlacement(map, { ...(size ?? UNMEASURED), ceiling: navigationFloor(), scale: mapPanelScale() });
	button.style.left = `${left}px`;
	button.style.top = `${top}px`;
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
	}
	place();
}

/** Take the button down. */
export function closeCompanyButton() {
	button?.remove();
	button = null;
	size = null;
	floor = null;
}

/** The hooks the button watches: the map moving, the Company being carried, and its Token coming or going. Called during init. */
export function registerCompanyButton() {
	// A pan is worth no work at all where there's no button to hold, which is every
	// player, and the Referee on any Scene but a Realm whose Company is off the map.
	Hooks.on("canvasPan", () => {
		if (button) place();
	});
	Hooks.on(TEXT_SIZE_HOOK, () => {
		floor = null;
		place();
	});
	Hooks.on(COMPANY_PLACING_HOOK, () => showCompanyButton());
	// The navigation is measured again only once it has been drawn or folded away.
	const onNavigation = () => {
		floor = null;
		if (button) place();
	};
	Hooks.on("renderSceneNavigation", onNavigation);
	Hooks.on("collapseSceneNavigation", onNavigation);
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
