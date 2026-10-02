/**
 * Lining a picture of a Realm up with the hexes, one step at a time, so
 * there's only ever one thing to do.
 *
 * First the GM marks two hexes on it, with the whole picture in view: a click
 * on the centre of the map's first hex drops a coloured hex there, and a click
 * on its last drops another. Each can be dragged or nudged until it sits
 * squarely over the hex drawn on the picture, and once both are down they're
 * drawn as large as the picture's own hexes, so the GM can see them fit.
 * Fitting the picture to them sizes it evenly, so its hexes are the Realm's
 * size, and moves it onto them; whatever lies round the map on the picture
 * falls off the map's edges, where nothing is drawn. Foundry's own hex lines
 * are hidden while the hexes are marked, on this screen alone: they're the
 * Realm's hexes, not the picture's, and would only be mistaken for them.
 *
 * Then the GM slides it the last little way: a drag anywhere on the map slides
 * the picture under the hex lines, and the arrow keys nudge it a pixel. Ctrl
 * and the wheel size it about the pointer, evenly, so its hexes can be matched
 * to the Realm's and it can't be stretched out of its shape.
 * Nothing is written until they keep it, so the picture moves on this screen
 * alone while it's under way, and Escape puts it back.
 *
 * A map with no hexes on it has none to mark: the Realm's hexes are laid over
 * it, and it's laid large enough to cover them. So it starts on sliding, the
 * only step, and the marking is never offered.
 *
 * While it's under way the rules beside the map wait, Creating a Realm and
 * Travel and Exploration alike, so there's only the picture and the hexes to
 * look at: MAP_ALIGNMENT_HOOK says when it starts and ends.
 *
 * The clicks and drags are caught before the canvas sees them, so whatever
 * tool is in hand doesn't act on them — the same way the Company is carried to
 * a hex. A right drag is left to the canvas, so the map can still be panned,
 * and the wheel without Ctrl still zooms.
 */
import { t } from "../chat/cards.js";
import { reducesMotion } from "../client-settings.js";
import { INK_HEX, PAPER_HEX as PAPER } from "../rules/colour.js";
import { hexCentre } from "../rules/realm-geometry.js";
import { realmFlag } from "../rules/realm-documents.js";
import { calibrationHexes, fitToMarks, mapRect, markAt, markedHexOutline, markedHexScale, sizeMapRect, slideMapRect, viewOfPicture } from "../rules/realm-map.js";
import { getRealm, isRealmScene, sceneGeometry } from "../actions/realm.js";
import { placeRealmPicture } from "../actions/realm-map.js";
import { followMap, hotbarFloor, mapPanelScale, panelScreen } from "../apps/map-screen.js";
import { phaseBannerFloor } from "../apps/PhaseBanner.js";
import { SYSTEM_ID } from "../system-id.js";
import { onBoard } from "./board.js";
import { traceHex } from "./trace-hex.js";

/** The ink the picture's frame and the hex being pointed out are drawn in. */
const RING = 0x8b1e1e;

/**
 * The colour of each hex marked on the picture: the first hex's, then the
 * last's. Told apart from each other and from the frame's red at a glance,
 * colour-blind or not.
 */
const MARK_COLOURS = Object.freeze(["#1f6fd1", "#e07b1a"]);

const MARK_NUMBERS = Object.freeze(MARK_COLOURS.map((colour) => Number(colour.replace("#", "0x"))));

/** How a mark is drawn: its fill faint enough to see the drawing under it; its lines and the cross on its centre, in screen pixels. */
const MARK = Object.freeze({ fill: 0.2, line: 2, held: 3, halo: 5, cross: 7 });

/** How near a mark's centre the pointer takes hold of it however small it's drawn, in screen pixels. */
const REACH = 14;

/** How far an arrow key moves the picture or a mark, in map pixels, and how far with Shift held. */
const NUDGE = Object.freeze({ step: 1, shift: 10 });

/** How much larger or smaller one turn of the wheel with Ctrl makes the picture, and with Shift held too. */
const WHEEL_SIZE = Object.freeze({ step: 0.005, shift: 0.05 });

/**
 * The pointer shown over the map while sliding or marking, over a mark, and
 * once both marks are down, when a click elsewhere does nothing.
 */
