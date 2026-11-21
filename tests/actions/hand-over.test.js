import { beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => ({})), t: (key) => key, warn: vi.fn() }));
// Like the real one, with no GM there is nobody to answer.
vi.mock("../../module/ask-gm-warn.js", () => ({
	askActiveGMOrWarn: vi.fn(async () => (globalThis.game?.users?.activeGM ? answered : false))
}));
vi.mock("../../module/compat.js", () => ({ queryAsker: (context) => context?.user ?? null }));

const { handOver, isHandOver, onHandOverQuery } = await import("../../module/actions/hand-over.js");
const { askActiveGMOrWarn } = await import("../../module/ask-gm-warn.js");
const { postCard, warn } = await import("../../module/chat/cards.js");

/** What the active GM answers, and the world's actors. */
let answered;
let world;

/** A character, as Foundry gives one: its items, and a create that can refuse (as a second Remedy is). */
const actor = (name, { isOwner = true, players = true, owners = [], refuses = false } = {}) => {
	const self = {
		documentName: "Actor",
		name,
		uuid: `Actor.${name}`,
		isOwner,
		hasPlayerOwner: players,
		testUserPermission: (user) => owners.includes(user.id),
		items: new Map(),
		createEmbeddedDocuments: vi.fn(async (_type, [data]) => {
			if (refuses) return [];
			const made = { ...data, id: data._id, parent: self };
			self.items.set(made.id, made);
			return [made];
		})
	};
	world.push(self);
	return self;
};

const carried = (carrier, type = "weapon", id = "sword") => {
	const item = {
		documentName: "Item",
		id,
		uuid: `${carrier.uuid}.Item.${id}`,
		name: "Longsword",
		type,
		parent: carrier,
		get isOwner() { return carrier.isOwner; },
		toObject: () => ({ _id: id, name: "Longsword", type }),
		delete: vi.fn(async () => carrier.items.delete(id))
	};
	carrier.items.set(id, item);
	return item;
};

beforeEach(() => {
	vi.clearAllMocks();
	answered = false;
	world = [];
	globalThis.game = { user: { isGM: true }, users: { activeGM: { isSelf: true } } };
	globalThis.fromUuidSync = (uuid) => world.find((one) => one.uuid === uuid) ?? world.flatMap((one) => [...one.items.values()]).find((item) => item.uuid === uuid) ?? null;
});

describe("isHandOver", () => {
	it("is a possession dropped from another character", () => {
		const alys = actor("Alys");
		const bram = actor("Bram");
		expect(isHandOver(carried(alys), bram)).toBe(true);
		expect(isHandOver(carried(alys, "armour", "coat"), bram)).toBe(true);
		expect(isHandOver(carried(alys, "gear", "rope"), bram)).toBe(true);
	});

	it("leaves sorting, the sidebar, compendiums and a Knight's Abilities, Passions and Scars to Foundry", () => {
		const alys = actor("Alys");
		const bram = actor("Bram");
		expect(isHandOver(carried(alys), alys)).toBe(false);
		expect(isHandOver({ type: "weapon", parent: null }, bram)).toBe(false);
		for (const type of ["ability", "passion", "scar"]) expect(isHandOver(carried(alys, type, type), bram)).toBe(false);
	});

	it("copies a possession dragged off an actor in a compendium, rather than taking it from the pack", () => {
		const pattern = actor("Brigand");
		pattern.pack = "mythic-bastionland.npcs";
		const sword = carried(pattern);
		sword.pack = pattern.pack;
		expect(isHandOver(sword, actor("Bram"))).toBe(false);
	});
});

