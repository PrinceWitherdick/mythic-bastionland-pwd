import { beforeEach, describe, expect, it, vi } from "vitest";

/** A possession that restores Virtues (p68), used from its row: never spent on a bearer with nothing to restore. */

vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key, postCard: vi.fn(async () => ({})), registerCardButtons: vi.fn(), warn: vi.fn() }));
vi.mock("../../module/apps/actor-pick.js", () => ({ chooseOne: vi.fn() }));
vi.mock("../../module/apps/ui.js", () => ({ confirmDialog: vi.fn() }));
vi.mock("../../module/actions/abilities.js", () => ({ loseVirtue: vi.fn(), rollDamageOn: vi.fn(), shortName: (item) => item.name, spendUse: vi.fn(async () => {}) }));
vi.mock("../../module/actions/afflictions.js", () => ({ afflictionLabel: (each) => each.name }));
vi.mock("../../module/actions/ledger.js", () => ({ causedBy: (key) => ({ ledgerCause: key }) }));

const { effectRowLabel, useEffect } = await import("../../module/actions/possession-effects.js");
const { chooseOne } = await import("../../module/apps/actor-pick.js");
const { spendUse } = await import("../../module/actions/abilities.js");

/** A Knight with these Virtues, as value over most. */
const knight = (vig, cla, spi) => ({
	name: "Sir Ash",
	isOwner: true,
	system: { virtues: { vig: { value: vig, max: 12 }, cla: { value: cla, max: 12 }, spi: { value: spi, max: 12 } } },
	update: vi.fn(async () => {})
});

const balm = (effect) => ({ name: "Balm", system: { effect, quantity: { value: 1, max: 1 } } });

beforeEach(() => vi.clearAllMocks());

describe("a possession that restores Virtues", () => {
	it("offers no button while every Virtue is at its most, and isn't spent if used", async () => {
		for (const effect of ["restoresOne", "restoresAll"]) {
			const full = knight(12, 12, 12);
			expect(effectRowLabel(balm(effect), full)).toBeNull();
			expect(await useEffect(full, balm(effect))).toBe(false);
			expect(full.update).not.toHaveBeenCalled();
		}
		expect(spendUse).not.toHaveBeenCalled();
		expect(chooseOne).not.toHaveBeenCalled();
	});

	it("restores every Virtue below its most, and offers only those to pick one of", async () => {
		const ash = knight(4, 12, 7);
		expect(effectRowLabel(balm("restoresAll"), ash)).toBe("possessionEffects.restoresAll.use");
		expect(await useEffect(ash, balm("restoresAll"))).toBe(true);
		expect(ash.update).toHaveBeenCalledWith({ "system.virtues.vig.value": 12, "system.virtues.spi.value": 12 }, { ledgerCause: "item" });
		chooseOne.mockResolvedValueOnce({ id: "vig" });
		await useEffect(ash, balm("restoresOne"));
		expect(chooseOne.mock.calls[0][0].map(({ id }) => id)).toEqual(["vig", "spi"]);
		expect(spendUse).toHaveBeenCalledTimes(2);
	});
});
