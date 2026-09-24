import { describe, expect, it } from "vitest";
import { pageStep, placeDropdown, rowsOf, step, takesOver, typeahead } from "../../module/apps/dropdown.js";

const viewport = { width: 1920, height: 1080 };

describe("placeDropdown", () => {
	const panel = { width: 200, height: 120 };

	it("drops under the box it belongs to", () => {
		expect(placeDropdown({ top: 400, bottom: 424, left: 300, width: 160 }, panel, viewport))
			.toEqual({ top: 426, left: 300, width: 200, maxHeight: 120, drops: true });
	});

	it("is never narrower than the box", () => {
		expect(placeDropdown({ top: 400, bottom: 424, left: 300, width: 300 }, panel, viewport).width).toBe(300);
	});

	it("goes over the box when there's no room under it", () => {
		expect(placeDropdown({ top: 800, bottom: 824, left: 300, width: 160 }, { width: 200, height: 300 }, viewport))
			.toEqual({ top: 498, left: 300, width: 200, maxHeight: 300, drops: false });
	});

	it("is cut down to what the window leaves it", () => {
		const place = placeDropdown({ top: 180, bottom: 204, left: 300, width: 160 }, { width: 200, height: 600 }, { width: 1920, height: 400 });
		expect(place).toEqual({ top: 206, left: 300, width: 200, maxHeight: 188, drops: true });
	});

	it("stays inside the window's right edge", () => {
		expect(placeDropdown({ top: 400, bottom: 424, left: 1850, width: 60 }, panel, viewport).left).toBe(1714);
	});
});

/** A list with a group name at the top, a greyed-out row and a second group. */
const rows = Object.freeze([
	{ kind: "group", label: "Spark" },
	{ kind: "option", label: "Ash", index: 0 },
	{ kind: "option", label: "Briar", index: 1, disabled: true },
	{ kind: "option", label: "Bramble", index: 2 },
	{ kind: "group", label: "Omen" },
	{ kind: "option", label: "Crow", index: 3 }
]);

describe("step", () => {
	it("starts on the first row that can be chosen", () => {
		expect(step(rows, -1, 1)).toBe(1);
	});

	it("passes over a greyed-out row and a group's name", () => {
		expect(step(rows, 1, 1)).toBe(3);
		expect(step(rows, 3, 1)).toBe(5);
	});

	it("stays where it is at either end", () => {
		expect(step(rows, 5, 1)).toBe(5);
		expect(step(rows, 1, -1)).toBe(1);
	});

	it("comes up from below the last row", () => {
		expect(step(rows, rows.length, -1)).toBe(5);
	});
});

describe("pageStep", () => {
	it("runs to the end of a list shorter than a page", () => {
		expect(pageStep(rows, 1, 1)).toBe(5);
		expect(pageStep(rows, 5, -1)).toBe(1);
	});
});

describe("typeahead", () => {
	it("finds the first row starting with the letter", () => {
		expect(typeahead(rows, "b", -1)).toBe(3);
	});

	it("narrows down as more is typed, keeping the row it's on", () => {
		expect(typeahead(rows, "br", 3)).toBe(3);
	});

	it("walks round the list on a letter pressed again", () => {
		expect(typeahead(rows, "c", 1)).toBe(5);
		expect(typeahead(rows, "b", 3)).toBe(3);
	});

	it("pays no heed to case", () => {
		expect(typeahead(rows, "CR", 5)).toBe(5);
	});

	it("finds nothing where nothing starts with it", () => {
		expect(typeahead(rows, "z", -1)).toBe(-1);
	});
});

/**
 * A select just real enough to read: its options in order, some of them under
 * an optgroup's name.
 * @param {[string|null, string[]][]} groups
 * @param {number} selectedIndex
 */
function select(groups, selectedIndex) {
	const options = [];
	for (const [name, labels] of groups) {
		const parent = name ? { tagName: "OPTGROUP", label: name } : null;
		for (const label of labels) options.push({ parentElement: parent, label, text: label, index: options.length });
	}
	return { options, selectedIndex };
}

describe("rowsOf", () => {
	it("stands each group's name above the options it holds", () => {
		expect(rowsOf(select([[null, ["All"]], ["Scores", ["VIG", "CLA"]], ["Gear", ["Blade"]]], 2))).toEqual([
			{ kind: "option", label: "All", index: 0, disabled: false, chosen: false },
			{ kind: "group", label: "Scores" },
			{ kind: "option", label: "VIG", index: 1, disabled: false, chosen: false },
			{ kind: "option", label: "CLA", index: 2, disabled: false, chosen: true },
			{ kind: "group", label: "Gear" },
			{ kind: "option", label: "Blade", index: 3, disabled: false, chosen: false }
		]);
	});

	it("names a group once, however many options it holds", () => {
		const names = rowsOf(select([["Seasons", ["Spring", "Summer", "Harvest"]]], 0)).filter((row) => row.kind === "group");
		expect(names).toEqual([{ kind: "group", label: "Seasons" }]);
	});
});

/**
 * A select in a window, as `takesOver` reads one.
 * @param {object} how
 * @param {string[]|null} [how.window] The window's classes, or null for no window around it.
 * @param {boolean} [how.card] Whether it sits in one of the system's chat cards.
 */
function inWindow({ window: classes = null, card = false, ...rest }) {
	return {
		tagName: "SELECT",
		disabled: false,
		multiple: false,
		size: 0,
		...rest,
		closest: (selector) => {
			if (selector === ".bastionland-card") return card ? {} : null;
			if (selector === ".application") return classes ? { classList: classes } : null;
			return null;
		}
	};
}

describe("takesOver", () => {
	it("takes the list of a select in one of the system's windows", () => {
		expect(takesOver(inWindow({ window: ["application", "sheet", "bastionland-sheet"] }))).toBe(true);
	});

	it("takes the list of a select in one of the system's chat cards", () => {
		expect(takesOver(inWindow({ card: true, window: ["application", "chat"] }))).toBe(true);
	});

	it("leaves Foundry's own windows and other modules' alone", () => {
		expect(takesOver(inWindow({ window: ["application", "settings-config"] }))).toBe(false);
		expect(takesOver(inWindow({ window: null }))).toBe(false);
	});

	it("leaves a list that isn't a single choice, or is greyed out", () => {
		const system = ["application", "bastionland-dialog"];
		expect(takesOver(inWindow({ window: system, multiple: true }))).toBe(false);
		expect(takesOver(inWindow({ window: system, size: 6 }))).toBe(false);
		expect(takesOver(inWindow({ window: system, disabled: true }))).toBe(false);
	});

	it("leaves anything that isn't a select", () => {
		expect(takesOver({ tagName: "INPUT", closest: () => null })).toBe(false);
		expect(takesOver(null)).toBe(false);
	});
});
