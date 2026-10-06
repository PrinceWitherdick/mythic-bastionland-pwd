/**
 * Making a Knight who hasn't been rolled or chosen yet, and opening the chooser
 * on them. Wanted in two places the book names: a Knight generated ahead of the
 * game for a player to pick up (p6), and the one a player makes when theirs
 * falls (p8). Kept apart from the chooser itself so that neither the GM Toolkit
 * nor taking Damage drags the whole chooser in behind it.
 */

import { OFFERED_FLAG, UNCHOSEN_FLAG, isBlankKnightData, ownershipGivenTo, playerHolding } from "../rules/unchosen-knight.js";
import { SCORES, clampVirtue } from "../rules/virtues.js";
import { SYSTEM_ID } from "../system-id.js";
import { worldKnights } from "./knights.js";
import { makeCompanions, markCompanions } from "./property.js";

/**
 * Roll each Virtue in order, then GD, with a Start's dice.
 * @param {{virtues: string, guard: string}} start
 * @returns {Promise<{scores: Record<string, number>, rolls: Roll[]}>}
 */
export async function rollStartScores(start) {
	const scores = {};
	const rolls = [];
	for (const key of SCORES) {
		const roll = await new Roll(key === "guard" ? start.guard : start.virtues).evaluate();
		rolls.push(roll);
		scores[key] = key === "guard" ? roll.total : clampVirtue(roll.total);
	}
	return { scores, rolls };
}

/**
 * Make a Knight with their Property. The steed and other companions are made
 * first, beside them, so the Knight is made riding it in one go.
 * @param {object} details
 * @param {string} details.name
 * @param {object} details.update The Knight's flat update, as knightUpdate gives it.
 * @param {object[]} details.items Their Property, as knightItems gives it.
 * @param {string|null} [details.folder]
 * @returns {Promise<Actor|null>}
 */
export async function createKnightWithCompanions({ name, update, items, folder = null }) {
	const { made, steed, gone } = await makeCompanions(items, { folder });
	if (steed) update["system.steed"] = steed;
	const created = await Actor.implementation.create({ name, type: "knight", folder, ...foundry.utils.expandObject(update), items: items.filter((item) => !gone.has(item)) });
	if (created) await markCompanions(made, created);
	return created ?? null;
}

/**
 * @param {object} details
 * @param {string} details.name        What to call them until they're rolled.
 * @param {object} [details.ownership] Who holds them, where they're handed on from somebody.
 * @param {{lowest: number, highest: number}|null} [details.companyGlory] The Glory of the Company they join, where
 *   they may start with some (p195).
 * @param {boolean} [details.replacement] They're made in place of a Knight who fell, so start as a
 *   Young Knight-Errant whatever the Company's Start (p195).
 * @returns {Promise<Actor|null>} Null where the actor couldn't be made.
 */
export async function makeFreshKnight({ name, ownership = null, companyGlory = null, replacement = false }) {
	// The folder is left to the Knight-filing hooks, which give every Knight one
	// of their own inside the Company.
	const created = await Actor.implementation.create({
		name,
		type: "knight",
		...(ownership ? { ownership } : {})
	});
	if (!created) return null;
	const { openKnightChooser } = await import("../apps/KnightChooser.js");
	openKnightChooser(created, { fresh: true, companyGlory, replacement });
	return created;
}

/**
 * Whether a Knight was made blank and nobody has chosen them yet.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isUnchosen(actor) {
	return actor?.type === "knight" && !actor.system.isSquire && Boolean(actor.getFlag(SYSTEM_ID, UNCHOSEN_FLAG));
}

/**
 * Show the whole sheet of a Knight made blank, to be filled in by hand.
 * @param {Actor} actor
 * @returns {Promise<Actor>}
 */
export function fillKnightByHand(actor) {
	return actor.setFlag(SYSTEM_ID, UNCHOSEN_FLAG, false);
}

/**
 * The player a Knight is given to, if any.
 * @param {Actor} actor
 * @returns {string} Their user id, or "".
 */
export function knightPlayer(actor) {
	return playerHolding(actor.ownership, game.users.contents, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
}

/**
 * Give a Knight to one player, in place of whoever held them, for them to
 * choose. They're made that player's character unless the player already has
 * one, and their sheet opens for them, now or when they next join.
 * @param {Actor} actor
 * @param {string} userId The player, or "" to take the Knight back.
 * @returns {Promise<void>}
 */
export async function giveKnightTo(actor, userId) {
	if (!game.user.isGM) return;
	const users = game.users.contents;
	const previous = knightPlayer(actor);
	if (previous === userId) return;
	const ownership = ownershipGivenTo(actor.ownership, userId, users, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
	// Replaced whole, so the players who held them lose it rather than keep it by the merge.
	await actor.update({ ownership }, { diff: false, recursive: false });
	await actor.update({ [`flags.${SYSTEM_ID}.${OFFERED_FLAG}`]: userId });
	const was = game.users.get(previous);
	if (was?.character?.id === actor.id) await was.update({ character: null });
	const now = game.users.get(userId);
	if (now && !now.character) await now.update({ character: actor.id });
}

/**
 * Open a Knight's sheet for the player they were given to, once, and only
 * while they're still to be chosen.
 * @param {Actor} actor
 */
function openIfOffered(actor) {
	if (actor.getFlag(SYSTEM_ID, OFFERED_FLAG) !== game.user.id || !actor.isOwner) return;
	actor.unsetFlag(SYSTEM_ID, OFFERED_FLAG);
	if (isUnchosen(actor)) actor.sheet.render({ force: true });
}

/** Mark Knights made blank, and open them for the player they're given to. */
export function registerUnchosenKnightHooks() {
	Hooks.on("preCreateActor", (actor, data, options) => {
		if (!options.pack && isBlankKnightData(data)) actor.updateSource({ [`flags.${SYSTEM_ID}.${UNCHOSEN_FLAG}`]: true });
	});
	Hooks.on("updateActor", (actor, changes) => {
		if (foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}.${OFFERED_FLAG}`)) openIfOffered(actor);
	});
}

/** Open the Knights given to a player who wasn't on when they were, now that they are. */
export function openOfferedKnights() {
	if (game.user.isGM) return;
	for (const actor of worldKnights()) openIfOffered(actor);
}
