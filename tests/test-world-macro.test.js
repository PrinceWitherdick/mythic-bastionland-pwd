import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEST_WORLD_COMMAND, TEST_WORLD_MACRO_NAME, seedTestWorldMacro, syncTestWorldMacro } from "../module/actions/test-world-macro.js";
import { SYSTEM_ID } from "../module/system-id.js";

const NONE = 0;

/**
 * A world as the test world macro sees it.
 * @returns {{createMacro: Function, createFolder: Function, assign: Function}}
 */
function installWorld({ isGM = true, macro = null, folder = null } = {}) {
	const createMacro = vi.fn();
	const createFolder = vi.fn(async (data) => ({ id: "new-folder", ...data }));
	const assign = vi.fn();
	globalThis.game = {
		user: { isGM, hotbar: {}, assignHotbarMacro: assign },
		macros: { find: (test) => [macro].filter(Boolean).find(test) },
		folders: { find: (test) => [folder].filter(Boolean).find(test) }
	};
	globalThis.CONFIG = { Macro: { documentClass: { create: createMacro } }, Folder: { documentClass: { create: createFolder } } };
	globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE } };
	return { createMacro, createFolder, assign };
}

/** A world macro carrying the system's flag. */
const worldMacro = ({ command = TEST_WORLD_COMMAND } = {}) => ({
	id: "test-world", command, update: vi.fn(), getFlag: (scope, key) => scope === SYSTEM_ID && key === "testWorldMacro"
});

afterEach(() => {
	for (const key of ["game", "CONFIG", "CONST"]) delete globalThis[key];
});

describe("seedTestWorldMacro", () => {
	it("files one macro in a For Testing Purposes folder, hidden from players and off the hotbar", async () => {
		const { createMacro, createFolder, assign } = installWorld();
		await seedTestWorldMacro();
		expect(createFolder).toHaveBeenCalledWith({ name: "For Testing Purposes", type: "Macro", flags: { [SYSTEM_ID]: { testingFolder: true } } });
		expect(createMacro).toHaveBeenCalledOnce();
		expect(createMacro.mock.calls[0][0]).toMatchObject({
			name: TEST_WORLD_MACRO_NAME,
			type: "script",
			command: TEST_WORLD_COMMAND,
			folder: "new-folder",
			ownership: { default: NONE },
			flags: { [SYSTEM_ID]: { testWorldMacro: true } }
		});
		expect(assign).not.toHaveBeenCalled();
	});

	it("files it in the folder the world already has, whatever it's called now", async () => {
		const folder = { id: "kept", type: "Macro", getFlag: (scope, key) => scope === SYSTEM_ID && key === "testingFolder" };
		const { createMacro, createFolder } = installWorld({ folder });
		await seedTestWorldMacro();
		expect(createFolder).not.toHaveBeenCalled();
		expect(createMacro.mock.calls[0][0].folder).toBe("kept");
	});

	it("leaves a world that has the macro alone", async () => {
		const { createMacro, createFolder } = installWorld({ macro: worldMacro() });
		await seedTestWorldMacro();
		expect(createMacro).not.toHaveBeenCalled();
		expect(createFolder).not.toHaveBeenCalled();
	});
});

describe("syncTestWorldMacro", () => {
	it("brings an old script up to date", async () => {
		const stale = worldMacro({ command: "old" });
		installWorld({ macro: stale });
		await syncTestWorldMacro();
		expect(stale.update).toHaveBeenCalledWith({ command: TEST_WORLD_COMMAND });
	});

	it("leaves a current script, and a player's world, alone", async () => {
		const current = worldMacro();
		installWorld({ macro: current });
		await syncTestWorldMacro();
		expect(current.update).not.toHaveBeenCalled();

		const stale = worldMacro({ command: "old" });
		installWorld({ isGM: false, macro: stale });
		await syncTestWorldMacro();
		expect(stale.update).not.toHaveBeenCalled();
	});
});

describe("TEST_WORLD_COMMAND", () => {
	it("imports a module the system ships, by the system's own id", () => {
		const path = /`systems\/\$\{game\.system\.id\}\/([^`]+)`/.exec(TEST_WORLD_COMMAND)?.[1];
		expect(path).toBe("module/test-world/populate.js");
		expect(existsSync(join(import.meta.dirname, "..", path))).toBe(true);
		expect(TEST_WORLD_COMMAND).toContain("return populateTestWorld();");
	});
});
