import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureToolkitHotbar, seedToolkitMacro } from "../module/actions/toolkit-macro.js";
import { SYSTEM_ID } from "../module/system-id.js";

const COMMAND = "game.system.api.openGmToolkit();";

/**
 * A world as the GM Toolkit macro sees it.
 * @returns {{create: Function, assign: Function, setFlag: Function}}
 */
function installWorld({ isGM = true, macro = null, hotbar = {}, placed = false } = {}) {
	const create = vi.fn();
	const assign = vi.fn();
	const setFlag = vi.fn();
	globalThis.game = {
		user: { isGM, hotbar, assignHotbarMacro: assign, setFlag, getFlag: () => placed },
		macros: { find: (test) => [macro].filter(Boolean).find(test) },
		i18n: { localize: (key) => key }
	};
	globalThis.CONFIG = { Macro: { documentClass: { create } } };
	return { create, assign, setFlag };
}

/** A world macro carrying the system's flag. */
const worldMacro = ({ command = COMMAND } = {}) => ({
	id: "toolkit", command, update: vi.fn(), getFlag: (scope, key) => scope === SYSTEM_ID && key === "gmToolkitMacro"
});

afterEach(() => {
	for (const key of ["game", "CONFIG"]) delete globalThis[key];
});

describe("seedToolkitMacro", () => {
	it("makes one GM Toolkit macro, left to GMs", async () => {
		const { create } = installWorld();
		await seedToolkitMacro();
		expect(create).toHaveBeenCalledOnce();
		const [data] = create.mock.calls[0];
		expect(data).toMatchObject({
			name: "bastionland.gmToolkit.name",
			type: "script",
			img: "systems/mythic-bastionland-pwd/assets/icons/gm-toolkit.svg",
			command: COMMAND,
			flags: { [SYSTEM_ID]: { gmToolkitMacro: true } }
		});
		expect(data).not.toHaveProperty("ownership");
	});

	it("leaves a world that has one alone", async () => {
		const { create } = installWorld({ macro: worldMacro() });
		await seedToolkitMacro();
		expect(create).not.toHaveBeenCalled();
	});
});

describe("ensureToolkitHotbar", () => {
	it("puts it on a GM's hotbar once, in the first empty slot", async () => {
		const macro = worldMacro();
		const { assign, setFlag } = installWorld({ macro, hotbar: { 1: "rulebook", 2: "luck" } });
		await ensureToolkitHotbar();
		expect(assign).toHaveBeenCalledWith(macro, 3);
		expect(setFlag).toHaveBeenCalledWith(SYSTEM_ID, "gmToolkitHotbar", true);
	});

	it("leaves a hotbar it has already been given alone", async () => {
		const { assign, setFlag } = installWorld({ macro: worldMacro(), placed: true });
		await ensureToolkitHotbar();
		expect(assign).not.toHaveBeenCalled();
		expect(setFlag).not.toHaveBeenCalled();
	});

	it("remembers a full first page, rather than filling a slot cleared later", async () => {
		const hotbar = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [index + 1, `macro-${index}`]));
		const { assign, setFlag } = installWorld({ macro: worldMacro(), hotbar });
		await ensureToolkitHotbar();
		expect(assign).not.toHaveBeenCalled();
		expect(setFlag).toHaveBeenCalledWith(SYSTEM_ID, "gmToolkitHotbar", true);
	});

	it("waits for the world to have the macro", async () => {
		const { assign, setFlag } = installWorld();
		await ensureToolkitHotbar();
		expect(assign).not.toHaveBeenCalled();
		expect(setFlag).not.toHaveBeenCalled();
	});

	it("gives players nothing", async () => {
		const stale = worldMacro({ command: "old" });
		const { assign, setFlag } = installWorld({ isGM: false, macro: stale });
		await ensureToolkitHotbar();
		expect(assign).not.toHaveBeenCalled();
		expect(setFlag).not.toHaveBeenCalled();
		expect(stale.update).not.toHaveBeenCalled();
	});

	it("brings an old script up to date", async () => {
		const stale = worldMacro({ command: "old" });
		installWorld({ macro: stale, placed: true });
		await ensureToolkitHotbar();
		expect(stale.update).toHaveBeenCalledWith({ command: COMMAND });
	});
});
