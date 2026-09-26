import { t } from "../chat/cards.js";
import { restockUpdates } from "../rules/restock.js";
import { CALENDAR_HOOK } from "./calendar.js";

/**
 * When the calendar brings a new Season or a new day, whatever is restocked
 * with it fills back up and is mended: titan beads each new Season, a salve
 * prepared each day. The active GM writes it; a player is told of their own.
 * Called once the world is ready.
 */
export function watchRestocks() {
	Hooks.on(CALENDAR_HOOK, (after, before, turned) => {
		if (!turned.length) return;
		const writes = [];
		for (const actor of restockableActors()) {
			const updates = restockUpdates(actor.items.contents, turned);
			if (!updates.length) continue;
			// Read before the GM's write lands, which is the same moment on every client.
			const names = updates.map(({ _id }) => actor.items.get(_id)?.name).filter(Boolean);
			if (game.user === game.users.activeGM) writes.push(actor.updateEmbeddedDocuments("Item", updates));
			if (actor.isOwner && (!game.user.isGM || actor.type === "knight")) {
				ui.notifications.info(t("item.restocked", { name: actor.name, items: names.join(", ") }));
			}
		}
		return Promise.all(writes);
	});
}

/**
 * Every actor whose things can run out: the world's, and each unlinked Token's
 * own copy on every Scene, which uses up its titan beads apart from the world's.
 * @returns {Actor[]}
 */
function restockableActors() {
	const unlinked = game.scenes.contents.flatMap((scene) => scene.tokens.contents)
		.filter((token) => !token.actorLink && token.actor)
		.map((token) => token.actor);
	return [...game.actors.contents, ...unlinked];
}
