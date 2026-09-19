import { showsArtPreviews } from "../client-settings.js";

/**
 * Hover previews: a larger copy of a piece of art, shown beside it while the
 * pointer is over it.
 *
 * The popup is added to <body> with `position: fixed`. Sheets and the chooser
 * scroll, and a scrolling ancestor would clip a popup placed inside it.
 */

const PREVIEW_CLASS = "bastionland-art-preview";

/** Space between the popup and its art, and between the popup and the window edge. */
const GAP = 12;

/** The largest a preview is drawn, in pixels and as a share of the window. */
const MAX_WIDTH = 560;
const MAX_HEIGHT = 640;
const MAX_WIDTH_SHARE = 0.6;
const MAX_HEIGHT_SHARE = 0.8;

/** Small art isn't enlarged past this, or it turns to mush. */
const MAX_UPSCALE = 2;

/**
 * The size to draw art at: as large as the limits allow, in its own shape.
 * @param {{width: number, height: number}} natural The art's own size.
 * @param {{width: number, height: number}} viewport The browser window.
 * @returns {{width: number, height: number}|null} Null while the art's size is unknown.
 */
export function fitArt(natural, viewport) {
	if (!(natural.width > 0 && natural.height > 0)) return null;
	const scale = Math.min(
		Math.min(MAX_WIDTH, viewport.width * MAX_WIDTH_SHARE) / natural.width,
		Math.min(MAX_HEIGHT, viewport.height * MAX_HEIGHT_SHARE) / natural.height,
		MAX_UPSCALE
	);
	return {
		width: Math.max(1, Math.round(natural.width * scale)),
		height: Math.max(1, Math.round(natural.height * scale))
	};
}

/**
 * Where a popup goes: right of the art, or left when the right has no room,
 * level with the art's middle and kept inside the window.
 * @param {{top: number, bottom: number, left: number, right: number}} anchor The art's box.
 * @param {{width: number, height: number}} popup
 * @param {{width: number, height: number}} viewport
 * @returns {{top: number, left: number}}
 */
export function placeArt(anchor, popup, viewport) {
	let left = anchor.right + GAP;
	if (left + popup.width > viewport.width - GAP) left = anchor.left - GAP - popup.width;
	const top = (anchor.top + anchor.bottom - popup.height) / 2;
	const clamp = (value, max) => Math.round(Math.max(GAP, Math.min(value, max)));
	return {
		top: clamp(top, viewport.height - GAP - popup.height),
		left: clamp(left, viewport.width - GAP - popup.width)
	};
}

/** @returns {{width: number, height: number}} */
const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

/** @type {{popup: HTMLElement, art: HTMLImageElement}|null} The preview showing. There is only ever one. */
let showing = null;

/**
 * Take down the preview, if one is showing.
 * @param {HTMLElement} [root] Only if its art is inside this.
 */
function removeArtPreview(root) {
	if (!showing || (root && !root.contains(showing.art))) return;
	showing.popup.remove();
	showing = null;
}

/**
 * Show a larger copy of an image beside it, captioned with its data-name.
 * @param {HTMLImageElement} art
 */
function showArtPreview(art) {
	removeArtPreview();
	// Read as each preview is about to show, so turning the setting off needs no window drawn again.
	if (!art.getAttribute("src") || !showsArtPreviews()) return;

	const popup = document.createElement("div");
	popup.className = PREVIEW_CLASS;
	// Hidden until sized and placed, so it never flashes up in a corner.
	popup.style.visibility = "hidden";
	// Above the window it came from. Foundry sets each window's z-index inline.
	const z = Number.parseInt(art.closest(".application")?.style.zIndex, 10) || 0;
	popup.style.zIndex = String(Math.max(10000, z + 1));

	const img = document.createElement("img");
	img.src = art.src;
	img.alt = "";
	popup.append(img);
	if (art.dataset.name) {
		const caption = document.createElement("span");
		caption.textContent = art.dataset.name;
		popup.append(caption);
	}
	document.body.append(popup);
	showing = { popup, art };

	const layout = (width, height) => {
		const size = fitArt({ width, height }, viewport());
		if (!size) return false;
		img.style.width = `${size.width}px`;
		img.style.height = `${size.height}px`;
		const box = { width: popup.offsetWidth, height: popup.offsetHeight };
		const { top, left } = placeArt(art.getBoundingClientRect(), box, viewport());
		Object.assign(popup.style, { top: `${top}px`, left: `${left}px`, visibility: "" });
		return true;
	};

	// Art on screen has loaded, so its size is already known. Art still loading
	// under the pointer is laid out once the copy loads.
	if (!layout(art.naturalWidth, art.naturalHeight)) {
		img.addEventListener("load", () => {
			if (popup.isConnected) layout(img.naturalWidth, img.naturalHeight);
		}, { once: true });
	}
}

/**
 * Show a preview for each image under `root` that matches `selector`.
 * mouseenter and mouseleave don't bubble, so they're caught on the way down.
 * @param {HTMLElement} root
 * @param {string} selector
 */
function wireArtPreview(root, selector) {
	root.addEventListener("mouseenter", (event) => {
		if (event.target.matches?.(selector)) showArtPreview(event.target);
	}, true);
	root.addEventListener("mouseleave", (event) => {
		if (event.target.matches?.(selector)) removeArtPreview();
	}, true);
}

/**
 * Gives a window hover previews for the art matching its static
 * `PREVIEWED_ART` selector. A preview comes down as the window draws again,
 * since that removes the art from under a still pointer without a mouseleave,
 * and as it closes.
 * @param {typeof foundry.applications.api.ApplicationV2} Base
 */
export const ArtPreviewMixin = (Base) => class extends Base {
	/** @type {string|null} */
	static PREVIEWED_ART = null;

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		if (this.constructor.PREVIEWED_ART) wireArtPreview(this.element, this.constructor.PREVIEWED_ART);
	}

	/** @override */
	async _preRender(context, options) {
		await super._preRender(context, options);
		if (this.element) removeArtPreview(this.element);
	}

	/** @override */
	async _preClose(options) {
		await super._preClose(options);
		removeArtPreview(this.element);
	}
};
