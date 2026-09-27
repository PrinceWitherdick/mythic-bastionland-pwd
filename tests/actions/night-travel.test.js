import { beforeEach, describe, expect, it, vi } from "vitest";
import { movedThisNight, nightMove } from "../../module/rules/night-travel.js";
import { SYSTEM_ID } from "../../module/system-id.js";

/** The world's calendar, what the next dialog answers, and what was stored. */
let calendar;
let answer;
let asked;
let stored;

vi.mock("../../module/apps/ui.js", () => ({
	chooseDialog: vi.fn(async (options) => {
		asked.push(options);
		return answer;
	})
}));
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({ ...calendar }) }));
vi.mock("../../module/actions/company.js", () => ({ wentSomewhere: () => true }));
vi.mock("../../module/actions/journey.js", () => ({ COMPANY_MOVED_HOOK: "mythic-bastionland.companyMoved" }));
vi.mock("../../module/actions/realm.js", () => ({ isRealmScene: () => true, sceneGeometry: () => ({}) }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollRefereeTable: vi.fn() }));

const { companyMovedThisNight, travelAtNight } = await import("../../module/actions/night-travel.js");
const { rollRefereeTable } = await import("../../module/actions/referee-rolls.js");

const night = { age: 1, year: 1, season: "spring", day: 4, phase: "night" };

beforeEach(() => {
	calendar = { ...night };
	answer = null;
	asked = [];
	stored = null;
	vi.mocked(rollRefereeTable).mockClear();
	globalThis.game = {
		user: { isGM: true },
		settings: {
			get: (scope, key) => (scope === SYSTEM_ID && key === "nightTravel" ? stored : null),
			set: vi.fn(async (_scope, _key, value) => {
				stored = value;
			})
		}
	};
});

describe("nightMove", () => {
	it("asks until the Referee has answered this Night, then rolls blind or asks nothing", () => {
		expect(nightMove(null, { ...night, phase: "afternoon" })).toBe("day");
		expect(nightMove(null, night)).toBe("ask");
		expect(nightMove({ when: night, blind: null }, night)).toBe("ask");
		expect(nightMove({ when: night, blind: true }, night)).toBe("blind");
		expect(nightMove({ when: night, blind: false }, night)).toBe("sighted");
		expect(nightMove({ when: { ...night, day: 3 }, blind: true }, night)).toBe("ask");
	});

	it("knows the Company moved this Night, answered or not", () => {
		expect(movedThisNight({ when: night, blind: null }, night)).toBe(true);
		expect(movedThisNight({ when: { ...night, day: 3 }, blind: false }, night)).toBe(false);
		expect(movedThisNight(null, night)).toBe(false);
	});
});

describe("travelAtNight", () => {
	it("asks once a Night, with a guide and light", async () => {
		answer = "sighted";
		expect(await travelAtNight()).toBe("sighted");
		expect(await travelAtNight()).toBe("sighted");
		expect(asked).toHaveLength(1);
		expect(rollRefereeTable).not.toHaveBeenCalled();
		expect(companyMovedThisNight()).toBe(true);
	});

	it("rolls Travelling Blind now and at each new Hex, without them", async () => {
		answer = "blind";
		await travelAtNight();
		await travelAtNight();
		expect(rollRefereeTable).toHaveBeenCalledTimes(2);
		expect(rollRefereeTable).toHaveBeenCalledWith("blind");
		expect(asked).toHaveLength(1);
	});

	it("remembers the move while unanswered, and asks again", async () => {
		expect(await travelAtNight()).toBeNull();
		expect(companyMovedThisNight()).toBe(true);
		await travelAtNight();
		expect(asked).toHaveLength(2);
	});

	it("asks nothing by day, and a new Night afresh", async () => {
		calendar.phase = "morning";
		expect(await travelAtNight()).toBeNull();
		calendar.phase = "night";
		answer = "blind";
		await travelAtNight();
		calendar.day = 5;
		answer = "sighted";
		expect(await travelAtNight()).toBe("sighted");
		expect(asked).toHaveLength(2);
	});
});
