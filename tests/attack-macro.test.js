import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../module/actions/attack.js", async (importOriginal) => ({ ...(await importOriginal()), attack: vi.fn(async () => []) }));
vi.mock("../module/apps/ui.js", () => ({ inputDialog: vi.fn() }));

const { attack } = await import("../module/actions/attack.js");
const { inputDialog } = await import("../module/apps/ui.js");
const { attackFromHotbar, attackerPool, ensureAttackHotbar, seedAttackMacro } = await import("../module/actions/attack-macro.js");
const { SYSTEM_ID } = await import("../module/system-id.js");
const { macroIconPath } = await import("../module/rules/macro-icons.js");

const IMAGE = macroIconPath("attack");
const COMMAND = "game.system.api.attackFromHotbar();";

/** An actor as the pool sees it. */
const actor = (name, { type = "knight", isOwner = true } = {}) => ({ name, uuid: `Actor.${name}`, type, isOwner });

/** A world as the Attack macro sees it. */
function installWorld({ isGM = false, selected = [], character = null, actors = [], macro = null, hotbar = {}, placed = false } = {}) {
	const create = vi.fn();
	const assign = vi.fn();
	const setFlag = vi.fn();
	const warn = vi.fn();
	globalThis.game = {
		user: { isGM, character, hotbar, assignHotbarMacro: assign, setFlag, getFlag: () => placed },
		actors: { contents: actors },
		macros: { find: (test) => [macro].filter(Boolean).find(test) },
		i18n: { localize: (key) => key, format: (key) => key }
	};
	globalThis.canvas = { tokens: { controlled: selected.map((token) => ({ actor: token })) } };
	globalThis.ui = { notifications: { warn } };
	globalThis.CONFIG = { Macro: { documentClass: { create } } };
	globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 } };
	return { create, assign, setFlag, warn };
}

beforeEach(() => {
	attack.mockClear();
	inputDialog.mockReset();
});

afterEach(() => {
	for (const key of ["game", "canvas", "ui", "CONFIG", "CONST"]) delete globalThis[key];
});

describe("seedAttackMacro", () => {
	it("makes one macro everyone can run", async () => {
		const { create } = installWorld({ isGM: true });
		await seedAttackMacro();
		expect(create).toHaveBeenCalledWith(expect.objectContaining({
			type: "script", command: COMMAND, img: IMAGE, ownership: { default: 2 }, flags: { [SYSTEM_ID]: { attackMacro: true, givenImg: IMAGE } }
		}));
	});
});

describe("ensureAttackHotbar", () => {
	const worldMacro = () => ({
		id: "attack", command: COMMAND, img: IMAGE, canExecute: true, update: vi.fn(),
		getFlag: (scope, key) => scope === SYSTEM_ID && (key === "givenImg" ? IMAGE : key === "attackMacro")
	});

	it("puts it on a player's hotbar once", async () => {
		const macro = worldMacro();
		const { assign, setFlag } = installWorld({ macro, hotbar: { 1: "luck" } });
		await ensureAttackHotbar();
		expect(assign).toHaveBeenCalledWith(macro, 2);
		expect(setFlag).toHaveBeenCalledWith(SYSTEM_ID, "attackHotbar", true);
	});

	it("puts it on a GM's hotbar too", async () => {
		const macro = worldMacro();
		const { assign } = installWorld({ isGM: true, macro, hotbar: { 1: "a", 2: "b", 3: "c", 4: "d" } });
		await ensureAttackHotbar();
		expect(assign).toHaveBeenCalledWith(macro, 5);
	});
});

describe("attackerPool", () => {
	it("takes the selected Tokens this user owns that make Attacks, each once", () => {
		const knight = actor("Knight");
		const npc = actor("Bandit", { type: "npc" });
		installWorld({ selected: [knight, actor("Theirs", { isOwner: false }), actor("Toolkit", { type: "gmToolkit" }), npc, knight, null], character: actor("Mine") });
		expect(attackerPool()).toEqual([knight, npc]);
	});

	it("falls back for a player to their character, then to the Knights they own", () => {
		const mine = actor("Mine");
		installWorld({ character: mine, actors: [actor("Other")] });
		expect(attackerPool()).toEqual([mine]);

		const owned = [actor("One"), actor("Two")];
		installWorld({ actors: [...owned, actor("Theirs", { isOwner: false }), actor("Bandit", { type: "npc" })] });
		expect(attackerPool()).toEqual(owned);
	});

	it("gives a GM only their selected Tokens", () => {
		installWorld({ isGM: true, character: actor("Toolkit", { type: "gmToolkit" }), actors: [actor("Knight")] });
		expect(attackerPool()).toEqual([]);
	});
});

describe("attackFromHotbar", () => {
	it("says what to do when there's nobody to attack with", async () => {
		for (const isGM of [false, true]) {
			const { warn } = installWorld({ isGM });
			expect(await attackFromHotbar()).toBeNull();
			expect(warn).toHaveBeenCalledWith(isGM ? "bastionland.attack.macro.nobodyGM" : "bastionland.attack.macro.nobody");
		}
		expect(attack).not.toHaveBeenCalled();
	});

	it("attacks straight away with the only one", async () => {
		const knight = actor("Knight");
		installWorld({ selected: [knight] });
		await attackFromHotbar();
		expect(inputDialog).not.toHaveBeenCalled();
		expect(attack).toHaveBeenCalledWith(knight);
	});

	it("asks which of several attacks, and attacks with nobody when the window is closed", async () => {
		const pair = [actor("One"), actor("Two")];
		installWorld({ selected: pair });
		inputDialog.mockResolvedValueOnce({ actor: "1" });
		await attackFromHotbar();
		expect(inputDialog).toHaveBeenCalledWith(expect.objectContaining({ template: "actor-pick" }));
		expect(attack).toHaveBeenCalledWith(pair[1]);

		attack.mockClear();
		inputDialog.mockResolvedValueOnce(null);
		await attackFromHotbar();
		expect(attack).not.toHaveBeenCalled();
	});
});
