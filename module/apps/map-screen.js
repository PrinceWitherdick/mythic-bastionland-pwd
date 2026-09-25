/**
 * Where the Realm's map lies on screen, and how the things held against it are
 * scaled and placed: the Place the Company button over its top, the Finish
 * button under its foot, and the window a freshly rolled Realm is looked over
 * in. None of these is a window of Foundry's, so each is laid out against the
 * canvas by hand as the map is panned and zoomed.
 *
 * The rules panels at the map's sides run from its top to its foot, so zooming
 * the map makes them taller or shorter, but never wider.
 * Kept apart from the panels themselves so anything that needs a measurement
 * can take one without loading a window class.
 */
import { TEXT_SIZE_HOOK, textSizeScale } from "../client-settings.js";
import { travelRulesPlacement } from "../rules/travel-rules.js";

/** How long Foundry's sidebar takes to slide open or shut, after which it's worth measuring again. In milliseconds. */
const SIDEBAR_SLIDE = 300;

/**
 * @returns {{left: number, top: number, right: number, bottom: number}|null} Where the Scene's map is on
 *   screen, in CSS pixels, or null while the canvas isn't ready.
 */
export function mapOnScreen() {
	const rect = canvas?.ready ? canvas.dimensions?.sceneRect : null;
	if (!rect) return null;
	// As Foundry lines its HUD up with the canvas.
	const origin = canvas.primary.getGlobalPosition();
	const zoom = canvas.stage.scale.x;
	return {
		left: origin.x + (rect.x * zoom),
		top: origin.y + (rect.y * zoom),
		right: origin.x + ((rect.x + rect.width) * zoom),
		bottom: origin.y + ((rect.y + rect.height) * zoom)
	};
}

/** @returns {number} The interface scale. Foundry sets it on the body itself, which is cheaper to read on every pan than computed style. */
export const interfaceScale = () => Number.parseFloat(document.body.style.getPropertyValue("--ui-scale")) || 1;

/**
 * Nothing held against the map is a window, so Text Size can't zoom it as it
 * zooms the system's pages: these are scaled where they stand instead, by the
 * same transform that takes Foundry's interface scale. The stylesheet draws
 * them at this scale and the placing reads it back, so they stand where
 * they're put however large the writing is.
 * @returns {number}
 */
export const mapPanelScale = () => interfaceScale() * textSizeScale();

/**
 * A part of Foundry's own interface, whichever way this version of it hands
 * that part over: its application on `ui` first, since that survives a rename
 * of the element, and the ids it has gone by behind that.
 * @param {string} app The key on `ui`.
 * @param {readonly string[]} ids
 * @returns {DOMRect|null} Where it is, or null where it isn't on screen at all.
 */
function interfacePart(app, ids) {
	const own = globalThis.ui?.[app]?.element;
	const elements = [own?.jquery ? own[0] : own, ...ids.map((id) => document.getElementById(id))];
	for (const element of elements) {
		const rect = element?.getBoundingClientRect?.();
		if (rect?.width && rect.height) return rect;
	}
	return null;
}

/** @type {number|null} The measured scene navigation floor, kept until the navigation itself changes. */
let floor = null;

/**
 * The foot of the scene navigation's own buttons. Its element is no guide: it
 * is stretched down half the screen whatever it holds, so what has to stay
 * clear of it is measured from the menus of scenes inside it, each of which
 * collapses to nothing when it's empty or folded away.
 *
 * Measuring it forces the browser to lay the page out, so the figure is kept
 * and only taken again once the navigation itself has changed.
 * @returns {number} In CSS pixels, or 0 with no navigation on screen.
 */
export function navigationFloor() {
	if (floor !== null) return floor;
	const nav = globalThis.ui?.nav?.element ?? document.getElementById("scene-navigation");
	const menus = (nav?.jquery ? nav[0] : nav)?.querySelectorAll(".scene-navigation-menu") ?? [];
	floor = 0;
	for (const menu of menus) {
		const { bottom, height } = menu.getBoundingClientRect();
		if (height) floor = Math.max(floor, bottom);
	}
	return floor;
}

/** Measure the navigation again on the next placing, after it has been drawn, folded away or rescaled. */
export function forgetNavigationFloor() {
	floor = null;
}

/**
 * The top of the hotbar, which nothing held at the foot of the screen may go
 * below. The bar is measured rather than assumed: a user who has hidden it
 * leaves the foot of the window instead.
 * @returns {number} In CSS pixels.
 */
