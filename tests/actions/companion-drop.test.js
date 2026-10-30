import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

/**
 * An NPC dropped on a Knight's sheet becomes their steed or their follower
 * (p8, p12), and a Slain steed is no steed (p10).
 */

/** What the yes-or-no question answers, and which role the radio list picks. */
let confirmed;
let role;

vi.mock("../../module/apps/ui.js", () => ({ confirmDialog: vi.fn(async () => confirmed), inputDialog: vi.fn(async () => null) }));
vi.mock("../../module/apps/actor-pick.js", () => ({ chooseActor: vi.fn(async (roles) => roles.find((one) => one.key === role) ?? null) }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => ({})), statLabels: () => ({}), t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));
vi.mock("../../module/actions/time.js", () => ({ chooseCompany: vi.fn(async () => null) }));
vi.mock("../../module/actions/knights.js", () => ({ COMPANY_KNIGHT_FLAG: "companyKnight", companyKnights: () => [], inCompany: () => true, worldKnights: () => [] }));
vi.mock("../../module/actions/solo.js", () => ({ SOLO_CHANGED_HOOK: "soloChanged", isSolo: () => false }));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineKnighted: vi.fn(), timelineSquireTaken: vi.fn() }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => null }));

const { dropCompanion, takeSteed } = await import("../../module/actions/steeds.js");
const { chooseActor } = await import("../../module/apps/actor-pick.js");
const { confirmDialog, inputDialog } = await import("../../module/apps/ui.js");

/**
 * One actor as the drop reads and writes it.
 * @param {object} options
 */
function actor({ id, name, type = "npc", system = {}, flags = {}, items = [], ownership = {}, isOwner = true, pack = null }) {
	const made = {
		id,
		uuid: pack ? `Compendium.${pack}.Actor.${id}` : `Actor.${id}`,
		documentName: "Actor",
		name,
		type,
		pack,
		system: { steed: "", slain: false, virtues: { vig: { value: 8, max: 8 } }, ...system },
		flags,
		items,
		ownership,
		isOwner,
		folder: null,
		sheet: { render: vi.fn() },
		getFlag: (scope, key) => flags[`${scope}.${key}`],
		update: vi.fn(async (changes) => {
			for (const [key, value] of Object.entries(changes)) {
				if (key.startsWith("system.")) made.system[key.slice(7)] = value;
				else if (key.startsWith("flags.")) flags[key.slice(6)] = value;
				else made[key] = value;
			}
			return made;
		})
	};
	return made;
}

const knight = (id = "k1", extra = {}) => actor({ id, name: `Sir ${id}`, type: "knight", ownership: { default: 0, alys: 3 }, ...extra });
const trample = [{ type: "weapon", system: { trample: true } }];
const companionOf = `${SYSTEM_ID}.companionOf`;
const follower = `${SYSTEM_ID}.follower`;

beforeEach(() => {
	confirmed = true;
	role = null;
	globalThis.game = {
		actors: Object.assign([], { get(id) { return this.find((one) => one.id === id) ?? null; }, fromCompendium: (doc) => ({ name: doc.name, type: doc.type, system: { ...doc.system } }) }),
		user: { isGM: true, can: () => true },
		packs: { get: () => null }
	};
	globalThis.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
	globalThis.fromUuidSync = (uuid) => game.actors.find((one) => one.uuid === uuid) ?? null;
	globalThis.foundry = { utils: { deepClone: (value) => JSON.parse(JSON.stringify(value)) } };
	globalThis.Actor = {
		implementation: {
			create: vi.fn(async (data) => {
				const made = actor({ id: `new${game.actors.length}`, name: data.name, type: data.type, system: data.system, ownership: data.ownership ?? {} });
				game.actors.push(made);
				return made;
			})
		}
	};
});

afterEach(() => {
	for (const key of ["game", "ui", "fromUuidSync", "foundry", "Actor"]) delete globalThis[key];
	vi.clearAllMocks();
});

const world = (...actors) => game.actors.push(...actors);

