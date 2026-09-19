import { postCard, t } from "../chat/cards.js";
import { specialistLabel } from "./attack.js";
import { knightTableItemId, namePartsWithoutSeeBelow } from "../rules/knight-tables.js";
import { parentheticals, splitName } from "../rules/text.js";

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
 * An item name's gloss for a line of its own: the rest after splitName, with
 * the brackets taken off when they wrap all of it, so "(VIG 12, CLA 8)" reads
 * "VIG 12, CLA 8" under the name.
 * @param {string} rest
 * @returns {string}
 */
function glossLine(rest) {
	if (!rest.startsWith("(") || !rest.endsWith(")")) return rest;
	// The opening bracket closes before the end, as in "(d8) and a spare": it wraps only part.
	const [first] = parentheticals(rest);
	return first && first.close < rest.length - 1 ? rest : rest.slice(1, -1);
}

/**
 * Template data for an item's chat card: its name as the title, the gloss
 * the name carries as a plain line under it, its kind and tags, and its
 * description, which the chat log enriches as it renders the message.
 * @param {Item} item
 * @param {{showsTable?: boolean}} [options] Whether the item is the one the Knight's
 *   table sits under on their sheet, which then drops its "see below" there and here.
 */
export function itemContext(item, { showsTable = false } = {}) {
	const parts = splitName(item.name);
	const { nameHead, nameRest } = showsTable ? namePartsWithoutSeeBelow(parts) : parts;
	return {
		name: nameHead,
		gloss: glossLine(nameRest),
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
	// The card reads as the sheet's row does, which drops "see below" over the Knight's table.
	return postCard(actor, "item", { item: itemContext(item, { showsTable: knightTableItemId(actor) === item.id }) });
}
