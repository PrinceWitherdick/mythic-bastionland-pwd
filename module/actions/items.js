import { postCard, t } from "../chat/cards.js";
import { specialistLabel } from "./attack.js";

/**
 * Short labels printed after an item's name, the way the book writes
 * "Polished mace (d8 hefty)" or "Kite shield (d4, A1)".
 * @param {Item} item
 * @returns {string[]}
 */
export function itemTags(item) {
	const { system } = item;
	const qualities = (...keys) => keys.filter((key) => system[key]).map((key) => t(`item.${key}`));

	switch (item.type) {
		case "weapon":
			return [
				system.damage,
				...qualities("hefty", "long", "slow", "heftyMounted", "ranged", "blast", "ignoresArmour", "trample"),
				...[specialistLabel(system)].filter(Boolean)
			];
		case "armour":
			return [
				t(`item.kinds.${system.kind}`),
				system.damage,
				`A${system.armour}`
			].filter(Boolean);
		case "gear":
			return system.remedy ? [t("item.remedyTag", { virtue: t(`virtues.${system.remedy}.abbr`) })] : [];
		default:
			return [];
	}
}

/**
 * Template data for an item's chat card: its name, kind and tags, and its
 * description, which the chat log enriches as it renders the message.
 * @param {Item} item
 */
export function itemContext(item) {
	return {
		name: item.name,
		kind: game.i18n.localize(`TYPES.Item.${item.type}`),
		tags: itemTags(item).join(", "),
		description: item.system.description || ""
	};
}

/**
 * Show an item from a sheet in chat, spoken by the actor carrying it.
 * @param {Actor} actor
 * @param {Item|undefined} item
 * @returns {Promise<ChatMessage>|null} Null without an item.
 */
export function postItem(actor, item) {
	if (!item) return null;
	return postCard(actor, "item", { item: itemContext(item) });
}
