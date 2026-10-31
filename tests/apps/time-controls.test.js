import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Setting the calendar by hand is a correction: nothing that comes between
 * Seasons or Ages is carried out, the hidden year and Day are kept, and only a
 * changed Phase is told to the table. Turning the Age stays a button of its own.
 */

let calendar;
let choice;

vi.mock("../../module/actions/calendar.js", () => ({
	getCalendar: () => ({ ...calendar }),
	setCalendar: vi.fn(async (next) => {
		calendar = { ...next };
	})
}));
vi.mock("../../module/apps/ui.js", () => ({ waitDialog: vi.fn(async () => choice) }));
vi.mock("../../module/actions/glory.js", () => ({ awardGlory: vi.fn() }));
vi.mock("../../module/actions/landmarks.js", () => ({ offCourseNow: () => null, rollTravellingBlind: vi.fn() }));
vi.mock("../../module/actions/off-course.js", () => ({ clearOffCourse: vi.fn() }));
vi.mock("../../module/actions/season-events.js", () => ({ eventLabel: (key) => key, markSeasonEvent: vi.fn(), seasonEventsNow: () => ({ events: [], next: null }), stageLabel: () => "" }));
vi.mock("../../module/actions/time.js", () => ({
	advancePhase: vi.fn(),
	announcePhase: vi.fn(async () => null),
	journeyToDistantRealm: vi.fn(),
	turnAge: vi.fn(async () => "turned"),
	turnSeason: vi.fn(),
	weeksPass: vi.fn()
}));
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
vi.mock("../../module/apps/SessionEnd.js", () => ({ openSessionEnd: vi.fn() }));

const { pickAge, setCalendarByHand } = await import("../../module/apps/time-controls.js");
const { announcePhase, turnAge, turnSeason } = await import("../../module/actions/time.js");
const { setCalendar } = await import("../../module/actions/calendar.js");

beforeEach(() => {
	vi.clearAllMocks();
	calendar = { age: 2, year: 3, season: "winter", day: 7, phase: "afternoon" };
	choice = null;
	globalThis.game = { user: { isGM: true } };
});

describe("setCalendarByHand", () => {
	it("keeps the year and Day as a Season is put right, turns nothing and tells nobody", async () => {
		await setCalendarByHand({ season: "spring" });
		expect(calendar).toEqual({ age: 2, year: 3, season: "spring", day: 7, phase: "afternoon" });
		expect(turnSeason).not.toHaveBeenCalled();
		expect(announcePhase).not.toHaveBeenCalled();
	});

	it("tells the table of a Phase put right, on its card", async () => {
		await setCalendarByHand({ phase: "night" });
		expect(announcePhase).toHaveBeenCalledWith(expect.objectContaining({ phase: "night", day: 7 }));
	});

	it("leaves an Age that isn't a whole number from 1 as it was, and anything unknown alone", async () => {
		await setCalendarByHand({ age: "0", season: "summer", phase: "dusk" });
		expect(calendar).toMatchObject({ age: 2, season: "winter", phase: "afternoon" });
	});

	it("is the Referee's alone", async () => {
		game.user.isGM = false;
		expect(await setCalendarByHand({ season: "spring" })).toBeUndefined();
		expect(setCalendar).not.toHaveBeenCalled();
	});
});

describe("pickAge", () => {
	it("turns the Age with everything between Ages when that's chosen", async () => {
		choice = "turn";
		expect(await pickAge()).toBe("turned");
		expect(setCalendar).not.toHaveBeenCalled();
	});

	it("only puts the number right when set by hand", async () => {
		choice = { age: "5" };
		await pickAge();
		expect(turnAge).not.toHaveBeenCalled();
		expect(calendar).toMatchObject({ age: 5, year: 3 });
	});

	it("does nothing when closed", async () => {
		expect(await pickAge()).toBeNull();
		expect(setCalendar).not.toHaveBeenCalled();
	});
});
