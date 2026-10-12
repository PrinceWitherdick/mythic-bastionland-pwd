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
