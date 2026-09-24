import { isSystemWindow } from "../system-id.js";
import { viewport } from "./ui.js";

/**
 * The system's own dropdowns.
 *
 * A browser draws a <select>'s list itself, and no stylesheet reaches inside
 * it: the rows sit tight against one another, the panel takes a hard border of
 * the browser's choosing, and under a dark theme it comes up dark with a blue
 * bar across the chosen row. None of that belongs on the parchment.
 *
 * So each select keeps everything but its list. It stays where it is, drawn as
 * it always was, holding its own value — every form still reads it, every
 * `change` listener still hears it, and the rules written for `select` in the
 * stylesheets still apply. Only the list is taken over: the browser's is never
 * opened, and the rows are drawn on <body> instead, in the pages' own hand.
 *
 * The panel goes on <body> with `position: fixed`, since the pages and the
 * dialogs scroll and a list placed inside one would be clipped by it.
 */

/** The panel's class. Its parts take it as a prefix. */
const PANEL_CLASS = "bastionland-dropdown";

/** What every chat card the system posts is wrapped in. */
const CARD_CLASS = "bastionland-card";

/** Space kept between the panel and the window's edges, in pixels. */
const MARGIN = 6;

/** Space between the panel and the box it drops from, in pixels. */
const GAP = 2;

/** A panel is never squeezed below this, even where there's no room for it. */
const MIN_HEIGHT = 80;

/** How many rows Page Up and Page Down move by. */
const PAGE = 8;

/** How long a typed letter waits for the next before starting a new search, in milliseconds. */
const TYPE_PAUSE = 800;

/** The keys that open a list from a select that has the focus. */
const OPENS = new Set(["ArrowDown", "ArrowUp", " ", "F4"]);

/**
 * @typedef {object} DropdownRow
 * @property {"group"|"option"} kind
 * @property {string} label
 * @property {number} [index]     Where the option sits in the select.
 * @property {boolean} [disabled]
 * @property {boolean} [chosen]   Whether it's the select's value just now.
 */

/**
 * Whether a select's list is one of ours to draw: a single-choice list, not
 * greyed out, in one of the system's own windows or chat cards. Foundry's own
 * windows and other modules' keep the browser's list, since only the
 * parchment's colours are drawn here.
 * @param {HTMLSelectElement} select
 * @returns {boolean}
 */
export function takesOver(select) {
	if (!select || select.tagName !== "SELECT") return false;
	if (select.disabled || select.multiple || select.size > 1) return false;
	if (select.closest(`.${CARD_CLASS}`)) return true;
	const host = select.closest(".application");
	return Boolean(host) && isSystemWindow(host);
}

/**
 * A select read as rows to draw: its options in order, each optgroup's name
 * standing above the options it holds.
 * @param {HTMLSelectElement} select
 * @returns {DropdownRow[]}
 */
export function rowsOf(select) {
	const rows = [];
	let group = null;
	for (const option of select.options) {
		const parent = option.parentElement;
		const name = parent?.tagName === "OPTGROUP" ? parent.label : null;
		if (name && name !== group) rows.push({ kind: "group", label: name });
		group = name;
		rows.push({
			kind: "option",
			label: (option.label || option.text || "").trim(),
			index: option.index,
			disabled: Boolean(option.disabled || parent?.disabled),
			chosen: option.index === select.selectedIndex
		});
	}
	return rows;
}

/**
 * Where a panel goes: under the box it drops from, over it where there's no
 * room under and more room over, and never past the window's edges. A list
 * too tall for either side is cut down to what fits and scrolls inside.
 * @param {{top: number, bottom: number, left: number, width: number}} anchor The select's box.
 * @param {{width: number, height: number}} panel The size the rows want.
 * @param {{width: number, height: number}} viewport The browser window.
 * @returns {{top: number, left: number, width: number, maxHeight: number, drops: boolean}}
 */