describe("handOver", () => {
	it("moves it, leaving no copy with the giver, and tells the table", async () => {
		const alys = actor("Alys");
		const bram = actor("Bram");
		const sword = carried(alys);
		const made = await handOver(sword, bram);
		expect(bram.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ _id: "sword", name: "Longsword", type: "weapon" }], { keepId: true });
		expect(sword.delete).toHaveBeenCalled();
		expect(made.parent).toBe(bram);
		expect(postCard).toHaveBeenCalledWith(bram, "note", expect.objectContaining({ text: "handOver.card" }), {});
	});

	it("takes nothing from the giver where it couldn't be made, as with a second Remedy", async () => {
		const sword = carried(actor("Alys"));
		expect(await handOver(sword, actor("Bram", { refuses: true }))).toBeNull();
		expect(sword.delete).not.toHaveBeenCalled();
		expect(postCard).not.toHaveBeenCalled();
	});

	it("tells only the Referee of a move between two of their own", async () => {
		await handOver(carried(actor("Brigand", { players: false })), actor("Ogre", { players: false }));
		expect(postCard).toHaveBeenCalledWith(expect.anything(), "note", expect.anything(), { mode: "gm" });
	});

	it("won't let anybody take what isn't theirs to hand over", async () => {
		const sword = carried(actor("Alys", { isOwner: false }));
		const bram = actor("Bram");
		expect(await handOver(sword, bram)).toBeNull();
		expect(warn).toHaveBeenCalledWith("handOver.notYours", { item: "Longsword", from: "Alys", to: "Bram" });
		expect(bram.createEmbeddedDocuments).not.toHaveBeenCalled();
		expect(sword.delete).not.toHaveBeenCalled();
	});

	it("has the Referee hand a player's possession to somebody they don't play", async () => {
		game.user.isGM = false;
		game.users.activeGM = { isSelf: false };
		const sword = carried(actor("Alys"));
		const bram = actor("Bram", { isOwner: false });
		answered = "sword";
		bram.items.set("sword", { id: "sword", parent: bram });
		const made = await handOver(sword, bram);
		expect(askActiveGMOrWarn).toHaveBeenCalledWith(`${SYSTEM_ID}.handOver`, { itemUuid: sword.uuid, toUuid: bram.uuid }, expect.any(String), expect.objectContaining({ absent: "handOver.needsReferee", refused: "handOver.refused" }));
		expect(made.parent).toBe(bram);
		// The Referee took it from the giver as they gave it.
		expect(sword.delete).not.toHaveBeenCalled();
	});

	it("keeps it with the giver when there's no Referee to ask", async () => {
		game.user.isGM = false;
		game.users.activeGM = null;
		const sword = carried(actor("Alys"));
		expect(await handOver(sword, actor("Bram", { isOwner: false }))).toBeNull();
		expect(sword.delete).not.toHaveBeenCalled();
	});
});

describe("onHandOverQuery", () => {
	const player = { id: "p1" };

	it("moves a possession the asker carries to somebody they can see", async () => {
		const alys = actor("Alys", { owners: ["p1"] });
		const bram = actor("Bram", { owners: ["p1"] });
		const sword = carried(alys);
		expect(await onHandOverQuery({ itemUuid: sword.uuid, toUuid: bram.uuid }, { user: player })).toBe("sword");
		expect(sword.delete).toHaveBeenCalled();
		expect(bram.items.has("sword")).toBe(true);
	});

	it("refuses what the asker doesn't carry, or a character they can't see", async () => {
		const alys = actor("Alys", { owners: [] });
		const bram = actor("Bram", { owners: ["p1"] });
		expect(await onHandOverQuery({ itemUuid: carried(alys).uuid, toUuid: bram.uuid }, { user: player })).toBe(false);
		const cara = actor("Cara", { owners: ["p1"] });
		const hidden = actor("Hidden", { owners: [] });
		expect(await onHandOverQuery({ itemUuid: carried(cara, "weapon", "axe").uuid, toUuid: hidden.uuid }, { user: player })).toBe(false);
		expect(hidden.createEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("refuses an Ability, or anything asked of a client that isn't a GM's", async () => {
		const alys = actor("Alys", { owners: ["p1"] });
		const bram = actor("Bram", { owners: ["p1"] });
		expect(await onHandOverQuery({ itemUuid: carried(alys, "ability", "gift").uuid, toUuid: bram.uuid }, { user: player })).toBe(false);
		game.user.isGM = false;
		expect(await onHandOverQuery({ itemUuid: carried(alys).uuid, toUuid: bram.uuid }, { user: player })).toBe(false);
	});
});
