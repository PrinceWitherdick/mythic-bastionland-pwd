import { confirmDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import { GOODS_PACKS } from "../book-art/goods-folders.js";
import { FOLK_VIRTUE_ROLL, VIRTUES, clampVirtue, hasUnrolledVirtues } from "../rules/virtues.js";

import { actorFromStatBlock, npcFromStatBlock, statBlockFromText } from "../rules/stat-blocks.js";
import { templatePath } from "../system-id.js";

/**
 * Actor data for an NPC from a stat block.
 * @param {{name: string|null, stats: object, lines?: string[]}} block From the art index, or pasted text.
 * @returns {{name: string, system: object, items: object[]}}
 */
export function npcData(block) {
	return npcFromStatBlock(block, { attackName: t("attack.title") });
}

/**
 * Actor data for whatever a stat block describes: a Structure for a thing with
 * only GD that counts as a structure, and otherwise an NPC.
 * @param {{name: string|null, stats: object, lines?: string[]}} block
 * @returns {{type: string, name: string, system: object, items: object[]}}
 */
export const actorData = (block) => actorFromStatBlock(block, { attackName: t("attack.title") });

/**
 * Give an NPC what a stat block says: its name, scores, Armour, Feats and
 * notes, with its attacks in place of the NPC's weapons. Other items stay.
 * @param {Actor} actor
 * @param {{name: string, system: object, items: object[]}} data From npcData.
 */
export async function applyNpcData(actor, { name, system, items }) {
	await actor.update({ ...(name ? { name } : {}), system });
	const replaced = actor.items.filter((item) => item.type === "weapon").map((item) => item.id);
	if (replaced.length) await actor.deleteEmbeddedDocuments("Item", replaced);
	if (items.length) await actor.createEmbeddedDocuments("Item", items);
}

/**
 * Ask for a stat block as text, such as one copied from the rulebook PDF, and
 * give it to an NPC.
 * @param {Actor} actor
 * @returns {Promise<object|null>} The data applied, or null.
 */
export async function pasteStatBlock(actor) {
	const content = await foundry.applications.handlebars.renderTemplate(templatePath("dialogs/stat-block.hbs"), {});
	const data = await foundry.applications.api.DialogV2.input({
		window: { title: t("npc.paste.title"), icon: "fa-solid fa-paste" },
		classes: ["bastionland-dialog"],
		content,
		ok: { label: t("npc.paste.apply"), icon: "fa-solid fa-check" },
		rejectClose: false
	});
	if (!data) return null;

	const block = statBlockFromText(data.text);
	if (!block) {
		ui.notifications.warn(t("npc.paste.noStats"));
		return null;
	}
	const npc = npcData(block);
	await applyNpcData(actor, npc);
	return npc;
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