const CURSORS = Object.freeze({ slide: "move", clicks: "crosshair", mark: "move", marked: "default" });

/** Between the bar and the hotbar, in CSS pixels. */
const BAR_GAP = 12;

/** Room left round the picture when it's brought into view for marking, in CSS pixels. */
const VIEW_MARGIN = 16;

/** How long bringing the picture into view takes, in milliseconds, unless motion is reduced. */
const VIEW_PAN = 400;

/**
 * Called as a picture starts being lined up, with `(true, scene)`, and once
 * it's kept or put back, with `(false, scene)`, for the rules beside the map
 * to wait and come back. Not called when the lining up goes with the Realm
 * itself, or gives way to another.
 */
export const MAP_ALIGNMENT_HOOK = `${SYSTEM_ID}.mapAlignment`;

/** What lining a picture up came to, for a caller waiting on it. */
export const ALIGNMENT = Object.freeze({ fitted: "fitted", stopped: "stopped", none: "none" });

/**
 * @typedef {{x: number, y: number, width: number, height: number}} Rect
 */

/**
 * @typedef {object} Alignment The picture being lined up.
 * @property {Scene} scene
 * @property {string} role Which picture, one of MAP_ROLES.
 * @property {TileDocument} tile The picture's Tile, moved on this screen alone until the GM keeps it.
 * @property {Rect} start Where the picture lay before, for putting it back.
 * @property {Rect} rect Where it lies now.
 * @property {"slide"|"clicks"} mode Sliding it about, or marking two hexes on it.
 * @property {boolean} bare Whether the picture has no hexes on it to mark, so it's only slid.
 * @property {boolean} fitted Whether it has been fitted to marked hexes yet, so marking them again can be left for sliding.
 * @property {{col: number, row: number}[]} hexes The two hexes to mark, in order.
 * @property {{x: number, y: number}[]} pins Where the hexes have been marked on the picture so far.
 * @property {number} held The mark last taken hold of, which the arrow keys move; -1 for none.
 * @property {{from: {x: number, y: number}, rect: Rect}
 *   |{pin: number, from: {x: number, y: number}, at: {x: number, y: number}}|null} drag
 *   The drag under way: of the picture, or of one of the marks.
 * @property {PIXI.Container} marks What's drawn while it's under way.
 * @property {PIXI.Graphics} frame The picture's edge.
 * @property {PIXI.Graphics} ring The hex to mark next, on the Realm's own hexes.
 * @property {PIXI.Graphics} pinned The hexes marked on the picture.
 * @property {number} zoom The zoom the marks were last drawn at, since their lines keep one width on screen.
 * @property {HTMLElement} bar The strip of buttons at the foot of the screen.
 * @property {() => void} stop Stops following the map and the zoom.
 * @property {number} tearDown The `canvasTearDown` hook watching for the Realm going away.
 * @property {(result: string) => void} settle Ends the caller's wait.
 */

/** @type {Alignment|null} The one picture this browser is lining up. */
let lining = null;

/** @type {string|null} The Realm Scene whose picture is about to be lined up, before its canvas is even drawn. */
let awaited = null;

/**
 * Say a Realm's picture is about to be lined up, before its Scene is shown,
 * so the rules that open with the Scene wait for it rather than opening and
 * closing again. startMapAlignment takes it from there.
 * @param {string} sceneId
 */
export function awaitMapAlignment(sceneId) {
	awaited = sceneId;
}

/**
 * @param {Scene|null|undefined} scene
 * @returns {boolean} Whether a picture is being lined up on that Scene in this browser, or is about to be.
 */
export const liningUpMap = (scene) => Boolean(scene?.id) && (lining?.scene.id === scene.id || awaited === scene.id);

/**
 * @param {Scene} scene
 * @param {string} role
 * @returns {TileDocument|undefined} The Tile a picture is drawn by.
 */
const mapTile = (scene, role) => scene.tiles.find((tile) => {
	const flag = realmFlag(tile);
	return flag?.kind === "map" && flag.role === role;
});

/**
 * Move the picture's Tile on this screen alone. Nothing is sent to the server
 * until the GM keeps it.
 * @param {TileDocument} tile
 * @param {Rect} rect
 * @param {object} [options]
 * @param {boolean} [options.redraw] False to change the Tile's data without drawing it there, so the
 *   picture stays where it's shown until the write that follows moves it.
 */
