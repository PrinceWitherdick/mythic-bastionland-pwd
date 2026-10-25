import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SYSTEM = "mythic-bastionland";
let folders = [];
const createFolder = vi.fn(async (data) => {
	const folder = {
		id: `f${folders.length + 1}`,
		...data,
		getFlag: (scope, key) => data.flags?.[scope]?.[key],
		getSubfolders: () => folders.filter((other) => other.ancestors?.includes(folder))
	};
	folders.push(folder);
	return folder;
});
const createActor = vi.fn(async (data) => ({ id: "a1", ...data }));
const makeCompanions = vi.fn(async () => ({ made: ["steed actor"], steed: "Actor.steed", gone: new Set() }));
const markCompanions = vi.fn();

vi.mock("../../module/system-id.js", () => ({ SYSTEM_ID: "mythic-bastionland" }));
const warn = vi.fn();
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key, warn: (...args) => warn(...args) }));
vi.mock("../../module/actions/abilities.js", () => ({ kitWeaponNames: () => ({}) }));
/** The world's actors, as worldKnights reads them. */
let world = [];
vi.mock("../../module/actions/knights.js", () => ({
	COMPANY_KNIGHT_FLAG: "companyKnight",
	worldKnights: (keep = () => true) => world.filter((actor) => ["knight", "npcKnight"].includes(actor.type) && keep(actor))
}));
vi.mock("../../module/actions/ledger.js", () => ({ withoutLedger: () => ({ ledgerLeftOut: true }) }));
vi.mock("../../module/actions/property.js", () => ({ makeCompanions: (...args) => makeCompanions(...args), markCompanions: (...args) => markCompanions(...args) }));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineJoined: () => null }));

const { NPC_FOLDER_FLAG, convertImportedNpcKnights, convertNpcKnights, joinCompany, makeNpcKnight, npcFolder, onJoinQuery, servedBySquire, setKnightKind } = await import("../../module/actions/npc-knights.js");

const index = {
	knights: [{ roll: "3-07", name: "The Silk Knight", path: "silk.webp", property: [], ability: null, passion: null }],
	seers: [{ roll: "3-07", name: "The Loom Seer" }]
};

beforeEach(() => {
	globalThis.game = { user: { isGM: true }, folders: { find: (test) => folders.find(test), get contents() {
		return folders;
	} } };
	globalThis.ui = { notifications: { info: vi.fn() } };
	globalThis.foundry = { utils: { getDocumentClass: () => ({ create: createFolder }), expandObject: (flat) => {
		const out = {};
		for (const [path, value] of Object.entries(flat)) {
			const keys = path.split(".");
			let at = out;
			for (const key of keys.slice(0, -1)) at = at[key] ??= {};
			at[keys.at(-1)] = value;
		}
		return out;
	} } };
	globalThis.Actor = { implementation: { create: createActor } };
	globalThis.Roll = class {
		constructor(formula) {
			this.formula = formula;
		}
		async evaluate() {
			this.total = 9;
			return this;
		}
	};
});

afterEach(() => {
	folders = [];
	world = [];
	for (const name of ["game", "foundry", "Actor", "Roll", "ui"]) delete globalThis[name];
	vi.clearAllMocks();
});

describe("the NPCs folder", () => {
	it("is made once, and found again by its flag however it's renamed", async () => {
		const made = await npcFolder();
		expect(createFolder).toHaveBeenCalledWith({ name: "npcFolder.name", type: "Actor", flags: { [SYSTEM]: { [NPC_FOLDER_FLAG]: true } } });
		made.name = "Rivals";
		expect(await npcFolder()).toBe(made);
		expect(createFolder).toHaveBeenCalledTimes(1);
	});
});

