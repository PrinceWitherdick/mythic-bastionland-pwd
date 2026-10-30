import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

vi.mock("../../module/chat/cards.js", async (importOriginal) => ({ ...(await importOriginal()), postCard: vi.fn(async () => ({})) }));
vi.mock("../../module/ask-gm.js", () => ({ askActiveGM: vi.fn(async () => true) }));

const { addAbilityDie, combatantOf, dropLastingDie, lastingDiceOf, onTemperQuery, temperWeapon } = await import("../../module/actions/lasting-dice.js");
const { postCard } = await import("../../module/chat/cards.js");
const { askActiveGM } = await import("../../module/ask-gm.js");

let flag;
let warnings;

const tal = { uuid: "Actor.tal", name: "Tal" };
const entry = () => ({
	actor: tal,
	getFlag: (scope, key) => (scope === SYSTEM_ID && key === "lastingDice" ? flag : undefined),
	setFlag: vi.fn(async (_scope, _key, value) => { flag = value; })
});
const ability = (system) => ({ name: "Mounting Fury", system: { lastingDie: "d8", quantity: { value: null, max: null }, ...system }, update: vi.fn(async () => {}) });

beforeEach(() => {
	flag = undefined;
	warnings = [];
	globalThis.game = { combats: [], i18n: { localize: (key) => key, format: (key) => key } };
	globalThis.ui = { notifications: { warn: (text) => warnings.push(text) } };
});