function showTileAt(tile, rect, { redraw = true } = {}) {
	tile.updateSource({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) });
	if (redraw && tile.object && !tile.object.destroyed) tile.object.renderFlags.set({ refreshTransform: true });
}

/** @returns {number} How many map pixels one screen pixel is, at the zoom the map is at. */
const screenPixel = () => 1 / (canvas.stage.scale.x || 1);

/** Draw the picture's edge, a constant width on screen however far the map is zoomed. */
function drawFrame() {
	if (!lining) return;
	const { frame, rect, mode } = lining;
	frame.clear();
	frame.visible = mode === "slide";
	if (!frame.visible) return;
	frame.lineStyle({ width: 2 * screenPixel(), color: RING, alpha: 0.9 });
	frame.drawRect(rect.x - rect.width / 2, rect.y - rect.height / 2, rect.width, rect.height);
}

/**
 * Ring the hex whose centre is to be marked next, on the Realm's own hexes,
 * and draw a cross through it so the GM can see which point of it they're
 * aiming at.
 */
function drawTarget() {
	if (!lining) return;
	const hex = lining.mode === "clicks" ? lining.hexes[lining.pins.length] : null;
	lining.ring.clear();
	lining.ring.visible = Boolean(hex);
	if (!hex) return;
	const g = sceneGeometry(lining.scene);
	const { x, y } = hexCentre(g, hex);

	lining.ring.lineStyle({ width: g.size / 20, color: RING, alpha: 0.9, join: PIXI.LINE_JOIN.ROUND });
	traceHex(lining.ring, g, hex);

	// A cross on the hex's own centre, which is the point the click stands for.
	lining.ring.lineStyle({ width: g.size / 28, color: INK_HEX, alpha: 0.9 });
	const arm = g.size / 5;
	lining.ring.moveTo(x - arm, y).lineTo(x + arm, y);
	lining.ring.moveTo(x, y - arm).lineTo(x, y + arm);
}

/** @returns {number} How large the picture's hexes are beside the Realm's, once both are marked; the Realm's own until then. */
const pinScale = () => markedHexScale(sceneGeometry(lining.scene), lining.pins[0], lining.pins[1]) ?? 1;

/**
 * Draw each hex marked on the picture: filled faintly in its colour, with a
 * paper halo so it shows on a dark picture, and a cross on its centre. The
 * one the arrow keys move is drawn bolder. Lines keep one width on screen.
 */
function drawPins() {
	if (!lining) return;
	const { pinned, pins, mode, held } = lining;
	pinned.clear();
	pinned.visible = mode === "clicks" && pins.length > 0;
	if (!pinned.visible) return;
	const g = sceneGeometry(lining.scene);
	const pixel = screenPixel();
	const scale = pinScale();
	const join = PIXI.LINE_JOIN.ROUND;

	for (const [index, point] of pins.entries()) {
		const colour = MARK_NUMBERS[index];
		const outline = markedHexOutline(g, point, scale).flatMap(({ x, y }) => [x, y]);
		pinned.lineStyle({ width: MARK.halo * pixel, color: PAPER, alpha: 0.85, join });
		pinned.drawPolygon(outline);
		pinned.lineStyle({ width: (index === held ? MARK.held : MARK.line) * pixel, color: colour, alpha: 1, join });
		pinned.beginFill(colour, MARK.fill);
		pinned.drawPolygon(outline);
		pinned.endFill();

		const arm = MARK.cross * pixel;
		pinned.lineStyle({ width: 1.5 * pixel, color: colour, alpha: 1 });
		pinned.moveTo(point.x - arm, point.y).lineTo(point.x + arm, point.y);
		pinned.moveTo(point.x, point.y - arm).lineTo(point.x, point.y + arm);
	}
}

/**
 * Show or hide Foundry's own hex lines on this screen alone. Nothing is
 * written to the Scene, so the Hex lines strength the GM set stays as it was.
 * @param {boolean} shown
 */
function showGrid(shown) {
	const mesh = canvas?.interface?.grid?.mesh;
	if (mesh && !mesh.destroyed) mesh.visible = shown;
}

