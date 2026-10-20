/**
 * Update several actors at once in as few writes as there can be: every world
 * actor in one, each with its own changes, and each Token's own copy of an
 * actor on its own, as Foundry writes those through the Token. An actor this
 * user may not change goes on its own too, so the one write refused takes no
 * other actor's changes with it. Every actor's hooks still run, each with its
 * own changes; the Ledger reads them apart.
 * @param {[Actor, object][]} changes Each actor with its changes.
 * @param {object} [options] Passed to the writes, such as `causedBy(...)`. Foundry adds to
 *   what it's given, so each write has a copy of its own.
 * @returns {Promise<void>}
 */
export async function updateActors(changes, options = {}) {
	const world = [];
	const writes = [];
	for (const [actor, update] of changes) {
		if (!actor.isToken && !actor.pack && actor.isOwner) world.push({ ...update, _id: actor.id });
		else writes.push(actor.update(update, { ...options }));
	}
	if (world.length) writes.push(Actor.implementation.updateDocuments(world, { ...options }));
	await Promise.all(writes);
}
