import { GOODS_PACKS } from "../book-art/goods-folders.js";
import { goodsActorIcon, goodsIconPath, goodsItemIcon } from "../rules/goods-icons.js";
import { SYSTEM_ID, SYSTEM_PATH } from "../system-id.js";

/**
 * The world setup step that gives items, beasts and structures already in the
 * world their pictures. Its number goes up whenever the rules picture names
 * they left without one, such as the Servant and Guide, so worlds run it again;
 * it only ever touches pictures nobody picked.
 */
export const GOODS_PICTURES_STEP = "goodsIcons2";

/**
 * The pictures steeds made from a Property line had before these: Foundry's
 * rider, then briefly a horse's head of their own, since folded into these.
 */
const OLD_STEED_IMAGES = Object.freeze(["icons/environment/people/cavalry.webp", `${SYSTEM_PATH}/assets/icons/steed.svg`]);
const STEED_IMAGE = goodsIconPath("horse-head");

/** @returns {boolean} Whether an item's picture is the one Foundry gives every item, so nobody picked it. */
const stockItem = (img) => !img || img === Item.implementation.DEFAULT_ICON;

/**
 * @param {string} img
 * @param {string} icon The picture the actor's name calls for.
 * @returns {boolean} Whether an actor's picture is one nobody picked: Foundry's
 *   own, or one an older steed was given.
 */
const stockActor = (img, icon) => !img || img === Actor.implementation.DEFAULT_ICON || (OLD_STEED_IMAGES.includes(img) && icon === STEED_IMAGE);

/**
 * @param {{type: string, name: string, img: string, system?: object}} item
 * @param {string} [name] The name it's about to have, if it's being renamed.
 * @returns {{img: string}|null} The change giving an item the picture its name calls for,
 *   or null if it has one of its own, or of this kind already.
 */
function itemPicture(item, name = item.name) {
	// Still the picture its old name called for, so nobody picked it either.
	if (!stockItem(item.img) && item.img !== goodsItemIcon(item)) return null;
	const img = goodsItemIcon({ type: item.type, name, system: item.system });
	return img && img !== item.img ? { img } : null;
}

/**
 * @param {Actor} actor
 * @param {string} [name] The name it's about to have, if it's being renamed.
 * @returns {object|null} The change giving an NPC or structure the picture its name
 *   calls for, on its Token too where that shows the same, or null as for itemPicture.
 */
function actorPicture(actor, name = actor.name) {
	const was = goodsActorIcon(actor);
	const img = goodsActorIcon({ type: actor.type, name });
	if (!img || img === actor.img) return null;
	const ours = (src) => stockActor(src, img) || (was && src === was);
	if (!ours(actor.img)) return null;
	const token = actor.prototypeToken?.texture?.src;
	return { img, ...(ours(token) ? { "prototypeToken.texture.src": img } : {}) };
}

/**
 * Give each new item, and each new NPC or structure with the items it's made
 * with, the picture its name calls for, and a renamed one the picture its new
 * name does, unless somebody gave it a picture of their own.
 */
export function registerGoodsPictures() {
	Hooks.on("preCreateItem", (item) => {
		const change = itemPicture(item);
		if (change) item.updateSource(change);
	});
	Hooks.on("preCreateActor", (actor) => {
		const change = actorPicture(actor);
		if (change) actor.updateSource(change);
		// Items made with their actor have no hooks of their own, and share its data.
		for (const item of actor.items) {
			const itemChange = itemPicture(item);
			if (itemChange) item.updateSource(itemChange);
		}
	});
	Hooks.on("preUpdateItem", (item, changes) => {
		if (typeof changes.name !== "string" || "img" in changes) return;
		Object.assign(changes, itemPicture(item, changes.name));
	});
	Hooks.on("preUpdateActor", (actor, changes) => {
		if (typeof changes.name !== "string" || "img" in changes) return;
		const change = actorPicture(actor, changes.name);
		if (change) foundry.utils.mergeObject(changes, change);
	});
}

/**
 * @param {Iterable<Item>} items
 * @returns {{_id: string, img: string}[]} An update for each item its name gives a picture.
 */
const pictureUpdates = (items) => [...items].map((item) => ({ _id: item.id, ...itemPicture(item) })).filter((update) => update.img);

/**
 * @param {Actor} actor
 * @returns {Promise<number>} How many pictures were given: the actor's own and its items'.
 */
async function pictureActor(actor) {
	let count = 0;
	const change = actorPicture(actor);
	if (change) {
		await actor.update(change);
		count += 1;
	}
	const items = pictureUpdates(actor.items);
	if (items.length) await actor.updateEmbeddedDocuments("Item", items);
	return count + items.length;
}

/**
 * A world setup step. Items, NPCs and structures made before they had
 * pictures, still with Foundry's own, get the ones their names call for: in
 * the Items and Actors directories, on every actor, and in the Arms & Goods
 * compendiums if they're unlocked.
 * @returns {Promise<void>}
 */
export async function pictureExistingGoods() {
	let count = 0;
	const items = pictureUpdates(game.items);
	if (items.length) {
		await Item.implementation.updateDocuments(items);
		count += items.length;
	}

	const actors = [...game.actors];
	for (const { name } of Object.values(GOODS_PACKS)) {
		const pack = game.packs.get(`world.${name}`);
		if (!pack || pack.locked) continue;
		const documents = await pack.getDocuments();
		if (pack.documentName === "Actor") {
			actors.push(...documents);
			continue;
		}
		const updates = pictureUpdates(documents);
		if (updates.length) await Item.implementation.updateDocuments(updates, { pack: pack.collection });
		count += updates.length;
	}

	// Each actor's writes are its own, so they go out together.
	const given = await Promise.all(actors.map((actor) => pictureActor(actor).catch((error) => {
		console.error(`${SYSTEM_ID} | Couldn't give ${actor.uuid} its pictures`, error);
		return 0;
	})));
	count += given.reduce((sum, each) => sum + each, 0);
	if (count) console.log(`${SYSTEM_ID} | Gave ${count} items, beasts and structures their pictures`);
}
