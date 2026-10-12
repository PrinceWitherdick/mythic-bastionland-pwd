import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CALENDAR_HOOK } from "../../module/actions/calendar.js";
import { unwatchTimeline, watchTimeline } from "../../module/apps/timeline-ui.js";

/**
 * A Timeline reads only the Season it is now from the calendar, so the clock
 * turning a Phase or a Day mustn't draw a whole board again.
 */

let handlers;

beforeEach(() => {
	handlers = new Map();
	let next = 0;
	globalThis.Hooks = {
		on(name, fn) {
			handlers.set(name, fn);
			return ++next;
		},
		off(name) {
			handlers.delete(name);
		}
	};
});

afterEach(() => {
	delete globalThis.Hooks;
});

const at = (more) => ({ age: 1, year: 1, season: "spring", phase: "morning", day: 1, ...more });

describe("a Timeline following the calendar", () => {
	it("is drawn again for a new Season or Age, not for a Phase or a Day", () => {
		let drawn = 0;
		const hooks = watchTimeline(null, () => drawn++);
		const turn = (after, before) => handlers.get(CALENDAR_HOOK)(after, before, []);

		turn(at({ phase: "afternoon" }), at());
		turn(at({ day: 2 }), at());
		expect(drawn).toBe(0);

		turn(at({ season: "harvest" }), at());
		turn(at({ age: 2 }), at());
		expect(drawn).toBe(2);

		unwatchTimeline(hooks);
		expect(handlers.has(CALENDAR_HOOK)).toBe(false);
	});
});

describe("a thread following the Company's Season turns", () => {
	const journal = { getFlag: () => true, pages: [] };
	const page = (entries) => ({ type: "timeline", parent: journal, system: { trackId: "company", entries } });
	const turn = { id: "t1", season: "1-spring", source: "season", title: "Harvest Begins" };
	const card = { id: "c1", season: "1-spring", source: "hand", title: "Set out" };

	beforeEach(() => {
		journal.pages = [];
		globalThis.game = { journal: [journal] };
	});

	afterEach(() => {
		delete globalThis.game;
	});

	it("is drawn again when the Company's turns move, and not for its cards", () => {
		let drawn = 0;
		const hooks = watchTimeline("k1", () => drawn++);
		const made = page({ c1: card });
		handlers.get("createJournalEntryPage")(made);
		expect(drawn).toBe(1);

		// A card written: the turns are as the page was made with.
		handlers.get("updateJournalEntryPage")(page({ c1: { ...card, title: "Set out at dawn" } }), { system: { entries: {} } });
		// Something other than the entries.
		handlers.get("updateJournalEntryPage")(page({ c1: card }), { name: "Company" });
		expect(drawn).toBe(1);

		handlers.get("updateJournalEntryPage")(page({ c1: card, t1: turn }), { system: { entries: {} } });
		expect(drawn).toBe(2);

		handlers.get("deleteJournalEntryPage")(made);
		handlers.get("createJournalEntryPage")(page({}));
		expect(drawn).toBe(4);
		// The page made again has no turns, as the watcher now knows.
		handlers.get("updateJournalEntryPage")(page({ c1: card }), { system: { entries: {} } });
		expect(drawn).toBe(4);
		unwatchTimeline(hooks);
	});
});
