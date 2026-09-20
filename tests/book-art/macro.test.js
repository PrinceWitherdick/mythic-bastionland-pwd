import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LAST_SLOT, arrangeHotbar, emptySlot } from "../../module/actions/hotbar-macro.js";
import { GM_HOTBAR_ORDER } from "../../module/actions/hotbar-order.js";
import { IMPORT_HOTBAR_FLAG, IMPORT_MACRO_ID, MACRO_SEEDED_SETTING, ensureImportHotbar, ensureImportMacro } from "../../module/book-art/macro.js";
// Loaded for the macros they declare to hotbarMacro.
import "../../module/actions/luck-macro.js";
import "../../module/actions/site-macro.js";
import "../../module/actions/toolkit-macro.js";
import "../../module/rulebook/macro.js";
import { MACROS_PACK, SYSTEM_ID } from "../../module/system-id.js";

const root = join(import.meta.dirname, "../..");
const manifest = JSON.parse(readFileSync(join(root, "system.json"), "utf8"));
const source = JSON.parse(readFileSync(join(root, "packs/src/macros/import-book-art.json"), "utf8"));
const AsyncFunction = (async () => {}).constructor;

describe("Import PDF macro source", () => {
	it("is keyed for the Macro compendium", () => {
		expect(source._id).toBe(IMPORT_MACRO_ID);
		expect(source._id).toMatch(/^[A-Za-z0-9]{16}$/);
		expect(source._key).toBe(`!macros!${IMPORT_MACRO_ID}`);
		expect(source).toMatchObject({ type: "script", scope: "global" });
		// Stonetop's Import PDF icon, shipped with this system.
		expect(source.img).toBe(`systems/${manifest.id}/assets/icons/macros/spell-book.svg`);
		expect(existsSync(join(root, source.img.replace(`systems/${manifest.id}/`, "")))).toBe(true);
	});

	it("lives in a Macro compendium declared in system.json", () => {
		const pack = manifest.packs.find((entry) => `${manifest.id}.${entry.name}` === MACROS_PACK);
		expect(pack).toMatchObject({ type: "Macro", path: `packs/${pack?.name}` });
	});

	it("calls the system's importer and names no system files", async () => {
		expect(source.command).not.toMatch(/systems\//);
		const run = new AsyncFunction("game", "ui", source.command);

		const bringInRulebook = vi.fn(async () => "imported");
		await expect(run({ system: { api: { bringInRulebook } } }, {})).resolves.toBe("imported");

		const warn = vi.fn();
		await expect(run({ system: {} }, { notifications: { warn } })).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalledOnce();
	});
});

describe("Macro compendium", () => {
	const dir = join(root, "packs/src/macros");
	const sources = readdirSync(dir).map((file) => JSON.parse(readFileSync(join(dir, file), "utf8")));

	it("keys every macro for the compendium, each id once", () => {
		for (const macro of sources) {
			expect(macro._id).toMatch(/^[A-Za-z0-9]{16}$/);
			expect(macro._key).toBe(`!macros!${macro._id}`);
			expect(macro).toMatchObject({ type: "script", scope: "global" });
		}
		expect(new Set(sources.map((macro) => macro._id)).size).toBe(sources.length);
	});

	// A spare copy of each macro the system makes in code, for a GM who deleted theirs.
	it.each([
		["module/actions/luck-macro.js", "luckRollMacro"],
		["module/actions/site-macro.js", "newSiteMacro"],
		["module/actions/toolkit-macro.js", "gmToolkitMacro"],
		["module/rulebook/macro.js", "rulebookMacro"]
	])("holds the macro %s makes, flagged as the world's copy", (file, flag) => {
		const code = readFileSync(join(root, file), "utf8");
		const macro = sources.find((entry) => entry.flags?.[manifest.id]?.[flag]);
		expect(macro).toBeDefined();
		expect(code).toContain(`macroFlag: "${flag}"`);
		expect(code).toContain(`img: "${macro.img}"`);
		expect(code).toContain(`command: "${macro.command}"`);
	});
});

describe("ensureImportMacro", () => {
	/**
	 * A world as the macro seeder sees it.
	 * @returns {{create: Function, setSetting: Function, warn: Function, getDocument: Function}}
	 */
	function installWorld({ isGM = true, activeGM = true, seeded = false, existing = null, packDocument = source, pack = true } = {}) {
		const user = { id: "gm", isGM };
		const create = vi.fn();
		const setSetting = vi.fn();
		const warn = vi.fn();
		const getDocument = vi.fn(async (id) => (id === IMPORT_MACRO_ID ? packDocument : undefined));

		globalThis.game = {
			user,
			users: { activeGM: activeGM ? user : { id: "other" } },
			packs: new Map(pack ? [[MACROS_PACK, { getDocument }]] : []),
			macros: {
				get: (id) => (existing?.id === id ? existing : undefined),
				fromCompendium: (document, options) => ({ ...document, keptId: options.keepId })
			},
			settings: {
				get: (namespace, key) => namespace === SYSTEM_ID && key === MACRO_SEEDED_SETTING && seeded,
				set: setSetting
			},
			i18n: { localize: (key) => key }
		};
		globalThis.CONFIG = { Macro: { documentClass: { create } } };
		globalThis.ui = { notifications: { warn } };
		globalThis.foundry = { utils: { isEmpty: (object) => Object.keys(object).length === 0 } };
		return { create, setSetting, warn, getDocument };
	}

	afterEach(() => {
		for (const key of ["game", "CONFIG", "ui", "foundry"]) delete globalThis[key];
	});

	it("does nothing for players or a GM who isn't the active GM", async () => {
		for (const options of [{ isGM: false }, { activeGM: false }]) {
			const { getDocument, create } = installWorld(options);
			await ensureImportMacro();
			expect(getDocument).not.toHaveBeenCalled();
			expect(create).not.toHaveBeenCalled();
		}
	});

	it("gives a new world its copy, keeping the compendium id", async () => {
		const { create, setSetting } = installWorld();
		await ensureImportMacro();
		expect(create).toHaveBeenCalledWith(expect.objectContaining({ _id: IMPORT_MACRO_ID, keptId: true }), { keepId: true });
		expect(setSetting).toHaveBeenCalledWith(SYSTEM_ID, MACRO_SEEDED_SETTING, true);
	});

	it("leaves a deleted copy deleted", async () => {
		const { create } = installWorld({ seeded: true });
		await ensureImportMacro();
		expect(create).not.toHaveBeenCalled();
	});

	it("brings an existing copy's script and icon up to date, and nothing else", async () => {
		const existing = { id: IMPORT_MACRO_ID, name: "My Importer", command: "old", img: source.img, update: vi.fn() };
		const { create } = installWorld({ seeded: true, existing });
		await ensureImportMacro();
		expect(existing.update).toHaveBeenCalledWith({ command: source.command });
		expect(create).not.toHaveBeenCalled();
	});

	it("leaves an up-to-date copy untouched", async () => {
		const existing = { id: IMPORT_MACRO_ID, command: source.command, img: source.img, update: vi.fn() };
		installWorld({ seeded: true, existing });
		await ensureImportMacro();
		expect(existing.update).not.toHaveBeenCalled();
	});

	it("warns when the compendium was never built", async () => {
		for (const options of [{ pack: false }, { packDocument: null }]) {
			const { create, warn } = installWorld(options);
			await ensureImportMacro();
			expect(warn).toHaveBeenCalledWith("bastionland.bookArt.packMissing");
			expect(create).not.toHaveBeenCalled();
		}
	});
});

describe("arrangeHotbar", () => {
	it("keeps the last slot, the one labelled 0, from the other system macros", () => {
		expect(LAST_SLOT).toBe(10);
		const nine = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, `m${index}`]));
		expect(emptySlot(nine, "rb")).toBeNull();
	});

	it("moves Import PDF to the last slot, leaving the rest where they are", () => {
		const hotbar = { 1: "import", 2: "rb", 3: "luck", 4: "site", 6: "mine" };
		expect(arrangeHotbar(hotbar, "import"))
			.toEqual({ 2: "rb", 3: "luck", 4: "site", 6: "mine", 10: "import" });
	});

	it("puts Import PDF in the last slot when it wasn't on the bar", () => {
		expect(arrangeHotbar({ 1: "rb" }, "import")).toEqual({ 1: "rb", 10: "import" });
	});

	it("leaves Import PDF where it is when the user keeps their own macro in the last slot", () => {
		const hotbar = { 1: "import", 2: "rb", 10: "mine" };
		expect(arrangeHotbar(hotbar, "import")).toEqual(hotbar);
	});
});