describe("an NPC Knight", () => {
	it("is one of the book's Knights, rolled as a Ruler and kept with their steed in the NPCs folder", async () => {
		const knight = await makeNpcKnight("3-07", index);
		const data = createActor.mock.calls[0][0];
		expect(data.type).toBe("npcKnight");
		expect(data.folder).toBe("f1");
		expect(data.name).toBeTruthy();
		expect(data.system.knightType).toBe("Silk");
		expect(data.system.seer).toBe("The Loom Seer");
		expect(data.system.steed).toBe("Actor.steed");
		expect(data.img).toBe("silk.webp");
		// No players own them, so they never join the Company.
		expect(data).not.toHaveProperty("ownership");
		expect(makeCompanions.mock.calls[0][1]).toEqual({ folder: "f1" });
		expect(markCompanions).toHaveBeenCalledWith(["steed actor"], knight);
	});

	it("is the Referee's to make", async () => {
		game.user.isGM = false;
		expect(await makeNpcKnight("3-07", index)).toBeNull();
		expect(createActor).not.toHaveBeenCalled();
	});
});

/**
 * A Knight in the world, written through update.
 * @param {object} details
 * @returns {object}
 */
function worldKnight({ id = "k1", name = "Sir Brand", type = "knight", folder = null, isSquire = false, hasPlayerOwner = false, flags = {} } = {}) {
	const actor = {
		id,
		name,
		type,
		folder: folder && { id: folder },
		hasPlayerOwner,
		system: { isSquire, knightType: "Silk", toObject: () => ({ isSquire, knightType: "Silk" }) },
		getFlag: (scope, key) => flags[key],
		update: vi.fn(async () => actor)
	};
	return actor;
}

describe("changing a Knight's kind", () => {
	it("makes them an NPC Knight with all they have, the old solo mark gone, unlogged", async () => {
		const actor = worldKnight({ flags: { companyKnight: false } });
		expect(await setKnightKind(actor, true)).toBe(true);
		const [changes, options] = actor.update.mock.calls[0];
		expect(changes.type).toBe("npcKnight");
		expect(changes["==system"]).toEqual({ isSquire: false, knightType: "Silk" });
		expect(changes).toHaveProperty(["flags.mythic-bastionland.-=companyKnight"], null);
		expect(options).toEqual({ ledgerLeftOut: true });
	});

	it("brings an NPC Knight into the Company as a Knight, even one already given to a player", async () => {
		const actor = worldKnight({ type: "npcKnight" });
		expect(await setKnightKind(actor, false)).toBe(true);
		expect(actor.update.mock.calls[0][0].type).toBe("knight");
		const given = worldKnight({ type: "npcKnight", hasPlayerOwner: true });
		expect(await setKnightKind(given, false)).toBe(true);
	});

	it("leaves a Squire, a player's Knight and one already of that kind alone, and is the Referee's to do", async () => {
		const squire = worldKnight({ isSquire: true });
		const owned = worldKnight({ hasPlayerOwner: true });
		const already = worldKnight({ type: "npcKnight" });
		expect(await setKnightKind(squire, true)).toBe(false);
		expect(await setKnightKind(owned, true)).toBe(false);
		expect(await setKnightKind(already, true)).toBe(false);
		game.user.isGM = false;
		expect(await setKnightKind(worldKnight(), true)).toBe(false);
		for (const actor of [squire, owned, already]) expect(actor.update).not.toHaveBeenCalled();
	});
});

describe("a Knight a Squire serves", () => {
	afterEach(() => {
		delete globalThis.fromUuidSync;
	});

	it("isn't made an NPC Knight until the Squire is unlinked or Knighted (p7)", async () => {
		const squire = { documentName: "Actor", system: { isSquire: true } };
		globalThis.fromUuidSync = (uuid) => (uuid === "Actor.sq" ? squire : null);
		const actor = worldKnight();
		actor.system.squire = "Actor.sq";
		expect(servedBySquire(actor)).toBe(true);
		expect(await setKnightKind(actor, true)).toBe(false);
		expect(actor.update).not.toHaveBeenCalled();

		squire.system.isSquire = false;
		expect(servedBySquire(actor)).toBe(false);
		expect(await setKnightKind(actor, true)).toBe(true);
	});

	it("doesn't count a Squire link to nobody", () => {
		globalThis.fromUuidSync = () => null;
		const actor = worldKnight();
		actor.system.squire = "Actor.gone";
		expect(servedBySquire(actor)).toBe(false);
	});
});

