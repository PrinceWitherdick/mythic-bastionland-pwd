import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureSiteHotbar, seedSiteMacro } from "../module/actions/site-macro.js";
import { SYSTEM_ID } from "../module/system-id.js";
import { macroIconPath } from "../module/rules/macro-icons.js";

/** The picture the macro wears, drawn in the system's ink. */
const IMAGE = macroIconPath("new-site");

const COMMAND = "game.system.api.newSite();";

/**
 * A world as the New Site macro sees it.
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

/** A world macro carrying the system's flag. `given` is the picture the system remembers giving it; null for a world made before it remembered. */
const worldMacro = ({ command = COMMAND, img = IMAGE, given = IMAGE } = {}) => ({
	id: "site", command, img, update: vi.fn(),
	getFlag: (scope, key) => scope === SYSTEM_ID && (key === "givenImg" ? given : key === "newSiteMacro")
});

afterEach(() => {
	for (const key of ["game", "CONFIG"]) delete globalThis[key];
});

describe("seedSiteMacro", () => {
	it("makes one New Site macro, left to GMs", async () => {
		const { create } = installWorld();
		await seedSiteMacro();
		expect(create).toHaveBeenCalledOnce();
		const [data] = create.mock.calls[0];
		expect(data).toMatchObject({
			name: "bastionland.sites.newSite",
			type: "script",
			img: IMAGE,
			command: COMMAND,
			flags: { [SYSTEM_ID]: { newSiteMacro: true, givenImg: IMAGE } }
		});
		expect(data).not.toHaveProperty("ownership");
	});

	it("leaves a world that has one alone", async () => {
		const { create } = installWorld({ macro: worldMacro() });
		await seedSiteMacro();
		expect(create).not.toHaveBeenCalled();
	});
});

describe("ensureSiteHotbar", () => {
	it("puts it on a GM's hotbar once, in the first empty slot", async () => {
		const macro = worldMacro();
		const { assign, setFlag } = installWorld({ macro, hotbar: { 1: "rulebook", 2: "luck" } });
		await ensureSiteHotbar();
		expect(assign).toHaveBeenCalledWith(macro, 3);
		expect(setFlag).toHaveBeenCalledWith(SYSTEM_ID, "newSiteHotbar", true);
	});

	it("leaves a hotbar it has already been given alone", async () => {
		const { assign, setFlag } = installWorld({ macro: worldMacro(), placed: true });
		await ensureSiteHotbar();
		expect(assign).not.toHaveBeenCalled();
		expect(setFlag).not.toHaveBeenCalled();
	});

	it("remembers a full first page, rather than filling a slot cleared later", async () => {
		const hotbar = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [index + 1, `macro-${index}`]));
		const { assign, setFlag } = installWorld({ macro: worldMacro(), hotbar });
		await ensureSiteHotbar();
		expect(assign).not.toHaveBeenCalled();
		expect(setFlag).toHaveBeenCalledWith(SYSTEM_ID, "newSiteHotbar", true);
	});

	it("waits for the world to have the macro", async () => {
		const { assign, setFlag } = installWorld();
		await ensureSiteHotbar();
		expect(assign).not.toHaveBeenCalled();
		expect(setFlag).not.toHaveBeenCalled();
	});

	it("gives players nothing", async () => {
		const stale = worldMacro({ command: "old" });
		const { assign, setFlag } = installWorld({ isGM: false, macro: stale });
		await ensureSiteHotbar();
		expect(assign).not.toHaveBeenCalled();
		expect(setFlag).not.toHaveBeenCalled();
		expect(stale.update).not.toHaveBeenCalled();
	});

	it("brings an old script up to date", async () => {
		const stale = worldMacro({ command: "old" });
		installWorld({ macro: stale, placed: true });
		await ensureSiteHotbar();
		expect(stale.update).toHaveBeenCalledWith({ command: COMMAND });
	});

	it("brings an old picture up to date, so a world made before it changed catches up", async () => {
		const stale = worldMacro({ img: "icons/environment/wilderness/tomb-entrance.webp", given: null });
		installWorld({ macro: stale, placed: true });
		await ensureSiteHotbar();
		expect(stale.update).toHaveBeenCalledWith({ img: IMAGE, [`flags.${SYSTEM_ID}.givenImg`]: IMAGE });
	});

	it("keeps a picture a GM put on the macro themselves", async () => {
		const theirs = worldMacro({ img: "icons/svg/book.svg" });
		installWorld({ macro: theirs, placed: true });
		await ensureSiteHotbar();
		expect(theirs.update).not.toHaveBeenCalled();
	});

	it("remembers the picture it gave a world made before it remembered, so the next change leaves a GM's own alone", async () => {
		const current = worldMacro({ given: null });
		installWorld({ macro: current, placed: true });
		await ensureSiteHotbar();
		expect(current.update).toHaveBeenCalledWith({ [`flags.${SYSTEM_ID}.givenImg`]: IMAGE });
	});

	it("leaves a macro that is already current alone", async () => {
		const macro = worldMacro();
		installWorld({ macro, placed: true });
		await ensureSiteHotbar();
		expect(macro.update).not.toHaveBeenCalled();
	});
});
