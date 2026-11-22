import { askActiveGMOrWarn } from "../ask-gm-warn.js";
import { gmAsker } from "../gm-asker.js";
import { postCard, t, warn } from "../chat/cards.js";
import { KIT_FLAG } from "../rules/ability-kits.js";
import { SYSTEM_ID } from "../system-id.js";
import { registerQuery } from "../queries.js";

/** The kinds of Item that are things carried, so one handed on leaves whoever gave it. */
export const HANDED_TYPES = Object.freeze(["weapon", "armour", "gear"]);

/** The query a player sends to hand a possession to a character they don't own. */
const HAND_QUERY = `${SYSTEM_ID}.handOver`;

/**
 * Whether an item is a weapon an Ability gives that fills no hand, such as a
 * bite or a burst of light: part of whoever has the Ability, not carried, so
 * it can't leave them. One that's a real thing, such as a chain, can.
 * @param {Item|null|undefined} item
 * @returns {boolean}
 */
const isOwnPower = (item) => Boolean(item?.type === "weapon" && item.system?.noHand && item.flags?.[SYSTEM_ID]?.[KIT_FLAG]);

/**
 * Whether an Item dropped on an actor's sheet is a possession handed on from
 * another character, rather than one sorted on its own sheet, or brought from
 * the sidebar or a compendium (which copy as Foundry does).
 * @param {Item|null|undefined} item
 * @param {Actor} to Whose sheet it was dropped on.
 * @returns {boolean}
 */
export function isHandOver(item, to) {
	const from = item?.parent;
	// An actor in a compendium is a pattern to copy from, not somebody carrying it.
	if (item?.pack || from?.pack) return false;
	if (isOwnPower(item)) return false;
	return from?.documentName === "Actor" && from.uuid !== to?.uuid && HANDED_TYPES.includes(item.type);
}

/**
 * Move the item: made on `to` as it is, then taken off whoever carried it.
 * Nothing is taken where it couldn't be made, such as a second Remedy (p12).
 * The table hears of it, unless neither side is anybody's but the Referee's.
 * @param {Item} item
 * @param {Actor} to
 * @returns {Promise<Item|null>} The item on `to`.
 */
async function moveItem(item, to) {
	const from = item.parent;
	const keepId = !to.items.has(item.id);
	const [made] = (await to.createEmbeddedDocuments("Item", [item.toObject()], { keepId })) ?? [];
	if (!made) return null;
	await item.delete();
	const seen = Boolean(from.hasPlayerOwner || to.hasPlayerOwner);
	await postCard(to, "note", {
		icon: "fa-solid fa-hand-holding",
		text: t("handOver.card", { item: item.name, from: from.name, to: to.name })
	}, seen ? {} : { mode: "gm" });
	return made;
}

/**
 * Hand a possession from one character to another, as dropping it on their
 * sheet does. It moves, rather than leaving a copy behind. Only whoever owns
 * the giver may hand it on, and a player handing it to somebody they don't own
 * has the active Referee's client finish it.
 * @param {Item} item
 * @param {Actor} to
 * @returns {Promise<Item|null>} The item on `to`, or null where it stayed.
 */
export async function handOver(item, to) {
	const said = { item: item.name, from: item.parent.name, to: to.name };
	if (!item.isOwner) {
		warn("handOver.notYours", said);
		return null;
	}
	if (to.isOwner) return moveItem(item, to);
	const asked = { itemUuid: item.uuid, toUuid: to.uuid };
	const answer = await askActiveGMOrWarn(HAND_QUERY, asked, `Couldn't hand ${item.name} to ${to.name}`, { absent: "handOver.needsReferee", refused: "handOver.refused", data: said });
	return typeof answer === "string" ? to.items.get(answer) ?? null : null;
}

/**
 * A player's possession handed to a character they don't own, moved by the GM
 * who was asked: only where the asker owns whoever carries it and can see the
 * one it goes to.
 * @param {{itemUuid?: string, toUuid?: string}} data
 * @param {object} context
 * @returns {Promise<string|false>} The item's id on the one it went to.
 */
export async function onHandOverQuery(data = {}, context = {}) {
	const asker = gmAsker(context);
	if (!asker) return false;
	const item = fromUuidSync(String(data?.itemUuid ?? ""));
	const to = fromUuidSync(String(data?.toUuid ?? ""));
	if (item?.documentName !== "Item" || to?.documentName !== "Actor" || !isHandOver(item, to)) return false;
	if (!item.parent.testUserPermission(asker, "OWNER") || !to.testUserPermission(asker, "LIMITED")) return false;
	const made = await moveItem(item, to);
	return made?.id ?? false;
}

/** Answer players handing possessions to characters they don't own. Called during init. */
export function registerHandOverQuery() {
	registerQuery(HAND_QUERY, onHandOverQuery);
}
