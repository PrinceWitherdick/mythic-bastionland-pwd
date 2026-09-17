/**
 * Reading the GM's own copy of the rulebook inside Foundry.
 *
 * Nothing of the book ships with the system, and nothing here draws a page.
 * Foundry bundles the whole pdf.js viewer and serves it at
 * `scripts/pdfjs/web/viewer.html`, which is what core's own PDF journal pages
 * point an iframe at. That viewer already has the outline, full-text search,
 * thumbnails and the book's own internal links, so this file only works out
 * the URL that hands it a file, and the window drives it from there.
 */
import { EXPECTED_PAGES } from "./book-art.js";

/** Foundry's bundled pdf.js viewer, relative to the game route. */
export const VIEWER_PATH = "scripts/pdfjs/web/viewer.html";

/**
 * Resolve a Data-relative path against this server's route prefix. Left alone
 * when it is already a URL, so a book served from elsewhere still opens.
 * @param {string} path
 * @returns {string}
 */
function routed(path) {
	const clean = String(path ?? "").replace(/^\/+/, "");
	if (/^[a-z]+:\/\//i.test(clean)) return clean;
	return globalThis.foundry?.utils?.getRoute?.(clean) ?? `/${clean}`;
}

/**
 * Whether a path looks like a PDF. Only the extension can be checked without
 * fetching the file, so callers warn rather than refuse.
 * @param {string} path
 * @returns {boolean}
 */
export function isPdfPath(path) {
	return /\.pdf(\?|#|$)/i.test(String(path ?? ""));
}

/**
 * A page number fit to ask a viewer for, or null.
 * @param {*} page
 * @returns {number|null}
 */
export function readerPage(page) {
	const number = Number(page);
	return Number.isFinite(number) && number >= 1 ? Math.trunc(number) : null;
}

/**
 * Whether the PDF that opened is the edition the page numbers in this system
 * were taken from. Asked of the loaded document rather than assumed: a
 * different printing renumbers everything, and a jump that lands in the wrong
 * chapter reads as a bad page reference rather than as the wrong file.
 * @param {number} pageCount
 * @returns {boolean}
 */
export function looksLikeTheRulebook(pageCount) {
	return Number(pageCount) === EXPECTED_PAGES;
}

/**
 * The URL that opens a PDF in Foundry's viewer.
 *
 * The query half says what to load and the hash half says what to do once it
 * has loaded; they aren't interchangeable. `file` goes through
 * URLSearchParams because a book saved under its shop filename often holds
 * spaces and an ampersand, and an unescaped one cuts the parameter short and
 * shows an empty viewer with nothing to explain it.
 *
 * @param {string} path Under Foundry's Data folder, or an absolute URL.
 * @param {object} [options]
 * @param {number} [options.page] Page to open at.
 * @returns {string} Empty when there's no path, so callers can build it either way.
 */
export function rulebookViewerUrl(path, { page } = {}) {
	const source = String(path ?? "").trim();
	if (!source) return "";

	const params = new URLSearchParams();
	params.append("file", routed(source));

	const number = readerPage(page);
	return `${routed(VIEWER_PATH)}?${params}${number ? `#page=${number}` : ""}`;
}

/**
 * One notch of the wheel, flat. pdf.js's own step compounds and reads one
 * mouse flick as three steps, which takes a page from 100% to 170% at once.
 */
const ZOOM_STEP = 0.1;

/**
 * The scale one notch from here, on a flat grid of tenths. Snapped to the grid
 * first, since "fit page" lands somewhere like 0.63, and rounded to the
 * hundredth so the toolbar never shows 70.00000000000001%.
 * @param {number} scale
 * @param {number} direction 1 to zoom in, -1 to zoom out.
 * @returns {number}
 */
export function zoomStepTarget(scale, direction) {
	const tenths = scale * 10;
	// Tolerance so a scale already on the grid isn't nudged off it by floating-point dust.
	const grid = (direction > 0 ? Math.floor(tenths + 1e-6) : Math.ceil(tenths - 1e-6)) / 10;
	return Math.round((grid + direction * ZOOM_STEP) * 100) / 100;
}
