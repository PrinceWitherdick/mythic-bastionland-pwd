/**
 * The New Realm dialog's Map size page for a Realm made from the GM's own map.
 * Such a map needn't be the book's 12 by 12 hexes, so its size is the GM's own
 * without the rules for setup being ignored, and a preview draws the Realm's
 * hexes over the picture so they can see how many fit it. Clicked, the preview
 * opens larger in a window of its own, where the size can be set as well.
 * Standard DOM alone, so the offline harness and the unit tests can wire it up
 * without Foundry.
 */
import { BARE_MAP, bareMapSize, drawnMapSize, hexOverlay, steppedMapSize, unusualMapShape } from "../rules/realm-map.js";
import { BOOK_LAYOUT, normaliseLayout } from "../rules/realm-geometry.js";
import { OTHER_SIDE, OWN_SIZE_LIMITS, withinOwnSize } from "../rules/realm-setup.js";

/** How long a map path typed by hand waits for the typing to pause before the picture is looked for. */
const PATH_TYPING_MS = 300;

/** The map's two sides, each named as its field in the dialog is (`setup.cols`, `setup.rows`). */
const SIDES = Object.freeze(["cols", "rows"]);

/**
 * @typedef {object} MapSizeView What the Map size page shows, for the larger window to show too.
 * @property {string} src           The picture's path.
 * @property {object|null} overlay  The hexes drawn over it (hexOverlay), or null until it has loaded.
 * @property {number} aspect        The picture's width over its height.
 * @property {string} cols          As the dialog's field has it.
 * @property {string} rows          Likewise.
 * @property {string} count         "{cols} by {rows}, {hexes} hexes", filled in.
 * @property {boolean} canFewer     Whether Fewer hexes has a size to step to.
 * @property {boolean} canMore      Whether More hexes has.
 * @property {"bare"|"drawn"} mode  Whether the map has no hexes on it, or hexes drawn.
 */

/**
 * @typedef {object} MapSizeControls The Map size page's numbers, for the larger window to set.
 * @property {() => MapSizeView} view
 * @property {(side: "cols"|"rows", value: string) => void} setSide  As though the GM typed into that side's field.
 * @property {(side: "cols"|"rows") => void} settleSide             As though they left it: a number out of bounds becomes the one used.
 * @property {(step: -1|1) => void} stepSize                         Fewer hexes or More hexes.
 * @property {(listener: (view: MapSizeView) => void) => () => void} onDraw  Hear of each redraw; returns the way to stop.
 */

/**
 * Draw the Realm's hexes over a picture.
 * @param {{svg?: Element|null, outside?: Element|null, halo?: Element|null, lines?: Element|null}} parts
 * @param {object} overlay From hexOverlay.
 */
function paintOverlay(parts, overlay) {
	parts.svg?.setAttribute("viewBox", overlay.viewBox);
	parts.outside?.setAttribute("d", overlay.outside);
	parts.halo?.setAttribute("d", overlay.hexes);
	parts.lines?.setAttribute("d", overlay.hexes);
}

/**
 * Fill in "{cols} by {rows}, {hexes} hexes".
 * @param {string} format
 * @param {{cols: number, rows: number}} size
 */
const countText = (format, { cols, rows }) => format.replace("{cols}", cols).replace("{rows}", rows).replace("{hexes}", cols * rows);

/**
 * Wire up the Map size page. The two numbers are unlocked and may run as far
 * as OWN_SIZE_LIMITS, so a very wide or tall map is still covered.
 *
 * A map with no hexes on it takes as many as its shape needs: when the GM sets
 * one side, the other follows the picture's shape, so the hexes still cover it
 * edge to edge. A map with hexes drawn on it takes as many as the GM counts:
 * a side they set is kept, and the other follows the shape only until they set
 * it too. Either way, the size starts where it suits the picture
 * (bareMapSize, drawnMapSize), and the sides the GM set are kept when the
 * picture or the card changes. Fewer hexes and More hexes step both sides at
 * once to the next size in the picture's shape (steppedMapSize), as though the
 * GM had set them.
 *
 * On the Import map page, a picture far from the shape of a typical Realm says
 * so, and that its size is chosen on the Map size page.
 * @param {HTMLElement} element The New Realm dialog.
 * @param {object} [options]
 * @param {(controls: MapSizeControls) => void} [options.enlarge] Open the map larger, when the preview is clicked.
 * @returns {MapSizeControls|null} Null when the page isn't there to wire.
 */
