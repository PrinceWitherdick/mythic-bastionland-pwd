import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { giveKnightTo, isUnchosen, openOfferedKnights, registerUnchosenKnightHooks } from "../../module/actions/new-knight.js";
import { OFFERED_FLAG, UNCHOSEN_FLAG, isBlankKnightData, ownershipGivenTo, playerHolding } from "../../module/rules/unchosen-knight.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const root = join(import.meta.dirname, "..", "..");
const page = readFileSync(join(root, "templates/actor/knight-unchosen.hbs"), "utf8");
const sheet = readFileSync(join(root, "module/sheets/KnightSheet.js"), "utf8");
const chooser = readFileSync(join(root, "module/apps/KnightChooser.js"), "utf8");

const OWNER = 3;
const gm = { id: "gm", isGM: true };
const ann = { id: "ann", isGM: false };
const bob = { id: "bob", isGM: false };

describe("a Knight made blank", () => {
	it("is what Create Actor makes, and not a Knight that arrives whole", () => {
		expect(isBlankKnightData({ name: "Knight", type: "knight", folder: null })).toBe(true);
		expect(isBlankKnightData({ name: "Knight", type: "knight", system: { isSquire: true } })).toBe(false);
		expect(isBlankKnightData({ name: "Knight", type: "knight", items: [{}] })).toBe(false);
		expect(isBlankKnightData({ name: "Knight", type: "knight", effects: [{}] })).toBe(false);
		expect(isBlankKnightData({ name: "Ferrymen", type: "npc" })).toBe(false);
	});
});

describe("giving a Knight to a player", () => {
	it("finds the player who holds them, never a GM", () => {
		expect(playerHolding({ default: 0, gm: OWNER, bob: OWNER }, [gm, ann, bob], OWNER)).toBe("bob");
		expect(playerHolding({ default: 0, gm: OWNER, ann: 2 }, [gm, ann, bob], OWNER)).toBe("");
	});

	it("takes them from whoever held them and leaves the GMs and the default alone", () => {
		const ownership = { default: 1, gm: OWNER, ann: OWNER };
		expect(ownershipGivenTo(ownership, "bob", [gm, ann, bob], OWNER)).toEqual({ default: 1, gm: OWNER, bob: OWNER });
		expect(ownershipGivenTo(ownership, "", [gm, ann, bob], OWNER)).toEqual({ default: 1, gm: OWNER });
		expect(ownership).toEqual({ default: 1, gm: OWNER, ann: OWNER });
	});
});

