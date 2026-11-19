/**
 * A Knight is one person, so each of their Tokens is that person: Damage, a
 * Scar or a rest on the Token is on the sheet their player reads, and the other
 * way round. Foundry's default is the opposite, a Token that takes a copy of
 * its Actor and goes its own way, which suits a band of sentries and would
 * leave a Knight Slain on the map and unharmed on their sheet. NPC Knights are
 * people of their own too, so they are linked the same.
 */

import { t } from "../chat/cards.js";
import { isKnight } from "../rules/knight-types.js";

/** One-time world setup step linking the Knights made before this. */
export const KNIGHT_TOKEN_LINK_STEP = "knightTokenLink";

/**
 * New Knights of either kind, Squires among them, get Tokens linked to their
 * sheet. A duplicate, a compendium entry or an imported file always says
 * actorLink, false by Foundry's default, so what the create data says is no
 * sign of a choice: every new Knight is linked, and one the Referee wants
 * unlinked is unlinked afterwards.
 */
export function registerKnightTokenLink() {
	Hooks.on("preCreateActor", (actor, data) => {
		if (!isKnight(actor) || foundry.utils.getProperty(data, "prototypeToken.actorLink") === true) return;
		actor.updateSource({ "prototypeToken.actorLink": true });
	});
}

/**
 * Whether an unlinked Token's copy of its Actor has gone its own way: marks,
 * scores or possessions changed on the Token alone.
 * @param {TokenDocument} token
 * @returns {boolean}
 */
function wentItsOwnWay(token) {
	const delta = token.delta?.toObject?.() ?? token.delta ?? {};
	return Object.keys(delta.system ?? {}).length > 0 || (delta.items?.length ?? 0) > 0;
}

/**
 * Knights already in the world: their prototype Tokens and the Tokens already
 * on a Scene are linked to their sheet. The sheet is the one that's kept. Where
 * a Token's own copy had come to differ, the Referee is told whose, since what
 * was marked on that Token alone no longer shows.
 * @returns {Promise<string[]>} The names of the Knights whose Token differed.
 */
export async function linkExistingKnightTokens() {
	const actorUpdates = game.actors
		.filter((actor) => isKnight(actor) && !actor.prototypeToken.actorLink)
		.map((actor) => ({ _id: actor.id, "prototypeToken.actorLink": true }));
	if (actorUpdates.length) await Actor.implementation.updateDocuments(actorUpdates);

	const differed = new Set();
	const sceneUpdates = game.scenes
		.map((scene) => [scene, scene.tokens.filter((token) => !token.actorLink && isKnight(game.actors.get(token.actorId)))])
		.filter(([, tokens]) => tokens.length);
	for (const [scene, tokens] of sceneUpdates) {
		for (const token of tokens.filter(wentItsOwnWay)) differed.add(token.name);
		await scene.updateEmbeddedDocuments("Token", tokens.map((token) => ({ _id: token.id, actorLink: true })));
	}
	const names = [...differed];
	if (names.length) ui.notifications.warn(t("knightTokenLink.differed", { names: names.join(", ") }), { permanent: true });
	return names;
}