describe("dropCompanion", () => {
	it("rides a plain mount without asking, and hands it the Knight's players when the Referee does it", async () => {
		const sir = knight();
		const bayard = actor({ id: "h1", name: "Bayard", items: trample, ownership: { default: 0 } });
		world(sir, bayard);
		expect(await dropCompanion(sir, bayard)).toBe(bayard);
		expect(chooseActor).not.toHaveBeenCalled();
		expect(sir.system.steed).toBe(bayard.uuid);
		expect(bayard.update).toHaveBeenCalledWith({ ownership: { default: 0, alys: 3 } });
	});

	it("asks steed or follower of anybody else, from one radio list", async () => {
		const sir = knight();
		const guide = actor({ id: "g1", name: "The Guide" });
		world(sir, guide);
		role = "follower";
		expect(await dropCompanion(sir, guide)).toBe(guide);
		expect(chooseActor.mock.calls[0][0].map(({ key }) => key)).toEqual(["steed", "follower"]);
		expect(guide.getFlag(SYSTEM_ID, "companionOf")).toBe("k1");
		expect(guide.getFlag(SYSTEM_ID, "follower")).toBe(true);
		expect(sir.system.steed).toBe("");
	});

	it("does nothing when that question is closed", async () => {
		const sir = knight();
		const guide = actor({ id: "g1", name: "The Guide" });
		world(sir, guide);
		expect(await dropCompanion(sir, guide)).toBeNull();
		expect(guide.update).not.toHaveBeenCalled();
		expect(sir.update).not.toHaveBeenCalled();
	});

	it("gives a Squire a steed without asking, as they take on no followers", async () => {
		const ned = knight("s1", { system: { isSquire: true } });
		const guide = actor({ id: "g1", name: "The Guide" });
		world(ned, guide);
		await dropCompanion(ned, guide);
		expect(chooseActor).not.toHaveBeenCalled();
		expect(ned.system.steed).toBe(guide.uuid);
	});

	it("asks before replacing a living steed, but not a Slain one", async () => {
		const sir = knight("k1", { system: { steed: "Actor.h0" } });
		const old = actor({ id: "h0", name: "Old Grey", items: trample });
		const bayard = actor({ id: "h1", name: "Bayard", items: trample });
		world(sir, old, bayard);

		confirmed = false;
		expect(await dropCompanion(sir, bayard)).toBeNull();
		expect(sir.system.steed).toBe(old.uuid);

		old.system.slain = true;
		vi.mocked(confirmDialog).mockClear();
		expect(await dropCompanion(sir, bayard)).toBe(bayard);
		expect(confirmDialog).not.toHaveBeenCalled();
		expect(sir.system.steed).toBe(bayard.uuid);
	});

	it("takes a steed from the Knight who rode it, asked first, so no two Knights ride one", async () => {
		const sir = knight();
		const other = knight("k2", { system: { steed: "Actor.h1" } });
		const bayard = actor({ id: "h1", name: "Bayard", items: trample });
		world(sir, other, bayard);
		await dropCompanion(sir, bayard);
		expect(confirmDialog).toHaveBeenCalledTimes(1);
		expect(sir.system.steed).toBe(bayard.uuid);
		expect(other.system.steed).toBe("");
	});

	it("won't take a steed from a Knight this user doesn't own", async () => {
		game.user.isGM = false;
		const sir = knight();
		const other = knight("k2", { system: { steed: "Actor.h1" }, isOwner: false });
		const bayard = actor({ id: "h1", name: "Bayard", items: trample });
		world(sir, other, bayard);
		expect(await dropCompanion(sir, bayard)).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith('steed.riddenBy {"steed":"Bayard","rider":"Sir k2"}');
		expect(sir.update).not.toHaveBeenCalled();
	});

	it("moves a follower from another Knight, asked first", async () => {
		const sir = knight();
		const other = knight("k2");
		const guide = actor({ id: "g1", name: "The Guide", flags: { [companionOf]: "k2" } });
		world(sir, other, guide);
		role = "follower";
		await dropCompanion(sir, guide);
		expect(confirmDialog.mock.calls[0][0].message[0]).toContain("follower.leaves");
		expect(guide.getFlag(SYSTEM_ID, "companionOf")).toBe("k1");
	});

	it("won't let a player make a follower of somebody they don't own", async () => {
		game.user.isGM = false;
		const sir = knight();
		const guide = actor({ id: "g1", name: "The Guide", isOwner: false });
		world(sir, guide);
		role = "follower";
		expect(await dropCompanion(sir, guide)).toBeNull();
		expect(guide.update).not.toHaveBeenCalled();
	});

	it("brings a hireling from a compendium into the world first", async () => {
		const sir = knight();
		world(sir);
		const hireling = actor({ id: "c1", name: "Torchbearer", pack: "world.bastionland-beasts-and-hirelings" });
		role = "follower";
		const taken = await dropCompanion(sir, hireling);
		expect(Actor.implementation.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Torchbearer", ownership: { default: 0, alys: 3 } }));
		expect(taken).not.toBe(hireling);
		expect(taken.getFlag(SYSTEM_ID, "companionOf")).toBe("k1");
	});

	it("refuses a Warband", async () => {
		const sir = knight();
		const band = actor({ id: "w1", name: "Bandits", system: { scale: "warband" } });
		world(sir, band);
		expect(await dropCompanion(sir, band)).toBeNull();
		expect(chooseActor).not.toHaveBeenCalled();
		expect(ui.notifications.warn).toHaveBeenCalled();
	});

	it("marks a follower so replacing the Knight's Property keeps them", async () => {
		const sir = knight();
		const guide = actor({ id: "g1", name: "The Guide" });
		world(sir, guide);
		role = "follower";
		await dropCompanion(sir, guide);
		expect(guide.flags[follower]).toBe(true);
	});
});

describe("takeSteed", () => {
	it("opens a living steed's sheet, but offers a new steed in place of a Slain one", async () => {
		const sir = knight("k1", { system: { steed: "Actor.h1" } });
		const bayard = actor({ id: "h1", name: "Bayard" });
		world(sir, bayard);
		expect(await takeSteed(sir)).toBe(bayard);
		expect(bayard.sheet.render).toHaveBeenCalled();
		expect(inputDialog).not.toHaveBeenCalled();

		bayard.system.slain = true;
		bayard.sheet.render.mockClear();
		await takeSteed(sir);
		expect(bayard.sheet.render).not.toHaveBeenCalled();
		expect(inputDialog).toHaveBeenCalled();
	});
});

describe("clearCompanions", () => {
	it("sweeps away what the Knight's Property made, but keeps a follower who joined them", async () => {
		const { clearCompanions } = await import("../../module/actions/property.js");
		const sir = knight();
		const hawk = actor({ id: "n1", name: "Hawk", flags: { [companionOf]: "k1" } });
		const guide = actor({ id: "g1", name: "The Guide", flags: { [companionOf]: "k1", [follower]: true } });
		for (const npc of [hawk, guide]) npc.canUserModify = () => true;
		world(sir, hawk, guide);
		Actor.implementation.deleteDocuments = vi.fn(async () => []);
		expect(await clearCompanions(sir)).toEqual([hawk.uuid]);
		expect(Actor.implementation.deleteDocuments).toHaveBeenCalledWith(["n1"]);
	});
});
