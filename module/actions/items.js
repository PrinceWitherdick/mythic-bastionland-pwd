import { postCard, t } from "../chat/cards.js";
import { SITUATION_CONDITIONS } from "../rules/armour.js";
import { isCounted } from "../rules/restock.js";
import { ALTERNATE_QUALITIES } from "../rules/attack.js";
import { specialistLabel } from "./attack.js";
import { knightTableItemId, namePartsWithoutSeeBelow } from "../rules/knight-tables.js";
import { parentheticals, splitName } from "../rules/text.js";

/**
 * A weapon's other way to fight, as the book writes it: "d10 Slow Ranged".
 * The words for how it's held are left out when a quality already says them.
 * @param {object} system A weapon's system data.
 * @returns {string|null} Null for a weapon fought only one way.
 */
export function alternateText(system) {
	const alternate = system?.alternate;
	if (!alternate?.damage?.trim()) return null;
	const words = [alternate.damage.trim(), ...ALTERNATE_QUALITIES.filter((key) => alternate[key]).map((key) => t(`item.${key}`))];
	const how = alternate.label?.trim();
	if (how && !words.some((word) => word.toLowerCase() === how.toLowerCase())) words.push(how);
	return words.join(" ");
}

/**
 * When a piece of armour counts, as a tag, such as "only in verdant environments".
 * @param {object} system An armour item's system data.
 * @returns {string|null} Null for armour that always counts.
 */
export function armourConditionText(system) {
	const { condition } = system ?? {};
	if (!condition) return null;
	const situation = system.situation?.trim();
	if (SITUATION_CONDITIONS.includes(condition) && !situation) return t(`item.conditionTags.${condition}Bare`);
	return t(`item.conditionTags.${condition}`, { situation });
}

/**
 * @param {object} system A possession's system data.
 * @returns {string|null} How many are left, such as "2 of 3", or null while nobody counts them.
 */
export function quantityText(system) {
	if (!isCounted(system)) return null;
	const { value, max } = system.quantity;
	return Number.isInteger(max) ? t("item.quantityTag", { value, max }) : t("item.quantityTagBare", { value });
}

/**
 * Short labels printed after an item's name, the way the book writes
 * "Polished mace (d8 hefty)" or "Kite shield (d4, A1)".
 * @param {Item} item
 * @param {object} [options]
 * @param {boolean} [options.counted=true] Say how many are left. A sheet's row
 *   leaves it out, since it shows the count with buttons of its own.
 * @returns {string[]}
 */
export function itemTags(item, { counted = true } = {}) {
	const { system } = item;
	const qualities = (...keys) => keys.filter((key) => system[key]).map((key) => t(`item.${key}`));
	const alternate = item.type === "weapon" ? alternateText(system) : null;
	// What every possession can end with: how many are left, and whether it's broken.
	const stock = [counted ? quantityText(system) : null, system.broken ? t("item.brokenTag") : null].filter(Boolean);

	switch (item.type) {
		case "weapon":
			return [
				system.damage,
				...qualities("hefty", "long", "slow", "heftyMounted", "ranged", "blast", "ignoresArmour", "trample"),
				...[specialistLabel(system)].filter(Boolean),
				...(alternate ? [t("item.alternateTag", { how: alternate })] : []),
				...stock
			];
		case "armour":
			return [
				system.kind === "shield" && system.buckler ? t("item.buckler") : t(`item.kinds.${system.kind}`),
				system.damage,
				`A${system.armour}`,
				armourConditionText(system),
				...stock
			].filter(Boolean);
		case "gear": {
			const poison = system.poison && t(system.rarity ? "item.poisonTag" : "item.poisonTagBare", { rarity: system.rarity ? t(`goods.rarities.${system.rarity}`) : "" });
			return [
				system.remedy ? t("item.remedyTag", { virtue: t(`virtues.${system.remedy}.abbr`) }) : null,
				poison || null,
				...stock
			].filter(Boolean);
		}
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
		// "Weapon · Rare": how rare it is rides with what it is.
		kind: [game.i18n.localize(`TYPES.Item.${item.type}`), item.system.rarity ? t(`goods.rarities.${item.system.rarity}`) : null].filter(Boolean).join(" · "),
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
