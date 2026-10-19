import { beforeEach, describe, expect, it, vi } from "vitest";
import { fogMove, movedThisNight, nightMove } from "../../module/rules/night-travel.js";
import { DIRECTIONS, neighbour, realmGeometry } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";

/** The world's calendar, what the next dialog answers, and what was stored. */
let calendar;
let answer;
let asked;
let stored;
/** The world's other settings: the day's fog, and the Company's Phase in it. */
let others;

vi.mock("../../module/apps/ui.js", () => ({
	chooseDialog: vi.fn(async (options) => {
		asked.push(options);
		return answer;
	})
}));
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({ ...calendar }) }));
vi.mock("../../module/actions/company.js", () => ({ wentSomewhere: () => true, findCompanyToken: () => companyToken, setCompanyHex: vi.fn() }));
vi.mock("../../module/actions/journey.js", () => ({ COMPANY_MOVED_HOOK: "mythic-bastionland.companyMoved" }));
vi.mock("../../module/actions/realm.js", () => ({ isRealmScene: () => true, sceneGeometry: () => realmGeometry() }));
vi.mock("../../module/actions/hex-names.js", () => ({ hexLabel: ({ col, row }) => `${col},${row}` }));
vi.mock("../../module/actions/off-course.js", () => ({ getOffCourse: () => cursed }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollRefereeTable: vi.fn(async () => blindRead) }));

const { companyMovedThisNight, rollBlindMove, settleBlindTravel, travelAtNight, travelInFog } = await import("../../module/actions/night-travel.js");
const { rollRefereeTable } = await import("../../module/actions/referee-rolls.js");
const { setCompanyHex } = await import("../../module/actions/company.js");

/** The Company's Token on the Realm, or null; what the blind roll reads; when a Curse struck. */
let companyToken;
let blindRead;
let cursed;

const night = { age: 1, year: 1, season: "spring", day: 4, phase: "night" };

beforeEach(() => {
	calendar = { ...night };
	answer = null;
	asked = [];
	stored = null;
	others = new Map();
	companyToken = {};
	blindRead = { d6: 5, result: "asPlanned", side: null };
	cursed = null;
	vi.mocked(rollRefereeTable).mockClear();
	vi.mocked(setCompanyHex).mockClear();
	globalThis.ui = { notifications: { info: vi.fn() } };
	globalThis.game = {
		user: { isGM: true },
		settings: {
			get: (scope, key) => {
				if (scope !== SYSTEM_ID) return null;
				return key === "nightTravel" ? stored : others.get(key) ?? null;
			},
			set: vi.fn(async (_scope, key, value) => {
				if (key === "nightTravel") stored = value;
				else others.set(key, value);
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

describe("rollBlindMove", () => {
	const g = realmGeometry();
	const from = { col: 6, row: 6 };
	const south = neighbour(g, from, DIRECTIONS.indexOf("south"));
	const move = { scene: {}, from, entered: [south] };

	it("circles the Company's Token back to where it set off (p18)", async () => {
		blindRead = { d6: 1, result: "circleBack", side: null };
		expect(await rollBlindMove(move)).toEqual(from);
		expect(setCompanyHex).toHaveBeenCalledWith(move.scene, from, { forced: true });
	});

	it("drifts it a hex to one side of where it made for", async () => {
		blindRead = { d6: 3, result: "drift", side: "right" };
		const landing = neighbour(g, from, DIRECTIONS.indexOf("southwest"));
		expect(await rollBlindMove(move)).toEqual(landing);
		// The hex it passed through last is where a long move set off on its last step.
		const longer = { scene: {}, from: null, entered: [from, south] };
		vi.mocked(setCompanyHex).mockClear();
		await rollBlindMove(longer);
		expect(setCompanyHex).toHaveBeenCalledWith(longer.scene, landing, { forced: true });
	});

	it("leaves it be as planned, or with no Company Token to move", async () => {
		expect(await rollBlindMove(move)).toBeNull();
		blindRead = { d6: 1, result: "circleBack", side: null };
		companyToken = null;
		expect(await rollBlindMove(move)).toBeNull();
		expect(await rollBlindMove(null)).toBeNull();
		expect(setCompanyHex).not.toHaveBeenCalled();
		expect(rollRefereeTable).toHaveBeenCalledTimes(3);
	});
});

describe("a Curse's blind Phase", () => {
	it("rolls for a move in the Phase after it struck, asking nothing of the dark (p14)", async () => {
		cursed = { ...night, phase: "afternoon" };
		await settleBlindTravel({}, { ended: true, entered: [{ col: 6, row: 7 }], from: { col: 6, row: 6 }, chosen: true });
		expect(rollRefereeTable).toHaveBeenCalledWith("blind");
		expect(asked).toHaveLength(0);
		// Still a Night on the move, which its end counts as travelled.
		expect(companyMovedThisNight(night)).toBe(true);

		// A drift it didn't choose asks nothing at all.
		vi.mocked(rollRefereeTable).mockClear();
		expect(await settleBlindTravel({}, { ended: true, entered: [{ col: 6, row: 7 }], from: { col: 6, row: 6 }, chosen: false })).toBeNull();
		expect(rollRefereeTable).not.toHaveBeenCalled();
	});
});

describe("fogMove", () => {
	const day = { ...night, phase: "morning" };

	it("asks nothing without fog, or by night, which asks for itself", () => {
		expect(fogMove(null, day, false)).toBe("clear");
		expect(fogMove(null, night, true)).toBe("clear");
	});

	it("asks until the Referee has answered this Phase, then rolls blind or asks nothing", () => {
		expect(fogMove(null, day, true)).toBe("ask");
		expect(fogMove({ when: day, blind: true }, day, true)).toBe("blind");
		expect(fogMove({ when: day, blind: false }, day, true)).toBe("course");
		expect(fogMove({ when: day, blind: false }, { ...day, phase: "afternoon" }, true)).toBe("ask");
	});
});

describe("travelInFog", () => {
	beforeEach(() => {
		calendar = { ...night, phase: "morning" };
		others.set("fog", { when: { ...calendar } });
	});

	it("asks once a Phase whether the Company can keep its course", async () => {
		answer = "course";
		expect(await travelInFog()).toBe("course");
		expect(await travelInFog()).toBe("course");
		expect(asked).toHaveLength(1);
		expect(asked[0].buttons.map(({ action }) => action)).toEqual(["course", "blind"]);
		expect(rollRefereeTable).not.toHaveBeenCalled();
	});

	it("rolls Travelling Blind now and at each new Hex, without a way to", async () => {
		answer = "blind";
		await travelInFog();
		await travelInFog();
		expect(rollRefereeTable).toHaveBeenCalledTimes(2);
		expect(rollRefereeTable).toHaveBeenCalledWith("blind");
	});

	it("asks again in the afternoon, and nothing once the fog has lapsed", async () => {
		answer = "course";
		await travelInFog();
		calendar.phase = "afternoon";
		await travelInFog();
		expect(asked).toHaveLength(2);
		calendar = { ...calendar, day: 5, phase: "morning" };
		expect(await travelInFog()).toBeNull();
		expect(asked).toHaveLength(2);
	});

	it("leaves the Night's own question alone", async () => {
		calendar.phase = "night";
		expect(await travelInFog()).toBeNull();
		expect(asked).toHaveLength(0);
		expect(stored).toBeNull();
	});
});
