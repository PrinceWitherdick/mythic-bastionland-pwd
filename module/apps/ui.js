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
 * @param {string} options.message HTML, already escaped.
 * @returns {Promise<boolean>} Whether the user said yes.
 */
export async function confirmDialog({ title, icon, message }) {
	const confirmed = await foundry.applications.api.DialogV2.confirm({
		window: { title, icon },
		classes: ["bastionland-dialog"],
		content: `<p>${message}</p>`,
		rejectClose: false
	});
	return confirmed === true;
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
