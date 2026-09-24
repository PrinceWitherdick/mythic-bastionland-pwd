import { chooseDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import { FALLEN_PATHS, fallenPaths, followersOf, knightHasFallen, squireOf } from "../rules/fallen.js";
import { SYSTEM_ID } from "../system-id.js";
import { makeFreshKnight } from "./new-knight.js";
import { COMPANION_FLAG } from "./property.js";
import { knightSquire } from "./squires.js";

/**
 * What follows a Knight's death (p8): the player makes a new Knight, added to
 * the Company as quickly as possible, or takes up the fallen Knight's Squire or
 * one of their followers. The fallen Knight's own sheet is left as it is: VIG 0
 * by Damage is what the book calls Slain, and there is nothing further to write
 * on them.
 */

/**
 * Every actor as rules/fallen.js reads them.
 * @returns {object[]}
 */
const worldCompanions = () => game.actors.map((actor) => ({
	uuid: actor.uuid,
	name: actor.name,
	type: actor.type,
	isSquire: Boolean(actor.system?.isSquire),
	serves: actor.system?.serves ?? "",
	companionOf: actor.getFlag(SYSTEM_ID, COMPANION_FLAG) ?? "",
	actor
}));

/**
 * @param {Actor} knight
 * @returns {{squire: object|null, followers: object[]}} Who rode with them, as actors.
 */
export function whoRodeWith(knight) {
	const held = { uuid: knight.uuid, id: knight.id, squire: knight.system.squire, steed: knight.system.steed };
	const actors = worldCompanions();
	// The Squire is handed on, so the world is read for them once rather than twice.
	const squire = squireOf(held, actors);
	return { squire: squire?.actor ?? null, followers: followersOf(held, actors, squire).map((entry) => entry.actor) };
}

/**
 * Tell the table a Knight has been Slain, and offer their player the ways on.
 * Called whenever Damage has been dealt, and judges for itself whether this was
 * a death the book has anything to say about.
 * @param {Actor} knight
 * @param {string} outcome One of the damage outcomes.
 * @returns {Promise<ChatMessage|null>} Null for a death the book leaves alone.
 */
export async function announceFallenKnight(knight, outcome) {
	if (!knightHasFallen({ type: knight.type, isSquire: knight.system.isSquire, hasPlayerOwner: knight.hasPlayerOwner }, outcome)) return null;
	const { squire, followers } = whoRodeWith(knight);
	const paths = fallenPaths({ squire: Boolean(squire), followers: followers.length });

	return postCard(knight, "fallen", {
		title: t("fallen.title"),
		tagline: t("fallen.tagline", { name: knight.name }),
		text: t("fallen.text"),
		uuid: knight.uuid,
		paths: paths.map((path) => ({
			key: path,
			label: path === "squire"
				? t("fallen.takeUpNamed", { name: squire.name })
				: t(path === "follower" && followers.length === 1 ? "fallen.takeUpNamed" : `fallen.paths.${path}`, { name: followers[0]?.name ?? "" }),
			icon: { newKnight: "fa-solid fa-chess-knight", squire: "fa-solid fa-khanda", follower: "fa-solid fa-people-group" }[path]
		}))
	});
}

/**
 * Take one of the ways on from a fallen Knight's card. Only their player and
 * the Referee may: it's that player's character to replace.
 * @param {string} path One of FALLEN_PATHS.
 * @param {Actor} knight The fallen Knight.
 * @returns {Promise<Actor|null>} Whoever the player now plays.
 */
export async function carryOnFrom(path, knight) {
	if (!FALLEN_PATHS.includes(path) || !knight) return null;
	if (!game.user.isGM && !knight.isOwner) {
		ui.notifications.warn(t("fallen.notYours", { name: knight.name }));
		return null;
	}
	if (path === "newKnight") return makeAnotherKnight(knight);
	const { squire, followers } = whoRodeWith(knight);
	if (path === "squire") return squire ? takeUpSquire(knight, squire) : null;
	return takeUpFollower(knight, followers);
}

/**
 * "The player creates a new Knight and they are added to the Company as quickly
 * as possible": a Knight is made carrying the fallen one's players, and the
 * chooser opens on them to be rolled or picked.
 * @param {Actor} fallen
 * @returns {Promise<Actor|null>}
 */
async function makeAnotherKnight(fallen) {
	if (!game.user.can("ACTOR_CREATE")) {
		ui.notifications.warn(t("fallen.cantCreate"));
		return null;
	}
	// A player who makes an actor owns it already; only a GM hands the fallen
	// Knight's players on.
	return makeFreshKnight({
		name: t("fallen.newName"),
		ownership: game.user.isGM ? foundry.utils.deepClone(fallen.ownership) : null
	});
}

/**
 * Take up the fallen Knight's Squire: they're Knighted (p7), which is what
 * being handed the Company's journey makes of them.
 * @param {Actor} fallen
 * @param {Actor} squire
 * @returns {Promise<Actor|null>}
 */
async function takeUpSquire(fallen, squire) {
	if (!(await knightSquire(squire))) return null;
	await handOver(squire, fallen);
	squire.sheet.render({ force: true });
	await postCard(squire, "note", { icon: "fa-solid fa-khanda", text: t("fallen.tookUp", { name: squire.name, fallen: fallen.name }) });
	return squire;
}

/**
 * Take up one of the fallen Knight's followers. Where more than one rode with
 * them, the player says which.
 * @param {Actor} fallen
 * @param {Actor[]} followers
 * @returns {Promise<Actor|null>}
 */
async function takeUpFollower(fallen, followers) {
	if (!followers.length) return null;
	let taken = followers[0];
	if (followers.length > 1) {
		const choice = await chooseDialog({
			title: t("fallen.paths.follower"),
			icon: "fa-solid fa-people-group",
			message: t("fallen.whichFollower", { name: foundry.utils.escapeHTML(fallen.name) }),
			buttons: followers.map((follower, index) => ({ action: follower.id, label: follower.name, default: index === 0 }))
		});
		taken = followers.find((follower) => follower.id === choice);
		if (!taken) return null;
	}

	await handOver(taken, fallen);
	// They're their own character now, not a line of the dead Knight's Property,
	// so re-rolling that Knight's gear can never sweep them away.
	if (taken.getFlag(SYSTEM_ID, COMPANION_FLAG)) await taken.unsetFlag(SYSTEM_ID, COMPANION_FLAG);
	taken.sheet.render({ force: true });
	await postCard(taken, "note", { icon: "fa-solid fa-people-group", text: t("fallen.tookUp", { name: taken.name, fallen: fallen.name }) });
	return taken;
}

/**
 * Hand whoever is taken up to the players who owned the fallen Knight. Only a
 * GM can give a document away; a player who already owns them needs nothing.
 * @param {Actor} actor
 * @param {Actor} fallen
 * @returns {Promise<unknown>}
 */
function handOver(actor, fallen) {
	if (!game.user.isGM) return Promise.resolve();
	const ownership = { ...actor.ownership };
	for (const [user, level] of Object.entries(fallen.ownership)) {
		if (user === "default") continue;
		ownership[user] = Math.max(ownership[user] ?? 0, level);
	}
	return actor.update({ ownership });
}
