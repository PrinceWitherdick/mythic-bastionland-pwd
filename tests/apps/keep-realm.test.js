import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askToKeepRealm, keepRealmLines } from "../../module/apps/keep-realm.js";

const root = join(import.meta.dirname, "../..");
const lang = JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8"));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);
const format = (key, data) => String(lookup(key) ?? key).replace(/\{(\w+)\}/g, (_match, name) => data?.[name] ?? "");

/**
 * A rolled Realm, as far as the window reads one.
 * @param {object} [options]
 */
const fakeRealm = ({ seed = "abc123", holdings = 4, myths = 6, landmarks = 13, barriers = 24, rivers = [[{}, {}, {}]] } = {}) => ({
	seed,
	rivers,
	holdings: Array.from({ length: holdings }, (_, index) => ({ hex: { col: index, row: 1 } })),
	myths: Array.from({ length: myths }, (_, index) => ({ number: index + 1 })),
	landmarks: Array.from({ length: landmarks }, () => ({ type: "dwelling" })),
	barriers: Array.from({ length: barriers }, (_, index) => ({ edge: String(index) }))
});

/** A node the window writes a line into. */
const fakeNode = () => ({ textContent: "" });

/** The window as it stands on screen, with just enough of a button to press. */
function fakeWindow() {
	const nodes = {
		"[data-keep-again]": {
			dataset: {},
			disabled: false,
			classes: new Set(),
			classList: { add: (name) => nodes["[data-keep-again]"].classes.add(name), remove: (name) => nodes["[data-keep-again]"].classes.delete(name) },
			clicks: [],
			addEventListener: (_type, handler) => nodes["[data-keep-again]"].clicks.push(handler),
			// Pressing it waits on the roll, as a Referee pressing it can't.
			press: () => Promise.all(nodes["[data-keep-again]"].clicks.map((handler) => handler()))
		},
		"[data-keep-tally]": fakeNode(),
		"[data-keep-seed]": fakeNode()
	};
	return {
		nodes,
		element: {
			querySelector: (selector) => nodes[selector] ?? null,
			getBoundingClientRect: () => ({ width: 340, height: 210 })
		},
		setPosition: vi.fn()
	};
}

/** The window the last call opened, once it has been rendered. */
let window_;
/** What the window was opened with. */
let options;
/** Presses the Keep button, closing the window. */
let keep;

beforeEach(() => {
	window_ = fakeWindow();
	options = null;
	// A 1000 by 1000 map drawn from 100, 100, in a browser 900 tall with no hotbar showing.
	globalThis.canvas = {
		ready: true,
		dimensions: { sceneRect: { x: 0, y: 0, width: 1000, height: 1000 } },
		primary: { getGlobalPosition: () => ({ x: 100, y: 100 }) },
		stage: { scale: { x: 1 } }
	};
	globalThis.document = { getElementById: () => null };
	globalThis.window = { innerHeight: 900 };
	globalThis.game = { i18n: { localize: (key) => lookup(key) ?? key, format } };
	globalThis.ui = { notifications: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } };
	globalThis.foundry = {
		applications: {
			handlebars: { renderTemplate: vi.fn(async (_path, context) => JSON.stringify(context)) },
			api: {
				DialogV2: {
					wait: vi.fn(async (given) => {
						options = given;
						given.render({}, window_);
						return new Promise((resolve) => { keep = () => resolve("keep"); });
					})
				}
			}
		}
	};
});

afterEach(() => {
	for (const name of ["canvas", "document", "window", "game", "ui", "foundry"]) delete globalThis[name];
});

describe("where the window stands in making a Realm", () => {
	const source = readFileSync(join(root, "module/actions/realm.js"), "utf8");
	const creating = source.slice(source.indexOf("export async function createRealmScene"), source.indexOf("async function refreshThumbnail"));

	it("asks before the Realm is pictured, given the Company or whispered as a key", () => {
		const asked = creating.indexOf("askToKeepRealm");
		expect(asked).toBeGreaterThan(-1);
		for (const after of ["refreshThumbnail(scene)", "placeCompanyAtStart", "postRealmKey"]) {
			expect(creating.indexOf(after), after).toBeGreaterThan(asked);
		}
	});

	it("asks only where something was rolled, not of a Realm drawn by hand", () => {
		expect(source).toContain("review: SETUP_PARTS.some((part) => rules.roll[part])");
	});

	// One roller, so a Realm rolled again from the window is the same in every way as one rerolled from the map.
	it("rolls again the way the Realm tools' Reroll does", () => {
		expect(source).toContain("roll: () => rollRealmAgain(scene)");
		expect(source.slice(source.indexOf("export async function rerollRealm"))).toContain("await rollRealmAgain(scene);");
	});
});