export function hotbarFloor() {
	return interfacePart("hotbar", ["hotbar"])?.top ?? window.innerHeight;
}

/**
 * How much of the screen the interface may claim at any one edge before it is
 * taken for a wrapper stretched across the page rather than the strip down the
 * side of it. Whatever is measured, a panel is left somewhere it can be seen.
 */
const MOST_CLAIMED = 0.2;

/**
 * The room the interface leaves for the panels held at the sides of the
 * screen: inside the tool palette and the sidebar, under the scene navigation
 * and above the hotbar. Each edge is clamped, so a part of the interface that
 * can't be found, or one measured far wider than an edge strip could honestly
 * be, never pushes a panel off the screen or under the sidebar.
 * @returns {{left: number, top: number, right: number, bottom: number}} In CSS pixels.
 */
export function panelScreen() {
	const { innerWidth: width, innerHeight: height } = window;
	const [across, down] = [width * MOST_CLAIMED, height * MOST_CLAIMED];
	const controls = interfacePart("controls", ["scene-controls", "ui-left"])?.right ?? 0;
	const sidebar = interfacePart("sidebar", ["sidebar", "ui-right"])?.left ?? width;
	return {
		left: Math.min(Math.max(controls, 0), across),
		top: Math.min(Math.max(navigationFloor(), 0), down),
		right: Math.max(Math.min(sidebar, width), width - across),
		bottom: Math.max(Math.min(hotbarFloor(), height), height - down)
	};
}

/**
 * Keep something held against the map where it belongs as the map and the
 * interface around it move: every pan, zoom and resize of the canvas, Text
 * Size, the scene navigation, and the sidebar once it has finished sliding.
 *
 * Foundry's animated pans and zooms, the mouse wheel's among them, move the
 * stage frame by frame but may only call canvasPan at their end. So each frame
 * the stage is looked at too, and `place` called only if it moved, which keeps
 * whatever is placed on the map all the way through.
 * @param {() => void} place
 * @returns {() => void} Stops following.
 */
export function followMap(place) {
	/** @type {number|null} A placing held back until the sidebar has finished sliding. */
	let settling = null;
	// The scene navigation is measured again only once it has been drawn, folded away or rescaled.
	const remeasure = () => {
		forgetNavigationFloor();
		place();
	};
	const settle = () => {
		place();
		if (settling !== null) clearTimeout(settling);
		settling = setTimeout(() => {
			settling = null;
			place();
		}, SIDEBAR_SLIDE);
	};
	const hooks = [
		["canvasPan", place],
		[TEXT_SIZE_HOOK, remeasure],
		["renderSceneNavigation", remeasure],
		["collapseSceneNavigation", remeasure],
		["collapseSidebar", settle]
	].map(([name, fn]) => [name, Hooks.on(name, fn)]);

	const ticker = canvas?.app?.ticker;
	/** @type {number[]} The stage's pivot, scale and position when last placed. */
	let last = [];
	const tick = () => {
		const stage = canvas.stage;
		if (!stage) return;
		const now = [stage.pivot.x, stage.pivot.y, stage.scale.x, stage.position.x, stage.position.y];
		if (now.every((value, index) => value === last[index])) return;
		last = now;
		place();
	};
	ticker?.add(tick);

	return () => {
		for (const [name, id] of hooks) Hooks.off(name, id);
		if (settling !== null) clearTimeout(settling);
		settling = null;
		ticker?.remove(tick);
	};
}

/**
 * Hold a panel against one edge of the map, from its top to its foot. It
 * follows the map as the map is panned and zoomed, but keeps its width, so the
 * rules stay readable however far out the map is zoomed.
 * @param {HTMLElement|null|undefined} element
 * @param {"left"|"right"} side
 * @param {number} [width] The panel's layout width, which neither the interface scale nor Text Size changes: both are one transform on it.
 * @param {ReturnType<typeof mapOnScreen>} [map] Where the map is; without one the panel stands at that edge of the screen.
 */
export function placeBesideMap(element, side, width = element?.offsetWidth ?? 0, map = mapOnScreen()) {
	if (!element) return;
	const scale = mapPanelScale();
	const { left, top, maxHeight } = travelRulesPlacement(map ? null : panelScreen(), { side, map, width, scale });

	const { style } = element;
	style.left = `${left}px`;
	style.top = `${top}px`;
	// That scale is a transform, so the height it may grow to is set before scaling.
	style.setProperty("--travel-rules-max-height", `${maxHeight / scale}px`);
}
