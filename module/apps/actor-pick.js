import { inputDialog } from "./ui.js";

/**
 * Ask which of several actors acts, from a list with one button, or take the only one without asking.
 * @param {Actor[]} actors
 * @param {object} ask
 * @param {string} ask.title
 * @param {string} ask.message The question over the list.
 * @param {string} [ask.icon] Font Awesome classes, for the window and its button.
 * @param {string} [ask.ok] The button's label: the window's title unless given.
 * @returns {Promise<Actor|null>} Null when the window was closed: nobody, rather than the first of them.
 */
export async function chooseActor(actors, { title, message, icon = "fa-solid fa-dice-d20", ok = title }) {
	if (actors.length === 1) return actors[0];
	const data = await inputDialog({
		title,
		icon,
		template: "actor-pick",
		context: { legend: message, actors: actors.map((actor, index) => ({ id: String(index), name: actor.name })) },
		ok: { label: ok, icon }
	});
	return data ? actors[Number(data.actor)] ?? null : null;
}