/** Draw everything the lining up shows, at the zoom the map is at now. */
function draw() {
	if (!lining) return;
	lining.zoom = canvas.stage.scale.x;
	// While marking, the only hexes on the map should be the ones drawn on the picture.
	showGrid(lining.mode !== "clicks");
	drawFrame();
	drawTarget();
	drawPins();
}

/** Keep the lines one width on screen as the map is zoomed. */
function onTick() {
	if (lining && canvas.stage?.scale.x !== lining.zoom) draw();
}

/**
 * Show the pointer the map should have.
 * @param {string} [over] What's under it, one of CURSORS: nothing for the rest of the map.
 */
function setCursor(over) {
	if (!lining) {
		delete document.body.dataset.mapSlide;
		return;
	}
	document.body.dataset.mapSlide = CURSORS[over] ?? CURSORS[lining.mode];
}

/**
 * @param {number} index Which mark.
 * @returns {string} A little hexagon in the mark's colour and the hex's name, as HTML.
 */
function pinLabel(index) {
	const g = sceneGeometry(lining.scene);
	const outline = markedHexOutline(g, { x: 0, y: 0 });
	const reach = Math.max(...outline.map(({ x, y }) => Math.hypot(x, y))) || 1;
	const points = outline.map(({ x, y }) => `${(x / reach * 9).toFixed(2)},${(y / reach * 9).toFixed(2)}`).join(" ");
	const colour = MARK_COLOURS[index];
	return `<span class="bastionland-map-slide__pin"><svg viewBox="-10 -10 20 20" aria-hidden="true">`
		+ `<polygon points="${points}" fill="${colour}" fill-opacity="0.35" stroke="${colour}" stroke-width="2" stroke-linejoin="round"/></svg>`
		+ `${foundry.utils.escapeHTML(t("realm.hex", lining.hexes[index]))}</span>`;
}

/**
 * @param {string} key Under `bastionland.realm.picture`.
 * @param {Record<string, number>} [pins] Which mark stands for each name in the text.
 * @returns {string} The text as HTML, each mark shown by its colour and its hex's name.
 */
function hintHtml(key, pins = {}) {
	const stand = (name) => `\u0000${name}\u0000`;
	const text = foundry.utils.escapeHTML(t(`realm.picture.${key}`, Object.fromEntries(Object.keys(pins).map((name) => [name, stand(name)]))));
	// NUL can't come out of escapeHTML or a translation, so it marks each name unambiguously.
	// eslint-disable-next-line no-control-regex
	return text.replace(/\u0000(\w+)\u0000/g, (_, name) => pinLabel(pins[name]));
}

/** Say on the bar what to do now, and label its buttons for the mode it's in. */
function tell() {
	if (!lining) return;
	const { bar, mode, pins, hexes } = lining;
	const marking = mode === "clicks";
	const placed = pins.length >= hexes.length;
	let hint = hintHtml(lining.bare ? "bare.slideHint" : "slide.hint");
	if (marking && placed) hint = hintHtml("lineUp.adjust", { first: 0, second: 1 });
	else if (marking) hint = hintHtml(`lineUp.${pins.length === 0 ? "first" : "second"}`, { hex: pins.length });
	// Sliding is the one step for a map with no hexes on it.
	const step = foundry.utils.escapeHTML(t(`realm.picture.slide.steps.${marking ? "mark" : lining.bare ? "only" : "slide"}`));
	bar.querySelector("[data-slide-hint]").innerHTML = `<strong class="bastionland-map-slide__step">${step}</strong> ${hint}`;

	// Marking comes first, so there's nothing to go back to until the picture has been fitted once;
	// and a map with no hexes on it has none to mark.
	const clicks = bar.querySelector('[data-slide="clicks"]');
	clicks.hidden = lining.bare || (marking && !lining.fitted);
	clicks.setAttribute("aria-pressed", String(marking));
	clicks.querySelector("span").textContent = t(`realm.picture.slide.${marking ? "noClicks" : "clicks"}`);
	const keep = bar.querySelector('[data-slide="keep"]');
	keep.querySelector("span").textContent = t(`realm.picture.slide.${marking ? "fit" : "keep"}`);
	keep.dataset.tooltip = t(`realm.picture.slide.${marking ? "fitHint" : "keepHint"}`);
	keep.disabled = marking && !placed;
	placeBar();
}

