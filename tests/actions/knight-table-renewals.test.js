import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

/**
 * A Knight's table rolled before rolls were dated is dated as the calendar
 * first moves: just before that move, and never in a moment time was turned back from.
 */

vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => null }));
vi.mock("../../module/book-art/myth-tables.js", () => ({ tableForEntry: () => null, verseForEntry: () => null }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(), t: (key) => key }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollMythTable: vi.fn() }));
vi.mock("../../module/actions/calendar.js", () => ({ CALENDAR_HOOK: "calendarChanged", getCalendar: () => ({}), onCalendarWrites: (fn) => globalThis.Hooks.on("calendarChanged", fn) }));
vi.mock("../../module/actions/ledger.js", () => ({ causedBy: () => ({}) }));
vi.mock("../../module/actions/table-stats.js", () => ({ applyTableStats: vi.fn() }));
vi.mock("../../module/actions/knights.js", () => ({ worldKnights: () => [] }));
vi.mock("../../module/rules/knight-types.js", () => ({ isKnight: () => true }));
vi.mock("../../module/rules/knight-tables.js", () => ({
	clauseMidSentence: (clause) => clause,
	hasTable: () => true,
	knightEntryByType: () => null,
	knightRenewal: () => ({ cadence: "season", clause: "each Season" }),
	knightTableFill: () => ({}),
	knightVerseFill: () => ({}),
	renewalDue: () => false,
	withRolls: (table) => table
}));

const { watchTableRenewals } = await import("../../module/actions/knight-tables.js");

let handler;
let knight;

beforeEach(() => {
	globalThis.Hooks = { on: (name, fn) => { if (name === "calendarChanged") handler = fn; } };
	knight = { name: "Sir Ash", isOwner: true, system: { bookTable: { rolls: [3], name: "Fish" } }, getFlag: () => null, setFlag: vi.fn() };
	const gm = { isGM: true };
	globalThis.game = { user: gm, users: { activeGM: gm }, actors: [knight] };
	globalThis.ui = { notifications: { info: vi.fn() } };
	watchTableRenewals();
});

afterEach(() => {
	for (const key of ["Hooks", "game", "ui"]) delete globalThis[key];
});

const afternoon = { age: 1, year: 1, season: "spring", day: 2, phase: "afternoon" };
const night = { ...afternoon, phase: "night" };

describe("dating a Knight's undated table roll", () => {
	it("dates it just before time moved on", () => {
		handler(night, afternoon, ["night", "phase"]);
		expect(knight.setFlag).toHaveBeenCalledWith(SYSTEM_ID, expect.any(String), afternoon);
	});

	it("dates it where time was turned back to, not the moment it left", () => {
		handler(afternoon, night, []);
		expect(knight.setFlag).toHaveBeenCalledWith(SYSTEM_ID, expect.any(String), afternoon);
	});
});
