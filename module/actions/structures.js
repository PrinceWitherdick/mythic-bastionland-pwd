import { chooseDialog, confirmDialog } from "../apps/ui.js";
import { GOODS_PACKS } from "../book-art/goods-folders.js";
import { postCard, t } from "../chat/cards.js";
import { collisionFaces, isStructureNpc, structureFromNpc } from "../rules/structures.js";
import { escapeHTML } from "../rules/text.js";
import { SYSTEM_ID } from "../system-id.js";
import { takeDamage } from "./damage.js";

/** The world setup step that makes the world's structure NPCs into Structure actors. */
export const STRUCTURE_ACTORS_STEP = "structureActors";

/**
 * A day of repairs restores a ship's or structure's GD (p11).
 * @param {Actor} actor
 */
export async function repair(actor) {
	const value = actor.system.guard.max;
	await actor.update({ "system.guard.value": value });
	await postCard(actor, "note", { icon: "fa-solid fa-hammer", text: t("structure.repaired", { value }) });
}

/**
 * A ship collides with another: roll the d12 it takes, or the d6 if it's much
 * the larger (p11), and take that Damage. A collision needs no fire or siege
 * weapon to harm a ship.
 * @param {Actor} actor
 * @returns {Promise<import("../rules/damage.js").DamageResult|null>} Null if the dialog was closed.
 */
export async function collide(actor) {
	const size = await chooseDialog({
		title: t("structure.collide.title"),
		icon: "fa-solid fa-sailboat",
		message: t("structure.collide.intro", { name: escapeHTML(actor.name) }),
		buttons: [
			{ action: "similar", label: t("structure.collide.similar"), default: true },
			{ action: "larger", label: t("structure.collide.larger") }
		]
	});
	if (size !== "similar" && size !== "larger") return null;

	const faces = collisionFaces(size === "larger");
	const roll = await new Roll(`1d${faces}`).evaluate();
	await postCard(actor, "note", {
		icon: "fa-solid fa-sailboat",
		text: t("structure.collide.rolled", { name: actor.name, faces, damage: roll.total })
	}, { rolls: [roll] });
	return takeDamage(actor, { damage: roll.total, ranged: false, harm: { structure: true } });
}

/**
 * Make an NPC marked as a structure into a Structure actor, keeping its Tokens,
 * picture, items and notes. Its Virtues, Feats and scale go.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {boolean} [options.confirm=true] Ask first.
 * @returns {Promise<boolean>} Whether it was changed.
 */
export async function convertToStructure(actor, { confirm = true } = {}) {
	if (actor?.type !== "npc") return false;
	if (confirm) {
		const confirmed = await confirmDialog({
			title: t("structure.convert.title"),
			icon: "fa-solid fa-chess-rook",
			message: t("structure.convert.confirm", { name: escapeHTML(actor.name) })
		});
		if (!confirmed) return false;
	}
	const system = structureFromNpc(actor.name, actor.toObject().system);
	// Foundry changes a document's type only when its system data is replaced whole.
	await actor.update({ type: "structure", system: foundry.data.operators.ForcedReplacement.create(system) });
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
			if (await convertToStructure(actor, { confirm: false })) count += 1;
		} catch (error) {
			console.error(`${SYSTEM_ID} | Couldn't make ${actor.uuid} a Structure`, error);
		}
	}
	if (count) ui.notifications.info(t("structure.convert.converted", { count }));
}
