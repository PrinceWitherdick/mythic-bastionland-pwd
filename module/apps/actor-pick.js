import { inputDialog } from "./ui.js";

/**
 * Ask which one of a list, as radio rows with one button (the "pick-one" dialog).
 * @template {{name: string, detail?: string}} T
 * @param {T[]} items Each shown by its name, with its detail under it.
 * @param {object} ask
 * @param {string} ask.title
 * @param {string} ask.message The question over the list.
 * @param {string} [ask.intro] A line above the list saying what it's for.
 * @param {string} [ask.icon] Font Awesome classes, for the window and its button.
 * @param {string} [ask.ok] The button's label: the window's title unless given.
 * @param {boolean} [ask.full] A list that never grows long stands at full length rather than scrolling.
 * @param {boolean} [ask.unchosen] Start with none chosen, so one must be picked, rather than the first.
 * @returns {Promise<T|null>} Null when the window was closed: none, rather than the first.
 */
export async function chooseOne(items, { title, message, intro = "", icon = "fa-solid fa-dice-d20", ok = title, full = false, unchosen = false }) {
	const data = await inputDialog({
		title,
		icon,
		template: "pick-one",
		context: { intro, legend: message, full, unchosen, choices: items.map(({ name, detail }, index) => ({ id: String(index), name, detail })) },
		ok: { label: ok, icon },
		render: unchosen ? (_event, dialog) => waitForChoice(dialog.element) : undefined
	});
	// Sent with nothing picked, as a list with none chosen to start can be, is none, not the first.
	const picked = data?.choice;
	return picked === undefined || picked === null || picked === "" ? null : items[Number(picked)] ?? null;
}

/**
 * Keep a pick list's button greyed out until one of its choices is picked.
 * @param {HTMLElement|null|undefined} element The dialog.
 */
export function waitForChoice(element) {
	const button = element?.querySelector("[data-action='ok']");
	const form = element?.querySelector("form") ?? element;
	if (!button || !form) return;
	const update = () => {
		button.disabled = !form.querySelector("input[type='radio']:checked");
	};
	update();
	form.addEventListener("change", update);
}

/**
 * Ask which of several actors acts, or take the only one without asking.
 * @param {Actor[]} actors
 * @param {Parameters<typeof chooseOne>[1]} ask
 * @returns {Promise<Actor|null>}
 */
export async function chooseActor(actors, ask) {
	return actors.length === 1 ? actors[0] : chooseOne(actors, ask);
}
