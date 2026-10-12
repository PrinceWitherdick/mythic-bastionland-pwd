import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWhenIdle } from "../../module/apps/ui.js";

/** A field that matches by its kind, as `input` or `textarea`, and lives in one box. */
const field = (kind) => ({ kind, matches: (selector) => selector.split(", ").some((part) => part.startsWith(kind)) });

/** A box on the page holding the fields put in it. */
const box = (...fields) => ({ fields, contains(other) {
	return this.fields.includes(other);
} });

/** A window with a "sheet" part and a "timeline" part. */
function windowOf() {
	const sheet = box();
	const timeline = box();
	return { rendered: true, element: { contains: (other) => sheet.contains(other) || timeline.contains(other) }, parts: { sheet, timeline }, render: vi.fn() };
}

describe("renderWhenIdle", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		globalThis.document = { activeElement: null };
	});

	afterEach(() => {
		vi.useRealTimers();
		delete globalThis.document;
	});

	it("draws at once when nobody is typing", () => {
		const app = windowOf();
		renderWhenIdle(app);
		renderWhenIdle(app, { parts: ["timeline"] });
		expect(app.render.mock.calls).toEqual([[], [{ parts: ["timeline"] }]]);
	});

	it("waits while someone types in it, then draws once", () => {
		const app = windowOf();
		const typing = field("textarea");
		app.parts.sheet.fields.push(typing);
		document.activeElement = typing;
		renderWhenIdle(app);
		renderWhenIdle(app);
		vi.advanceTimersByTime(1000);
		expect(app.render).not.toHaveBeenCalled();
		document.activeElement = null;
		vi.advanceTimersByTime(300);
		expect(app.render.mock.calls).toEqual([[]]);
	});

	it("still draws when the field it waited on is swept away, with no blur", () => {
		const app = windowOf();
		const typing = field("input");
		app.parts.timeline.fields.push(typing);
		document.activeElement = typing;
		renderWhenIdle(app, { parts: ["timeline"] });
		// Another redraw takes the field off the page; focus falls back to the body.
		app.parts.timeline.fields.length = 0;
		document.activeElement = { matches: () => false };
		vi.advanceTimersByTime(300);
		expect(app.render.mock.calls).toEqual([[{ parts: ["timeline"] }]]);
		renderWhenIdle(app, { parts: ["timeline"] });
		expect(app.render).toHaveBeenCalledTimes(2);
	});

	it("draws one part without waiting on a field in another", () => {
		const app = windowOf();
		const typing = field("textarea");
		app.parts.sheet.fields.push(typing);
		document.activeElement = typing;
		renderWhenIdle(app, { parts: ["timeline"] });
		expect(app.render.mock.calls).toEqual([[{ parts: ["timeline"] }]]);
	});

	it("waits only on the fields it is told are busy", () => {
		const app = windowOf();
		const typing = field("textarea");
		app.parts.timeline.fields.push(typing);
		document.activeElement = typing;
		renderWhenIdle(app, { parts: ["timeline"], busy: "input" });
		expect(app.render).toHaveBeenCalledTimes(1);
	});

	it("gathers what each asks for while it waits", () => {
		const app = windowOf();
		const typing = field("input");
		app.parts.timeline.fields.push(typing);
		document.activeElement = typing;
		renderWhenIdle(app, { parts: ["timeline"] });
		renderWhenIdle(app, { parts: ["sheet"] });
		document.activeElement = null;
		vi.advanceTimersByTime(300);
		expect(app.render.mock.calls).toEqual([[{ parts: ["timeline", "sheet"] }]]);
	});

	it("draws the whole window when one asks for it while a part waits", () => {
		const app = windowOf();
		const typing = field("input");
		app.parts.timeline.fields.push(typing);
		document.activeElement = typing;
		renderWhenIdle(app, { parts: ["timeline"] });
		renderWhenIdle(app);
		document.activeElement = null;
		vi.advanceTimersByTime(300);
		expect(app.render.mock.calls).toEqual([[]]);
	});

	it("draws nothing once the window has closed", () => {
		const app = windowOf();
		const typing = field("input");
		app.parts.sheet.fields.push(typing);
		document.activeElement = typing;
		renderWhenIdle(app);
		app.rendered = false;
		vi.advanceTimersByTime(300);
		expect(app.render).not.toHaveBeenCalled();
	});
});