describe("the hooks", () => {
	const hooks = {};
	/** A Knight actor as far as the hooks and giveKnightTo read one. */
	const knight = (flags = {}, ownership = { default: 0, gm: OWNER }) => ({
		id: "k1",
		type: "knight",
		system: { isSquire: false },
		ownership,
		isOwner: true,
		getFlag: (scope, key) => (scope === SYSTEM_ID ? flags[key] : undefined),
		unsetFlag: vi.fn(),
		update: vi.fn(),
		updateSource: vi.fn(),
		sheet: { render: vi.fn() }
	});

	beforeEach(() => {
		globalThis.Hooks = { on: (name, callback) => { hooks[name] = callback; } };
		globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER } };
		globalThis.foundry = { utils: { hasProperty: (object, path) => path.split(".").reduce((node, key) => node?.[key], object) !== undefined } };
		registerUnchosenKnightHooks();
	});

	afterEach(() => {
		delete globalThis.Hooks;
		delete globalThis.CONST;
		delete globalThis.foundry;
		delete globalThis.game;
	});

	it("marks a Knight made blank, but not one made in a compendium or brought whole", () => {
		const blank = knight();
		hooks.preCreateActor(blank, { name: "Knight", type: "knight" }, {});
		expect(blank.updateSource).toHaveBeenCalledWith({ [`flags.${SYSTEM_ID}.${UNCHOSEN_FLAG}`]: true });
		const packed = knight();
		hooks.preCreateActor(packed, { name: "Knight", type: "knight" }, { pack: "world.knights" });
		const whole = knight();
		hooks.preCreateActor(whole, { name: "Eve", type: "knight", system: { knightType: "Silk" } }, {});
		expect(packed.updateSource).not.toHaveBeenCalled();
		expect(whole.updateSource).not.toHaveBeenCalled();
	});

	it("reads a Squire as chosen, whatever their flags say", () => {
		expect(isUnchosen(knight({ [UNCHOSEN_FLAG]: true }))).toBe(true);
		expect(isUnchosen({ ...knight({ [UNCHOSEN_FLAG]: true }), system: { isSquire: true } })).toBe(false);
		expect(isUnchosen(knight({ [UNCHOSEN_FLAG]: false }))).toBe(false);
	});

	it("hands the Knight over, makes them the player's character and offers the sheet", async () => {
		const users = [
			{ ...gm, update: vi.fn() },
			{ ...ann, character: { id: "k1" }, update: vi.fn() },
			{ ...bob, character: null, update: vi.fn() }
		];
		globalThis.game = { user: { isGM: true }, users: { contents: users, get: (id) => users.find((user) => user.id === id) } };
		const actor = knight({ [UNCHOSEN_FLAG]: true }, { default: 0, gm: OWNER, ann: OWNER });
		await giveKnightTo(actor, "bob");
		expect(actor.update).toHaveBeenCalledWith({ ownership: { default: 0, gm: OWNER, bob: OWNER } }, { diff: false, recursive: false });
		expect(actor.update).toHaveBeenCalledWith({ [`flags.${SYSTEM_ID}.${OFFERED_FLAG}`]: "bob" });
		expect(users[1].update).toHaveBeenCalledWith({ character: null });
		expect(users[2].update).toHaveBeenCalledWith({ character: "k1" });
	});

	it("leaves a player's own character where it is, and lets only a GM give", async () => {
		const users = [{ ...bob, character: { id: "theirs" }, update: vi.fn() }];
		globalThis.game = { user: { isGM: false }, users: { contents: users, get: (id) => users.find((user) => user.id === id) } };
		const actor = knight({ [UNCHOSEN_FLAG]: true });
		await giveKnightTo(actor, "bob");
		expect(actor.update).not.toHaveBeenCalled();
		game.user.isGM = true;
		await giveKnightTo(actor, "bob");
		expect(users[0].update).not.toHaveBeenCalled();
	});

	it("opens the sheet once for the player it was given to, now or when they join", () => {
		globalThis.game = { user: { id: "bob", isGM: false } };
		const given = knight({ [UNCHOSEN_FLAG]: true, [OFFERED_FLAG]: "bob" });
		hooks.updateActor(given, { flags: { [SYSTEM_ID]: { [OFFERED_FLAG]: "bob" } } });
		expect(given.sheet.render).toHaveBeenCalledWith({ force: true });
		expect(given.unsetFlag).toHaveBeenCalledWith(SYSTEM_ID, OFFERED_FLAG);

		const others = knight({ [UNCHOSEN_FLAG]: true, [OFFERED_FLAG]: "ann" });
		const waiting = knight({ [UNCHOSEN_FLAG]: true, [OFFERED_FLAG]: "bob" });
		game.actors = [others, waiting];
		openOfferedKnights();
		expect(others.sheet.render).not.toHaveBeenCalled();
		expect(waiting.sheet.render).toHaveBeenCalled();
	});
});

describe("the empty page", () => {
	it("is what the sheet draws for a Knight still to be chosen, with no rail", () => {
		expect(sheet).toContain('else if (isUnchosen(this.actor)) parts.sheet.template = templatePath("actor/knight-unchosen.hbs");');
		expect(sheet).toContain("if (isUnchosen(this.actor)) return { ...config, tabs: [] };");
	});

	it("offers the chooser, filling in by hand, and for a GM, the players", () => {
		for (const part of ['data-action="chooseFresh"', 'data-action="fillByHand"', "unchosen.players", 'name="name"']) expect(page).toContain(part);
		// The player picker gives the Knight away rather than writing a field of the Actor's.
		expect(page).not.toMatch(/<select[^>]*\bname=/);
	});

	it("gives way to the sheet once the chooser fills the Knight in", () => {
		expect(chooser).toContain("update[`flags.${SYSTEM_ID}.${UNCHOSEN_FLAG}`] = false;");
	});
});
