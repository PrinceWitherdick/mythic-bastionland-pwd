import { describe, expect, it } from "vitest";
import { RING_SAVES, clickOpensRing, ringButtons, ringCombatant, ringGrowth, ringHasButtons } from "../../module/rules/combat-ring.js";

const virtues = { vig: { value: 12 }, cla: { value: 9 }, spi: { value: 14 } };
const runs = (buttons) => buttons.map(({ run, virtue }) => virtue ?? run);

describe("ringButtons", () => {
	it("gives a Knight, of either kind, Attack and Take Damage on the left and the three Saves with their scores on the right", () => {
		for (const type of ["knight", "npcKnight"]) {
			const { fight, saves } = ringButtons({ type, system: { virtues } });
			expect(runs(fight)).toEqual(["attack", "takeDamage"]);
			expect(saves.map(({ virtue, value }) => [virtue, value])).toEqual([["vig", 12], ["cla", 9], ["spi", 14]]);
		}
	});

	it("gives an NPC Morale too, under Take Damage", () => {
		const { fight, saves } = ringButtons({ type: "npc", system: { virtues } });
		expect(runs(fight)).toEqual(["attack", "takeDamage", "morale"]);
		expect(runs(saves)).toEqual([...RING_SAVES]);
	});

	it("gives a Structure Take Damage, and Attack only with a weapon aboard, and no Saves", () => {
		expect(ringButtons({ type: "structure", items: [] })).toEqual({ fight: [expect.objectContaining({ run: "takeDamage" })], saves: [] });
		expect(runs(ringButtons({ type: "structure", items: [{ type: "gear" }, { type: "weapon" }] }).fight)).toEqual(["attack", "takeDamage"]);
	});

	it("gives a Domain, the Toolkit, or no actor at all nothing to put up", () => {
		for (const actor of [{ type: "domain" }, { type: "gmToolkit" }, null]) expect(ringHasButtons(ringButtons(actor))).toBe(false);
	});

	it("shows a score that can't be read as 0", () => {
		expect(ringButtons({ type: "npc", system: {} }).saves.map(({ value }) => value)).toEqual([0, 0, 0]);
	});

	it("draws each button with the sheet's own icon", () => {
		const { fight, saves } = ringButtons({ type: "npc", system: { virtues } });
		expect(fight.map(({ icon }) => icon)).toEqual(["fa-solid fa-swords", "fa-solid fa-heart-crack", "fa-solid fa-flag"]);
		expect(new Set(saves.map(({ icon }) => icon))).toEqual(new Set(["fa-solid fa-dice-d20"]));
	});
});

describe("ringCombatant", () => {
	const token = { id: "t1", parent: { id: "s1" } };
	const combat = (combatants) => ({ combatants });

	it("finds the Token among any Combat's combatants on its own Scene", () => {
		const mine = { tokenId: "t1", sceneId: "s1" };
		expect(ringCombatant(token, [combat([{ tokenId: "t2", sceneId: "s1" }]), combat([mine])])).toBe(mine);
	});

	it("doesn't take the same Token id on another Scene", () => {
		expect(ringCombatant(token, [combat([{ tokenId: "t1", sceneId: "s2" }])])).toBeNull();
	});

	it("leaves out a combatant marked defeated", () => {
		expect(ringCombatant(token, [combat([{ tokenId: "t1", sceneId: "s1", isDefeated: true }])])).toBeNull();
		expect(ringCombatant(token, [combat([{ tokenId: "t1", sceneId: "s1", defeated: true }])])).toBeNull();
	});

	it("finds nothing with no Combat, or a Token on no Scene", () => {
		expect(ringCombatant(token, [])).toBeNull();
		expect(ringCombatant({ id: "t1", parent: null }, [combat([{ tokenId: "t1", sceneId: "s1" }])])).toBeNull();
	});
});

describe("clickOpensRing", () => {
	it("opens on a plain click that leaves the Token selected", () => {
		expect(clickOpensRing({ tokenId: "t1", tool: "select", controlled: true })).toBe(true);
	});

	it("opens nothing for a Token left unselected, as a drag by another's player or a release does", () => {
		expect(clickOpensRing({ tokenId: "t1", tool: "select", controlled: false })).toBe(false);
	});

	it("opens nothing under the target or ruler tools, or with a modifier held", () => {
		expect(clickOpensRing({ tokenId: "t1", tool: "target", controlled: true })).toBe(false);
		expect(clickOpensRing({ tokenId: "t1", tool: "ruler", controlled: true })).toBe(false);
		expect(clickOpensRing({ tokenId: "t1", modifiers: true, controlled: true })).toBe(false);
	});

	it("keeps them away when the same press put that Token's buttons away", () => {
		expect(clickOpensRing({ pressedOn: "t1", tokenId: "t1", controlled: true })).toBe(false);
		expect(clickOpensRing({ pressedOn: "t2", tokenId: "t1", controlled: true })).toBe(true);
	});
});

describe("ringGrowth", () => {
	it("leaves the buttons alone where the map's scale already draws them at their size", () => {
		expect(ringGrowth(1, 1)).toBe(1);
		expect(ringGrowth(2, 1)).toBe(1);
	});

	it("grows them back to their size when the map is zoomed out", () => {
		expect(ringGrowth(0.5, 1)).toBe(2);
		expect(ringGrowth(0.5, 0.5)).toBe(4);
	});

	it("leaves them alone at a zoom that can't be read", () => {
		expect(ringGrowth(0, 1)).toBe(1);
		expect(ringGrowth(Number.NaN, 1)).toBe(1);
	});
});
