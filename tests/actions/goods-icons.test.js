import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pictureExistingGoods, registerGoodsPictures } from "../../module/actions/goods-icons.js";
import { goodsIconPath } from "../../module/rules/goods-icons.js";

const ITEM_BAG = "icons/svg/item-bag.svg";
const MYSTERY_MAN = "icons/svg/mystery-man.svg";
const CAVALRY = "icons/environment/people/cavalry.webp";

/** A document as far as the pictures look at one, whose updateSource writes to it as Foundry's does. */
function fakeItem(type, name, img = ITEM_BAG, system = {}) {
	const item = { id: name, type, name, img, system };
	item.updateSource = (changes) => Object.assign(item, changes);
	return item;
}

function fakeActor(type, name, { img = MYSTERY_MAN, token = img, items = [] } = {}) {
	const actor = { id: name, uuid: `Actor.${name}`, type, name, img, prototypeToken: { texture: { src: token } }, items };
	actor.updateSource = (changes) => {
		for (const [key, value] of Object.entries(changes)) {
			if (key === "prototypeToken.texture.src") actor.prototypeToken.texture.src = value;
			else actor[key] = value;
		}
	};
	actor.update = vi.fn(async (changes) => actor.updateSource(changes));
	actor.updateEmbeddedDocuments = vi.fn(async () => []);
	return actor;
}

let hooks;
beforeEach(() => {
	hooks = {};
	globalThis.Hooks = { on: (name, fn) => (hooks[name] = fn) };
	globalThis.Item = { implementation: { DEFAULT_ICON: ITEM_BAG, updateDocuments: vi.fn(async () => []) } };
	globalThis.Actor = { implementation: { DEFAULT_ICON: MYSTERY_MAN } };
	globalThis.foundry = { utils: { mergeObject: (target, source) => Object.assign(target, source) } };
	registerGoodsPictures();
});

afterEach(() => {
	for (const name of ["Hooks", "Item", "Actor", "foundry", "game"]) delete globalThis[name];
});

describe("new items and actors", () => {
	it("gives a new item the picture its name calls for", () => {
		const sword = fakeItem("weapon", "Old sword");
		hooks.preCreateItem(sword);
		expect(sword.img).toBe(goodsIconPath("broadsword"));
	});

	it("leaves a picture somebody picked", () => {
		const sword = fakeItem("weapon", "Old sword", "worlds/mine/sword.webp");
		hooks.preCreateItem(sword);
		expect(sword.img).toBe("worlds/mine/sword.webp");
	});

	it("gives a new beast its picture, on its Token too, and the items it's made with theirs", () => {
		const bite = fakeItem("weapon", "Bite");
		const hound = fakeActor("npc", "Hound", { items: [bite] });
		hooks.preCreateActor(hound);
		expect(hound.img).toBe(goodsIconPath("hound"));
		expect(hound.prototypeToken.texture.src).toBe(goodsIconPath("hound"));
		expect(bite.img).toBe(goodsIconPath("fangs"));
	});

	it("leaves a Knight's portrait but still pictures what they carry", () => {
		const mace = fakeItem("weapon", "Polished mace");
		const knight = fakeActor("knight", "The True Knight", { img: "worlds/art/true.webp", items: [mace] });
		hooks.preCreateActor(knight);
		expect(knight.img).toBe("worlds/art/true.webp");
		expect(mace.img).toBe(goodsIconPath("flanged-mace"));
	});

	it("keeps a Token picture somebody picked", () => {
		const ox = fakeActor("npc", "Ox", { token: "worlds/tokens/ox.webp" });
		hooks.preCreateActor(ox);
		expect(ox.img).toBe(goodsIconPath("bull"));
		expect(ox.prototypeToken.texture.src).toBe("worlds/tokens/ox.webp");
	});
});

