import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
vi.mock("../../module/compat.js", () => ({ deletionEntry: (path) => [path, null] }));
vi.mock("../../module/actions/knights.js", () => ({ worldKnights: () => [] }));
vi.mock("../../module/actions/npc-knights.js", () => ({ npcFolder: vi.fn(async () => null) }));

const { registerKnightFolderHooks } = await import("../../module/actions/knight-folders.js");

/** The hooks registered, by name, and whether the Company's folder can be made. */
let hooks;
let companyRefused;

/** Folders as Foundry makes them, flagged as asked. */
const create = vi.fn(async (data) => {
	if (data.flags[SYSTEM_ID].company && companyRefused) throw new Error("refused");
	const folder = { ...data, id: `f${game.folders.length + 1}`, getFlag: (scope, key) => data.flags[scope]?.[key] };
	game.folders.push(folder);
	return folder;
});

/** A Knight just made at the top of the directory, waiting for a folder. */
const newKnight = () => ({ id: "k1", name: "Sir Tal", type: "knight", system: {}, getFlag: (_scope, key) => key === "wantsFolder", update: vi.fn() });

beforeEach(() => {
	hooks = new Map();
	companyRefused = false;
	create.mockClear();
	globalThis.Hooks = { on: (name, fn) => hooks.set(name, fn) };
	globalThis.game = { users: { activeGM: { isSelf: true } }, folders: [], actors: { has: () => true } };
	globalThis.foundry = { utils: { getDocumentClass: () => ({ create }) } };
	vi.spyOn(console, "warn").mockImplementation(() => {});
	registerKnightFolderHooks();
});

afterEach(() => {
	delete globalThis.Hooks;
	delete globalThis.game;
	delete globalThis.foundry;
	vi.restoreAllMocks();
});

describe("a Knight's own folder", () => {
	it("goes inside the Company's folder", async () => {
		const knight = newKnight();
		hooks.get("createActor")(knight);
		await vi.waitFor(() => expect(knight.update).toHaveBeenCalled());
		const [company, own] = game.folders;
		expect(own).toMatchObject({ name: "Sir Tal", folder: company.id });
		expect(knight.update.mock.calls[0][0].folder).toBe(own.id);
	});

	it("isn't made at the top when the Company's folder can't be, so the Knight is left to file later", async () => {
		companyRefused = true;
		const knight = newKnight();
		hooks.get("createActor")(knight);
		await vi.waitFor(() => expect(create).toHaveBeenCalled());
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(create).toHaveBeenCalledTimes(1);
		expect(game.folders).toEqual([]);
		expect(knight.update).not.toHaveBeenCalled();
	});
});