/** Hold the bar at the foot of the screen, above the hotbar and between the tools and the sidebar. */
function placeBar() {
	const bar = lining?.bar;
	if (!bar?.offsetWidth) return;
	const room = panelScreen();
	const scale = mapPanelScale();
	const [wide, tall] = [bar.offsetWidth * scale, bar.offsetHeight * scale];
	bar.style.left = `${Math.round(Math.max(room.left, ((room.left + room.right) / 2) - (wide / 2)))}px`;
	bar.style.top = `${Math.round(Math.min(hotbarFloor(), window.innerHeight) - BAR_GAP - tall)}px`;
}

/** @returns {HTMLElement} The strip of buttons: mark the hexes again, and keep it here (or fit the map to the marks). Escape puts it back. */
function makeBar() {
	const bar = document.createElement("div");
	bar.id = "bastionland-map-slide";
	bar.className = "bastionland bastionland-map-slide";
	const button = (action, icon, label, tip) => `<button type="button" data-slide="${action}" data-tooltip="${foundry.utils.escapeHTML(tip)}">`
		+ `<i class="fa-solid ${icon}" inert></i> <span>${foundry.utils.escapeHTML(label)}</span></button>`;
	bar.innerHTML = `<p class="bastionland-map-slide__hint" data-slide-hint></p>`
		+ `<div class="bastionland-map-slide__buttons">`
		+ button("clicks", "fa-crosshairs", t("realm.picture.slide.clicks"), t("realm.picture.slide.clicksHint"))
		+ button("keep", "fa-check", t("realm.picture.slide.keep"), t("realm.picture.slide.keepHint"))
		+ `</div>`;
	bar.addEventListener("click", (event) => {
		const action = event.target.closest("[data-slide]")?.dataset.slide;
		if (action === "clicks") toggleClicks();
		else if (action === "keep") keepAlignment();
	});
	(document.getElementById("interface") ?? document.body).append(bar);
	return bar;
}

/**
 * Start marking two hexes on the picture, or go back to sliding it. Either
 * way starts with no marks. Marking starts with the whole picture in view,
 * since the two hexes are at its far corners.
 */
function toggleClicks() {
	if (!lining || lining.bare) return;
	lining.mode = lining.mode === "clicks" ? "slide" : "clicks";
	lining.pins = [];
	lining.held = -1;
	lining.drag = null;
	draw();
	setCursor();
	tell();
	if (lining.mode === "clicks") viewWholePicture();
}

/**
 * Zoom the map so the whole picture is in view between the tools and the
 * sidebar, under the Phase banner and above the bar: the last hex is at the
 * picture's foot, where the bar would otherwise hide it and take the click
 * meant for it.
 */
function viewWholePicture() {
	if (!lining || !canvas.ready || !canvas.dimensions?.scale) return;
	const room = panelScreen();
	const bar = lining.bar.getBoundingClientRect();
	const view = viewOfPicture(lining.rect, {
		...room,
		top: Math.max(room.top, phaseBannerFloor()),
		bottom: bar.height ? Math.min(room.bottom, bar.top) : room.bottom
	}, { width: window.innerWidth, height: window.innerHeight }, canvas.dimensions.scale, VIEW_MARGIN);
	if (view) canvas.animatePan({ ...view, duration: reducesMotion() ? 0 : VIEW_PAN });
}

/**
 * Take down everything the lining up put up, and put the picture's Tile back
 * as the server has it: a write that follows is planned against that, not
 * against where the picture was only shown. Whoever is waiting on it is left
 * waiting until the caller settles them, so a write that follows lands first.
 * @param {object} [options]
 * @param {boolean} [options.redraw] False to leave the picture drawn where it was slid to.
 * @returns {Alignment|null} What was under way.
 */
