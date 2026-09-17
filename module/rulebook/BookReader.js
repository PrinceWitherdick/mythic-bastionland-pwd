import { t } from "../chat/cards.js";
import { EXPECTED_PAGES } from "../rules/book-art.js";
import { looksLikeTheRulebook, readerPage, rulebookViewerUrl, zoomStepTarget } from "../rules/rulebook.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { openRulebookSetup } from "./RulebookSetup.js";
import { showRulebookPage } from "./share.js";
import { canKeepRulebook, canReadRulebook, hasRulebook, rulebookPath } from "./store.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * pdf.js's LinkTarget.BLANK. Without it a link out of the book navigates the
 * iframe away, leaving the window on a web page with no way back but closing
 * it. Links inside the book are unaffected.
 */
const LINK_TARGET_BLANK = 2;

/**
 * pdf.js's CursorTool.HAND: dragging moves the page, as a sheet of paper
 * would. It leaves links alone, and the viewer's own menu offers text
 * selection back.
 */
const CURSOR_TOOL_HAND = 1;

/**
 * A rulebook has an outline and thumbnails but no attachments or layers, and
 * sidebar tabs that answer nothing read as broken rather than empty. Hidden on
 * the disabled state, which is the viewer's own answer to whether there's
 * anything in them, so a PDF that has some keeps them.
 */
const EMPTY_TABS_STYLE = "bastionland-empty-sidebar-tabs";
const EMPTY_TABS_CSS = "#viewAttachments[disabled], #viewLayers[disabled] { display: none; }";

/** WheelEvent.DOM_DELTA_PIXEL, written out so tests need no WheelEvent. */
const DELTA_MODE_PIXEL = 0;

/** Pixels of wheel travel pdf.js counts as one notch. Only used to tell whether the wheel moved. */
const WHEEL_PIXELS_PER_NOTCH = 30;

/**
 * The rulebook, open in Foundry's own PDF viewer.
 *
 * Thin on purpose: the outline, search, thumbnails and the book's own links
 * all belong to the viewer in the frame. This window only does what a viewer
 * in an iframe can't do for itself. It must never re-render, since that
 * replaces the frame and loses the page being read, so anything that changes
 * drives the viewer instead of calling `render`.
 */
