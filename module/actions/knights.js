/**
 * The world's Knights, Squires among them, as the Actors directory holds them:
 * not a Token's own copy.
 * @param {(knight: Actor) => boolean} [keep] Only those this says yes to.
 * @returns {Actor[]}
 */
export const worldKnights = (keep = () => true) => (game.actors?.contents ?? Array.from(game.actors ?? []))
	.filter((actor) => actor.type === "knight" && keep(actor));
