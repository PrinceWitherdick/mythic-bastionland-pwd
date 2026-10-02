import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IMPORT_MACRO_ID, MACRO_SEEDED_SETTING, ensureImportMacro } from "../../module/book-art/macro.js";
// Loaded for the macros they declare to hotbarMacro.
import "../../module/actions/luck-macro.js";
import "../../module/actions/site-macro.js";
import "../../module/actions/toolkit-macro.js";
import "../../module/rulebook/macro.js";
import { MACRO_ICONS, macroIconPath } from "../../module/rules/macro-icons.js";
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
		expect(source.img).toBe(macroIconPath("import-pdf"));
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
	// Foundry's own icons are painted; every macro this system ships wears one of its own
	// black-and-white drawings instead, so the hotbar reads as one set.
	it("gives every macro a picture this system draws", () => {
		const ours = new Set(MACRO_ICONS.map(({ key }) => macroIconPath(key)));
		for (const macro of sources) {
			expect([macro.name, ours.has(macro.img)]).toEqual([macro.name, true]);
			expect(existsSync(join(root, macro.img.replace(`systems/${manifest.id}/`, "")))).toBe(true);
		}
	});

	it.each([
		["module/actions/luck-macro.js", "luckRollMacro"],
		["module/actions/site-macro.js", "newSiteMacro"],
		["module/actions/toolkit-macro.js", "gmToolkitMacro"],
		["module/actions/session-macro.js", "endSessionMacro"],
		["module/rulebook/macro.js", "rulebookMacro"]
	])("holds the macro %s makes, flagged as the world's copy", (file, flag) => {
		/** @returns {string} The key a picture's path was made from. */
		const keyOf = (img) => img.replace(/^.*\//, "").replace(/\.svg$/, "");
		const code = readFileSync(join(root, file), "utf8");
		const macro = sources.find((entry) => entry.flags?.[manifest.id]?.[flag]);
		expect(macro).toBeDefined();
		expect(code).toContain(`macroFlag: "${flag}"`);
		// The module asks for its picture by key, so the two are compared by the path that key makes.
		expect(code).toContain(`img: macroIconPath("${keyOf(macro.img)}")`);
		expect(macroIconPath(keyOf(macro.img))).toBe(macro.img);
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