function endAlignment({ redraw = true } = {}) {
	const was = lining;
	if (!was) return null;
	lining = null;
	window.removeEventListener("pointerdown", onPointerDown, true);
	window.removeEventListener("pointermove", onPointerMove, true);
	window.removeEventListener("pointerup", onPointerUp, true);
	window.removeEventListener("keydown", onKeyDown, true);
	window.removeEventListener("wheel", onWheel, true);
	Hooks.off("canvasTearDown", was.tearDown);
	was.stop();
	was.bar.remove();
	was.marks.destroy({ children: true });
	showGrid(true);
	document.body.classList.remove("bastionland-map-sliding");
	setCursor();
	showTileAt(was.tile, was.start, { redraw });
	return was;
}

/**
 * Give up lining the picture up, and put it back where it lay.
 * @param {object} [options]
 * @param {boolean} [options.quiet] True when the Realm itself has gone, so there's nothing to say.
 */
export function cancelMapAlignment({ quiet = false } = {}) {
	const was = endAlignment();
	if (!was) return;
	if (!quiet) Hooks.callAll(MAP_ALIGNMENT_HOOK, false, was.scene);
	was.settle(ALIGNMENT.stopped);
	if (!quiet) ui.notifications.info(t("realm.picture.lineUp.stopped"));
}

/**
 * Keep the picture where it has been slid to, for everyone. While two hexes
 * are being marked, the same button fits the picture to them instead.
 * @returns {Promise<void>}
 */
async function keepAlignment() {
	if (lining?.mode === "clicks") {
		fitToPins();
		return;
	}
	if (!lining) return;
	const { rect, start } = lining;
	const moved = ["x", "y", "width", "height"].some((key) => Math.round(rect[key]) !== Math.round(start[key]));
	// The marks come down before the write, so the GM sees the picture settle into place uncluttered,
	// and the picture stays drawn where it was slid to while the write moves it there for everyone.
	const was = endAlignment({ redraw: !moved });
	if (moved) {
		await placeRealmPicture(was.scene, was.role, rect);
		was.tile.object?.renderFlags.set({ refreshTransform: true });
	}
	// The rules come back once the picture is where it's kept, so they're drawn over the map as it now lies.
	Hooks.callAll(MAP_ALIGNMENT_HOOK, false, was.scene);
	ui.notifications.info(t("realm.picture.lineUp.done"));
	was.settle(ALIGNMENT.fitted);
}

/**
 * Fit the picture to the two hexes marked on it: sized evenly so its hexes
 * are the Realm's, and moved so the marks land on the map's first and last.
 * Then back to sliding it, for the last little way. Two marks that can't be
 * the map's corners are left where they are to be moved, rather than the
 * picture being thrown about.
 */
function fitToPins() {
	if (!lining || lining.mode !== "clicks" || lining.pins.length < lining.hexes.length) return;
	const fitted = fitToMarks(sceneGeometry(lining.scene), lining.rect, lining.pins);
	if (!fitted) {
		ui.notifications.warn(t("realm.picture.lineUp.tooClose"));
		return;
	}
	lining.rect = fitted;
	lining.fitted = true;
	showTileAt(lining.tile, fitted);
	toggleClicks();
}

/**
 * Take hold of a mark, to drag it and for the arrow keys to move.
 * @param {number} index
 * @param {{x: number, y: number}} point Where on the map the pointer took it.
 */
function holdPin(index, point) {
	lining.held = index;
	lining.drag = { pin: index, from: point, at: { ...lining.pins[index] } };
	setCursor("mark");
}

/**
 * Mark a hex where the GM clicked, if one is still to be marked, and take
 * hold of it at once, so a press and a drag puts it down and moves it.
 * @param {{x: number, y: number}} point Where on the map the click landed.
 */
function pointOut(point) {
	if (!lining || lining.pins.length >= lining.hexes.length) return;
	lining.pins.push(point);
	holdPin(lining.pins.length - 1, point);
	draw();
	tell();
}

/**
 * @param {PointerEvent} event
 * @returns {{x: number, y: number}} Where on the map the pointer is.
 */
const pointerOnMap = (event) => canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });

/**
 * @param {{x: number, y: number}} point
 * @returns {number} The mark under the pointer, or -1 for none.
 */
const pinUnder = (point) => (lining?.mode === "clicks"
	? markAt(sceneGeometry(lining.scene), lining.pins, point, { scale: pinScale(), reach: REACH * screenPixel() })
	: -1);