describe("ensureImportHotbar", () => {
	const systemMacro = (id, flag) => ({ id, getFlag: (scope, key) => scope === SYSTEM_ID && key === flag });

	function installWorld({ isGM = true, placed = false, macro = true, hotbar = {} } = {}) {
		const update = vi.fn();
		const setFlag = vi.fn();
		const macros = [
			...(macro ? [systemMacro(IMPORT_MACRO_ID, null)] : []),
			...GM_HOTBAR_ORDER.map((flag) => systemMacro(flag, flag)),
			systemMacro("mine", null)
		];
		globalThis.game = {
			user: { isGM, hotbar, update, setFlag, getFlag: (scope, key) => scope === SYSTEM_ID && key === IMPORT_HOTBAR_FLAG && placed },
			macros: { get: (id) => macros.find((entry) => entry.id === id), filter: (test) => macros.filter(test) }
		};
		globalThis.foundry = { utils: { objectsEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b) } };
		return { update, setFlag };
	}

	afterEach(() => {
		for (const key of ["game", "foundry"]) delete globalThis[key];
	});

	it("rearranges a GM's hotbar once", async () => {
		expect(GM_HOTBAR_ORDER).toEqual(expect.arrayContaining(["rulebookMacro", "luckRollMacro", "newSiteMacro", "gmToolkitMacro"]));
		const [first, second] = GM_HOTBAR_ORDER;
		const { update, setFlag } = installWorld({ hotbar: { 1: IMPORT_MACRO_ID, 2: first, 3: second, 4: "mine" } });
		await ensureImportHotbar();
		expect(update).toHaveBeenCalledWith(
			{ hotbar: { 2: first, 3: second, 4: "mine", 10: IMPORT_MACRO_ID } },
			{ diff: false, recursive: false, noHook: true }
		);
		expect(setFlag).toHaveBeenCalledWith(SYSTEM_ID, IMPORT_HOTBAR_FLAG, true);
	});

	it("leaves players, GMs it has already placed, and worlds without the macro alone", async () => {
		for (const options of [{ isGM: false }, { placed: true }, { macro: false }]) {
			const { update, setFlag } = installWorld({ ...options, hotbar: { 1: IMPORT_MACRO_ID } });
			await ensureImportHotbar();
			expect(update).not.toHaveBeenCalled();
			expect(setFlag).not.toHaveBeenCalled();
		}
	});
});
