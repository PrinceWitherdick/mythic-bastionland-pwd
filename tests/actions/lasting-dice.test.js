import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addAbilityDie, combatantOf, dropLastingDie, lastingDiceOf } from "../../module/actions/lasting-dice.js";
import { SYSTEM_ID } from "../../module/system-id.js";

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
	for (const key of ["game", "ui"]) delete globalThis[key];
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
		expect(limited.update).toHaveBeenCalledWith({ "system.quantity.value": 0 });

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
