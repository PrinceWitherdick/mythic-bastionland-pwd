import { describe, expect, it } from "vitest";
import { ABILITY_KITS, KIT_FLAG, KIT_WEAPON_KEYS, kitCatchUp, kitForPage, kittedAbility, kitWeapons } from "../../module/rules/ability-kits.js";
import {
	ABILITY_POWERS,
	SIGIL_MAX,
	abilitiesWith,
	abilityOffers,
	declarableBy,
	declaredGrants,
	etchUpdate,
	etchedNumber,
	fadedUpdate,
	readyForAttack,
	sigilChoices
} from "../../module/rules/ability-uses.js";
import { knightItems } from "../../module/rules/creation.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// Ability words here are invented, so no book text lives in the repository.

const kitNames = { dagger: "Dagger", torches: "Torches", rope: "Rope", rations: "Dry rations", camping: "Camping gear" };
const knightOn = (page) => ({
	roll: "2-03",
	page,
	name: "The Test Knight",
	property: ["Old club (d6)"],
	ability: { name: "Odd Gift", text: "Once per day, do something odd." },
	passion: { name: "Quiet", text: "Restore SPI in silence." }
});

describe("ABILITY_KITS", () => {
	it("are keyed by the Knight pages of the book, which are even", () => {
		for (const page of Object.keys(ABILITY_KITS).map(Number)) {
			expect(page % 2).toBe(0);
			expect(page).toBeGreaterThanOrEqual(28);
			expect(page).toBeLessThanOrEqual(170);
		}
		expect(kitForPage(57)).toBeNull();
		expect(kitForPage(undefined)).toBeNull();
	});

	it("name every weapon they give", () => {
		expect(KIT_WEAPON_KEYS).toEqual(["chain", "shockwave", "bite"]);
	});

	it("lay an Ability's settings over what its words gave it", () => {
		const system = { description: "<p>x</p>", quantity: { value: 1, max: 1 }, restock: "day", grants: { blast: false } };
		const kitted = kittedAbility(system, kitForPage(92));
		expect(kitted).toMatchObject({ quantity: { value: 1, max: 1 }, restock: "day", bonusDie: "d12" });
		expect(kitted.grants).toEqual({ blast: true, strongGambits: true, shatters: true, alone: true });
		expect(kittedAbility(system, null)).toBe(system);
		expect(kittedAbility(system, kitForPage(60))).toBe(system);
	});

	it("give weapons marked as the kit's", () => {
		const [bite] = kitWeapons(kitForPage(166), (key) => `named ${key}`, SYSTEM_ID);
		expect(bite).toEqual({ type: "weapon", name: "named bite", system: { equipped: true, damage: "d6", noHand: true }, flags: { [SYSTEM_ID]: { [KIT_FLAG]: "bite" } } });
		expect(kitWeapons(null, String, SYSTEM_ID)).toEqual([]);
	});
});

describe("knightItems with a kit", () => {
	it("sets the Ability from the page, and adds the weapon it gives before the standard kit", () => {
		const items = knightItems(knightOn(166), kitNames, { bite: "Bite" });
		const ability = items.find((item) => item.type === "ability");
		expect(ability.system.grants).toEqual({ drain: true, sleep: true, memory: true });
		expect(ability.system.quantity).toEqual({ value: 1, max: 1 });
		const at = items.findIndex((item) => item.name === "Bite");
		expect(items[at]).toMatchObject({ type: "weapon", system: { damage: "d6", noHand: true } });
		expect(items[at + 1].name).toBe("Dagger");
	});

	it("names a kit weapon by its key where no name is given, and leaves pages without a kit alone", () => {
		expect(knightItems(knightOn(106), kitNames).some((item) => item.name === "shockwave")).toBe(true);
		const plain = knightItems(knightOn(30), kitNames).find((item) => item.type === "ability");
		expect(plain.system).not.toHaveProperty("grants");
	});

	it("gives nothing from the kit to a Knight whose Ability wasn't read", () => {
		expect(knightItems({ ...knightOn(166), ability: null }, kitNames).some((item) => item.name === "bite")).toBe(false);
	});
});

describe("kitCatchUp", () => {
	const items = (ability, extra = []) => [{ id: "a1", type: "ability", name: "Odd Gift", system: ability }, ...extra];

	it("fills only what's still at the defaults, and the weapons not carried yet", () => {
		const { update, missing } = kitCatchUp(items({ grants: { drain: false }, deathWard: false }), kitForPage(166), "Odd Gift", SYSTEM_ID);
		expect(update).toEqual({ _id: "a1", "system.grants.drain": true, "system.grants.sleep": true, "system.grants.memory": true });
		expect(missing).toEqual(["bite"]);
		const carried = { id: "w1", type: "weapon", name: "My teeth", system: {}, flags: { [SYSTEM_ID]: { [KIT_FLAG]: "bite" } } };
		expect(kitCatchUp(items({ grants: { drain: true, sleep: true, memory: true } }, [carried]), kitForPage(166), "Odd Gift", SYSTEM_ID)).toEqual({ update: null, missing: [] });
	});

	it("sets more than grants, and does nothing for an Ability named otherwise", () => {
		expect(kitCatchUp(items({ grants: {}, bonusDie: "" }), kitForPage(92), "Odd Gift", SYSTEM_ID).update).toMatchObject({ "system.bonusDie": "d12", "system.grants.alone": true });
		expect(kitCatchUp(items({ grants: {} }), kitForPage(92), "Something Else", SYSTEM_ID)).toEqual({ update: null, missing: [] });
	});
});