export function wireMapSizeFields(element, { enlarge } = {}) {
	const radios = [...element.querySelectorAll('input[name="layout"]')];
	const field = element.querySelector("[data-map-field]");
	const inputs = Object.fromEntries(SIDES.map((side) => [side, element.querySelector(`[name="setup.${side}"]`)]));
	// The lines that say one thing of a map with no hexes on it and another of one drawn with them.
	const modal = [...element.querySelectorAll("[data-map-mode]")];
	const shapes = [...element.querySelectorAll("[data-map-shape]")];
	const preview = element.querySelector("[data-map-size-preview]");
	const picture = element.querySelector("[data-map-size-picture]");
	const parts = {
		svg: element.querySelector("[data-map-size-hexes]"),
		outside: element.querySelector("[data-map-size-outside]"),
		halo: element.querySelector("[data-map-size-halo]"),
		lines: element.querySelector("[data-map-size-lines]")
	};
	const stepper = element.querySelector("[data-map-size-step]");
	const steps = { [-1]: element.querySelector("[data-map-size-fewer]"), 1: element.querySelector("[data-map-size-more]") };
	const count = element.querySelector("[data-map-size-count]");
	const waiting = element.querySelector("[data-map-size-waiting]");
	const broken = element.querySelector("[data-map-size-broken]");
	const enlargers = [...element.querySelectorAll("[data-map-size-enlarge]")];
	if (!picture || !inputs.cols || !inputs.rows) return null;

	/** @type {{width: number, height: number}|null} The picture's own size, once it has loaded. */
	let size = null;
	/** @type {("cols"|"rows")[]} The sides the GM has set, the last set last. */
	let typed = [];
	/** Whether the picture chosen wouldn't load. */
	let unreadable = false;
	let src = "";
	/** @type {Set<(view: MapSizeView) => void>} The larger window, while it's open. */
	const listeners = new Set();

	const bare = () => radios.some((radio) => radio.checked && radio.value === BARE_MAP);
	/** @returns {string} How the Realm's hexes are laid out: the book's over a map with none on it. */
	const layout = () => (bare() ? BOOK_LAYOUT : normaliseLayout(radios.find((radio) => radio.checked)?.value));
	const given = () => ({ cols: inputs.cols.value, rows: inputs.rows.value });

	/** @returns {MapSizeView} The hexes over the picture as the numbers lay them, worked out once for the page and the larger window. */
	const view = () => {
		const drawn = hexOverlay(size, { ...given(), layout: layout() });
		return {
			src,
			overlay: drawn,
			aspect: size ? size.width / size.height : 1,
			...given(),
			count: drawn ? countText(count?.dataset.format ?? "", withinOwnSize(inputs.cols.value, inputs.rows.value)) : "",
			canFewer: Boolean(drawn && steppedMapSize(size, given(), -1, layout())),
			canMore: Boolean(drawn && steppedMapSize(size, given(), 1, layout())),
			mode: bare() ? "bare" : "drawn"
		};
	};

	/** Draw the hexes over the picture as the numbers lay them, or say why there's no picture to draw them on. */
	const draw = () => {
		const now = view();
		const drawn = Boolean(now.overlay);
		if (preview) {
			preview.hidden = !drawn;
			if (size) preview.style.setProperty("--bastionland-map-aspect", String(now.aspect));
		}
		if (waiting) waiting.hidden = drawn || unreadable;
		if (broken) broken.hidden = drawn || !unreadable;
		if (stepper) stepper.hidden = !drawn;
		if (drawn) {
			if (count) count.textContent = now.count;
			if (steps[-1]) steps[-1].disabled = !now.canFewer;
			if (steps[1]) steps[1].disabled = !now.canMore;
			paintOverlay(parts, now.overlay);
		}
		for (const listener of listeners) listener(now);
	};

	/** Say which kind of map the lines are speaking of, and whether this one is far from a typical Realm's shape. */
	const describe = () => {
		const mode = bare() ? "bare" : "drawn";
		for (const line of modal) line.hidden = line.dataset.mapMode !== mode;
		// A map with no hexes on it is already told its size is chosen on the Map size page.
		const shape = bare() ? null : unusualMapShape(size, layout());
		for (const line of shapes) line.hidden = line.dataset.mapShape !== shape;
	};

	/** Give the sides the GM didn't set the counts that suit the picture. */
	const fit = () => {
		if (size) {
			const fitted = bare()
				? bareMapSize(size, { ...given(), lead: typed.at(-1) ?? null }, layout())
				: drawnMapSize(size, { ...given(), typed }, layout());
			const kept = bare() ? typed.slice(-1) : typed;
			for (const side of SIDES) if (!kept.includes(side)) inputs[side].value = String(fitted[side]);
		}
		describe();
		draw();
	};

	/**
	 * Measure the picture chosen on the Import map page.
	 * @param {string} next Its path.
	 */
	const load = (next) => {
		if (next === src) return;
		src = next;
		size = null;
		unreadable = false;
		if (next) picture.setAttribute("src", next);
		else picture.removeAttribute("src");
		describe();
		draw();
	};

	/** @type {MapSizeControls} */
	const controls = {
		view,
		setSide: (side, value) => {
			// Typed into the page's own field, it already holds it; set again, its caret would jump.
			if (inputs[side].value !== String(value)) inputs[side].value = String(value);
			typed = [...typed.filter((other) => other !== side), side];
			fit();
		},
		// Once it's typed, a number out of bounds is shown as the one used.
		settleSide: (side) => {
			inputs[side].value = String(withinOwnSize(inputs.cols.value, inputs.rows.value, side)[side]);
			fit();
		},
		// More hexes or fewer, the picture's shape kept: the side the other follows is the one set last.
		stepSize: (step) => {
			const next = steppedMapSize(size, given(), step, layout());
			if (!next) return;
			typed = bare() ? [next.lead] : [OTHER_SIDE[next.lead], next.lead];
			for (const side of SIDES) inputs[side].value = String(next[side]);
			fit();
		},
		onDraw: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};

	picture.addEventListener("load", () => {
		size = picture.naturalWidth > 0 && picture.naturalHeight > 0 ? { width: picture.naturalWidth, height: picture.naturalHeight } : null;
		fit();
	});
	picture.addEventListener("error", () => {
		size = null;
		unreadable = Boolean(src);
		describe();
		draw();
	});
	for (const radio of radios) radio.addEventListener("change", fit);
	for (const side of SIDES) {
		const input = inputs[side];
		// Drawn locked for a Realm of the book's size; or the browser refuses a long side when the dialog is sent.
		input.disabled = false;
		input.max = String(OWN_SIZE_LIMITS[side].max);
		input.addEventListener("input", () => controls.setSide(side, input.value));
		input.addEventListener("change", () => controls.settleSide(side));
	}
	for (const step of [-1, 1]) steps[step]?.addEventListener("click", () => controls.stepSize(step));
	for (const button of enlargers) button.addEventListener("click", () => enlarge?.(controls));
	// A path typed by hand is looked for once the typing pauses, not at every letter; one pasted, picked or settled at once.
	let typing = null;
	field?.addEventListener("input", (event) => {
		clearTimeout(typing);
		const typed = event.inputType === "insertText" || event.inputType?.startsWith("delete");
		if (!typed) return load(field.value.trim());
		typing = setTimeout(() => field.isConnected && load(field.value.trim()), PATH_TYPING_MS);
	});
	field?.addEventListener("change", () => {
		clearTimeout(typing);
		load(field.value.trim());
	});
	load(field?.value.trim() ?? "");
	fit();
	return controls;
}