describe("renaming", () => {
	it("changes a picture nobody picked to the one the new name calls for", () => {
		const changes = { name: "Warhammer" };
		hooks.preUpdateItem(fakeItem("weapon", "Old sword", goodsIconPath("broadsword")), changes);
		expect(changes).toEqual({ name: "Warhammer", img: goodsIconPath("warhammer") });

		const actorChanges = { name: "Wolf" };
		hooks.preUpdateActor(fakeActor("npc", "Hound", { img: goodsIconPath("hound") }), actorChanges);
		expect(actorChanges).toEqual({ name: "Wolf", img: goodsIconPath("wolf-head"), "prototypeToken.texture.src": goodsIconPath("wolf-head") });
	});

	it("leaves a picked picture, and one changed in the same update", () => {
		const picked = { name: "Warhammer" };
		hooks.preUpdateItem(fakeItem("weapon", "Old sword", "worlds/mine/sword.webp"), picked);
		expect(picked).toEqual({ name: "Warhammer" });

		const both = { name: "Warhammer", img: "worlds/mine/hammer.webp" };
		hooks.preUpdateItem(fakeItem("weapon", "Old sword", goodsIconPath("broadsword")), both);
		expect(both.img).toBe("worlds/mine/hammer.webp");
	});
});

describe("pictureExistingGoods", () => {
	it("pictures the world's items and actors still wearing Foundry's own, and older steeds' rider", async () => {
		const sword = fakeItem("weapon", "Longsword");
		const picked = fakeItem("weapon", "Mace", "worlds/mine/mace.webp");
		const steed = fakeActor("npc", "Well-groomed steed (Alex)", { img: CAVALRY });
		const shield = fakeItem("armour", "Kite shield");
		const knight = fakeActor("knight", "Alex", { img: "worlds/art/alex.webp", items: [shield] });
		globalThis.game = { items: [sword, picked], actors: [steed, knight], packs: new Map() };

		await pictureExistingGoods();

		expect(Item.implementation.updateDocuments).toHaveBeenCalledWith([{ _id: "Longsword", img: goodsIconPath("broadsword") }]);
		expect(steed.update).toHaveBeenCalledWith({ img: goodsIconPath("horse-head"), "prototypeToken.texture.src": goodsIconPath("horse-head") });
		expect(knight.update).not.toHaveBeenCalled();
		expect(knight.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ _id: "Kite shield", img: goodsIconPath("shield") }]);
	});

	it("replaces the horse's head steeds briefly had of their own, whose file is gone", async () => {
		const steed = fakeActor("npc", "Loyal steed (Alex)", { img: "systems/mythic-bastionland-pwd/assets/icons/steed.svg" });
		globalThis.game = { items: [], actors: [steed], packs: new Map() };
		await pictureExistingGoods();
		expect(steed.update).toHaveBeenCalledWith({ img: goodsIconPath("horse-head"), "prototypeToken.texture.src": goodsIconPath("horse-head") });
	});

	it("leaves a rider picture on anything but a steed", async () => {
		const riders = fakeActor("npc", "Riders", { img: CAVALRY });
		globalThis.game = { items: [], actors: [riders], packs: new Map() };
		await pictureExistingGoods();
		expect(riders.update).not.toHaveBeenCalled();
	});

	it("pictures the Arms & Goods compendiums only while they're unlocked", async () => {
		const pick = fakeItem("weapon", "Pick");
		const mule = fakeActor("npc", "Mule");
		const packs = new Map([
			["world.bastionland-arms-and-goods", { collection: "world.bastionland-arms-and-goods", documentName: "Item", locked: false, getDocuments: async () => [pick] }],
			["world.bastionland-beasts-and-hirelings", { collection: "world.bastionland-beasts-and-hirelings", documentName: "Actor", locked: true, getDocuments: async () => [mule] }]
		]);
		globalThis.game = { items: [], actors: [], packs };

		await pictureExistingGoods();

		expect(Item.implementation.updateDocuments).toHaveBeenCalledWith([{ _id: "Pick", img: goodsIconPath("war-pick") }], { pack: "world.bastionland-arms-and-goods" });
		expect(mule.update).not.toHaveBeenCalled();
	});
});
