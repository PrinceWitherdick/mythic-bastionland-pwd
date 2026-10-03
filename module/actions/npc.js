import { confirmDialog, inputDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import { GOODS_PACKS } from "../book-art/goods-folders.js";
import { FOLK_VIRTUE_ROLL, VIRTUES, clampVirtue, hasUnrolledVirtues } from "../rules/virtues.js";

import { actorFromStatBlock } from "../rules/stat-blocks.js";

/**
 * Actor data for whatever a stat block describes: a Structure for a thing with
 * only GD that counts as a structure, and otherwise an NPC.
 * @param {{name: string|null, stats: object, lines?: string[]}} block
 * @returns {{type: string, name: string, system: object, items: object[]}}
 */
export const actorData = (block) => actorFromStatBlock(block, { attackName: t("attack.title") });

/**
 * Change what an NPC's or Structure's Armour is and what it counts for, from
 * the A beside its first score. Both are typed in by hand, as stat blocks print them.
 * @param {Actor} actor
 * @returns {Promise<Actor|undefined>}
 */
export async function editArmour(actor) {
	if (!actor?.isOwner) return;
	const { armour, armourNote } = actor.system;
	const data = await inputDialog({
		title: t(`${actor.type}.armourEdit.title`),
		icon: "fa-solid fa-shield-halved",
		template: "npc-armour",
		context: { armour, note: armourNote, placeholder: t(`${actor.type}.armourEdit.notePlaceholder`) },
		ok: { label: t("npc.armourEdit.ok") }
	});
	if (!data) return;
	const value = Math.max(0, Math.floor(Number(data.armour) || 0));
	return actor.update({ "system.armour": value, "system.armourNote": String(data.note ?? "").trim() });
}

/**
 * Roll an NPC's Virtues on d12+d6, as the book has hirelings rolled (Service,
 * p13), and post them. Asks first where the NPC already has Virtues of its own.
 * @param {Actor} actor
 * @returns {Promise<Record<string, number>|null>} The Virtues rolled, or null.
 */
export async function rollNpcVirtues(actor) {
	if (!actor?.isOwner || !actor.system.virtues) return null;
	if (!hasUnrolledVirtues(actor.system)) {
		const confirmed = await confirmDialog({ title: t("npc.rollVirtues"), icon: "fa-solid fa-dice", message: t("npc.rollVirtuesAgain", { name: foundry.utils.escapeHTML(actor.name) }) });
		if (!confirmed) return null;
	}
	const rolls = [];
	const update = {};
	const scores = {};
	for (const key of VIRTUES) {
		const roll = await new Roll(FOLK_VIRTUE_ROLL).evaluate();
		rolls.push(roll);
		scores[key] = clampVirtue(roll.total);
		update[`system.virtues.${key}`] = { value: scores[key], max: scores[key] };
	}
	await actor.update(update);
	await postCard(actor, "creation", {
		title: t("npc.rollVirtues"),
		tagline: t("npc.rollVirtuesTagline"),
		lines: VIRTUES.map((key) => ({ label: t(`virtues.${key}.abbr`), value: String(scores[key]) }))
	}, { rolls });
	return scores;
}

/**
 * A hireling taken from the Beasts & Hirelings compendium into the world rolls
 * its Virtues on d12+d6 as it's made (Service, p13), since the book gives only
 * their GD. Called from the preCreateActor hook, on the creating client.
 * @param {Actor} actor Being created.
 * @param {object} data
 * @param {object} _options
 * @param {string} userId
 */
export function rollHirelingVirtues(actor, data, _options, userId) {
	if (userId !== game.user.id || actor.type !== "npc" || actor.system.scale === "warband") return;
	const source = actor._stats?.compendiumSource ?? data?._stats?.compendiumSource ?? "";
	if (!source.includes(`.${GOODS_PACKS.actors.name}.`) || !hasUnrolledVirtues(actor.system)) return;
	const virtues = Object.fromEntries(VIRTUES.map((key) => {
		const score = clampVirtue(new Roll(FOLK_VIRTUE_ROLL).evaluateSync().total);
		return [key, { value: score, max: score }];
	}));
	actor.updateSource({ system: { virtues } });
}
