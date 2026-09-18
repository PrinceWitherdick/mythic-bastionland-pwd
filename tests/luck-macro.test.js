import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureLuckHotbar, seedLuckMacro } from "../module/actions/luck-macro.js";
import { SYSTEM_ID } from "../module/system-id.js";

const COMMAND = "game.system.api.rollLuck();";

/**
 * A world as the Luck Roll macro sees it.
 * @returns {{create: Function, assign: Function, setFlag: Function}}
 */
function installWorld({ isGM = false, macro = null, hotbar = {}, placed = false } = {}) {
	const create = vi.fn();
	const assign = vi.fn();
	const setFlag = vi.fn();
	globalThis.game = {
		user: { isGM, hotbar, assignHotbarMacro: assign, setFlag, getFlag: () => placed },
		macros: { find: (test) => [macro].filter(Boolean).find(test) },
		i18n: { localize: (key) => key }
	};
	globalThis.CONFIG = { Macro: { documentClass: { create } } };
	globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 } };
	return { create, assign, setFlag };
}

/** A world macro carrying the system's flag. */
const worldMacro = ({ command = COMMAND, canExecute = true } = {}) => ({
	id: "luck", command, canExecute, update: vi.fn(), getFlag: (scope, key) => scope === SYSTEM_ID && key === "luckRollMacro"
});

afterEach(() => {
	for (const key of ["game", "CONFIG", "CONST"]) delete globalThis[key];
});

describe("seedLuckMacro", () => {
	it("makes one macro everyone can run", async () => {
		const { create } = installWorld({ isGM: true });
		await seedLuckMacro();
		expect(create).toHaveBeenCalledWith(expect.objectContaining({
			type: "script", command: COMMAND, ownership: { default: 2 }, flags: { [SYSTEM_ID]: { luckRollMacro: true } }
		}));
	});

	it("leaves a world that has one alone", async () => {
		const { create } = installWorld({ isGM: true, macro: worldMacro() });
		await seedLuckMacro();
		expect(create).not.toHaveBeenCalled();
	});
});

describe("ensureLuckHotbar", () => {
	it("puts it on a player's hotbar once", async () => {
		const macro = worldMacro();
		const { assign, setFlag } = installWorld({ macro, hotbar: { 1: "other" } });
		await ensureLuckHotbar();
		expect(assign).toHaveBeenCalledWith(macro, 2);
		expect(setFlag).toHaveBeenCalledWith(SYSTEM_ID, "luckRollHotbar", true);
	});

	it("leaves a hotbar it has already been given alone", async () => {
		const { assign } = installWorld({ macro: worldMacro(), placed: true });
		await ensureLuckHotbar();
		expect(assign).not.toHaveBeenCalled();
	});

	it("waits for a macro the user can run", async () => {
		for (const macro of [null, worldMacro({ canExecute: false })]) {
			const { assign, setFlag } = installWorld({ macro });
			await ensureLuckHotbar();
			expect(assign).not.toHaveBeenCalled();
			expect(setFlag).not.toHaveBeenCalled();
		}
	});

	it("lets only a GM bring the script up to date", async () => {
		const stale = worldMacro({ command: "old" });
		installWorld({ macro: stale, placed: true });
		await ensureLuckHotbar();
		expect(stale.update).not.toHaveBeenCalled();

		installWorld({ isGM: true, macro: stale, placed: true });
		await ensureLuckHotbar();
		expect(stale.update).toHaveBeenCalledWith({ command: COMMAND });
	});
});