afterEach(() => {
	for (const key of ["game", "ui", "fromUuidSync"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("an Ability's die for the fight", () => {
	it("is kept on their Combatant, the started Combat first", async () => {
		const waiting = entry();
		const fought = entry();
		game.combats = [{ started: false, combatants: [waiting] }, { started: true, combatants: [fought] }];
		expect(combatantOf(tal)).toBe(fought);
		expect(await addAbilityDie(tal, ability())).toBe(true);
		expect(fought.setFlag).toHaveBeenCalledWith(SYSTEM_ID, "lastingDice", [{ faces: 8, label: "Mounting Fury" }]);
		expect(lastingDiceOf(tal)).toEqual([{ faces: 8, label: "Mounting Fury" }]);
	});

	it("spends a use of an Ability with a limit, and none is added once they're spent", async () => {
		game.combats = [{ started: true, combatants: [entry()] }];
		const limited = ability({ quantity: { value: 1, max: 1 } });
		expect(await addAbilityDie(tal, limited)).toBe(true);
		expect(limited.update).toHaveBeenCalledWith({ "system.quantity.value": 0 }, {});

		const spent = ability({ quantity: { value: 0, max: 1 } });
		expect(await addAbilityDie(tal, spent)).toBe(false);
		expect(warnings).toEqual(["bastionland.ability.usedUp"]);
	});

	it("needs a Combat, and spends nothing without one", async () => {
		const limited = ability({ quantity: { value: 1, max: 1 } });
		expect(await addAbilityDie(tal, limited)).toBe(false);
		expect(limited.update).not.toHaveBeenCalled();
		expect(warnings).toEqual(["bastionland.ability.notInCombat"]);
	});

	it("can be dropped again", async () => {
		const fought = entry();
		game.combats = [{ started: true, combatants: [fought] }];
		flag = [{ faces: 8, label: "A" }, { faces: 6, label: "B" }];
		await dropLastingDie(tal, 0);
		expect(flag).toEqual([{ faces: 6, label: "B" }]);
	});
});

describe("a weapon tempered by a Wound (p98)", () => {
	const items = (tempers = true) => {
		const list = [
			{ id: "guisarme", name: "Bolt-guisarme", type: "weapon", system: {} },
			{ id: "forge", name: "Tempering", type: "ability", system: { lastingDie: "d8", tempers } }
		];
		return Object.assign(list, { get: (id) => list.find((item) => item.id === id) });
	};
	const smith = (tempers) => ({ uuid: "Actor.tal", name: "Tal", items: items(tempers) });
	const foe = (system = { wounded: true }) => ({ uuid: "Actor.boar", name: "Boar", system });
	/** The smith and their foe in a started Combat, this browser the active GM's unless said otherwise. */
	const fighting = (actor, victim = foe(), { gm = true } = {}) => {
		const place = { ...entry(), actor };
		const combat = { started: true, combatants: [place, { actor: victim }] };
		place.parent = combat;
		game.combats = [combat];
		game.users = { activeGM: { id: "gm", isSelf: gm } };
		return place;
	};

	it("gives the weapon its die for the rest of the fight, and says so", async () => {
		const actor = smith();
		const boar = foe();
		fighting(actor, boar);
		expect(await temperWeapon(actor, "guisarme", boar)).toBe(true);
		expect(flag).toEqual([{ faces: 8, label: "Tempering", melee: true, item: "guisarme", itemName: "Bolt-guisarme" }]);
		expect(postCard).toHaveBeenCalledWith(actor, "note", expect.objectContaining({ text: "bastionland.ability.tempered" }));
		// Each Wound gives another.
		await temperWeapon(actor, "guisarme", boar);
		expect(flag).toHaveLength(2);
	});

	it("keeps both of two Wounds landing at once", async () => {
		const actor = smith();
		const boar = foe();
		const place = fighting(actor, boar);
		// Each write lands a moment later, as a Combatant's flag does.
		place.setFlag = vi.fn(async (_scope, _key, value) => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			flag = value;
		});
		await Promise.all([temperWeapon(actor, "guisarme", boar), temperWeapon(actor, "guisarme", boar)]);
		expect(flag).toHaveLength(2);
	});

	it("gives nothing outside a Combat, without the Ability, to what isn't a weapon, or without a Wound to see", async () => {
		expect(await temperWeapon(smith(), "guisarme", foe())).toBe(false);
		const plain = smith(false);
		fighting(plain);
		expect(await temperWeapon(plain, "guisarme", foe())).toBe(false);
		const actor = smith();
		const unhurt = foe({ wounded: false });
		fighting(actor, unhurt);
		expect(await temperWeapon(actor, "forge", foe())).toBe(false);
		expect(await temperWeapon(actor, "guisarme", unhurt)).toBe(false);
		// A Wounded foe in no fight of theirs, or the smith themself, is no Wound of this fight.
		expect(await temperWeapon(actor, "guisarme", { ...foe(), uuid: "Actor.elsewhere" })).toBe(false);
		expect(await temperWeapon(actor, "guisarme", { ...actor, system: { wounded: true } })).toBe(false);
		expect(postCard).not.toHaveBeenCalled();
	});

	it("asks the active GM whenever this browser isn't theirs, even for a Combatant this user owns", async () => {
		const actor = smith();
		const place = fighting(actor, foe(), { gm: false });
		place.isOwner = true;
		expect(await temperWeapon(actor, "guisarme", foe())).toBe(true);
		expect(askActiveGM).toHaveBeenCalledWith(expect.stringContaining("temperWeapon"), { dealer: "Actor.tal", item: "guisarme", victim: "Actor.boar" }, expect.any(String));
		expect(place.setFlag).not.toHaveBeenCalled();

		askActiveGM.mockResolvedValueOnce(false);
		postCard.mockClear();
		expect(await temperWeapon(actor, "guisarme", foe())).toBe(false);
		expect(postCard).not.toHaveBeenCalled();
	});

	it("is done by the GM only, read off the dealer's own sheet, and only for a Wound there to see", async () => {
		const actor = smith();
		const boar = foe();
		const place = fighting(actor, boar);
		const unhurt = { ...foe({ wounded: false }), uuid: "Actor.fox" };
		place.parent.combatants.push({ actor: unhurt });
		const known = { "Actor.tal": actor, "Actor.boar": boar, "Actor.fox": unhurt };
		globalThis.fromUuidSync = (uuid) => known[uuid] ?? null;
		// Ann plays Tal; Bo plays nobody here.
		actor.testUserPermission = (user, level) => user.id === "ann" && level === "OWNER";
		const ask = (data, user = { id: "ann" }) => onTemperQuery({ dealer: "Actor.tal", item: "guisarme", victim: "Actor.boar", ...data }, { user });
		game.user = { isGM: false };
		expect(await ask()).toBe(false);
		game.user = { isGM: true };
		expect(await ask({}, { id: "bo" })).toBe(false);
		expect(await ask({ item: "forge" })).toBe(false);
		expect(await ask({ victim: "Actor.fox" })).toBe(false);
		expect(await ask({ victim: undefined })).toBe(false);
		expect(await ask()).toBe(true);
		expect(place.setFlag).toHaveBeenCalledTimes(1);
	});
});