/**
 * @param {{x: number, y: number}} point
 * @returns {string} What the pointer is over while hexes are being marked, one of CURSORS.
 */
const markingUnder = (point) => {
	if (pinUnder(point) >= 0) return "mark";
	return lining.pins.length < lining.hexes.length ? "clicks" : "marked";
};

/**
 * A left button takes hold of the picture to slide it; while marking hexes it
 * takes hold of a mark, or puts the next one down. Caught before the canvas
 * sees it, so the brush in hand doesn't paint with the same press.
 * @param {PointerEvent} event
 */
function onPointerDown(event) {
	if (!lining || event.button !== 0 || !onBoard(event)) return;
	event.preventDefault();
	event.stopImmediatePropagation();
	const point = pointerOnMap(event);
	if (lining.mode === "clicks") {
		const index = pinUnder(point);
		if (index < 0) pointOut(point);
		else {
			holdPin(index, point);
			drawPins();
		}
		return;
	}
	lining.drag = { from: point, rect: { ...lining.rect } };
}

/**
 * Slide the picture, or move a mark, as the pointer moves, and show what's
 * under it otherwise.
 * @param {PointerEvent} event
 */
function onPointerMove(event) {
	// PIXI sends its own pointermove, while the pointer rests, from where it last saw it: before the drag, since
	// the drag's moves are kept from it. Taken for the pointer's, it would throw the picture back to where it began.
	if (!lining || !event.isTrusted) return;
	const { drag } = lining;
	if (!drag) {
		if (onBoard(event) && lining.mode === "clicks") setCursor(markingUnder(pointerOnMap(event)));
		return;
	}
	event.stopImmediatePropagation();
	const point = pointerOnMap(event);
	if ("pin" in drag) {
		lining.pins[drag.pin] = { x: drag.at.x + point.x - drag.from.x, y: drag.at.y + point.y - drag.from.y };
		drawPins();
		return;
	}
	lining.rect = slideMapRect(drag.rect, point.x - drag.from.x, point.y - drag.from.y);
	showTileAt(lining.tile, lining.rect);
	drawFrame();
}

/**
 * Let go of the picture, or of a mark.
 * @param {PointerEvent} event
 */
function onPointerUp(event) {
	if (!lining?.drag || event.button !== 0) return;
	event.stopImmediatePropagation();
	lining.drag = null;
}

/**
 * @param {EventTarget|null} target
 * @returns {boolean} Whether a key pressed there is being typed, as into the Hex lines slider or a journal.
 */
const typing = (target) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** Which way each arrow key moves the picture or a mark. */
const ARROWS = Object.freeze({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] });

/**
 * The arrow keys nudge the picture, or the mark last taken hold of; Enter
 * keeps the picture, or fits it to the marks; and Escape leaves the marking
 * or puts the picture back — all before Foundry takes the keys for its own.
 * @param {KeyboardEvent} event
 */
function onKeyDown(event) {
	if (!lining || typing(event.target)) return;
	const arrow = ARROWS[event.key];
	const marking = lining.mode === "clicks";
	const handled = event.key === "Escape" || event.key === "Enter" || (arrow && (!marking || lining.held >= 0));
	if (!handled) return;
	event.preventDefault();
	event.stopImmediatePropagation();
	if (event.key === "Escape") {
		if (marking && lining.fitted) toggleClicks();
		else cancelMapAlignment();
		return;
	}
	if (event.key === "Enter") {
		keepAlignment();
		return;
	}
	const step = event.shiftKey ? NUDGE.shift : NUDGE.step;
	if (marking) {
		const pin = lining.pins[lining.held];
		lining.pins[lining.held] = { x: pin.x + arrow[0] * step, y: pin.y + arrow[1] * step };
		drawPins();
		return;
	}
	lining.rect = slideMapRect(lining.rect, arrow[0] * step, arrow[1] * step);
	showTileAt(lining.tile, lining.rect);
	drawFrame();
}

/**
 * Ctrl and the wheel size the picture evenly about the pointer while it's
 * being slid, so what's under the pointer stays put while the hexes drawn on
 * it grow or shrink to the Realm's. Without Ctrl the wheel zooms the map as
 * ever. While hexes are being marked it's left alone: the marks are made on
 * the picture as it lies.
 * @param {WheelEvent} event
 */
