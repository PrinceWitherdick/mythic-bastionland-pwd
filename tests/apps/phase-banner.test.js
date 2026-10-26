import { afterEach, describe, expect, it, vi } from "vitest";

let calendar = { phase: "morning", season: "spring", age: 1, day: 1 };
vi.mock("../../module/actions/calendar.js", () => ({
	CALENDAR_HOOK: "bastionlandCalendar",
	chronicleLabel: () => "date",
	getCalendar: () => calendar,
	ordinalLabel: (n) => String(n)
}));
vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));
vi.mock("../../module/client-settings.js", () => ({ TEXT_SIZE_HOOK: "textSize", read: () => true, reducesMotion: () => true }));
vi.mock("../../module/apps/ui.js", () => ({ PAINTED: "bastionland-painted" }));

const { closePhaseBanner, registerPhaseBanner, showPhaseBanner } = await import("../../module/apps/PhaseBanner.js");

/** Whether a fake element answers to a selector of the forms "[data-x]" or '[data-x="y"]'. */
function matches(node, selector) {
	const [, name, value] = selector.match(/^\[data-([a-z]+)(?:="([^"]*)")?\]$/) ?? [];
	if (!name || !(name in node.dataset)) return false;
	return value === undefined || node.dataset[name] === value;
}

/** Just enough of an element for the banner and its menu to be built, found and pressed. */
function fakeElement(tag) {
	const node = {
		tag, id: "", className: "", type: "", innerHTML: "", dataset: {}, attributes: {}, children: [], listeners: {}, parent: null,
		append: (...kids) => { for (const kid of kids) kid.parent = node; node.children.push(...kids); },
		prepend: (...kids) => { for (const kid of kids) kid.parent = node; node.children.unshift(...kids); },
		remove: () => { if (node.parent) node.parent.children = node.parent.children.filter((kid) => kid !== node); node.parent = null; },
		setAttribute: (key, value) => { node.attributes[key] = value; },
		addEventListener: (type, handler) => { node.listeners[type] = handler; },
		get isConnected() { return true; },
		contains: (other) => other === node || node.children.some((kid) => kid.contains(other)),
		querySelectorAll: (selector) => node.children.flatMap((kid) => [...(matches(kid, selector) ? [kid] : []), ...kid.querySelectorAll(selector)]),
		querySelector: (selector) => node.querySelectorAll(selector)[0] ?? null
	};
	return node;
}

function installWorld({ gm = true } = {}) {
	const top = fakeElement("div");
	globalThis.document = {
		createElement: (tag) => fakeElement(tag),
		getElementById: (id) => (id === "ui-top" ? top : null),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn()
	};
	globalThis.foundry = { utils: { escapeHTML: (text) => text } };
	globalThis.Hooks = { on: vi.fn() };
	globalThis.game = { user: { isGM: gm }, settings: { register: vi.fn() }, tooltip: { deactivate: vi.fn() } };
	const moves = { phase: vi.fn(), weeks: vi.fn(), months: vi.fn(), year: vi.fn(), end: vi.fn(), nextEvent: () => "Planting" };
	registerPhaseBanner({ moves });
	showPhaseBanner();
	return { top, moves, banner: top.children[0] };
}

afterEach(() => {
	closePhaseBanner();
	calendar = { phase: "morning", season: "spring", age: 1, day: 1 };
	for (const key of ["document", "foundry", "Hooks", "game"]) delete globalThis[key];
});

describe("the Referee's menu under the Phase banner", () => {
	it("leads with Next Phase, naming the Phase it ends and the one it moves on to", () => {
		const { banner } = installWorld();
		banner.querySelector('[data-part="phase"]').listeners.click();
		const buttons = banner.querySelectorAll("[data-move]");
		expect(buttons.map((button) => button.dataset.move)).toEqual(["phase", "weeks", "months", "year", "end"]);
		const [next] = buttons;
		expect(next.innerHTML).toContain("time.nextPhase");
		expect(next.dataset.tooltip).toBe('time.banner.phaseHint {"phase":"time.phases.morning","next":"time.phases.afternoon"}');
	});

	it("names the Morning as what follows Night", () => {
		calendar = { ...calendar, phase: "night" };
		const { banner } = installWorld();
		banner.querySelector('[data-part="age"]').listeners.click();
		expect(banner.querySelector('[data-move="phase"]').dataset.tooltip).toContain('"next":"time.phases.morning"');
	});

	it("puts the menu away and moves the Phase on when Next Phase is pressed", () => {
		const { banner, moves } = installWorld();
		banner.querySelector('[data-part="phase"]').listeners.click();
		banner.querySelector('[data-move="phase"]').listeners.click();
		expect(moves.phase).toHaveBeenCalledOnce();
		expect(moves.weeks).not.toHaveBeenCalled();
		expect(banner.querySelector("[data-move]")).toBeNull();
	});

	it("gives players no menu to open", () => {
		const { banner } = installWorld({ gm: false });
		expect(banner.querySelector('[data-part="phase"]').listeners.click).toBeUndefined();
	});
});