describe("what an Ability offers an Attack", () => {
	const ability = (id, system) => ({ id, name: id, type: "ability", system: { grants: {}, quantity: { value: null, max: null }, ...system } });

	it("offers one that only adds a die, and says which dice the ticked ones add", () => {
		const offers = abilityOffers([ability("charge", { bonusDie: "d12", grants: { alone: true } }), ability("odd", { bonusDie: "x" })]);
		expect(offers).toEqual([{ id: "charge", name: "charge", grants: ["alone"], effects: [], bonusDie: "d12", needs: "", counted: false, chosen: true }]);
		expect(abilityOffers([ability("gaze", { grants: { ignoresArmour: true } })])[0].chosen).toBe(false);
		expect(abilityOffers([ability("bite", { grants: { drain: true } })])[0].chosen).toBe(true);
		const declared = declaredGrants({ ability: { charge: true }, declare: { spirit: true } }, offers);
		expect(declared).toMatchObject({ dice: [{ die: "d12", name: "charge" }], alone: true, spirit: true, combine: false });
	});

	it("declares by hand what a Wound does as one pick, which an Ability's own outranks (p166)", () => {
		expect(declaredGrants({ declare: { onWound: "sleep", drain: true } }, [])).toMatchObject({ sleep: true, drain: false, memory: false });
		const fangs = abilityOffers([ability("fangs", { grants: { drain: true } })]);
		expect(declaredGrants({ ability: { fangs: true }, declare: { onWound: "sleep" } }, fangs)).toMatchObject({ drain: true, sleep: false });
	});

	it("lets a Knight declare by hand only what no Ability need lend", () => {
		const open = declarableBy({ type: "knight" });
		expect(open).toEqual(["blast", "ignoresArmour", "strongGambits"]);
		expect(declaredGrants({ declare: { blast: true, spirit: true, onWound: "drain" } }, [], open)).toMatchObject({ blast: true, spirit: false, drain: false });
		expect(declarableBy({ type: "npc" })).toContain("spirit");
	});

	it("readies an Ability with a use left, or one that comes back with the Attack", () => {
		expect(readyForAttack({ quantity: { value: 0, max: 1 }, restock: "day" })).toBe(false);
		expect(readyForAttack({ quantity: { value: 0, max: 1 }, restock: "attack" })).toBe(true);
	});

	it("finds the Abilities that can do something besides", () => {
		expect(ABILITY_POWERS).toEqual(["rerollPool", "deathWard", "coinFlip", "sigil"]);
		const items = [ability("ward", { deathWard: true }), ability("plain", {}), { type: "weapon", system: { deathWard: true } }];
		expect(abilitiesWith(items, "deathWard").map((item) => item.id)).toEqual(["ward"]);
		expect(abilitiesWith(null, "deathWard")).toEqual([]);
	});
});

describe("a rune etched for a number (p100)", () => {
	it("holds while it has turns left", () => {
		expect(etchedNumber({ sigil: true, sigilNumber: 4, quantity: { value: 2, max: 4 } })).toBe(4);
		expect(etchedNumber({ sigil: true, sigilNumber: 4, quantity: { value: 0, max: 4 } })).toBeNull();
		expect(etchedNumber({ sigil: true, sigilNumber: null, quantity: { value: null, max: null } })).toBeNull();
		expect(etchedNumber({ sigil: false, sigilNumber: 4, quantity: { value: 4, max: 4 } })).toBeNull();
	});

	it("may be etched for any number but last night's", () => {
		expect(sigilChoices()).toHaveLength(SIGIL_MAX);
		expect(sigilChoices(7)).not.toContain(7);
		expect(sigilChoices(7)).toHaveLength(SIGIL_MAX - 1);
	});

	it("gives as many turns as the number, and fades at sunset, remembering it", () => {
		expect(etchUpdate(5)).toEqual({ "system.sigilNumber": 5, "system.quantity": { value: 5, max: 5 }, "system.restock": "" });
		expect(fadedUpdate({ sigilNumber: 5 })).toEqual({ "system.sigilNumber": null, "system.sigilLast": 5, "system.quantity": { value: null, max: null } });
		expect(fadedUpdate({ sigilNumber: null })).toBeNull();
	});
});
