import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SYSTEM = "mythic-bastionland";
let folders = [];
const createFolder = vi.fn(async (data) => {
	const folder = { id: `f${folders.length + 1}`, ...data, getFlag: (scope, key) => data.flags?.[scope]?.[key] };
	folders.push(folder);
	return folder;
});
const createActor = vi.fn(async (data) => ({ id: "a1", ...data }));
const makeCompanions = vi.fn(async () => ({ made: ["steed actor"], steed: "Actor.steed", gone: new Set() }));
const markCompanions = vi.fn();

vi.mock("../../module/system-id.js", () => ({ SYSTEM_ID: "mythic-bastionland" }));
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
vi.mock("../../module/actions/abilities.js", () => ({ kitWeaponNames: () => ({}) }));
vi.mock("../../module/actions/knights.js", () => ({ worldKnights: () => [] }));
vi.mock("../../module/actions/property.js", () => ({ makeCompanions: (...args) => makeCompanions(...args), markCompanions: (...args) => markCompanions(...args) }));

const { NPC_FOLDER_FLAG, makeNpcKnight, npcFolder } = await import("../../module/actions/npc-knights.js");

const index = {
	knights: [{ roll: "3-07", name: "The Silk Knight", path: "silk.webp", property: [], ability: null, passion: null }],
	seers: [{ roll: "3-07", name: "The Loom Seer" }]
};

beforeEach(() => {
	globalThis.game = { user: { isGM: true }, folders: { find: (test) => folders.find(test) } };
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
	for (const name of ["game", "foundry", "Actor", "Roll"]) delete globalThis[name];
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
		expect(data.type).toBe("knight");
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