export class BookReader extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-rulebook",
		classes: [SYSTEM_ID, "bastionland", "bastionland-rulebook-window"],
		position: { width: 900, height: 820 },
		window: {
			title: "bastionland.rulebook.title",
			icon: "fa-solid fa-book",
			resizable: true,
			controls: [
				{ action: "openTab", icon: "fa-solid fa-arrow-up-right-from-square", label: "bastionland.rulebook.openTab" },
				{ action: "setup", icon: "fa-solid fa-folder-open", label: "bastionland.rulebook.setup.title", visible: canKeepRulebook }
			]
		},
		actions: {
			openTab: BookReader.#onOpenTab,
			setup: BookReader.#onSetup,
			showPlayers: BookReader.#onShowPlayers
		}
	};

	static PARTS = {
		reader: { template: templatePath("apps/book-reader.hbs") }
	};

	/** @type {object|null} The viewer inside the frame, once it has loaded. */
	#viewer = null;

	/** @type {HTMLIFrameElement|null} */
	#frame = null;

	/** The frame's window while a wheel listener is on it. The listener is bound once so it can be taken off again. */
	#zoomWindow = null;
	#onWheelZoom = (event) => this.#wheelZoom(event);

	/** Set once the edition has been checked, so it's said once per file. */
	#editionChecked = false;

	/** @type {number|null} The page asked for when the reader was opened. */
	#openedAt = null;

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		return Object.assign(context, {
			src: rulebookViewerUrl(rulebookPath(), { page: this.#openedAt }),
			frameTitle: t("rulebook.title")
		});
	}

	/**
	 * Show Players sits in the header itself rather than the menu: it's the one
	 * a GM reaches for mid-session.
	 * @override
	 */
	_getFrameButtons(options) {
		const buttons = super._getFrameButtons(options);
		if (game.user.isGM) buttons.unshift({ action: "showPlayers", icon: "fa-solid fa-eye", label: "bastionland.rulebook.showPlayers" });
		return buttons;
	}

	/** @override */
	_onRender(context, options) {
		super._onRender(context, options);
		this.#frame = this.element.querySelector("iframe");
		this.#frame?.addEventListener("load", () => this.#onFrameLoad());
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		this.#unbindWheelZoom();
		this.#viewer = null;
		this.#frame = null;
	}

	/**
	 * Reach into the loaded viewer for what a URL can't say. Each step is
	 * wrapped on its own: the viewer's shape belongs to whichever pdf.js core
	 * bundles, and one step failing shouldn't cost the reader the others.
	 */
	#onFrameLoad() {
		this.#try("tidy the book's sidebar", () => this.#hideEmptySidebarTabs());
		this.#try("set up the PDF viewer", () => {
			const viewer = this.#frame?.contentWindow?.PDFViewerApplication;
			if (!viewer) return;
			this.#viewer = viewer;
			if (viewer.pdfLinkService) viewer.pdfLinkService.externalLinkTarget = LINK_TARGET_BLANK;
			viewer.initializedPromise?.then(() => {
				this.#try("hand the reader the page to drag", () => viewer.pdfCursorTools?.switchTool(CURSOR_TOOL_HAND));
			});
			// The page count is only known once the document itself has loaded.
			viewer.eventBus?.on("pagesinit", () => this.#try("check the rulebook's edition", () => this.#checkEdition(viewer)));
		});
		this.#try("bind zoom to the book's wheel", () => this.#bindWheelZoom(this.#frame?.contentWindow));
	}

	/**
	 * @param {string} what Finishes "Couldn't ..." in the console.
	 * @param {() => void} work
	 */
	#try(what, work) {
		try {
			work();
		} catch (error) {
			console.warn(`${SYSTEM_ID} | Couldn't ${what}`, error);
		}
	}

	/** Written into the frame's own document, since this system's stylesheet doesn't reach it. */
	#hideEmptySidebarTabs() {
		const doc = this.#frame?.contentDocument;
		if (!doc?.head || doc.getElementById(EMPTY_TABS_STYLE)) return;
		const style = doc.createElement("style");
		style.id = EMPTY_TABS_STYLE;
		style.textContent = EMPTY_TABS_CSS;
		doc.head.append(style);
	}

	/**
	 * Say when the file isn't the edition this system's page numbers come from.
	 * Another printing reads perfectly; only a jump to a page goes astray, so
	 * it's said out loud only when a page was asked for.
	 * @param {object} viewer
	 */
	#checkEdition(viewer) {
		const pages = Number(viewer?.pagesCount);
		if (this.#editionChecked || !pages) return;
		this.#editionChecked = true;
		if (looksLikeTheRulebook(pages)) return;
		const message = t("rulebook.otherEdition", { pages, expected: EXPECTED_PAGES });
		console.info(`${SYSTEM_ID} | ${message}`);
		if (this.#openedAt) ui.notifications.warn(message);
	}

	/**
	 * Ctrl and the wheel zooms the page. pdf.js's own handler goes deaf for a
	 * second after every ordinary scroll, which is exactly when a reader tries
	 * it, so this listens first, on the capture phase of the frame's window.
	 * @param {Window|null|undefined} frameWindow
	 */
	#bindWheelZoom(frameWindow) {
		if (!frameWindow || frameWindow === this.#zoomWindow) return;
		this.#unbindWheelZoom();
		frameWindow.addEventListener("wheel", this.#onWheelZoom, { capture: true, passive: false });
		this.#zoomWindow = frameWindow;
	}

	#unbindWheelZoom() {
		try {
			this.#zoomWindow?.removeEventListener("wheel", this.#onWheelZoom, { capture: true });
		} catch {
			// The frame is already gone.
		}
		this.#zoomWindow = null;
	}

	/**
	 * One notch of the wheel as one step of zoom, around the cursor. Whether
	 * the wheel moved uses pdf.js's arithmetic, which adds up a trackpad's tiny
	 * deltas; how far to zoom is always one step.
	 * @param {WheelEvent} event
	 */
	#wheelZoom(event) {
		if (!event.ctrlKey && !event.metaKey) return;
		// Otherwise the browser zooms the whole game out from under the reader.
		event.preventDefault();
		event.stopPropagation();

		const viewer = this.#viewer;
		const pages = viewer?.pdfViewer;
		if (!pages || pages.isInPresentationMode) return;

		// Wheel down is a positive deltaY and means zoom out.
		const delta = -event.deltaY;
		const accumulate = (amount) => viewer._accumulateTicks?.(amount, "_wheelUnusedTicks") ?? Math.trunc(amount);
		const ticks = event.deltaMode === DELTA_MODE_PIXEL
			? accumulate(delta / WHEEL_PIXELS_PER_NOTCH)
			: (Math.abs(delta) >= 1 ? Math.sign(delta) : accumulate(delta));
		const direction = Math.sign(ticks);
		if (!direction) return;

		this.#try("zoom the book", () => {
			const before = pages.currentScale;
			const factor = zoomStepTarget(before, direction) / before;
			if (direction > 0) viewer.zoomIn(null, factor);
			else viewer.zoomOut(null, factor);
			// Keep what was under the pointer under it.
			viewer._centerAtPos?.(before, event.clientX, event.clientY);
		});
	}

	/** @returns {number|null} The page being read, or null while the book is still opening. */
	get page() {
		if (!(Number(this.#viewer?.pagesCount) > 0)) return null;
		return readerPage(this.#viewer.page);
	}

	/**
	 * Remember the page to open at, before the first render builds the URL.
	 * @param {number} [page]
	 */
	openAt(page) {
		this.#openedAt = readerPage(page);
	}

	/**
	 * Turn an open book to a page by driving the viewer, never by re-rendering.
	 * A book still loading already opens at the page in its URL.
	 * @param {number} page Numbered as the book is.
	 */
	goToPage(page) {
		const number = readerPage(page);
		if (!number) return;
		this.#openedAt = number;
		if (!this.#viewer) return;
		this.#try("turn the book to that page", () => {
			this.#viewer.page = number;
		});
	}

	/** @returns {string} The viewer's URL for the world's book, at the page being read. */
	get #currentUrl() {
		return rulebookViewerUrl(rulebookPath(), { page: this.page ?? this.#openedAt });
	}

	/** Open the book again from wherever it now lives, after the world is pointed at another file. */
	reload() {
		const src = this.#currentUrl;
		if (!this.#frame || !src) return;
		this.#viewer = null;
		this.#editionChecked = false;
		this.#frame.src = src;
	}

	/**
	 * The same book in a browser tab of its own, for a second monitor. Always a
	 * new tab: sending the game's own tab to the PDF would end the session.
	 * @this {BookReader}
	 */
	static #onOpenTab() {
		const src = this.#currentUrl;
		if (src) window.open(src, "_blank", "noopener");
	}

	static #onSetup() {
		openRulebookSetup();
	}

	/**
	 * Open the page on show on every other screen at the table. Taken from the
	 * viewer rather than the opening URL, since the GM has read on since then.
	 * @this {BookReader}
	 */
	static async #onShowPlayers() {
		const page = this.page;
		if (!page) {
			ui.notifications.warn(t("rulebook.stillOpening"));
			return;
		}
		const shown = await showRulebookPage(page);
		if (shown) ui.notifications.info(t("rulebook.shownPlayers", { page }));
	}
}

/** @type {BookReader|null} */
let reader = null;

/**
 * Open the rulebook, or bring the one already open forward without
 * re-rendering it.
 * @param {object} [options]
 * @param {number} [options.page]  Page to turn to, numbered as the book is.
 * @param {boolean} [options.shown] The GM shared this page, so open it even when players aren't offered the book.
 * @returns {BookReader|null} Null when there's no copy to open, or this user isn't offered it.
 */
export function openRulebook({ page, shown = false } = {}) {
	if (!hasRulebook() || !(shown || canReadRulebook())) return null;

	if (reader?.rendered) {
		reader.goToPage(page);
		reader.bringToFront();
		return reader;
	}

	reader = new BookReader();
	reader.openAt(page);
	reader.render({ force: true });
	return reader;
}

/**
 * The reader to render when the book was open as the page last unloaded. No
 * page is asked for, so pdf.js puts the reader back where they were.
 * @returns {BookReader|null} Null when there's no book, or this user isn't offered it.
 */
export function reopenableReader() {
	if (!hasRulebook() || !canReadRulebook()) return null;
	return openReader() ?? (reader = new BookReader());
}

/** @returns {BookReader|null} The reader on screen, if any. */
export function openReader() {
	return reader?.rendered ? reader : null;
}

/**
 * The hotkey: open the book, or close it when it's already in front. A GM
 * whose world has no copy yet is taken to the setup instead.
 * @returns {boolean} Whether the key was used.
 */
export function toggleRulebook() {
	const open = openReader();
	if (open?.minimized) {
		open.maximize();
		return true;
	}
	if (open && isFrontmost(open)) {
		open.close();
		return true;
	}
	if (openRulebook()) return true;
	if (!hasRulebook() && canKeepRulebook()) {
		openRulebookSetup();
		return true;
	}
	if (!hasRulebook() && canReadRulebook()) ui.notifications.info(t("rulebook.noCopy"));
	return false;
}

/**
 * @param {ApplicationV2} app
 * @returns {boolean} Whether it's the window Foundry last brought to the front.
 */
function isFrontmost(app) {
	return !app.minimized && ui.activeWindow === app;
}
