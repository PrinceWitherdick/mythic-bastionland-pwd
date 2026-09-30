import { describe, expect, it } from "vitest";
import { AFFLICTION_TIMES, afflictionsAt, afflictionsFromText, immunityFromText, withAffliction } from "../../module/rules/afflictions.js";
import { resolveDamage } from "../../module/rules/damage.js";
import { npcFromStatBlock } from "../../module/rules/stat-blocks.js";
import { hasUnrolledVirtues } from "../../module/rules/virtues.js";

// Wording here is invented in the book's manner, so no book text lives in the repository.

describe("afflictionsFromText", () => {
	it("reads a Virtue lost each day or each round", () => {
		expect(afflictionsFromText("Those bitten must pass a VIG Save. Causes d6 VIG loss daily.", "The Rot")).toEqual([
			{ name: "The Rot", loss: "1d6", virtue: "vig", when: "day" }
		]);
		expect(afflictionsFromText("Its gaze drains 2d6 SPI each round.", "The Gaze")).toEqual([
			{ name: "The Gaze", loss: "2d6", virtue: "spi", when: "round" }
		]);
	});

	it("finds nothing in text that names no toll", () => {
		expect(afflictionsFromText("Lose d6 VIG.", "Once")).toEqual([]);
		expect(afflictionsFromText("", "Nothing")).toEqual([]);
	});
});

describe("immunityFromText", () => {
	it("keeps the sentence that says what can't harm them", () => {
		expect(immunityFromText("A shadow of a man. Cannot be harmed by blades or arrows. Hates light.")).toBe("Cannot be harmed by blades or arrows.");
		expect(immunityFromText("Can only be hurt by weapons of silver")).toBe("Can only be hurt by weapons of silver");
		expect(immunityFromText("Ignores all Damage while the bell tolls.")).toBe("Ignores all Damage while the bell tolls.");
		expect(immunityFromText("Bites hard.")).toBe("");
	});
});

describe("afflictions carried", () => {
	const rot = { name: "The Rot", loss: "1d6", virtue: "vig", when: "day" };

	it("gives each affliction once", () => {
		const once = withAffliction([], rot, "a");
		expect(once).toEqual([{ id: "a", ...rot }]);
		expect(withAffliction(once, rot, "b")).toBeNull();
		expect(withAffliction(once, { ...rot, when: "round" }, "c")).toHaveLength(2);
	});

	it("sorts them by when they take their toll", () => {
		const system = { afflictions: [{ id: "a", ...rot }, { id: "b", ...rot, when: "round" }] };
		expect(afflictionsAt(system, "day").map((each) => each.id)).toEqual(["a"]);
		expect(afflictionsAt(system, "round").map((each) => each.id)).toEqual(["b"]);
		expect(afflictionsAt({}, "day")).toEqual([]);
		expect(AFFLICTION_TIMES).toEqual(["day", "round"]);
	});
});

describe("Cast stat blocks", () => {
	it("note what keeps them from harm and what they cause", () => {
		const npc = npcFromStatBlock({
			name: "The Grey Walker",
			stats: { vig: 12, cla: 8, spi: 6, guard: 3 },
			lines: ["Touch (d6)", "Cannot be harmed by iron. Causes d6 CLA loss daily."]
		});
		expect(npc.system.immunity).toBe("Cannot be harmed by iron.");
		expect(npc.system.inflicts).toEqual([{ id: "inflicts0", name: "The Grey Walker", loss: "1d6", virtue: "cla", when: "day" }]);
	});

	it("leave both out where the stat block says neither", () => {
		const npc = npcFromStatBlock({ name: "Hound", stats: { vig: 5, cla: 10, spi: 5, guard: 4 }, lines: ["Bite (d6)"] });
		expect(npc.system).not.toHaveProperty("immunity");
		expect(npc.system).not.toHaveProperty("inflicts");
	});

	it("mark a weapon whose Damage is non-lethal", () => {
		const [gun] = npcFromStatBlock({ name: "Catcher", stats: null, lines: ["Snare-gun (2d8, long, causes non-lethal Damage)"] }).items;
		expect(gun.system.nonLethal).toBe(true);
	});
});

describe("non-lethal Damage", () => {
	it("leaves at least 1 VIG, so it never Slays", () => {
		const lethal = resolveDamage({ damage: 20, guard: 2, vigour: 8 });
		expect(lethal.outcome).toBe("slain");
		const gentle = resolveDamage({ damage: 20, guard: 2, vigour: 8, nonLethal: true });
		expect(gentle).toMatchObject({ vigour: 1, vigourLoss: 7, outcome: "mortal" });
	});

	it("leaves no Wound on somebody at 1 VIG, since it takes nothing", () => {
		expect(resolveDamage({ damage: 5, guard: 0, vigour: 1, nonLethal: true })).toMatchObject({ vigour: 1, vigourLoss: 0, guard: 0, outcome: "spared" });
	});
});

describe("hasUnrolledVirtues", () => {
	const at = (vig, cla, spi) => ({ virtues: { vig: { value: vig, max: vig }, cla: { value: cla, max: cla }, spi: { value: spi, max: spi } } });
	it("knows a hireling nobody has rolled for yet", () => {
		expect(hasUnrolledVirtues(at(10, 10, 10))).toBe(true);
		expect(hasUnrolledVirtues(at(10, 12, 10))).toBe(false);
		expect(hasUnrolledVirtues({})).toBe(false);
	});
});
