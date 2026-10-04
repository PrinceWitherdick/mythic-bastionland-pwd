import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let shown;

vi.mock("../../module/actions/realm.js", () => ({ isRealmScene: (scene) => Boolean(scene?.isRealm) }));
vi.mock("../../module/apps/TravelsPlaces.js", () => ({ openPlaces: vi.fn() }));
vi.mock("../../module/apps/VisitedMarks.js", () => ({ openVisitedMarks: vi.fn() }));
vi.mock("../../module/canvas/visited-marks.js", () => ({
	visitedMarksShown: () => shown,
	setVisitedMarksShown: vi.fn(async (value) => { shown = value; })
}));

const { openPlaces } = await import("../../module/apps/TravelsPlaces.js");
const { openVisitedMarks } = await import("../../module/apps/VisitedMarks.js");
const { setVisitedMarksShown } = await import("../../module/canvas/visited-marks.js");
const { TRAVELS_BUTTONS_ID, refreshTravelsButtons } = await import("../../module/canvas/travels-controls.js");

/** Just enough of an element for the buttons. */
class FakeElement {
	constructor(tag) {
		this.tagName = tag.toUpperCase();
		this.children = [];
		this.parentElement = null;
		this.dataset = {};
		this.attributes = {};
		this.listeners = {};
		this.hidden = false;
		this.id = "";
	}
	get isConnected() { return true; }
	append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
	prepend(node) { node.parentElement = this; this.children.unshift(node); }
	insertBefore(node, before) { node.parentElement = this; this.children.splice(this.children.indexOf(before), 0, node); }
	setAttribute(name, value) { this.attributes[name] = value; }
	addEventListener(type, listener) { this.listeners[type] = listener; }
	querySelector(selector) {
		const action = /data-action="([^"]+)"/.exec(selector)?.[1];
		return this.children.find((child) => child.dataset.action === action) ?? null;
	}
}

let right;
let chatColumn;

const byId = (id, from = right) => {
	if (from.id === id) return from;
	for (const child of from.children) {
		const found = byId(id, child);
		if (found) return found;
	}
	return null;
};

beforeEach(() => {
	shown = true;
	right = new FakeElement("section");
	right.id = "ui-right";
	chatColumn = new FakeElement("div");
	chatColumn.id = "ui-right-column-1";
	const stack = new FakeElement("div");
	stack.id = "chat-notifications";
	chatColumn.append(stack);
	right.append(chatColumn);
	globalThis.document = { createElement: (tag) => new FakeElement(tag), getElementById: (id) => byId(id) };
	globalThis.game = { i18n: { localize: (key) => key } };
	globalThis.canvas = { scene: { isRealm: true } };
});

afterEach(() => {
	delete globalThis.document;
	delete globalThis.game;
	delete globalThis.canvas;
	vi.clearAllMocks();
});

describe("the travels buttons beside the sidebar", () => {
	it("stack Mark the Hexes Visited over Places at the top of the chat column, on a Realm", () => {
		refreshTravelsButtons();
		const column = chatColumn.children[0];
		expect(column.id).toBe(TRAVELS_BUTTONS_ID);
		expect(column.hidden).toBe(false);
		expect(column.children.map((button) => button.dataset.action)).toEqual(["visitedMarks", "places"]);
		expect(column.children.map((button) => button.dataset.tooltip)).toEqual(["bastionland.travels.controls.marks", "bastionland.travels.controls.places"]);
		expect(column.children[0].attributes["aria-pressed"]).toBe("true");
		expect(column.children[0].className).toContain("ui-control");
	});

	it("are made once, and hidden off a Realm", () => {
		refreshTravelsButtons();
		refreshTravelsButtons();
		expect(chatColumn.children.filter((child) => child.id === TRAVELS_BUTTONS_ID)).toHaveLength(1);
		canvas.scene = { isRealm: false };
		refreshTravelsButtons();
		expect(byId(TRAVELS_BUTTONS_ID).hidden).toBe(true);
	});

	it("aren't made at all on a Scene that isn't a Realm", () => {
		canvas.scene = null;
		refreshTravelsButtons();
		expect(byId(TRAVELS_BUTTONS_ID)).toBeNull();
	});

	it("flip the marks and open Places", async () => {
		refreshTravelsButtons();
		const [marks, places] = byId(TRAVELS_BUTTONS_ID).children;
		await marks.listeners.click({ preventDefault() {} });
		expect(setVisitedMarksShown).toHaveBeenCalledWith(false);
		expect(marks.attributes["aria-pressed"]).toBe("false");
		places.listeners.click({ preventDefault() {} });
		expect(openPlaces).toHaveBeenCalled();
	});

	it("open the Visited Marks window on a right-click of the footprints, and only there", () => {
		refreshTravelsButtons();
		const [marks, places] = byId(TRAVELS_BUTTONS_ID).children;
		const event = { preventDefault: vi.fn() };
		marks.listeners.contextmenu(event);
		expect(event.preventDefault).toHaveBeenCalled();
		expect(openVisitedMarks).toHaveBeenCalledTimes(1);
		expect(setVisitedMarksShown).not.toHaveBeenCalled();
		expect(places.listeners.contextmenu).toBeUndefined();
	});
});
