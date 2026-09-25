/**
 * Lining a picture of a Realm up with the hexes by sliding it into place. The
 * GM drags the map anywhere to slide the picture under the hex lines, drags a
 * corner to size it and an edge to stretch it, and nudges it the last pixel
 * with the arrow keys. Nothing is written until they keep it, so the picture
 * moves on this screen alone while it's under way, and Escape puts it back.
 *
 * Two clicks are still there for a picture far out: the centre of the map's
 * first hex on the picture, then the centre of its last. That fits it roughly,
 * and the GM slides it the rest of the way.
 *
 * The clicks and drags are caught before the canvas sees them, so whatever
 * tool is in hand doesn't act on them — the same way the Company is carried to
 * a hex. A right drag is left to the canvas, so the map can still be panned,
 * and the wheel still zooms.
 */
import { t } from "../chat/cards.js";
import { INK_HEX } from "../rules/colour.js";
import { hexCentre, hexVertices } from "../rules/realm-geometry.js";
import { realmFlag } from "../rules/realm-documents.js";
import { calibrationHexes, fitFromClicks, handleAt, mapHandles, mapRect, resizeMapRect, slideMapRect } from "../rules/realm-map.js";
import { getRealm, isRealmScene, sceneGeometry } from "../actions/realm.js";
import { placeRealmPicture } from "../actions/realm-map.js";
import { followMap, hotbarFloor, mapPanelScale, panelScreen } from "../apps/map-screen.js";

/** The ink the picture's frame, its handles and the hex being pointed out are drawn in. */
const RING = 0x8b1e1e;

/** The paper a handle is filled with. */
const PAPER = 0xf4ecd8;

/** How big a handle is drawn, and how near it the pointer must be to take it, in screen pixels. */
const HANDLE = Object.freeze({ size: 12, reach: 14 });

/** How far an arrow key moves the picture, in map pixels, and how far with Shift held. */
const NUDGE = Object.freeze({ step: 1, shift: 10 });

/** The pointer shown over each handle, and over the rest of the map while sliding or clicking. */
const CURSORS = Object.freeze({
	nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize",
	n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
	slide: "move", clicks: "crosshair"
});

/** Between the bar and the hotbar, in CSS pixels. */
const BAR_GAP = 12;

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
 * @property {"slide"|"clicks"} mode Sliding it about, or pointing out two hexes on it.
 * @property {{col: number, row: number}[]} hexes The two hexes to point out in clicks mode, in order.
 * @property {{x: number, y: number}[]} clicks Where the hexes have been pointed out so far, in clicks mode.
 * @property {{handle: string|null, from: {x: number, y: number}, rect: Rect}|null} drag The drag under way.
 * @property {PIXI.Container} marks What's drawn while it's under way.
 * @property {PIXI.Graphics} frame The picture's edge and its handles.
 * @property {PIXI.Graphics} ring The hex to point out next, in clicks mode.
 * @property {number} zoom The zoom the frame was last drawn at, since its lines keep one width on screen.
 * @property {HTMLElement} bar The strip of buttons at the foot of the screen.
 * @property {() => void} stop Stops following the map and the zoom.
 * @property {number} tearDown The `canvasTearDown` hook watching for the Realm going away.
 * @property {(result: string) => void} settle Ends the caller's wait.
 */

/** @type {Alignment|null} The one picture this browser is lining up. */
let lining = null;

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

/** Draw the picture's edge and its handles, a constant size on screen however far the map is zoomed. */
function drawFrame() {
	if (!lining) return;
	const { frame, rect, mode } = lining;
	frame.clear();
	frame.visible = mode === "slide";
	if (!frame.visible) return;
	const pixel = 1 / (canvas.stage.scale.x || 1);
	lining.zoom = canvas.stage.scale.x;

	frame.lineStyle({ width: 2 * pixel, color: RING, alpha: 0.9 });
	frame.drawRect(rect.x - rect.width / 2, rect.y - rect.height / 2, rect.width, rect.height);

	const size = HANDLE.size * pixel;
	frame.lineStyle({ width: 1.5 * pixel, color: INK_HEX, alpha: 1 });
	for (const { x, y } of mapHandles(rect)) {
		frame.beginFill(PAPER, 1);
		frame.drawRect(x - size / 2, y - size / 2, size, size);
		frame.endFill();
	}
}

