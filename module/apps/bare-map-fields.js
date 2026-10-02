/**
 * The New Realm dialog's fields for a map with no hexes on it. The Realm lays
 * its own hexes over such a map, so on the Map size page the two numbers
 * follow the picture's shape, and a preview draws the hexes over the picture.
 * Standard DOM alone, so the offline harness and the unit tests can wire it
 * up without Foundry.
 */
import { BARE_MAP, bareHexOverlay, bareMapSize } from "../rules/realm-map.js";
import { OWN_SIZE_LIMITS } from "../rules/realm-setup.js";

/** The map's two sides, each named as its field in the dialog is (`setup.cols`, `setup.rows`). */
const SIDES = Object.freeze(["cols", "rows"]);

/**
 * Wire up the fields for a map with no hexes on it. Choosing No hexes on it
 * puts the rules for setup away and unlocks the map's size, without ignoring
 * the rules. The size starts at the one suggested for the picture. When the GM
 * sets one side, the other follows the picture's shape, so the hexes still
 * cover it edge to edge. The side they set is kept when the picture changes.
 * Its sides may run further than a Realm's with the rules ignored
 * (OWN_SIZE_LIMITS), so a very wide or tall map is still covered.
 * Choosing a layout again gives back the size that was there before.
 * @param {HTMLElement} element The New Realm dialog.
 */
export function wireBareMapFields(element) {
	const parts = [...element.querySelectorAll("[data-bare-map]")];
	if (!parts.length) return;
	const rules = [...element.querySelectorAll("[data-setup-rules]")];
	const radios = [...element.querySelectorAll('input[name="layout"]')];
	const field = element.querySelector("[data-map-field]");
	const ignore = element.querySelector("[data-setup-ignore]");
	const inputs = Object.fromEntries(SIDES.map((side) => [side, element.querySelector(`[name="setup.${side}"]`)]));
	// The furthest each side goes with the rules ignored, as the dialog was drawn.
	const bounds = Object.fromEntries(SIDES.map((side) => [side, inputs[side]?.max ?? ""]));
	const preview = element.querySelector("[data-bare-preview]");
	const picture = element.querySelector("[data-bare-picture]");
	const hexes = element.querySelector("[data-bare-hexes]");
	const paths = {
		outside: element.querySelector("[data-bare-outside]"),
		halo: element.querySelector("[data-bare-halo]"),
		lines: element.querySelector("[data-bare-lines]")
	};
	const waiting = element.querySelector("[data-bare-waiting]");
	const broken = element.querySelector("[data-bare-broken]");

	/** @type {{width: number, height: number}|null} The picture's own size, once it has loaded. */
	let size = null;
	/** @type {"cols"|"rows"|null} The side the GM set last. */
	let lead = null;
	/** Whether No hexes on it was chosen when the fields were last laid out. */
	let on = false;
	/** @type {{cols: string, rows: string}|null} The size before No hexes on it was chosen, given back when it's left. */
	let kept = null;
	/** Whether the picture chosen wouldn't load. */
	let unreadable = false;
	let src = "";

	const bare = () => radios.some((radio) => radio.checked && radio.value === BARE_MAP);
	const given = () => ({ cols: inputs.cols?.value, rows: inputs.rows?.value });

	/** Draw the hexes over the picture as the numbers lay them, or say why there's no picture to draw them on. */
	const draw = () => {
		const overlay = on ? bareHexOverlay(size, given()) : null;
		if (preview) {
			preview.hidden = !overlay;
			if (size) preview.style.setProperty("--bastionland-bare-aspect", String(size.width / size.height));
		}
		if (waiting) waiting.hidden = Boolean(overlay) || unreadable;
		if (broken) broken.hidden = Boolean(overlay) || !unreadable;
		if (!overlay) return;
		hexes?.setAttribute("viewBox", overlay.viewBox);
		paths.outside?.setAttribute("d", overlay.outside);
		paths.halo?.setAttribute("d", overlay.hexes);
		paths.lines?.setAttribute("d", overlay.hexes);
	};

	/** Give the side the GM didn't set the count the picture's shape takes, or both the suggestion until they set one. */
	const fit = () => {
		if (on && size) {
			const fitted = bareMapSize(size, { ...given(), lead });
			for (const side of SIDES) if (side !== lead && inputs[side]) inputs[side].value = String(fitted[side]);
		}
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
		if (picture) {
			if (next) picture.setAttribute("src", next);
			else picture.removeAttribute("src");
		}
		draw();
	};

	/** Swap the rules for setup for the bare map's own fields, or back. */
	const mode = () => {
		const was = on;
		on = bare();
		for (const part of parts) part.hidden = !on;
		for (const part of rules) part.hidden = on;
		if (on) {
			if (!was) kept = given();
			// Disabled, so a tick put away out of sight isn't sent with the rest.
			if (ignore) ignore.disabled = true;
			for (const side of SIDES) {
				if (!inputs[side]) continue;
				inputs[side].disabled = false;
				// Or the browser refuses a long side when the dialog is sent.
				inputs[side].max = String(OWN_SIZE_LIMITS[side].max);
			}
			fit();
			return;
		}
		if (was) {
			lead = null;
			// The GM's own numbers, if the rules were ignored; otherwise the setup fields put the book's back anyway.
			for (const side of SIDES) {
				if (!inputs[side]) continue;
				inputs[side].max = bounds[side];
				if (kept) inputs[side].value = kept[side];
			}
			kept = null;
			if (ignore) {
				ignore.disabled = false;
				// The setup fields put the book's numbers back and lock them again, unless the rules are ignored.
				ignore.dispatchEvent(new Event("change"));
			}
		}
		draw();
	};

	picture?.addEventListener("load", () => {
		size = picture.naturalWidth > 0 && picture.naturalHeight > 0 ? { width: picture.naturalWidth, height: picture.naturalHeight } : null;
		fit();
	});
	picture?.addEventListener("error", () => {
		size = null;
		unreadable = Boolean(src);
		draw();
	});
	for (const radio of radios) radio.addEventListener("change", mode);
	for (const side of SIDES) {
		const input = inputs[side];
		input?.addEventListener("input", () => {
			if (!on) return;
			lead = side;
			fit();
		});
		// Once it's typed, a number out of bounds is shown as the one used.
		input?.addEventListener("change", () => {
			if (!on) return;
			input.value = String(bareMapSize(null, { ...given(), lead: side })[side]);
			fit();
		});
	}
	for (const type of ["input", "change"]) field?.addEventListener(type, () => load(field.value.trim()));
	load(field?.value.trim() ?? "");
	mode();
}
