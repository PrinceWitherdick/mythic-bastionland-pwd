/**
 * Knight Tokens show their name to anyone who hovers over them, not only to
 * their owner: the whole table knows who a Knight is. A name setting chosen by
 * hand, or by the world's Default Token Configuration, is left alone.
 */

/** One-time world setup step bringing Knights made before this up to date. */
export const KNIGHT_TOKEN_NAMES_STEP = "knightTokenNames";

/** @returns {number} Foundry's "Hover by Anyone". */
const hoverByAnyone = () => CONST.TOKEN_DISPLAY_MODES.HOVER;

/** New Knights, Squires among them, get their name shown on hover to everyone. */
export function registerKnightTokenNames() {
	Hooks.on("preCreateActor", (actor, data) => {
		if (actor.type !== "knight" || foundry.utils.hasProperty(data, "prototypeToken.displayName")) return;
		actor.updateSource({ "prototypeToken.displayName": hoverByAnyone() });
	});
}

/**
 * Knights already in the world whose Tokens still show their name to no one,
 * Foundry's default, show it on hover to everyone: their prototype Tokens and
 * the Tokens already on a Scene.
 */
export async function showExistingKnightNames() {
	const hidden = CONST.TOKEN_DISPLAY_MODES.NONE;
	const actorUpdates = game.actors
		.filter((actor) => actor.type === "knight" && actor.prototypeToken.displayName === hidden)
		.map((actor) => ({ _id: actor.id, "prototypeToken.displayName": hoverByAnyone() }));
	if (actorUpdates.length) await Actor.implementation.updateDocuments(actorUpdates);

	const sceneUpdates = game.scenes
		.map((scene) => [scene, scene.tokens
			.filter((token) => token.actor?.type === "knight" && token.displayName === hidden)
			.map((token) => ({ _id: token.id, displayName: hoverByAnyone() }))])
		.filter(([, updates]) => updates.length);
	await Promise.all(sceneUpdates.map(([scene, updates]) => scene.updateEmbeddedDocuments("Token", updates)));
}
