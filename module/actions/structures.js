import { confirmDialog, inputDialog } from "../apps/ui.js";
import { GOODS_PACKS } from "../book-art/goods-folders.js";
import { postCard, registerCardButtons, t, warn } from "../chat/cards.js";
import { collisionFaces, isStructureNpc, structureFromNpc } from "../rules/structures.js";
import { replacementEntry } from "../compat.js";
import { SYSTEM_ID } from "../system-id.js";
import { takeDamage } from "./damage.js";

/** The world setup step that makes the world's structure NPCs into Structure actors. */
export const STRUCTURE_ACTORS_STEP = "structureActors";

/**
 * A day of repairs restores a ship's or structure's GD (p11). One destroyed at
 * 0GD may be past mending, so the Referee is asked first.
 * @param {Actor} actor
 * @returns {Promise<boolean>} Whether it was repaired.
 */
export async function repair(actor) {
	if (actor.system.guard.value === 0 && !(await confirmDialog({
		title: t("structure.repairDestroyedTitle", { name: actor.name }),
		icon: "fa-solid fa-hammer",
		message: t("structure.repairDestroyed", { name: foundry.utils.escapeHTML(actor.name) }),
		yes: { label: t("structure.repair") }
	}))) return false;
	const value = actor.system.guard.max;
	await actor.update({ "system.guard.value": value });
	await postCard(actor, "note", { icon: "fa-solid fa-hammer", text: t("structure.repaired", { value }) });
	return true;
}

/**
 * The one other ship or structure this user has targeted, which a collision is with.
 * @param {Actor} actor The ship colliding.
 * @returns {Actor|null}
 */
function targetedVessel(actor) {
	const others = [...new Set([...(game.user.targets ?? [])].map((token) => token.actor))]
		.filter((other) => other?.type === "structure" && other !== actor);
	return others.length === 1 ? others[0] : null;
}

/** How the colliding ship measures against the other. */
const COLLISION_SIZES = Object.freeze(["similar", "larger", "smaller"]);

/** What marks the button on a collision card for a ship its roller couldn't change. */
const COLLISION_SELECTOR = "[data-collision]";

/**
 * What a collision does to a ship, as takeDamage takes it.
 * @param {number} damage
 * @returns {object}
 */
const collisionDamage = (damage) => ({ damage, ranged: false, harm: { structure: true } });

/**
 * Roll a collision's Damage for one ship and have it take it. A ship this user
 * can't change has its Damage offered on the card instead, for its owner or the
 * Referee to take.
 * @param {Actor} ship
 * @param {boolean} muchLarger
 * @returns {Promise<import("../rules/damage.js").DamageResult|null>} Null where the Damage was only offered.
 */
async function takeCollision(ship, muchLarger) {
	const faces = collisionFaces(muchLarger);
	const roll = await new Roll(`1d${faces}`).evaluate();
	const text = t("structure.collide.rolled", { name: ship.name, faces, damage: roll.total });
	if (!ship.isOwner) {
		await postCard(ship, "note", {
			icon: "fa-solid fa-sailboat",
			text,
			action: { data: "collision", icon: "fa-solid fa-burst", label: t("structure.collide.take") }
		}, { rolls: [roll], flags: { [SYSTEM_ID]: { collision: { ship: ship.uuid, damage: roll.total } } } });
		return null;
	}
	await postCard(ship, "note", { icon: "fa-solid fa-sailboat", text }, { rolls: [roll] });
	return takeDamage(ship, collisionDamage(roll.total));
}

/**
 * @param {ChatMessage} message A collision's card.
 * @returns {Actor|null} The ship it offers the Damage to.
 */
const collidedShip = (message) => fromUuidSync(message?.flags?.[SYSTEM_ID]?.collision?.ship ?? "");

/** Wire the card offering a collision's Damage to the other ship. Called during init. */
export function registerCollisions() {
	registerCardButtons({
		selector: COLLISION_SELECTOR,
		once: true,
		// Only by whoever may change the ship.
		mayPress: (message, user) => Boolean(collidedShip(message)?.testUserPermission?.(user, "OWNER")),
		handler: async (_button, message) => {
			const damage = message?.flags?.[SYSTEM_ID]?.collision?.damage;
			const ship = collidedShip(message);
			if (!ship?.isOwner || !Number.isFinite(damage)) {
				warn("structure.collide.notYours");
				return false;
			}
			return Boolean(await takeDamage(ship, collisionDamage(damage)));
		}
	});
}

/**
 * Ships collide: each takes d12 Damage, or d6 if it's much the larger (p11). A
 * collision needs no fire or siege weapon to harm a ship. With the other ship
 * targeted, it takes its own Damage too, or has it offered on a card where this
 * user can't change it.
 * @param {Actor} actor
 * @returns {Promise<import("../rules/damage.js").DamageResult|null>} This ship's, or null if the dialog was closed.
 */
export async function collide(actor) {
	const other = targetedVessel(actor);
	const data = await inputDialog({
		title: t("structure.collide.title"),
		icon: "fa-solid fa-sailboat",
		template: "collide",
		context: {
			intro: other
				? t("structure.collide.introWith", { name: actor.name, other: other.name })
				: t("structure.collide.intro", { name: actor.name }),
			sizes: COLLISION_SIZES.map((id) => ({ id, name: t(`structure.collide.${id}`) }))
		},
		ok: { label: t("structure.collide.roll"), icon: "fa-solid fa-dice-d12" }
	});
	const size = data?.size;
	if (!COLLISION_SIZES.includes(size)) return null;

	const result = await takeCollision(actor, size === "larger");
	if (other) await takeCollision(other, size === "smaller");
	return result;
}

/**
 * Make an NPC marked as a structure into a Structure actor, keeping its Tokens,
 * picture, items and notes. Its Virtues, Feats and scale go.
 * @param {Actor} actor
 * @returns {Promise<boolean>} Whether it was changed.
 */
async function convertToStructure(actor) {
	if (actor?.type !== "npc") return false;
	const system = structureFromNpc(actor.name, actor.toObject().system);
	// Foundry changes a document's type only when its system data is replaced whole.
	await actor.update(Object.fromEntries([["type", "structure"], replacementEntry("system", system)]));
	return true;
}

/**
 * A world setup step: make every structure NPC in the world, and in the
 * Arms & Goods compendium if it's unlocked, into a Structure actor. NPCs that
 * only count as a structure but have Virtues of their own stay NPCs.
 * @returns {Promise<void>}
 */
export async function convertStructureNpcs() {
	const actors = game.actors.filter((actor) => isStructureNpc(actor));
	const pack = game.packs.get(`world.${GOODS_PACKS.actors.name}`);
	if (pack && !pack.locked) actors.push(...(await pack.getDocuments()).filter((actor) => isStructureNpc(actor)));

	let count = 0;
	for (const actor of actors) {
		try {
			if (await convertToStructure(actor)) count += 1;
		} catch (error) {
			console.error(`${SYSTEM_ID} | Couldn't make ${actor.uuid} a Structure`, error);
		}
	}
	if (count) ui.notifications.info(t("structure.convert.converted", { count }));
}