describe("what the window says about a rolled Realm", () => {
	it("counts what was laid on the map, and names the seed", () => {
		const { tally, seed } = keepRealmLines(fakeRealm());
		expect(seed).toBe("abc123");
		expect(tally).toContain("4 Holdings");
		expect(tally).toContain("6 Myths");
		expect(tally).toContain("13 Landmarks");
		expect(tally).toContain("24 Barriers");
	});

	it("says whether a river crosses the Realm, which is a reason to roll again", () => {
		expect(keepRealmLines(fakeRealm()).tally).toContain(lookup("bastionland.realm.keep.river"));
		expect(keepRealmLines(fakeRealm({ rivers: [] })).tally).toContain(lookup("bastionland.realm.keep.noRiver"));
		// A course of a single hex is no river, as the drawing tally counts them.
		expect(keepRealmLines(fakeRealm({ rivers: [[{}]] })).tally).toContain(lookup("bastionland.realm.keep.noRiver"));
		expect(keepRealmLines(fakeRealm({ rivers: [[{}, {}], [{}, {}]] })).tally).toContain("2 rivers");
	});
});

describe("keeping a rolled Realm", () => {
	it("keeps what's on the map when nothing is rolled again", async () => {
		const first = fakeRealm();
		const asked = askToKeepRealm({ realm: first, roll: vi.fn() });
		await Promise.resolve();
		keep();
		expect(await asked).toBe(first);
	});

	it("rolls another Realm onto the same Scene as often as it's asked, and keeps the last", async () => {
		const first = fakeRealm({ seed: "first1" });
		const second = fakeRealm({ seed: "second", landmarks: 10 });
		const third = fakeRealm({ seed: "third1", rivers: [] });
		const roll = vi.fn().mockResolvedValueOnce(second).mockResolvedValueOnce(third);
		const asked = askToKeepRealm({ realm: first, roll });
		await Promise.resolve();

		await window_.nodes["[data-keep-again]"].press();
		expect(window_.nodes["[data-keep-seed]"].textContent).toBe("second");
		expect(window_.nodes["[data-keep-tally]"].textContent).toContain("10 Landmarks");

		await window_.nodes["[data-keep-again]"].press();
		expect(roll).toHaveBeenCalledTimes(2);
		expect(window_.nodes["[data-keep-seed]"].textContent).toBe("third1");
		expect(window_.nodes["[data-keep-tally]"].textContent).toContain(lookup("bastionland.realm.keep.noRiver"));

		keep();
		expect(await asked).toBe(third);
	});

	it("holds the button while a Realm is being rolled, so two aren't set going at once", async () => {
		const button = window_.nodes["[data-keep-again]"];
		let land;
		const rolled = fakeRealm({ seed: "landed" });
		const roll = vi.fn(() => new Promise((resolve) => { land = () => resolve(rolled); }));
		const asked = askToKeepRealm({ realm: fakeRealm(), roll });
		await Promise.resolve();

		const pressed = button.press();
		expect(button.disabled).toBe(true);
		expect(button.classes.has("is-rolling")).toBe(true);
		// A second press while the first is still rolling rides the roll already going.
		const again = button.press();
		expect(roll).toHaveBeenCalledTimes(1);

		land();
		await Promise.all([pressed, again]);
		expect(button.disabled).toBe(false);
		expect(button.classes.has("is-rolling")).toBe(false);

		keep();
		expect(await asked).toBe(rolled);
	});

	it("waits on a roll set going as the window was closed", async () => {
		const first = fakeRealm({ seed: "first1" });
		const last = fakeRealm({ seed: "last12" });
		let land;
		const asked = askToKeepRealm({ realm: first, roll: () => new Promise((resolve) => { land = () => resolve(last); }) });
		await Promise.resolve();

		window_.nodes["[data-keep-again]"].press();
		// Closed while that Realm is still being written: what follows must take the Realm it lays down.
		keep();
		let settled = false;
		const kept = asked.then((realm) => { settled = true; return realm; });
		await Promise.resolve();
		expect(settled).toBe(false);

		land();
		expect(await kept).toBe(last);
	});

	it("keeps what's on the map when a roll fails, and says so", async () => {
		const first = fakeRealm();
		const roll = vi.fn(async () => { throw new Error("no room for a river"); });
		const asked = askToKeepRealm({ realm: first, roll });
		await Promise.resolve();

		vi.spyOn(console, "error").mockImplementation(() => {});
		await window_.nodes["[data-keep-again]"].press();
		expect(ui.notifications.error).toHaveBeenCalledWith(lookup("bastionland.realm.keep.failed"));
		expect(window_.nodes["[data-keep-again]"].disabled).toBe(false);

		keep();
		expect(await asked).toBe(first);
		vi.restoreAllMocks();
	});

	it("wears the system's own look, and closing it keeps the Realm rather than throwing", async () => {
		const asked = askToKeepRealm({ realm: fakeRealm(), roll: vi.fn() });
		await Promise.resolve();
		expect(options.classes).toContain("bastionland-dialog");
		expect(options.rejectClose).toBe(false);
		// One button to have done with: rolling again is the window's own.
		expect(options.buttons.map((button) => button.action)).toEqual(["keep"]);
		keep();
		await asked;
	});

	it("stands at the foot of the map, clear of it and of the hotbar", async () => {
		const asked = askToKeepRealm({ realm: fakeRealm(), roll: vi.fn() });
		await Promise.resolve();
		// Centred on the map, and as low as the window's own height allows.
		expect(options.position).toMatchObject({ width: 340, left: 430 });
		expect(options.position.top).toBeLessThan(900);
		// Placed again once it has been laid out and its height is known.
		expect(window_.setPosition).toHaveBeenCalledWith({ left: 430, top: 678 });
		keep();
		await asked;
	});
});
