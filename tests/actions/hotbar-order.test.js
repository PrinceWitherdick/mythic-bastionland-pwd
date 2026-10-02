import { afterEach, describe, expect, it, vi } from "vitest";
import { IMPORT_SLOT, SESSION_SLOT, emptySlot, endHotbar, orderHotbar } from "../../module/actions/hotbar-macro.js";
import { GM_HOTBAR_ORDER, HOTBAR_ENDS_FLAG, HOTBAR_ORDER_FLAG, ensureHotbarOrder } from "../../module/actions/hotbar-order.js";
import { IMPORT_MACRO_ID } from "../../module/book-art/macro.js";
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

describe("endHotbar", () => {
	const ends = { [IMPORT_SLOT]: "import", [SESSION_SLOT]: "session" };

	it("keeps the slots labelled 9 and 0 from the other system macros", () => {
		expect([IMPORT_SLOT, SESSION_SLOT]).toEqual([9, 10]);
		const eight = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [index + 1, `m${index}`]));
		expect(emptySlot(eight, "rb")).toBeNull();
	});

	it("leaves a player slot 9, which only a GM keeps for Import PDF", () => {
		const eight = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [index + 1, `m${index}`]));
		expect(emptySlot(eight, "luck", { gm: false })).toBe(IMPORT_SLOT);
		expect(emptySlot({ ...eight, 9: "mine" }, "luck", { gm: false })).toBeNull();
	});

	it("puts Import PDF and End the Session last and slides the rest of the page left", () => {
		const hotbar = { 1: "toolkit", 2: "rb", 3: "session", 4: "site", 5: "luck", 7: "mine", 10: "import", 12: "later" };
		expect(endHotbar(hotbar, ends))
			.toEqual({ 1: "toolkit", 2: "rb", 3: "site", 4: "luck", 5: "mine", 9: "import", 10: "session", 12: "later" });
	});

	it("moves a user's own macro off the last slots rather than dropping it", () => {
		const full = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [index + 1, `m${index}`]));
		expect(endHotbar(full, ends)).toEqual({ ...Object.fromEntries(Array.from({ length: 8 }, (_, index) => [index + 1, `m${index}`])), 9: "import", 10: "session", 11: "m8", 12: "m9" });
	});

	it("leaves a slot to the page when its macro is missing", () => {
		expect(endHotbar({ 1: "a", 3: "b" }, { [IMPORT_SLOT]: undefined, [SESSION_SLOT]: "session" })).toEqual({ 1: "a", 2: "b", 10: "session" });
	});
});

describe("ensureHotbarOrder", () => {
	const systemMacro = (id, flag, canExecute = true) => ({ id, canExecute, getFlag: (scope, key) => scope === SYSTEM_ID && key === flag });

	const gmMacros = () => [...GM_HOTBAR_ORDER, "endSessionMacro"].map((flag) => systemMacro(flag, flag)).concat(systemMacro(IMPORT_MACRO_ID, null));

	function installWorld({ isGM = true, ordered = false, ended = ordered, macros = gmMacros(), hotbar = {} } = {}) {
		const update = vi.fn();
		const setFlag = vi.fn();
		const flags = { [HOTBAR_ORDER_FLAG]: ordered, [HOTBAR_ENDS_FLAG]: ended };
		globalThis.game = {
			user: { isGM, hotbar, update, setFlag, getFlag: (scope, key) => scope === SYSTEM_ID && !!flags[key] },
			macros: { find: (test) => macros.find(test), get: (id) => macros.find((macro) => macro.id === id) }
		};
		globalThis.foundry = { utils: { objectsEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b) } };
		return { update, setFlag };
	}

	afterEach(() => {
		for (const key of ["game", "foundry"]) delete globalThis[key];
	});

	it("gives a GM the GM Toolkit first, and Import PDF and End the Session last", async () => {
		const { update, setFlag } = installWorld({ hotbar: { 1: "rulebookMacro", 2: "luckRollMacro", 3: "newSiteMacro", 4: "gmToolkitMacro", 5: "endSessionMacro", 6: IMPORT_MACRO_ID, 7: "mine" } });
		await ensureHotbarOrder();
		expect(update.mock.calls[0][0].hotbar).toEqual({
			1: "gmToolkitMacro", 2: "rulebookMacro", 3: "newSiteMacro", 4: "luckRollMacro", 5: "mine", 9: IMPORT_MACRO_ID, 10: "endSessionMacro"
		});
		expect(update).toHaveBeenLastCalledWith({ [`flags.${SYSTEM_ID}.${HOTBAR_ORDER_FLAG}`]: true, [`flags.${SYSTEM_ID}.${HOTBAR_ENDS_FLAG}`]: true });
		expect(setFlag).not.toHaveBeenCalled();
	});

	it("moves a GM ordered the old way's Import PDF and End the Session to the end, once", async () => {
		const { update, setFlag } = installWorld({ ordered: true, ended: false, hotbar: { 1: "gmToolkitMacro", 2: "rulebookMacro", 3: "endSessionMacro", 4: "newSiteMacro", 5: "luckRollMacro", 10: IMPORT_MACRO_ID } });
		await ensureHotbarOrder();
		expect(update).toHaveBeenCalledWith(
			{ hotbar: { 1: "gmToolkitMacro", 2: "rulebookMacro", 3: "newSiteMacro", 4: "luckRollMacro", 9: IMPORT_MACRO_ID, 10: "endSessionMacro" } },
			{ diff: false, recursive: false, noHook: true }
		);
		expect(setFlag).toHaveBeenCalledWith(SYSTEM_ID, HOTBAR_ENDS_FLAG, true);
	});

	it("brings the Rulebook up to the second slot for a GM ordered when End the Session came second", async () => {
		const { update } = installWorld({ ordered: true, ended: false, hotbar: { 1: "gmToolkitMacro", 2: "endSessionMacro", 3: "rulebookMacro", 7: "mine" } });
		await ensureHotbarOrder();
		expect(update.mock.calls[0][0].hotbar).toEqual({ 1: "gmToolkitMacro", 2: "rulebookMacro", 3: "mine", 9: IMPORT_MACRO_ID, 10: "endSessionMacro" });
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
