import { searchable } from "../rules/text.js";
import { templatePath } from "../system-id.js";

/**
 * Add a button to a directory's header, beside Foundry's own. Callers decide
 * who gets one.
 * @param {HTMLElement} element The directory.
 * @param {object} options
 * @param {string} options.className Marks the button, so a re-render doesn't add a second.
 * @param {string} options.icon      Font Awesome classes.
 * @param {string} options.label
 * @param {() => void} options.onClick
 */
export function addDirectoryButton(element, { className, icon, label, onClick }) {
	const actions = element.querySelector(".header-actions");
	if (!actions || actions.querySelector(`.${className}`)) return;

	const button = document.createElement("button");
	button.type = "button";
	button.className = className;
	const glyph = document.createElement("i");
	glyph.className = icon;
	glyph.inert = true;
	const text = document.createElement("span");
	text.textContent = label;
	button.append(glyph, text);
	button.addEventListener("click", onClick);
	actions.append(button);
}

/**
 * Ask a yes-or-no question.
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.icon    Font Awesome classes.
 * @param {string|string[]} options.message HTML, already escaped; an array becomes a paragraph each.
 * @param {{label: string, icon?: string}} [options.yes] A button in place of Yes, such as Accept.
 * @param {{label: string, icon?: string}} [options.no] A button in place of No.
 * @returns {Promise<boolean>} Whether the user said yes.
 */
export async function confirmDialog({ title, icon, message, yes, no }) {
	const paragraphs = Array.isArray(message) ? message : [message];
	const confirmed = await foundry.applications.api.DialogV2.confirm({
		window: { title, icon },
		classes: ["bastionland-dialog"],
		content: paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join(""),
		...(yes ? { yes: { icon: "fa-solid fa-check", ...yes } } : {}),
		...(no ? { no: { icon: "fa-solid fa-xmark", ...no } } : {}),
		rejectClose: false
	});
	return confirmed === true;
}

/**
 * DialogV2.wait in the system's parchment, at the width its dialogs share:
 * without one, wait() sizes the window to its longest line unwrapped.
 * @param {object} options As DialogV2.wait takes them.
 * @param {string[]} [options.classes] More classes for the window.
 * @returns {Promise<unknown>} What the button pressed gave, or null if closed.
 */
export function waitDialog({ classes = [], ...options }) {
	return foundry.applications.api.DialogV2.wait({ position: { width: 400 }, rejectClose: false, ...options, classes: ["bastionland-dialog", ...classes] });
}

/**
 * Ask which of several things to do.
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.icon      Font Awesome classes.
 * @param {string|string[]} options.message HTML, already escaped; an array becomes a paragraph each.
 * @param {object[]} options.buttons As DialogV2 takes them.
 * @param {string[]} [options.classes] More classes for the window.
 * @returns {Promise<string|null>} The button's action, or null if closed.
 */
export async function chooseDialog({ title, icon, message, buttons, classes = [] }) {
	const paragraphs = Array.isArray(message) ? message : [message];
	return waitDialog({
		window: { title, icon },
		classes,
		content: paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join(""),
		buttons
	});
}

/** @returns {{width: number, height: number}} The window a floating panel has to be placed inside. */
export const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

/**
 * How many columns a grid of pictured cards wants for its pictures to be as
 * large as the space allows, with every card in sight. A picture is cropped to
 * fill its frame, so the frame may be drawn anywhere between two shapes: that
 * lets the cards take the space's height as well as its width, where a single
 * shape would leave one of them over.
 * @param {object} space
 * @param {number} space.count  How many cards.
 * @param {number} space.width  The grid's width.
 * @param {number} space.height The grid's height.
 * @param {number} space.gap    Between cards, across and down.
 * @param {number} space.widest The widest a picture may be drawn, as its width over its height.
 * @param {number} space.tallest The tallest, likewise.
 * @param {number} space.inset  How much narrower a picture is than its card.
 * @param {number} space.extra  How much taller a card is than its picture: its name and the like.
 * @param {number} space.min    The narrowest a card may be.
 * @param {number} space.max    The widest a card may be.
 * @returns {{columns: number, size: number, art: number}|null} The columns, a card's width and its picture's height, in whole pixels; or null when even the narrowest cards won't all fit.
 */
