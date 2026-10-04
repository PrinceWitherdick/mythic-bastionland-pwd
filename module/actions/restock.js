import { SYSTEM_ID } from "../system-id.js";
import { t } from "../chat/cards.js";
import { RESTOCK_CADENCES, restockUpdates } from "../rules/restock.js";
import { CALENDAR_HOOK } from "./calendar.js";
import { COMPANY_MOVED_HOOK } from "./journey.js";

/**
 * When the calendar brings a new Season or a new day, whatever is restocked
 * with it fills back up and is mended: titan beads each new Season, a salve
 * prepared each day. A limited Ability's uses come back the same way, and also
 * each Phase, once a fight is over, and when the Company moves on. The active
 * GM writes it; a player is told of their own. Called once the world is ready.
 */
export function watchRestocks() {
	Hooks.on("deleteCombat", (combat) => {
		if (game.user !== game.users.activeGM) return;
		const actors = new Set(combat.combatants.contents.map((combatant) => combatant.actor).filter(Boolean));
		return Promise.all([...actors].map((actor) => refreshAbilities(actor, ["combat", "attack"])));
	});
	// Heard on the active GM's client alone: the Company has left the place it was in.
	Hooks.on(COMPANY_MOVED_HOOK, (_scene, { entered }) => {
		if (!entered?.length) return;
		return Promise.all(game.actors.contents.filter((actor) => actor.type === "knight").map((actor) => refreshAbilities(actor, ["location"])));
	});
	Hooks.on(CALENDAR_HOOK, (_after, _before, turned) => {
		if (!turned.length) return;
		const writes = [];
		for (const actor of restockableActors(turned)) {
			const updates = restockUpdates(actor.items.contents, turned);
			if (!updates.length) continue;
			// Read before the GM's write lands, which is the same moment on every client.
			const items = updates.map(({ _id }) => actor.items.get(_id)).filter(Boolean);
			if (game.user === game.users.activeGM) writes.push(actor.updateEmbeddedDocuments("Item", updates));
			if (actor.isOwner && (!game.user.isGM || actor.type === "knight")) tellRestocked(actor, items);
		}
		return Promise.all(writes);
	});
	// Uses the GM brought back at a fight's end or on moving on, told on each owner's own client.
	Hooks.on("updateItem", (item, _changes, options) => {
		const actor = item.parent;
		if (!options?.[SYSTEM_ID]?.refreshed || !actor?.isOwner || (game.user.isGM && actor.type !== "knight")) return;
		if (!refreshed.size) queueMicrotask(tellRefreshed);
		refreshed.set(actor, [...(refreshed.get(actor) ?? []), item]);
	});
}

/** @type {Map<Actor, Item[]>} Abilities readied in one write, told together. */
const refreshed = new Map();

function tellRefreshed() {
	for (const [actor, items] of refreshed) tellRestocked(actor, items);
	refreshed.clear();
}

/**
 * Say what came back: possessions restocked, Abilities ready again.
 * @param {Actor} actor
 * @param {Item[]} items
 */
function tellRestocked(actor, items) {
	const names = (abilities) => items.filter((item) => (item.type === "ability") === abilities).map((item) => item.name).join(", ");
	const [stocked, ready] = [names(false), names(true)];
	if (stocked) ui.notifications.info(t("item.restocked", { name: actor.name, items: stocked }));
	if (ready) ui.notifications.info(t("ability.refreshed", { name: actor.name, items: ready }));
}

/**
 * Bring back the uses of an actor's limited Abilities that come round with
 * one of these: the fight being over, their next Attack, the Company moving on.
 * Written by whoever calls it, who must own the actor, and the actor's
 * owners are told as it lands.
 * @param {Actor} actor
 * @param {string[]} cadences From ABILITY_CADENCES.
 * @returns {Promise<object[]>} The item updates made: none if the write failed.
 */
export async function refreshAbilities(actor, cadences) {
	const updates = restockUpdates(actor.items.contents.filter((item) => item.type === "ability"), cadences);
	if (!updates.length) return updates;
	try {
		await actor.updateEmbeddedDocuments("Item", updates, { [SYSTEM_ID]: { refreshed: true } });
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't ready ${actor.name}'s Abilities again`, error);
		return [];
	}
	return updates;
}

/**
 * Every actor whose things can run out: the world's, and each unlinked Token's
 * own copy on every Scene, which uses up its titan beads apart from the world's.
 * A Token's copy is looked through only when a possession's cadence came round,
 * since only Knights, who are the world's, have Abilities.
 * @param {string[]} turned
 * @returns {Actor[]}
 */
function restockableActors(turned) {
	if (!turned.some((cadence) => RESTOCK_CADENCES.includes(cadence))) return game.actors.contents;
	const unlinked = game.scenes.contents.flatMap((scene) => scene.tokens.contents)
		.filter((token) => !token.actorLink && token.actor)
		.map((token) => token.actor);
	return [...game.actors.contents, ...unlinked];
}