/** Keep the frame's lines one width on screen as the map is zoomed. */
function onTick() {
	if (lining && lining.mode === "slide" && canvas.stage?.scale.x !== lining.zoom) drawFrame();
}

/**
 * Ring the hex whose centre is to be pointed out next, and draw a cross through
 * it so the GM can see which point of it they're aiming at.
 */
function drawTarget() {
	if (!lining) return;
	const hex = lining.mode === "clicks" ? lining.hexes[lining.clicks.length] : null;
	lining.ring.clear();
	lining.ring.visible = Boolean(hex);
	if (!hex) return;
	const g = sceneGeometry(lining.scene);
	const { x, y } = hexCentre(g, hex);

	lining.ring.lineStyle({ width: g.size / 20, color: RING, alpha: 0.9, join: PIXI.LINE_JOIN.ROUND });
	const [first, ...rest] = hexVertices(g, hex);
	lining.ring.moveTo(first.x, first.y);
	for (const corner of rest) lining.ring.lineTo(corner.x, corner.y);
	lining.ring.closePath();

	// A cross on the hex's own centre, which is the point the click stands for.
	lining.ring.lineStyle({ width: g.size / 28, color: INK_HEX, alpha: 0.9 });
	const arm = g.size / 5;
	lining.ring.moveTo(x - arm, y).lineTo(x + arm, y);
	lining.ring.moveTo(x, y - arm).lineTo(x, y + arm);
}

/**
 * Show the pointer the map should have, over a handle or over the rest of it.
 * @param {string} [over] A handle, or nothing for the rest of the map.
 */
function setCursor(over) {
	if (!lining) {
		delete document.body.dataset.mapSlide;
		return;
	}
	document.body.dataset.mapSlide = CURSORS[over] ?? CURSORS[lining.mode];
}

