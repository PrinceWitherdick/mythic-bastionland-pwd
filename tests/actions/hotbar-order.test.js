import { afterEach, describe, expect, it, vi } from "vitest";
import { orderHotbar } from "../../module/actions/hotbar-macro.js";
import { GM_HOTBAR_ORDER, HOTBAR_ORDER_FLAG, RULEBOOK_SECOND_FLAG, ensureHotbarOrder } from "../../module/actions/hotbar-order.js";
import { SYSTEM_ID } from "../../module/system-id.js";

describe("orderHotbar", () => {
	it("puts the macros first, in order, from wherever they were", () => {
		const hotbar = { 1: "rb", 2: "luck", 3: "site", 4: "toolkit", 10: "import" };
		expect(orderHotbar(hotbar, ["toolkit", "rb", "luck", "site"]))
			.toEqual({ 1: "toolkit", 2: "rb", 3: "luck", 4: "site", 10: "import" });
	});

	it("moves a user's own macro out of the way rather than dropping it", () => {
		expect(orderHotbar({ 1: "mine", 3: "luck" }, ["luck"])).toEqual({ 1: "luck", 2: "mine" });
	});

	it("adds a macro that wasn't on the bar", () => {
		expect(orderHotbar({}, ["luck"])).toEqual({ 1: "luck" });
	});
});

describe("ensureHotbarOrder", () => {
	const systemMacro = (id, flag, canExecute = true) => ({ id, canExecute, getFlag: (scope, key) => scope === SYSTEM_ID && key === flag });

	function installWorld({ isGM = true, ordered = false, swapped = ordered, macros = GM_HOTBAR_ORDER.map((flag) => systemMacro(flag, flag)), hotbar = {} } = {}) {
		const update = vi.fn();
		const setFlag = vi.fn();
		globalThis.game = {
			user: { isGM, hotbar, update, setFlag, getFlag: (scope, key) => scope === SYSTEM_ID && ((key === HOTBAR_ORDER_FLAG && ordered) || (key === RULEBOOK_SECOND_FLAG && swapped)) },
			macros: { find: (test) => macros.find(test) }
		};
		globalThis.foundry = { utils: { objectsEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b) } };
		return { update, setFlag };
	}

	afterEach(() => {
		for (const key of ["game", "foundry"]) delete globalThis[key];
	});

	it("gives a GM the GM Toolkit in the first slot", async () => {
		const { update, setFlag } = installWorld({ hotbar: { 1: "rulebookMacro", 2: "luckRollMacro", 3: "newSiteMacro", 4: "gmToolkitMacro" } });
		await ensureHotbarOrder();
		expect(update.mock.calls[0][0].hotbar[1]).toBe("gmToolkitMacro");
		expect(update.mock.calls[0][0].hotbar[2]).toBe("rulebookMacro");
		expect(setFlag).toHaveBeenCalledWith(SYSTEM_ID, HOTBAR_ORDER_FLAG, true);
		expect(setFlag).toHaveBeenCalledWith(SYSTEM_ID, RULEBOOK_SECOND_FLAG, true);
	});

	it("swaps the Rulebook into the second slot for a GM ordered the old way, once", async () => {
		const { update, setFlag } = installWorld({ ordered: true, swapped: false, hotbar: { 1: "gmToolkitMacro", 2: "endSessionMacro", 3: "rulebookMacro", 7: "mine" } });
		await ensureHotbarOrder();
		expect(update).toHaveBeenCalledWith(
			{ hotbar: { 1: "gmToolkitMacro", 2: "rulebookMacro", 3: "endSessionMacro", 7: "mine" } },
			{ diff: false, recursive: false, noHook: true }
		);
		expect(setFlag).toHaveBeenCalledWith(SYSTEM_ID, RULEBOOK_SECOND_FLAG, true);
	});

	it("leaves a GM who moved End the Session or the Rulebook their own way", async () => {
		const { update, setFlag } = installWorld({ ordered: true, swapped: false, hotbar: { 1: "gmToolkitMacro", 2: "mine", 3: "rulebookMacro" } });
		await ensureHotbarOrder();
		expect(update).not.toHaveBeenCalled();
		expect(setFlag).toHaveBeenCalledWith(SYSTEM_ID, RULEBOOK_SECOND_FLAG, true);
	});

	it("gives a player the Luck Roll in the first slot", async () => {
		const { update } = installWorld({ isGM: false, hotbar: { 1: "mine", 2: "luckRollMacro" } });
		await ensureHotbarOrder();
		expect(update.mock.calls[0][0].hotbar).toEqual({ 1: "luckRollMacro", 2: "mine" });
	});

	it("waits for the macros to exist, and orders a user only once", async () => {
		for (const options of [{ isGM: false, macros: [] }, { ordered: true }]) {
			const { update, setFlag } = installWorld(options);
			await ensureHotbarOrder();
			expect(update).not.toHaveBeenCalled();
			expect(setFlag).not.toHaveBeenCalled();
		}
	});
});
