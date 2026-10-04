import { chooseDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import {
	FALLEN_PATHS,
	companyGlory,
	fallenPaths,
	followersOf,
	knightHasFallen,
	squireOf,
	successorOf
} from "../rules/fallen.js";
import { UNCHOSEN_FLAG } from "../rules/unchosen-knight.js";
import { SYSTEM_ID } from "../system-id.js";
import { makeFreshKnight } from "./new-knight.js";
import { COMPANION_FLAG } from "./property.js";
import { knightSquire } from "./squires.js";
import { worldKnights } from "./knights.js";

/**
 * What follows a Knight's death (p8): the player makes another Knight to join
 * the Company soon, or takes up the fallen Knight's Squire or one of their
 * followers. The fallen Knight's own sheet is left as it is: VIG 0
 * by Damage is what the book calls Slain, and there is nothing further to write
 * on them.
 */

/**
 * @param {Actor} actor
 * @returns {string[]} The players who own them, never a GM.
 */
const playersOf = (actor) => Object.entries(actor.ownership ?? {})
	.filter(([user, level]) => user !== "default" && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && !game.users.get(user)?.isGM)
	.map(([user]) => user);

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
	// Only a Knight can be a successor, so only theirs are counted.
	players: actor.type === "knight" ? playersOf(actor) : [],
	actor
}));

/**
 * @param {Actor} knight
 * @returns {{squire: object|null, successor: object|null, followers: object[]}} Who rode with them, and who they
 *   named to follow them, as actors. A successor who is also their Squire is given as both.
 */
export function whoRodeWith(knight) {
	const held = {
		uuid: knight.uuid,
		id: knight.id,
		squire: knight.system.squire,
		steed: knight.system.steed,
		successor: knight.system.successor ?? "",
		players: playersOf(knight)
	};
	const actors = worldCompanions();
	// The Squire and the successor are handed on, so the world is read for them once rather than twice.
	const squire = squireOf(held, actors);
	const successor = successorOf(held, actors);
	return {
		squire: squire?.actor ?? null,
		successor: successor?.actor ?? null,
		followers: followersOf(held, actors, squire, successor).map((entry) => entry.actor)
	};
}

/**
 * The Glory of the Knights riding on without the fallen one, for a new Knight
 * who may start with some (p195).
 * @param {Actor} fallen
 * @returns {{lowest: number, highest: number}|null}
 */
export function gloryOfTheCompany(fallen) {
	return companyGlory(worldKnights((actor) => actor.id !== fallen.id).map((actor) => ({
		glory: actor.system.glory,
		isSquire: Boolean(actor.system.isSquire),
		played: actor.hasPlayerOwner,
		// VIG 0 by Damage is Slain (p8), but Virtue Loss to 0 only Exhausts (p9).
		slain: Boolean(actor.system.slain),
		unchosen: Boolean(actor.getFlag(SYSTEM_ID, UNCHOSEN_FLAG))
	})));
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
	const rode = whoRodeWith(knight);
	const { squire, successor, followers } = rode;
	// A successor who is their Squire is taken up as their Squire, and named so on that button.
	const heir = successor && successor !== squire ? successor : null;
	const paths = fallenPaths({ squire: Boolean(squire), followers: followers.length, successor: Boolean(heir) });

	return postCard(knight, "fallen", {
		title: t("fallen.title"),
		tagline: t("fallen.tagline", { name: knight.name }),
		text: t("fallen.text"),
		uuid: knight.uuid,
		paths: paths.map((path) => ({
			key: path,
			label: fallenPathLabel(path, rode),
			icon: {
				newKnight: "fa-solid fa-chess-knight",
				successor: "fa-solid fa-crown",
				squire: "fa-solid fa-khanda",
				follower: "fa-solid fa-people-group"
			}[path]
		}))
	});
}

/**
 * @param {string} path One of FALLEN_PATHS.
 * @param {{squire: Actor|null, successor: Actor|null, followers: Actor[]}} rode From whoRodeWith.
 * @returns {string} What the path's button on the card says, naming whoever it takes up.
 */
function fallenPathLabel(path, { squire, successor, followers }) {
	if (path === "successor") return t("fallen.takeUpSuccessor", { name: successor.name });
	if (path === "squire") return t(squire === successor ? "fallen.takeUpSuccessor" : "fallen.takeUpNamed", { name: squire.name });
	if (path === "follower" && followers.length === 1) return t("fallen.takeUpNamed", { name: followers[0].name });
	return t(`fallen.paths.${path}`);
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
	const { squire, successor, followers } = whoRodeWith(knight);
	if (path === "successor") return successor ? takeUpSuccessor(knight, successor) : null;
	if (path === "squire") return squire ? takeUpSquire(knight, squire) : null;
	return takeUpFollower(knight, followers);
}

/**
 * A new Knight for a fallen one's player (p8): a Knight is made carrying the
 * fallen one's players, and the chooser opens on them to be rolled or picked.
 * Where the Company has been going a while, the chooser offers them a start in
 * Glory too (p195).
 * @param {Actor} fallen
 * @returns {Promise<Actor|null>}
 */
async function makeAnotherKnight(fallen) {
	if (!game.user.can("ACTOR_CREATE")) {
		ui.notifications.warn(t("fallen.cantCreate"));
		return null;
	}
	// Read before the new Knight is made, who has no Glory yet.
	const companyGlory = gloryOfTheCompany(fallen);
	// A player who makes an actor owns it already; only a GM hands the fallen
	// Knight's players on.
	return makeFreshKnight({
		name: t("fallen.newName"),
		ownership: game.user.isGM ? foundry.utils.deepClone(fallen.ownership) : null,
		companyGlory,
		replacement: true
	});
}

/**
 * Take up the successor the fallen Knight named (p195). A Squire is Knighted,
 * as their own Squire would be; a Knight is handed over as a follower is.
 * Handing over is the Referee's, so a player who doesn't own them yet is told
 * to ask.
 * @param {Actor} fallen
 * @param {Actor} successor
 * @returns {Promise<Actor|null>}
 */
async function takeUpSuccessor(fallen, successor) {
	if (!game.user.isGM && !successor.isOwner) {
		ui.notifications.warn(t("fallen.successorNotYours", { name: successor.name }));
		return null;
	}
	if (successor.system.isSquire) return takeUpSquire(fallen, successor);
	return takeUp(fallen, successor, "fa-solid fa-crown");
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

	return takeUp(fallen, taken, "fa-solid fa-people-group");
}

/**
 * Hand somebody over to the fallen Knight's player as their character, and say so.
 * @param {Actor} fallen
 * @param {Actor} taken
 * @param {string} icon For the note in chat.
 * @returns {Promise<Actor>}
 */
async function takeUp(fallen, taken, icon) {
	await handOver(taken, fallen);
	// They're their own character now, not a line of the dead Knight's Property,
	// so re-rolling that Knight's gear can never sweep them away.
	if (taken.getFlag(SYSTEM_ID, COMPANION_FLAG)) await taken.unsetFlag(SYSTEM_ID, COMPANION_FLAG);
	taken.sheet.render({ force: true });
	await postCard(taken, "note", { icon, text: t("fallen.tookUp", { name: taken.name, fallen: fallen.name }) });
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