/** Say on the bar what to do now, and label its buttons for the mode it's in. */
function tell() {
	if (!lining) return;
	const { bar, mode } = lining;
	const hex = lining.hexes[lining.clicks.length];
	const hint = mode === "clicks" && hex
		? t(`realm.picture.lineUp.${lining.clicks.length === 0 ? "first" : "second"}`, { hex: t("realm.hex", hex) })
		: t("realm.picture.slide.hint");
	bar.querySelector("[data-slide-hint]").textContent = hint;
	const clicks = bar.querySelector('[data-slide="clicks"]');
	clicks.setAttribute("aria-pressed", String(mode === "clicks"));
	clicks.querySelector("span").textContent = t(`realm.picture.slide.${mode === "clicks" ? "noClicks" : "clicks"}`);
	bar.querySelector('[data-slide="keep"]').disabled = mode === "clicks";
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

/** @returns {HTMLElement} The strip of buttons: two clicks, put it back, keep it here. */
function makeBar() {
	const bar = document.createElement("div");
	bar.id = "bastionland-map-slide";
	bar.className = "bastionland bastionland-map-slide";
	const button = (action, icon, label, tip) => `<button type="button" data-slide="${action}" data-tooltip="${foundry.utils.escapeHTML(tip)}">`
		+ `<i class="fa-solid ${icon}" inert></i> <span>${foundry.utils.escapeHTML(label)}</span></button>`;
	bar.innerHTML = `<p class="bastionland-map-slide__hint" data-slide-hint></p>`
		+ `<div class="bastionland-map-slide__buttons">`
		+ button("clicks", "fa-crosshairs", t("realm.picture.slide.clicks"), t("realm.picture.slide.clicksHint"))
		+ button("back", "fa-rotate-left", t("realm.picture.slide.back"), t("realm.picture.slide.backHint"))
		+ button("keep", "fa-check", t("realm.picture.slide.keep"), t("realm.picture.slide.keepHint"))
		+ `</div>`;
	bar.addEventListener("click", (event) => {
		const action = event.target.closest("[data-slide]")?.dataset.slide;
		if (action === "clicks") toggleClicks();
		else if (action === "back") cancelMapAlignment();
		else if (action === "keep") keepAlignment();
	});
	(document.getElementById("interface") ?? document.body).append(bar);
	return bar;
}

/** Start pointing out two hexes on the picture, or go back to sliding it. */
function toggleClicks() {
	if (!lining) return;
	lining.mode = lining.mode === "clicks" ? "slide" : "clicks";
	lining.clicks = [];
	lining.drag = null;
	drawFrame();
	drawTarget();
	setCursor();
	tell();
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
	Hooks.off("canvasTearDown", was.tearDown);
	was.stop();
	was.bar.remove();
	was.marks.destroy({ children: true });
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
	was.settle(ALIGNMENT.stopped);
	if (!quiet) ui.notifications.info(t("realm.picture.lineUp.stopped"));
}

/**
 * Keep the picture where it has been slid to, for everyone.
 * @returns {Promise<void>}
 */
async function keepAlignment() {
	if (!lining || lining.mode !== "slide") return;
	const { rect, start } = lining;
	const moved = ["x", "y", "width", "height"].some((key) => Math.round(rect[key]) !== Math.round(start[key]));
	// The marks come down before the write, so the GM sees the picture settle into place uncluttered,
	// and the picture stays drawn where it was slid to while the write moves it there for everyone.
	const was = endAlignment({ redraw: !moved });
	if (moved) {
		await placeRealmPicture(was.scene, was.role, rect);
		was.tile.object?.renderFlags.set({ refreshTransform: true });
	}
	ui.notifications.info(t("realm.picture.lineUp.done"));
	was.settle(ALIGNMENT.fitted);
}

/**
 * Take in a click on the picture, and once there are two of them, fit the
 * picture to them and go back to sliding it, for the last little way.
 * @param {{x: number, y: number}} point Where on the map the click landed.
 */
function pointOut(point) {
	if (!lining) return;
	lining.clicks.push(point);
	if (lining.clicks.length < lining.hexes.length) {
		drawTarget();
		tell();
		return;
	}

	const fitted = fitFromClicks(sceneGeometry(lining.scene), lining.rect, lining.clicks[0], lining.clicks[1]);
	lining.clicks = [];
	if (!fitted) {
		// Two clicks that say nothing: the same two hexes are asked for again rather than the picture being thrown about.
		ui.notifications.warn(t("realm.picture.lineUp.tooClose"));
		drawTarget();
		tell();
		return;
	}
	lining.rect = fitted;
	showTileAt(lining.tile, fitted);
	toggleClicks();
}

/**
 * @param {Event} event
 * @returns {boolean} Whether the event happened over the map rather than over a window or the sidebar.
 */
const onBoard = (event) => event.target instanceof Element && event.target.id === "board";

/**
 * @param {PointerEvent} event
 * @returns {{x: number, y: number}} Where on the map the pointer is.
 */
const pointerOnMap = (event) => canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });

/**
 * @param {{x: number, y: number}} point
 * @returns {string|null} The handle under the pointer, if any.
 */
const handleUnder = (point) => (lining?.mode === "slide" ? handleAt(lining.rect, point, HANDLE.reach / (canvas.stage.scale.x || 1)) : null);

/**
 * A left button takes hold of the picture, by a handle or anywhere else to
 * slide it; in clicks mode it points out a hex. Caught before the canvas sees
 * it, so the brush in hand doesn't paint with the same press.
 * @param {PointerEvent} event
 */