export function fitCards({ count, width, height, gap, widest, tallest, inset, extra, min, max }) {
	let best = null;
	for (let columns = 1; columns <= count; columns++) {
		const across = Math.floor((width - (columns - 1) * gap) / columns);
		// More columns only ever make narrower cards.
		if (across < min) break;
		const rows = Math.ceil(count / columns);
		const room = Math.floor((height - (rows - 1) * gap) / rows - extra);
		if (room <= 0) continue;
		// As wide as the column allows, unless even the widest shape then stands taller than the row.
		const size = Math.min(across, Math.floor(max), Math.floor(room * widest + inset));
		if (size < min) continue;
		const art = Math.min(room, Math.floor((size - inset) / tallest));
		const area = (size - inset) * art;
		if (!best || area > best.area) best = { columns, size, art, area };
	}
	return best && { columns: best.columns, size: best.size, art: best.art };
}

/**
 * Mark a button as the chosen one of a row, for a reader as well as a looker.
 * @param {HTMLElement} button
 * @param {boolean} active
 */
export function markActive(button, active) {
	button.classList.toggle("is-active", active);
	button.setAttribute("aria-pressed", String(active));
}

/**
 * The Undo and Redo gestures, with Cmd in place of Ctrl on a Mac.
 * @param {KeyboardEvent} event
 * @returns {"undo"|"redo"|null} Null when it's some other key.
 */
export function undoRedoKey(event) {
	if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
	const key = event.key.toLowerCase();
	if (key === "y" || (key === "z" && event.shiftKey)) return "redo";
	return key === "z" ? "undo" : null;
}

/**
 * A dialog's content that DialogV2 takes as it is. Content given as a string
 * is run through Foundry's HTML cleaning, which drops an `svg` and everything
 * in it; content given as a bare `div` is not.
 * @param {string} html Rendered from one of the system's own templates.
 * @returns {HTMLDivElement}
 */
export function uncleanedContent(html) {
	const content = document.createElement("div");
	content.innerHTML = html;
	return content;
}

/**
 * Ask for a form's worth of answers.
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.icon     Font Awesome classes.
 * @param {string} options.template Name of a file in templates/dialogs, without extension.
 * @param {object} options.context  Data for the template.
 * @param {{label: string, icon?: string}} options.ok
 * @param {boolean} [options.drawings] Whether the template draws with SVG, which must skip Foundry's HTML cleaning.
 * @param {object} [options.rest]   Anything else DialogV2.input takes, such as `render`.
 * @returns {Promise<object|null>} The form data, or null if closed.
 */
export async function inputDialog({ title, icon, template, context, ok, drawings = false, ...rest }) {
	const html = await foundry.applications.handlebars.renderTemplate(templatePath(`dialogs/${template}.hbs`), context);
	const content = drawings ? uncleanedContent(html) : html;
	return foundry.applications.api.DialogV2.input({
		window: { title, icon },
		classes: ["bastionland-dialog"],
		content,
		ok: { icon: "fa-solid fa-check", ...ok },
		rejectClose: false,
		...rest
	});
}

/**
 * A hotkey's second press: a window minimised is brought back, and one in
 * front is closed.
 * @param {foundry.applications.api.ApplicationV2|null} app
 * @returns {boolean} Whether it did either, so the key needn't open the window.
 */
export function toggleShown(app) {
	if (!app?.rendered) return false;
	if (app.minimized) {
		app.maximize();
		return true;
	}
	if (ui.activeWindow !== app) return false;
	app.close();
	return true;
}

/**
 * @param {typeof foundry.applications.api.ApplicationV2} AppClass
 * @returns {() => foundry.applications.api.ApplicationV2} Opens the one window of
 *   that kind, bringing it forward if it's already open.
 */