describe("a player taking up their NPC Knight", () => {
	const player = { id: "u1", isGM: false };

	it("asks the active Referee to make them one of the Company", async () => {
		const actor = worldKnight({ type: "npcKnight", hasPlayerOwner: true });
		const query = vi.fn(async () => true);
		game.user.isGM = false;
		game.users = { activeGM: { query } };
		expect(await joinCompany(actor)).toBe(true);
		expect(query).toHaveBeenCalledWith("mythic-bastionland.npcKnightJoins", { actorId: "k1" }, { timeout: 10000 });
		expect(actor.update).not.toHaveBeenCalled();
	});

	it("isn't taken up with no Referee to ask, or when the Referee refuses", async () => {
		const actor = worldKnight({ type: "npcKnight", hasPlayerOwner: true });
		game.user.isGM = false;
		game.users = { activeGM: null };
		expect(await joinCompany(actor)).toBe(false);
		game.users = { activeGM: { query: vi.fn(async () => false) } };
		expect(await joinCompany(actor)).toBe(false);
		expect(warn.mock.calls.map(([key]) => key)).toEqual(["npcKnight.joinNeedsReferee", "npcKnight.joinRefused"]);
	});

	it("is answered by the Referee only for an NPC Knight the asker owns", async () => {
		const owned = worldKnight({ id: "k1", type: "npcKnight", hasPlayerOwner: true });
		owned.testUserPermission = (user) => user === player;
		const other = worldKnight({ id: "k2", type: "npcKnight" });
		other.testUserPermission = () => false;
		game.actors = { get: (id) => [owned, other].find((actor) => actor.id === id) };
		expect(await onJoinQuery({ actorId: "k2" }, { user: player })).toBe(false);
		expect(await onJoinQuery({ actorId: "k1" }, { user: player })).toBe(true);
		expect(owned.update.mock.calls[0][0].type).toBe("knight");
		expect(other.update).not.toHaveBeenCalled();
	});
});

describe("the Referee's Knights from before NPC Knights", () => {
	it("become NPC Knights: those in the NPCs folder or a folder in it, and those a solo Referee marked as their own", async () => {
		const npcs = await npcFolder();
		folders.push({ id: "inner", type: "Actor", ancestors: [npcs], getFlag: () => undefined });
		const inFolder = worldKnight({ id: "a", folder: npcs.id });
		const inInner = worldKnight({ id: "b", folder: "inner" });
		const marked = worldKnight({ id: "c", flags: { companyKnight: false } });
		const company = worldKnight({ id: "d" });
		const squire = worldKnight({ id: "e", folder: npcs.id, isSquire: true });
		const held = worldKnight({ id: "f", folder: npcs.id, hasPlayerOwner: true });
		world = [inFolder, inInner, marked, company, squire, held];
		await convertNpcKnights();
		for (const actor of [inFolder, inInner, marked]) expect(actor.update.mock.calls[0][0].type).toBe("npcKnight");
		for (const actor of [company, squire, held]) expect(actor.update).not.toHaveBeenCalled();
		expect(ui.notifications.info).toHaveBeenCalledTimes(1);
	});

	it("are made NPC Knights as they're brought in, when marked as the Referee's own and brought in here", async () => {
		const hooks = [];
		globalThis.Hooks = { on: (name, fn) => hooks.push([name, fn]) };
		game.user.id = "me";
		convertImportedNpcKnights();
		const [[name, onCreate]] = hooks;
		expect(name).toBe("createActor");
		const marked = worldKnight({ flags: { companyKnight: false } });
		const byAnother = worldKnight({ flags: { companyKnight: false } });
		const plain = worldKnight();
		const squire = worldKnight({ isSquire: true, flags: { companyKnight: false } });
		onCreate(marked, {}, "me");
		onCreate(byAnother, {}, "them");
		onCreate(plain, {}, "me");
		onCreate(squire, {}, "me");
		await vi.waitFor(() => expect(marked.update).toHaveBeenCalledOnce());
		expect(marked.update.mock.calls[0][0].type).toBe("npcKnight");
		for (const actor of [byAnother, plain, squire]) expect(actor.update).not.toHaveBeenCalled();
		delete globalThis.Hooks;
	});

	it("needs no NPCs folder, and makes none", async () => {
		world = [worldKnight()];
		await convertNpcKnights();
		expect(createFolder).not.toHaveBeenCalled();
		expect(world[0].update).not.toHaveBeenCalled();
		expect(ui.notifications.info).not.toHaveBeenCalled();
	});
});