export function placeDropdown(anchor, panel, viewport) {
	// Never narrower than the box it belongs to, and never wider than the window.
	const width = Math.round(Math.min(Math.max(panel.width, anchor.width), viewport.width - 2 * MARGIN));
	const left = Math.round(Math.max(MARGIN, Math.min(anchor.left, viewport.width - MARGIN - width)));
	const under = viewport.height - anchor.bottom - GAP - MARGIN;
	const over = anchor.top - GAP - MARGIN;
	const drops = panel.height <= under || under >= over;
	const maxHeight = Math.round(Math.max(MIN_HEIGHT, Math.min(panel.height, drops ? under : over)));
	const top = drops ? anchor.bottom + GAP : anchor.top - GAP - maxHeight;
	return {
		top: Math.round(Math.max(MARGIN, Math.min(top, viewport.height - MARGIN - maxHeight))),
		left,
		width,
		maxHeight,
		drops
	};
}

/**
 * The row a move lands on, passing over the group names and anything greyed
 * out. A move with nowhere to go stays where it is.
 * @param {DropdownRow[]} rows
 * @param {number} from Where the move starts, or -1 for before the first row.
 * @param {number} by   1 down the list, -1 up it.
 * @returns {number}
 */
export function step(rows, from, by) {
	const start = from < 0 ? (by > 0 ? -1 : rows.length) : from;
	for (let at = start + by; at >= 0 && at < rows.length; at += by) {
		if (rows[at].kind === "option" && !rows[at].disabled) return at;
	}
	return from;
}

/**
 * The row a Page Up or Page Down lands on: as far as a page goes, or the end
 * of the list.
 * @param {DropdownRow[]} rows
 * @param {number} from
 * @param {number} by
 * @returns {number}
 */
export function pageStep(rows, from, by) {
	let at = from;
	for (let moves = 0; moves < PAGE; moves += 1) {
		const next = step(rows, at, by);
		if (next === at) break;
		at = next;
	}
	return at;
}

/**
 * The row typing picks out. A single letter walks the rows starting with it,
 * one press to the next; letters typed together look for a row starting with
 * the lot, the row already under the cursor included, so a word narrows down
 * rather than jumping on.
 * @param {DropdownRow[]} rows
 * @param {string} typed  What's been typed since the last pause.
 * @param {number} from   The row the cursor is on, or -1.
 * @returns {number} The row, or -1 for nothing starting with it.
 */
export function typeahead(rows, typed, from) {
	const want = typed.toLowerCase();
	const total = rows.length;
	if (!total || !want) return -1;
	const walks = want.length === 1;
	for (let move = 1; move <= total; move += 1) {
		const at = ((from + (walks ? move : move - 1)) % total + total) % total;
		const row = rows[at];
		if (row.kind !== "option" || row.disabled) continue;
		if (row.label.toLowerCase().startsWith(want)) return at;
	}
	return -1;
}

/**
 * @typedef {object} OpenDropdown
 * @property {HTMLSelectElement} select
 * @property {HTMLElement} panel
 * @property {DropdownRow[]} rows
 * @property {number} active  The row the cursor is on, or -1.
 * @property {Map<number, HTMLElement>} options  Each drawn option by its row.
 * @property {(() => void)[]} listeners  Each takes one listener off again.
 */

/** @type {OpenDropdown|null} The list showing. There is only ever one. */
let open = null;

/** Panels are numbered so each row has an id of its own for aria-activedescendant. */
let counted = 0;

/** What's been typed to jump through the rows, and when the last letter came. */
let typed = "";
let typedAt = 0;


/**
 * A z-index above the window the list belongs to. Foundry sets each window's
 * inline as it's brought to the front.
 * @param {HTMLElement} select
 * @returns {string}
 */
function above(select) {
	const host = Number.parseInt(select.closest(".application")?.style.zIndex, 10) || 0;
	return String(Math.max(10000, host + 1));
}

/** Take the list down, if one is showing. */
export function closeDropdown() {
	if (!open) return;
	const { select, panel, listeners } = open;
	open = null;
	typed = "";
	for (const off of listeners) off();
	panel.remove();
	for (const name of ["aria-expanded", "aria-controls", "aria-activedescendant"]) select.removeAttribute(name);
}