function onPointerDown(event) {
	if (!lining || event.button !== 0 || !onBoard(event)) return;
	event.preventDefault();
	event.stopImmediatePropagation();
	const point = pointerOnMap(event);
	if (lining.mode === "clicks") {
		pointOut(point);
		return;
	}
	lining.drag = { handle: handleUnder(point), from: point, rect: { ...lining.rect } };
}

/**
 * Slide or size the picture as the pointer moves, and show which handle is under it otherwise.
 * @param {PointerEvent} event
 */
function onPointerMove(event) {
	if (!lining) return;
	const { drag } = lining;
	if (!drag) {
		if (onBoard(event)) setCursor(handleUnder(pointerOnMap(event)));
		return;
	}
	event.stopImmediatePropagation();
	const point = pointerOnMap(event);
	lining.rect = drag.handle
		// Shift frees a corner from the picture's shape.
		? resizeMapRect(sceneGeometry(lining.scene), drag.rect, drag.handle, point, { keepShape: !event.shiftKey })
		: slideMapRect(drag.rect, point.x - drag.from.x, point.y - drag.from.y);
	showTileAt(lining.tile, lining.rect);
	drawFrame();
}

/**
 * Let go of the picture.
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

/** Which way each arrow key moves the picture. */
const ARROWS = Object.freeze({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] });

/**
 * The arrow keys nudge the picture, Enter keeps it, and Escape leaves the two
 * clicks or puts the picture back — all before Foundry takes the keys for its own.
 * @param {KeyboardEvent} event
 */
function onKeyDown(event) {
	if (!lining || typing(event.target)) return;
	const arrow = ARROWS[event.key];
	const handled = event.key === "Escape" || (lining.mode === "slide" && (event.key === "Enter" || arrow));
	if (!handled) return;
	event.preventDefault();
	event.stopImmediatePropagation();
	if (event.key === "Escape") {
		if (lining.mode === "clicks") toggleClicks();
		else cancelMapAlignment();
	} else if (event.key === "Enter") keepAlignment();
	else {
		const step = event.shiftKey ? NUDGE.shift : NUDGE.step;
		lining.rect = slideMapRect(lining.rect, arrow[0] * step, arrow[1] * step);
		showTileAt(lining.tile, lining.rect);
		drawFrame();
	}
}

/**
 * Hand the GM a picture to slide into place over the hexes, and wait for them:
 * whatever follows — handing them the Company to stand on the map, say —
 * shouldn't be taking the same clicks.
 * @param {Scene} scene A Realm Scene carrying that picture.
 * @param {object} [options]
 * @param {string} [options.role] Which picture, one of MAP_ROLES.
 * @returns {Promise<string>} One of ALIGNMENT, once it's kept or put back: "none" when there was
 *   nothing to line up, so the caller can say so another way.
 */
export function startMapAlignment(scene, { role = "players" } = {}) {
	cancelMapAlignment({ quiet: true });
	if (!game.user.isGM || !isRealmScene(scene)) return Promise.resolve(ALIGNMENT.none);
	if (!canvas?.ready || canvas.scene?.id !== scene.id) return Promise.resolve(ALIGNMENT.none);

	const picture = getRealm(scene)?.realm?.picture?.[role];
	const tile = picture ? mapTile(scene, role) : null;
	if (!tile) return Promise.resolve(ALIGNMENT.none);

	const g = sceneGeometry(scene);
	const rect = mapRect(g, picture);
	const marks = (canvas.controls ?? canvas.stage).addChild(new PIXI.Container());
	marks.eventMode = "none";
	const frame = marks.addChild(new PIXI.Graphics());
	const ring = marks.addChild(new PIXI.Graphics());

	return new Promise((resolve) => {
		lining = {
			scene,
			role,
			tile,
			start: { ...rect },
			rect,
			mode: "slide",
			hexes: calibrationHexes(g),
			clicks: [],
			drag: null,
			marks,
			frame,
			ring,
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
		// The buttons under the map would sit behind the bar.
		document.body.classList.add("bastionland-map-sliding");
		drawFrame();
		drawTarget();
		setCursor();
		tell();
	});
}
