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
 * @returns {Promise<boolean>} Whether the user said yes.
 */
export async function confirmDialog({ title, icon, message }) {
	const paragraphs = Array.isArray(message) ? message : [message];
	const confirmed = await foundry.applications.api.DialogV2.confirm({
		window: { title, icon },
		classes: ["bastionland-dialog"],
		content: paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join(""),
		rejectClose: false
	});
	return confirmed === true;
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
	return foundry.applications.api.DialogV2.wait({
		window: { title, icon },
		classes: ["bastionland-dialog", ...classes],
		content: paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join(""),
		buttons,
		rejectClose: false
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
 * Ask for a form's worth of answers.
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.icon     Font Awesome classes.
 * @param {string} options.template Name of a file in templates/dialogs, without extension.
 * @param {object} options.context  Data for the template.
 * @param {{label: string, icon?: string}} options.ok
 * @param {object} [options.rest]   Anything else DialogV2.input takes, such as `render`.
 * @returns {Promise<object|null>} The form data, or null if closed.
 */
export async function inputDialog({ title, icon, template, context, ok, ...rest }) {
	const content = await foundry.applications.handlebars.renderTemplate(templatePath(`dialogs/${template}.hbs`), context);
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
 * @param {typeof foundry.applications.api.ApplicationV2} AppClass
 * @returns {() => foundry.applications.api.ApplicationV2} Opens the one window of
 *   that kind, bringing it forward if it's already open.
 */
export function singletonOpener(AppClass) {
	let app = null;
	return () => {
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