/**
 * Put the cursor on a row: mark it, scroll it into sight, and name it as the
 * select's active descendant so a screen reader reads it.
 * @param {number} at
 */
function setActive(at) {
	if (!open) return;
	open.options.get(open.active)?.classList.remove("is-active");
	open.active = at;
	const element = open.options.get(at);
	if (!element) {
		open.select.removeAttribute("aria-activedescendant");
		return;
	}
	element.classList.add("is-active");
	open.select.setAttribute("aria-activedescendant", element.id);
	element.scrollIntoView({ block: "nearest" });
}

/**
 * Take a row as the select's value and take the list down. The select is told
 * as the browser would tell it, so everything already listening hears.
 * @param {number} at
 */
function commit(at) {
	const row = open?.rows[at];
	const select = open?.select;
	closeDropdown();
	if (!row || !select || row.kind !== "option" || row.disabled) return;
	if (select.selectedIndex === row.index) return;
	select.selectedIndex = row.index;
	select.dispatchEvent(new Event("input", { bubbles: true }));
	select.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Draw a select's list. Anything already showing comes down first.
 * @param {HTMLSelectElement} select
 */
function openDropdown(select) {
	closeDropdown();
	const rows = rowsOf(select);
	if (!rows.some((row) => row.kind === "option")) return;

	counted += 1;
	const panel = document.createElement("div");
	panel.className = PANEL_CLASS;
	// Hidden until measured and placed, so it never flashes up in a corner.
	panel.style.visibility = "hidden";
	panel.style.zIndex = above(select);

	const list = document.createElement("div");
	list.className = `${PANEL_CLASS}__list`;
	list.id = `${PANEL_CLASS}-${counted}`;
	list.setAttribute("role", "listbox");
	const named = select.getAttribute("aria-label");
	if (named) list.setAttribute("aria-label", named);
	panel.append(list);

	/** @type {Map<number, HTMLElement>} Each option as it's drawn, for the cursor to move between. */
	const options = new Map();
	rows.forEach((row, at) => {
		const element = document.createElement("div");
		if (row.kind === "group") {
			element.className = `${PANEL_CLASS}__group`;
			element.textContent = row.label;
			list.append(element);
			return;
		}
		element.className = `${PANEL_CLASS}__option`;
		element.id = `${list.id}-${at}`;
		element.dataset.row = String(at);
		element.setAttribute("role", "option");
		element.setAttribute("aria-selected", String(Boolean(row.chosen)));
		if (row.disabled) element.setAttribute("aria-disabled", "true");
		element.textContent = row.label;
		options.set(at, element);
		list.append(element);
	});

	document.body.append(panel);

	// Measured through its box on screen, which is in the same pixels as the
	// select's and the window's, whatever Text Size has zoomed the rows by.
	const drawn = panel.getBoundingClientRect();
	const place = placeDropdown(select.getBoundingClientRect(), { width: drawn.width, height: drawn.height }, viewport());
	panel.classList.toggle("is-above", !place.drops);
	Object.assign(panel.style, {
		top: `${place.top}px`,
		left: `${place.left}px`,
		width: `${place.width}px`,
		maxHeight: `${place.maxHeight}px`,
		visibility: ""
	});

	select.setAttribute("aria-expanded", "true");
	select.setAttribute("aria-controls", list.id);

	/** @type {(() => void)[]} */
	const listeners = [];
	const on = (target, type, handler, capture) => {
		target.addEventListener(type, handler, capture);
		listeners.push(() => target.removeEventListener(type, handler, capture));
	};
	open = { select, panel, rows, options, active: -1, listeners };

	on(panel, "click", (event) => {
		const row = event.target.closest?.(`.${PANEL_CLASS}__option`);
		if (row) commit(Number(row.dataset.row));
	});
	// The cursor follows the pointer, as it does in the browser's own list.
	on(panel, "pointerover", (event) => {
		const row = event.target.closest?.(`.${PANEL_CLASS}__option`);
		if (row && !row.hasAttribute("aria-disabled")) setActive(Number(row.dataset.row));
	});
	// A list placed against a box that's moving under it is no longer pointing
	// at anything, so it comes down; a wheel over the list itself scrolls it.
	on(document, "scroll", (event) => {
		if (!panel.contains(event.target)) closeDropdown();
	}, true);
	on(window, "resize", closeDropdown);
	on(window, "blur", closeDropdown);

	setActive(rows.findIndex((row) => row.chosen));
}

/**
 * The press that opens a list, picks from one, or takes one down. The
 * browser's own list is never allowed to open: preventing the press stops it,
 * and the focus is then given by hand, since a prevented press doesn't give it.
 * @param {MouseEvent} event
 */
function onMouseDown(event) {
	if (open?.panel.contains(event.target)) {
		// The list is nothing to put a caret in: the select keeps the focus.
		event.preventDefault();
		return;
	}
	const select = event.target?.closest?.("select");
	if (!select || !takesOver(select)) {
		closeDropdown();
		return;
	}
	if (event.button !== 0) return;
	event.preventDefault();
	const again = open?.select === select;
	closeDropdown();
	select.focus();
	if (!again) openDropdown(select);
}

/**
 * The keys a list showing answers to.
 * @param {KeyboardEvent} event
 */
function onOpenKeyDown(event) {
	const { rows, active } = open;
	const stop = () => {
		event.preventDefault();
		event.stopPropagation();
	};
	switch (event.key) {
		case "Escape":
			// Caught here, or Foundry would take it as closing the window behind.
			stop();
			closeDropdown();
			return;
		case "Enter":
			stop();
			commit(active);
			return;
		case "Tab":
			// Not stopped: the press still carries the focus on, as it would from any control.
			commit(active);
			return;
		case "ArrowDown":
			stop();
			setActive(step(rows, active, 1));
			return;
		case "ArrowUp":
			stop();
			setActive(step(rows, active, -1));
			return;
		case "Home":
			stop();
			setActive(step(rows, -1, 1));
			return;
		case "End":
			stop();
			setActive(step(rows, rows.length, -1));
			return;
		case "PageDown":
			stop();
			setActive(pageStep(rows, active, 1));
			return;
		case "PageUp":
			stop();
			setActive(pageStep(rows, active, -1));
			return;
		default:
			break;
	}
	if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
	stop();
	// A space picks the row the cursor is on, unless it's part of a name being typed.
	if (event.key === " " && !typed) {
		commit(active);
		return;
	}
	const now = Date.now();
	typed = now - typedAt > TYPE_PAUSE ? event.key : typed + event.key;
	typedAt = now;
	const at = typeahead(rows, typed, active);
	if (at >= 0) setActive(at);
}

/**
 * @param {KeyboardEvent} event
 */
function onKeyDown(event) {
	if (open) {
		onOpenKeyDown(event);
		return;
	}
	const select = event.target;
	if (!takesOver(select)) return;
	// An arrow opens the list rather than changing the value where it stands,
	// so nothing is chosen without being seen. Enter is left alone: in a
	// dialog it still answers the dialog.
	if (!OPENS.has(event.key) && !(event.altKey && event.key.startsWith("Arrow"))) return;
	event.preventDefault();
	openDropdown(select);
}

/**
 * Give every select in the system's windows and chat cards a list of the
 * system's own. Listened for on the document rather than wired up window by
 * window, so a select drawn tomorrow is covered without anyone remembering to,
 * and so a window drawn again doesn't leave a dead list behind. Called during
 * init.
 */
export function registerDropdowns() {
	document.addEventListener("mousedown", onMouseDown, true);
	document.addEventListener("keydown", onKeyDown, true);
	// A window drawn again replaces the select the list was pointing at.
	Hooks.on("renderApplicationV2", closeDropdown);
	Hooks.on("closeApplicationV2", closeDropdown);
}
