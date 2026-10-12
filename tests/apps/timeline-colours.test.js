import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TimelineHost, onTimelineAction } from "../../module/apps/timeline-ui.js";

/**
 * The Referee's Colours menu: Reset puts a kind back to its own colour, on
 * the row and its picker, and keeps it there through a redraw while the
 * menu is still open, rather than the saved colour the redrawn row is given.
 */

/** The colour every kind is painted here, as the page would compute it. */
const OWN = "#010203";

beforeEach(() => {
	globalThis.game = { user: { isGM: true }, settings: { get: () => undefined } };
	globalThis.document = { createElement: () => ({ style: {}, remove() {} }), querySelectorAll: () => [], addEventListener() {} };
	globalThis.getComputedStyle = () => ({ color: "rgb(1, 2, 3)" });
	globalThis.cancelAnimationFrame = () => {};
});

afterEach(async () => {
	// The draft is the module's own: Cancel lets it go for the next test.
	await onTimelineAction(null, { dataset: { timeline: "coloursCancel" }, closest: () => null });
	delete globalThis.game;
	delete globalThis.document;
	delete globalThis.getComputedStyle;
	delete globalThis.cancelAnimationFrame;
});

/** A row as the template draws it: the kind's saved colour, marked repainted. */
function savedRow(kind, value) {
	const classes = new Set(value ? ["is-repainted"] : []);
	const picker = { value: "" };
	const row = {
		dataset: { kind, value },
		picker,
		classList: { contains: (name) => classes.has(name), toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
		querySelector: (selector) => (selector === "input[type=color]" ? picker : null),
		append() {}
	};
	return row;
}

/** A Timeline holding the Colours menu, open or shut, over these rows. */
function timelineWith(rows, { open = true } = {}) {
	const colours = { open, querySelectorAll: (selector) => (selector === "li[data-kind]" ? rows : []), addEventListener() {} };
	return {
		matches: (selector) => selector === ".bastionland-timeline",
		classList: { contains: () => false },
		style: { setProperty() {}, removeProperty() {} },
		querySelector: (selector) => (selector === 'details[data-timeline-menu="colours"]' ? colours : null),
		querySelectorAll: () => [],
		addEventListener() {}
	};
}

const resetOf = (timeline, row) => ({
	dataset: { timeline: "coloursReset", kind: row.dataset.kind },
	closest: (selector) => (selector === ".bastionland-timeline" ? timeline : selector === "li[data-kind]" ? row : null)
});

describe("the Colours menu's Reset", () => {
	// Review, 2026-10-12: Reset took the mark off its own button, not its row.
	it("takes the mark off its row and opens the picker on the kind's own colour", async () => {
		const row = savedRow("myth", "#112233");
		const timeline = timelineWith([row]);
		await onTimelineAction(null, resetOf(timeline, row));
		expect(row.classList.contains("is-repainted")).toBe(false);
		expect(row.picker.value).toBe(OWN);
	});

	// Review, 2026-10-12: a redraw while the menu was open put the saved colour back in the picker.
	it("holds through a redraw while the menu is open", async () => {
		const row = savedRow("myth", "#112233");
		await onTimelineAction(null, resetOf(timelineWith([row]), row));
		const redrawn = savedRow("myth", "#112233");
		const other = savedRow("glory", "#445566");
		const host = new TimelineHost("test");
		host.wire(timelineWith([redrawn, other]));
		expect(redrawn.classList.contains("is-repainted")).toBe(false);
		expect(redrawn.picker.value).toBe(OWN);
		// A kind with no draft keeps its saved colour.
		expect(other.classList.contains("is-repainted")).toBe(true);
		expect(other.picker.value).toBe("#445566");
		host.close();
	});
});
