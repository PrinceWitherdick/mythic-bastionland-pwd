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