function onWheel(event) {
	if (!lining || lining.mode !== "slide" || lining.drag || !(event.ctrlKey || event.metaKey) || !onBoard(event)) return;
	event.preventDefault();
	event.stopImmediatePropagation();
	// Shift turns the wheel sideways in some browsers.
	const turn = Math.sign(event.deltaY || event.deltaX);
	if (!turn) return;
	const factor = (1 + (event.shiftKey ? WHEEL_SIZE.shift : WHEEL_SIZE.step)) ** -turn;
	const sized = sizeMapRect(sceneGeometry(lining.scene), lining.rect, factor, pointerOnMap(event));
	if (!sized) return;
	lining.rect = sized;
	showTileAt(lining.tile, lining.rect);
	drawFrame();
}

/**
 * Hand the GM a picture to line up over the hexes, starting with the two
 * hexes to mark on it, or with sliding it for a map with no hexes on it, and
 * wait for them:
 * whatever follows — handing them the Company to stand on the map, say —
 * shouldn't be taking the same clicks.
 * @param {Scene} scene A Realm Scene carrying that picture.
 * @param {object} [options]
 * @param {string} [options.role] Which picture, one of MAP_ROLES.
 * @returns {Promise<string>} One of ALIGNMENT, once it's kept or put back: "none" when there was
 *   nothing to line up, so the caller can say so another way.
 */
export function startMapAlignment(scene, { role = "players" } = {}) {
	// Rules held back for this, or for a lining up this one takes over from, come back if there's nothing to line up.
	const held = [lining?.scene, awaited && game.scenes?.get(awaited)].filter(Boolean);
	awaited = null;
	cancelMapAlignment({ quiet: true });
	const none = () => {
		for (const waiting of held) Hooks.callAll(MAP_ALIGNMENT_HOOK, false, waiting);
		return Promise.resolve(ALIGNMENT.none);
	};
	if (!game.user.isGM || !isRealmScene(scene)) return none();
	if (!canvas?.ready || canvas.scene?.id !== scene.id) return none();

	const picture = getRealm(scene)?.realm?.picture?.[role];
	const tile = picture ? mapTile(scene, role) : null;
	if (!tile) return none();

	const g = sceneGeometry(scene);
	const rect = mapRect(g, picture);
	const bare = Boolean(picture.bare);
	const marks = (canvas.controls ?? canvas.stage).addChild(new PIXI.Container());
	marks.eventMode = "none";
	const frame = marks.addChild(new PIXI.Graphics());
	const ring = marks.addChild(new PIXI.Graphics());
	const pinned = marks.addChild(new PIXI.Graphics());

	return new Promise((resolve) => {
		lining = {
			scene,
			role,
			tile,
			start: { ...rect },
			rect,
			mode: bare ? "slide" : "clicks",
			bare,
			fitted: false,
			hexes: calibrationHexes(g),
			pins: [],
			held: -1,
			drag: null,
			marks,
			frame,
			ring,
			pinned,
			zoom: 0,
			bar: makeBar(),
			stop: () => {},
			tearDown: 0,
			settle: resolve
		};
		lining.tearDown = Hooks.on("canvasTearDown", () => cancelMapAlignment({ quiet: true }));
		const unfollow = followMap(placeBar);
		canvas.app.ticker.add(onTick);
		lining.stop = () => {
			unfollow();
			canvas.app?.ticker.remove(onTick);
		};

		window.addEventListener("pointerdown", onPointerDown, true);
		window.addEventListener("pointermove", onPointerMove, true);
		window.addEventListener("pointerup", onPointerUp, true);
		window.addEventListener("keydown", onKeyDown, true);
		// Not passive, so Ctrl and the wheel size the picture rather than the browser's page.
		window.addEventListener("wheel", onWheel, { capture: true, passive: false });
		// The buttons under the map would sit behind the bar.
		document.body.classList.add("bastionland-map-sliding");
		Hooks.callAll(MAP_ALIGNMENT_HOOK, true, scene);
		draw();
		setCursor();
		tell();
		// The two hexes to mark are at the picture's far corners, and a map with no hexes on it is slid as a whole.
		viewWholePicture();
	});
}
