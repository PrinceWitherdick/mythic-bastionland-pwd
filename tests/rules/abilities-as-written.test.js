import { describe, expect, it } from "vitest";
import { WOUND_EFFECTS, abilityOffers, declaredGrants, unmetNeed } from "../../module/rules/ability-uses.js";
import { changeAttack, sortDice } from "../../module/rules/attack.js";
import { lossOf, possessionDetails, propertyItems } from "../../module/rules/property.js";

// Wording here is invented in the book's manner, so no book text lives in the repository.

const ability = (id, system) => ({ id, name: id, type: "ability", system: { grants: {}, quantity: { value: null, max: null }, ...system } });

describe("a bite whose Wound does one of three things (p166)", () => {
	const bite = () => abilityOffers([ability("fangs", { grants: { drain: true, sleep: true, memory: true } })]);

	it("is offered with the three to pick between", () => {
		expect(WOUND_EFFECTS).toEqual(["drain", "sleep", "memory"]);
		expect(bite()[0]).toMatchObject({ effects: ["drain", "sleep", "memory"], chosen: true });
		expect(abilityOffers([ability("plain", { grants: { drain: true } })])[0].effects).toEqual([]);
	});

	it("lends only the one picked, or the first where none was", () => {
		expect(declaredGrants({ ability: { fangs: true }, effect: { fangs: "sleep" } }, bite())).toMatchObject({ drain: false, sleep: true, memory: false });
		expect(declaredGrants({ ability: { fangs: true } }, bite())).toMatchObject({ drain: true, sleep: false, memory: false });
		expect(declaredGrants({ ability: { fangs: true }, effect: { fangs: "nonsense" } }, bite())).toMatchObject({ drain: true, sleep: false });
		expect(declaredGrants({ ability: {} }, bite())).toMatchObject({ drain: false, sleep: false, memory: false });
	});

	it("stays on a joint Attack's card, each effect once", () => {
		const card = { dice: sortDice([{ faces: 8, result: 3, label: "d8", deniedBy: null }]), melee: true, impaired: false, gambits: [], feats: [], appliedTo: [], attacker: "Actor.a", onWound: ["sleep"] };
		const joint = changeAttack(card, { type: "join", actor: "Actor.b", name: "B", melee: true, dice: [{ faces: 6, result: 2, label: "Bite" }], onWound: ["sleep", "memory", "fire"] });
		expect(joint.onWound).toEqual(["sleep", "memory"]);
	});
});

describe("an Ability used only in one kind of Attack", () => {
	const offers = abilityOffers([
		ability("strike", { grants: { spirit: true }, needs: "melee" }),
		ability("charge", { bonusDie: "d12", needs: "charge" }),
		ability("odd", { grants: { blast: true }, needs: "flying" })
	]);

	it("reads its need, and no need it doesn't know", () => {
		expect(offers.map(({ needs }) => needs)).toEqual(["melee", "charge", ""]);
	});

	it("is refused outside it: a melee Attack (p68), or a mounted charge (p92)", () => {
		expect(unmetNeed([offers[0]], { melee: false, charging: false })).toEqual({ name: "strike", needs: "melee" });
		expect(unmetNeed([offers[0]], { melee: true, charging: false })).toBeNull();
		expect(unmetNeed([offers[1]], { melee: true, charging: false })).toEqual({ name: "charge", needs: "charge" });
		expect(unmetNeed([offers[1]], { melee: true, charging: true })).toBeNull();
		expect(unmetNeed([offers[2]], { melee: false, charging: false })).toBeNull();
		expect(unmetNeed([], { melee: false, charging: false })).toBeNull();
	});
});

describe("a Virtue a possession costs should something befall it (p62)", () => {
	it("is read from its line", () => {
		expect(lossOf("Old flag (lose d4 SPI if it is ever torn, see below)")).toEqual({ loss: { dice: "d4", virtue: "spi", when: "if it is ever torn" } });
		expect(lossOf("Lose 2d6 VIG")).toEqual({ loss: { dice: "2d6", virtue: "vig", when: "" } });
		expect(lossOf("A sturdy rope")).toEqual({});
	});

	it("is kept on the weapon or gear, and filled into a Knight made before it was read", () => {
		const [standard, flag] = propertyItems(["War-standard (d8 long, lose d4 SPI if it is ever torn)", "Old flag (lose d4 SPI if it is ever torn)"]).items;
		expect(standard).toMatchObject({ type: "weapon", system: { damage: "d8", loss: { dice: "d4", virtue: "spi", when: "if it is ever torn" } } });
		expect(flag).toMatchObject({ type: "gear", system: { loss: { dice: "d4", virtue: "spi" } } });
		const had = [{ id: "w1", type: "weapon", name: "War-standard", system: { loss: { dice: "", virtue: "", when: "" } } }];
		expect(possessionDetails(had, ["War-standard (d8 long, lose d4 SPI if it is ever torn)"])).toEqual([
			{ _id: "w1", "system.loss": { dice: "d4", virtue: "spi", when: "if it is ever torn" } }
		]);
	});
});
