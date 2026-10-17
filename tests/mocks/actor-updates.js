// Stands in for module/actions/actor-updates.js: each actor written on its own,
// so a test reads what each was given.
//   vi.mock("../../module/actions/actor-updates.js", () => import("../mocks/actor-updates.js"));

/**
 * @param {[object, object][]} changes
 * @param {object} [options]
 */
export async function updateActors(changes, options) {
	await Promise.all(changes.map(([actor, update]) => actor.update(update, options)));
}
