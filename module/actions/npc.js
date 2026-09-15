import { t } from "../chat/cards.js";
import { npcFromStatBlock, statBlockFromText } from "../rules/stat-blocks.js";
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
 * Give an NPC what a stat block says: its name, scores, Armour, Feats and
 * notes, with its attacks in place of the NPC's weapons. Other items stay.
 * @param {Actor} actor
 * @param {{name: string, system: object, items: object[]}} data From npcData.
 * @param {object} [changes] More to set on the actor, such as `img`.
 */
export async function applyNpcData(actor, { name, system, items }, changes = {}) {
	await actor.update({ ...(name ? { name } : {}), system, ...changes });
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