export function singletonOpener(AppClass) {
	let app = null;
	return () => {
		// Foundry's settings list opens a window of its own under the same id, which takes this one's
		// place on the page: that one is brought forward, and once it's shut a fresh one is made.
		const open = AppClass.DEFAULT_OPTIONS?.id ? foundry.applications.instances?.get(AppClass.DEFAULT_OPTIONS.id) : null;
		if (open instanceof AppClass) app = open;
		else if (app?.rendered && !app.element?.isConnected) app = null;
		app ??= new AppClass();
		app.render({ force: true });
		return app;
	};
}

/**
 * Open the computer's own file dialog for a window's file input. Cleared
 * first, so choosing the same files again still counts as a choice.
 * @param {HTMLElement} element The window.
 */
export function chooseLocalFiles(element) {
	const input = element.querySelector("input[type=file]");
	if (!input) return;
	input.value = "";
	input.click();
}

/** Windows waiting for whoever is using them to leave the field they're typing in. */
const waiting = new WeakSet();

/** A field a redraw would take the typing out of. */
const TYPING = 'input:not([type="checkbox"]):not([type="radio"]), textarea';

/**
 * Draw a window again once whoever is using it has finished typing. Drawing
 * puts every field back to its saved value, so a redraw mid-sentence would take
 * the sentence away.
 * @param {foundry.applications.api.ApplicationV2} app
 */
export function renderWhenIdle(app) {
	if (!app?.rendered) return;
	const field = document.activeElement;
	if (!field || !app.element.contains(field) || !field.matches(TYPING)) {
		app.render();
		return;
	}
	if (waiting.has(app)) return;
	waiting.add(app);
	field.addEventListener("blur", () => {
		waiting.delete(app);
		if (app.rendered) app.render();
	}, { once: true });
}

/**
 * Show only the rows a search finds, and only the sections that still hold
 * one. Each row carries its words, already made searchable, in `data-search`;
 * each section that should go when empty is marked `data-search-section`.
 * With no search, everything is shown.
 * @param {HTMLElement|null|undefined} page
 * @param {string} term As typed.
 * @param {string} [noMatch] The selector of a line saying nothing was found, shown only then.
 * @returns {number} How many rows are shown.
 */
export function filterBySearch(page, term, noMatch = null) {
	if (!page) return 0;
	const words = searchable(String(term ?? "").trim());
	let found = 0;
	for (const row of page.querySelectorAll("[data-search]")) {
		row.hidden = Boolean(words) && !row.dataset.search.includes(words);
		if (!row.hidden) found++;
	}
	for (const section of page.querySelectorAll("[data-search-section]")) {
		section.hidden = Boolean(words) && !section.querySelector("[data-search]:not([hidden])");
	}
	const none = noMatch ? page.querySelector(noMatch) : null;
	if (none) none.hidden = !words || found > 0;
	return found;
}

/**
 * Hang labelled buttons in a window's title bar, left of Foundry's own
 * controls, in place of any hung before under the same class. Their
 * data-action is the window's to handle.
 * @param {HTMLElement|null|undefined} element The window.
 * @param {string} className Marks these buttons apart from Foundry's and other hangers'.
 * @param {{action: string, icon: string, label: string, tooltip?: string, muted?: boolean}[]} buttons None takes them all down.
 *   A muted one is greyed, for what's offered but not yet to hand.
 */
export function hangHeaderButtons(element, className, buttons) {
	const header = element?.querySelector(".window-header");
	if (!header) return;
	header.querySelectorAll(`.${className}`).forEach((button) => button.remove());
	const doc = header.ownerDocument;
	const controls = header.querySelector("[data-action=toggleControls], [data-action=close]");
	for (const { action, icon, label, tooltip, muted } of buttons) {
		const button = doc.createElement("button");
		button.type = "button";
		button.classList.add("header-control", "bastionland-header-button", className);
		button.classList.toggle("bastionland-header-button--muted", Boolean(muted));
		button.dataset.action = action;
		if (tooltip) button.dataset.tooltip = tooltip;
		const glyph = doc.createElement("i");
		glyph.className = icon;
		glyph.inert = true;
		const text = doc.createElement("span");
		text.textContent = label;
		button.append(glyph, text);
		if (controls) controls.before(button);
		else header.append(button);
	}
}