/**
 * Wire up the larger window of the Map size page: the GM's map as large as the
 * window allows, the Realm's hexes over it, and the same numbers and steps as
 * the page, kept in step with it both ways.
 * @param {HTMLElement} element The window.
 * @param {MapSizeControls} controls From wireMapSizeFields.
 * @returns {() => void} Stop hearing from the page, for when the window closes.
 */
export function wireMapSizeMirror(element, controls) {
	const preview = element.querySelector("[data-map-size-big-preview]");
	const picture = element.querySelector("[data-map-size-big-picture]");
	const parts = {
		svg: element.querySelector("[data-map-size-big-hexes]"),
		outside: element.querySelector("[data-map-size-big-outside]"),
		halo: element.querySelector("[data-map-size-big-halo]"),
		lines: element.querySelector("[data-map-size-big-lines]")
	};
	const inputs = Object.fromEntries(SIDES.map((side) => [side, element.querySelector(`[data-map-size-big-side="${side}"]`)]));
	const steps = { [-1]: element.querySelector("[data-map-size-big-fewer]"), 1: element.querySelector("[data-map-size-big-more]") };
	const count = element.querySelector("[data-map-size-big-count]");
	const modal = [...element.querySelectorAll("[data-map-mode]")];
	/** The side being typed into, left alone while it is: rewritten, the caret would jump. */
	let typing = null;

	/** @param {MapSizeView} view */
	const draw = (view) => {
		if (picture && picture.getAttribute?.("src") !== view.src) {
			if (view.src) picture.setAttribute("src", view.src);
			else picture.removeAttribute("src");
		}
		if (preview) {
			preview.hidden = !view.overlay;
			preview.style.setProperty("--bastionland-map-aspect", String(view.aspect));
		}
		if (view.overlay) paintOverlay(parts, view.overlay);
		for (const side of SIDES) if (inputs[side] && side !== typing) inputs[side].value = view[side];
		if (count) count.textContent = view.count;
		if (steps[-1]) steps[-1].disabled = !view.canFewer;
		if (steps[1]) steps[1].disabled = !view.canMore;
		for (const line of modal) line.hidden = line.dataset.mapMode !== view.mode;
	};

	for (const side of SIDES) {
		const input = inputs[side];
		if (!input) continue;
		input.min = String(OWN_SIZE_LIMITS[side].min);
		input.max = String(OWN_SIZE_LIMITS[side].max);
		input.addEventListener("input", () => {
			typing = side;
			try {
				controls.setSide(side, input.value);
			} finally {
				typing = null;
			}
		});
		input.addEventListener("change", () => controls.settleSide(side));
	}
	for (const step of [-1, 1]) steps[step]?.addEventListener("click", () => controls.stepSize(step));
	const stop = controls.onDraw(draw);
	draw(controls.view());
	return stop;
}
