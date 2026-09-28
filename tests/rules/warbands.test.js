import { describe, expect, it } from "vitest";
import {
	UPKEEP_LOSS,
	UPKEEP_STRAINS,
	UPKEEP_VIRTUE,
	WARBAND_ORIGINS,
	isOrigin,
	isStrain,
	musterState,
	strainedSpirit,
	warbandLine,
	warbandState,
	willNotFollowOrders
} from "../../module/rules/warbands.js";
import { VIRTUES } from "../../module/rules/virtues.js";

describe("WARBAND_ORIGINS", () => {
	it("holds the three the book draws soldiers from, in its order", () => {
		expect(WARBAND_ORIGINS).toEqual(["vassals", "allies", "mercenaries"]);
		expect(WARBAND_ORIGINS.every(isOrigin)).toBe(true);
		expect(isOrigin("wyverns")).toBe(false);
	});
});

describe("UPKEEP_STRAINS", () => {
	it("holds the three ways a Warband is worn down", () => {
		expect(UPKEEP_STRAINS).toEqual(["illRested", "poorlyFed", "pushedTooFar"]);
		expect(UPKEEP_STRAINS.every(isStrain)).toBe(true);
		expect(isStrain("bored")).toBe(false);
	});

	it("costs d6 of the Virtue their needs are met in, as Virtue Loss does elsewhere", () => {
		expect(UPKEEP_LOSS).toBe("1d6");
		expect(VIRTUES).toContain(UPKEEP_VIRTUE);
		expect(UPKEEP_VIRTUE).toBe("spi");
	});
});

describe("strainedSpirit", () => {
	it("takes the loss off their Spirit", () => {
		expect(strainedSpirit(10, 4)).toBe(6);
	});

	it("never falls below 0, however hard they're pushed", () => {
		expect(strainedSpirit(3, 6)).toBe(0);
		expect(strainedSpirit(0, 6)).toBe(0);
	});

	it("reads nonsense as nothing rather than throwing", () => {
		expect(strainedSpirit(undefined, 2)).toBe(0);
		expect(strainedSpirit(7, -3)).toBe(7);
	});
});

describe("willNotFollowOrders", () => {
	it("is true at SPI 0, where they act only in their self interest", () => {
		expect(willNotFollowOrders(0)).toBe(true);
		expect(willNotFollowOrders(1)).toBe(false);
		expect(willNotFollowOrders(13)).toBe(false);
	});
});

describe("musterState", () => {
	it("counts what a Seat of Power has raised against its 3", () => {
		expect(musterState(1, 3)).toEqual({ mustered: 1, muster: 3, spare: 2, full: false });
	});

	it("is full once a Holding has raised its 2", () => {
		expect(musterState(2, 2)).toMatchObject({ spare: 0, full: true });
		expect(musterState(3, 2)).toMatchObject({ spare: 0, full: true });
	});

	it("reads nothing raised, and nonsense, as none", () => {
		expect(musterState(0, 2)).toMatchObject({ mustered: 0, spare: 2, full: false });
		expect(musterState(-2, 2)).toMatchObject({ mustered: 0, full: false });
	});
});

describe("warbandState", () => {
	const standing = { mortalWound: false, spi: 7, vig: 10 };

	it("routs a Warband by a Mortal Wound, or by failed Morale that sent it running (p10, p11)", () => {
		expect(warbandState(standing)).toEqual({ routed: false, surrendered: false, broken: false, wipedOut: false });
		expect(warbandState({ ...standing, mortalWound: true }).routed).toBe(true);
		expect(warbandState({ ...standing, moraleBroken: "fled" })).toMatchObject({ routed: true, surrendered: false });
		expect(warbandState({ ...standing, moraleBroken: "surrendered" })).toMatchObject({ routed: false, surrendered: true });
	});

	it("breaks it at SPI 0 and wipes it out at VIG 0", () => {
		expect(warbandState({ ...standing, spi: 0 }).broken).toBe(true);
		expect(warbandState({ ...standing, vig: 0 }).wipedOut).toBe(true);
	});
});

describe("warbandLine", () => {
	const warband = (state = {}) => ({ routed: false, broken: false, wipedOut: false, ...state });

	it("gives their Spirit and nothing else while they stand", () => {
		expect(warbandLine({ name: "The Militia", spi: 7, warband: warband() })).toEqual({ name: "The Militia", spi: 7, state: null });
	});

	it("says the worst that has become of them", () => {
		expect(warbandLine({ name: "A", spi: 0, warband: warband({ broken: true }) }).state).toBe("broken");
		expect(warbandLine({ name: "A", spi: 0, warband: warband({ broken: true, routed: true }) }).state).toBe("routed");
		expect(warbandLine({ name: "A", spi: 0, warband: warband({ broken: true, routed: true, wipedOut: true }) }).state).toBe("wipedOut");
	});

	it("counts surrender as worse than broken, but not as bad as a rout", () => {
		expect(warbandLine({ name: "A", spi: 0, warband: warband({ broken: true, surrendered: true }) }).state).toBe("surrendered");
		expect(warbandLine({ name: "A", spi: 7, warband: warband({ surrendered: true, routed: true }) }).state).toBe("routed");
	});

	it("says nothing of an individual, who has no Warband states", () => {
		expect(warbandLine({ name: "Sir Ose", spi: 12, warband: null }).state).toBeNull();
	});
});
