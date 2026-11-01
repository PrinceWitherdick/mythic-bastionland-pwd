import { inputDialog } from "./ui.js";

/**
 * Ask which one of a list, as radio rows with one button (the "pick-one" dialog).
 * @template {{name: string, detail?: string}} T
 * @param {T[]} items Each shown by its name, with its detail under it.
 * @param {object} ask
 * @param {string} ask.title
 * @param {string} ask.message The question over the list.
 * @param {string} [ask.icon] Font Awesome classes, for the window and its button.
 * @param {string} [ask.ok] The button's label: the window's title unless given.
 * @param {boolean} [ask.full] A list that never grows long stands at full length rather than scrolling.
 * @returns {Promise<T|null>} Null when the window was closed: none, rather than the first.
 */
export async function chooseOne(items, { title, message, icon = "fa-solid fa-dice-d20", ok = title, full = false }) {
	const data = await inputDialog({
		title,
		icon,
		template: "pick-one",
		context: { legend: message, full, choices: items.map(({ name, detail }, index) => ({ id: String(index), name, detail })) },
		ok: { label: ok, icon }
	});
	return data ? items[Number(data.choice)] ?? null : null;
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
