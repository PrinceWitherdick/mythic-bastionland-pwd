/** The world setup step that marks the dead of worlds from before Slain was a mark. */
export const SLAIN_STEP = "slainMark";

/**
 * Whether somebody is at VIG 0 without the Slain mark that the system now
 * tells the dead by.
 * @param {Actor|null|undefined} actor
 * @returns {boolean}
 */
const unmarkedAtZero = (actor) => actor?.system?.slain === false && actor.system.virtues?.vig.value === 0;

/**
 * Before Slain was a mark of its own, VIG 0 was what told the dead, so
 * everybody a world has at VIG 0 is marked Slain, as the system took them
 * to be. From now on only Damage marks it (p8), and Virtue Loss to 0 leaves
 * somebody Exhausted (p9). A Knight's steed is left out, since a Gallop to
 * VIG 0 was always called Exhausted and a Slain steed couldn't rest back.
 * The world's Actors first, then each Scene's Tokens with an actor of their own.
 */
export async function markTheSlain() {
	const steeds = new Set(game.actors.map((actor) => actor.system?.steed).filter(Boolean));
	const updates = game.actors
		.filter((actor) => unmarkedAtZero(actor) && !steeds.has(actor.uuid))
		.map((actor) => ({ _id: actor.id, "system.slain": true }));
	if (updates.length) await Actor.implementation.updateDocuments(updates);
	const loose = game.scenes.contents.flatMap((scene) => scene.tokens.filter((token) => !token.actorLink && unmarkedAtZero(token.actor)));
	await Promise.all(loose.map((token) => token.actor.update({ "system.slain": true })));
}
