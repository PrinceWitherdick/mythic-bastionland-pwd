import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { showGuideSection, wireGuideRail } from "../../module/apps/guide-rail.js";
import { KNIGHTHOOD_SECTIONS, knighthoodSection } from "../../module/rules/knighthood.js";

const root = join(import.meta.dirname, "../..");

/** Just enough of an element for the rail: dataset, hidden, a class list and attributes. */
function element(dataset = {}) {
	const classes = new Set();
	const attributes = new Map();
	return {
		dataset,
		hidden: false,
		scrollTop: 0,
		classList: {
			toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
			contains: (name) => classes.has(name)
		},
		setAttribute: (name, value) => attributes.set(name, value),
		removeAttribute: (name) => attributes.delete(name),
		getAttribute: (name) => attributes.get(name) ?? null
	};
}

/** A guide of the given sections, the first showing. */
function guide(keys) {
	const tabs = keys.map((key) => element({ guideTab: key }));
	const panels = keys.map((key, index) => Object.assign(element({ guidePanel: key }), { hidden: index > 0 }));
	const main = element();
	const listeners = [];
	const rail = { addEventListener: (type, listener) => listeners.push({ type, listener }) };
	const root = {
		querySelectorAll: (selector) => ({ "[data-guide-panel]": panels, "[data-guide-tab]": tabs })[selector] ?? [],
		querySelector: (selector) => ({ ".bastionland-guide__main": main, ".bastionland-guide__rail": rail })[selector] ?? null
	};
	/** Click a tab, as the rail sees it. */
	const click = (index) => {
		const target = { closest: () => tabs[index] };
		for (const { type, listener } of listeners) if (type === "click") listener({ target });
	};
	return { root, tabs, panels, main, click };
}

describe("the section rail", () => {
	it("shows one section and marks its tab", () => {
		const { root, tabs, panels } = guide(["a", "b", "c"]);
		expect(showGuideSection(root, "b")).toBe(true);
		expect(panels.map((panel) => panel.hidden)).toEqual([true, false, true]);
		expect(tabs.map((tab) => tab.classList.contains("is-active"))).toEqual([false, true, false]);
		expect(tabs.map((tab) => tab.getAttribute("aria-current"))).toEqual([null, "true", null]);
	});

	it("starts the section at its top", () => {
		const { root, main } = guide(["a", "b"]);
		main.scrollTop = 400;
		showGuideSection(root, "b");
		expect(main.scrollTop).toBe(0);
	});

	it("leaves the page alone for a section it doesn't have", () => {
		const { root, panels } = guide(["a", "b"]);
		expect(showGuideSection(root, "z")).toBe(false);
		expect(panels.map((panel) => panel.hidden)).toEqual([false, true]);
	});

	it("switches from a click on the rail and says which section is showing", () => {
		const { root, panels, click } = guide(["a", "b", "c"]);
		const onShow = vi.fn();
		wireGuideRail(root, onShow);
		click(2);
		expect(panels.map((panel) => panel.hidden)).toEqual([true, true, false]);
		expect(onShow).toHaveBeenCalledWith("c");
	});
});

describe("the Knighthood window's sections", () => {
	const template = readFileSync(join(root, "templates/dialogs/knighthood.hbs"), "utf8");
	const panels = [...template.matchAll(/data-guide-panel="([^"]+)"\{\{#unless shown\.([^}]+)\}\} hidden\{\{\/unless\}\}/g)];

	it("has a panel for every tab on the rail, in the rail's order, each hidden unless shown", () => {
		expect(panels.map(([, key]) => key)).toEqual(KNIGHTHOOD_SECTIONS.map(({ key }) => key));
		for (const [, key, shown] of panels) expect(shown).toBe(key);
	});

	it("opens at the section last read, or the first", () => {
		expect(knighthoodSection("glory")).toBe("glory");
		expect(knighthoodSection(null)).toBe("knighthood");
		expect(knighthoodSection("gone")).toBe("knighthood");
	});
});
