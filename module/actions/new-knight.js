/**
 * Making a Knight who hasn't been rolled or chosen yet, and opening the chooser
 * on them. Wanted in two places the book names: a Knight generated ahead of the
 * game for a player to pick up (p6), and the one a player makes when theirs
 * falls (p8). Kept apart from the chooser itself so that neither the GM Toolkit
 * nor taking Damage drags the whole chooser in behind it.
 */

/**
 * @param {object} details
 * @param {string} details.name        What to call them until they're rolled.
 * @param {object} [details.ownership] Who holds them, where they're handed on from somebody.
 * @returns {Promise<Actor|null>} Null where the actor couldn't be made.
 */
export async function makeFreshKnight({ name, ownership = null }) {
	// The folder is left to the Knight-filing hooks, which give every Knight one
	// of their own inside the Company.
	const created = await Actor.implementation.create({
		name,
		type: "knight",
		...(ownership ? { ownership } : {})
	});
	if (!created) return null;
	const { openKnightChooser } = await import("../apps/KnightChooser.js");
	openKnightChooser(created, { fresh: true });
	return created;
}
