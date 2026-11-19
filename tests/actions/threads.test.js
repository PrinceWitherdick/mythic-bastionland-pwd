import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The Toolkit, the calendar, and what the window that asks is answered with. */
let toolkit;
let calendar;
let answer;

vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn(async () => answer) }));
vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data ? `${key}:${Object.values(data).join("|")}` : key) }));
vi.mock("../../module/compat.js", () => ({ deletionEntry: (path) => [path, "<gone>"] }));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => calendar, seasonLabel: ({ season, age }) => `${season} of age ${age}` }));
vi.mock("../../module/actions/gm-toolkit.js", () => ({ GM_TOOLKIT_TYPE: "gmToolkit", theGmToolkit: () => toolkit }));
vi.mock("../../module/actions/hex-names.js", () => ({ hexLabel: (hex) => `Column ${hex.col}, Row ${hex.row}` }));
vi.mock("../../module/actions/knights.js", () => ({ companyKnights: () => [{ id: "k1", name: "Sir Corvin", system: {} }, { id: "k2", name: "Dame Dead", system: { slain: true } }] }));
vi.mock("../../module/actions/timeline-record.js", () => ({ recordOnTrack: vi.fn(async () => {}) }));

const { inputDialog } = await import("../../module/apps/ui.js");
const { recordOnTrack } = await import("../../module/actions/timeline-record.js");
const { addThread, editThread, keepThreadRoll, keepThreadRolls, leaveOpen, openThreads, registerThreadsWatch, settleThread, threadView, threadsInHex } = await import("../../module/actions/threads.js");

const scene = { id: "s1", name: "Gravenmoor" };

beforeEach(() => {
	vi.clearAllMocks();
	calendar = { age: 2, year: 2, season: "harvest", day: 3, phase: "afternoon" };
	answer = null;
	toolkit = {
		system: { threads: {} },
		// Writes land as Foundry's would: a dotted path sets one key, and the deletion mark takes one off.
		update: vi.fn(async (changes) => {
			for (const [path, value] of Object.entries(changes)) {
				const [, , id, field] = path.split(".");
				if (value === "<gone>") delete toolkit.system.threads[id];
				else if (field) toolkit.system.threads[id][field] = value;
				else toolkit.system.threads[id] = value;
			}
		})
	};
	let made = 0;
	globalThis.foundry = { utils: { randomID: () => `id${++made}` } };
	globalThis.Hooks = { callAll: vi.fn() };
	globalThis.game = {
		user: { isGM: true },
		actors: { get: (id) => ({ k1: { name: "Sir Corvin" } })[id] ?? null },
		scenes: { get: (id) => (id === "s1" ? scene : null) }
	};
});

afterEach(() => {
	for (const key of ["foundry", "Hooks", "game"]) delete globalThis[key];
});

describe("leaving something open", () => {
	it("keeps it on the Toolkit with the Season it was left open in, and tells whoever shows the list", async () => {
		const id = await addThread({ kind: "favour", name: "The miller's favour", knight: "k1" });
		expect(id).toBe("id1");
		expect(openThreads()).toEqual([expect.objectContaining({ id: "id1", kind: "favour", name: "The miller's favour", knight: "k1", opened: { age: 2, year: 2, season: "harvest" } })]);
	});

	it("tells whoever shows the list on every client once the Toolkit's threads change, and nothing else", () => {
		const hooks = {};
		Hooks.on = (name, fn) => (hooks[name] = fn);
		registerThreadsWatch();
		hooks.updateActor({ type: "gmToolkit" }, { system: { threads: { id1: {} } } });
		expect(Hooks.callAll).toHaveBeenCalledWith("bastionlandThreadsChanged");
		vi.mocked(Hooks.callAll).mockClear();
		hooks.updateActor({ type: "gmToolkit" }, { system: { notes: "" } });
		hooks.updateActor({ type: "knight" }, { system: { threads: {} } });
		expect(Hooks.callAll).not.toHaveBeenCalled();
	});

	it("keeps nothing with no name, for a player, or with no Toolkit to keep it", async () => {
		expect(await addThread({ kind: "favour", name: " " })).toBeNull();
		game.user.isGM = false;
		expect(await addThread({ kind: "favour", name: "The miller" })).toBeNull();
		game.user.isGM = true;
		toolkit = null;
		expect(await addThread({ kind: "favour", name: "The miller" })).toBeNull();
	});

	it("asks in a window offering the living Knights and the hex, and ties it there only when ticked", async () => {
		answer = { kind: "contact", name: "A drover", knight: "k1", place: true };
		await leaveOpen({ scene, hex: { col: 5, row: 9 } });
		const { context } = inputDialog.mock.calls[0][0];
		expect(context.knights.map(({ name }) => name)).toEqual(["Sir Corvin"]);
		expect(context.place).toEqual({ label: "threads.here:Column 5, Row 9", checked: true });
		expect(openThreads()[0]).toMatchObject({ kind: "contact", scene: "s1", hex: "5,9" });

		answer = { kind: "contact", name: "Another", knight: "", place: false };
		await leaveOpen({ scene, hex: { col: 5, row: 9 } });
		expect(openThreads()[1]).toMatchObject({ scene: "", hex: "" });
	});

	it("keeps to the one kind where only one is offered, as a session's end asks for a situation", async () => {
		answer = { name: "The smoke to the north" };
		await leaveOpen({ kind: "situation", kinds: ["situation"] });
		expect(inputDialog.mock.calls[0][0].context.kinds).toEqual([expect.objectContaining({ key: "situation", checked: true })]);
		expect(openThreads()[0].kind).toBe("situation");
	});

	it("keeps nothing when the window is closed", async () => {
		expect(await leaveOpen()).toBeNull();
		expect(toolkit.update).not.toHaveBeenCalled();
	});
});

describe("what's left open in a hex", () => {
	it("is what's tied to that hex of that Realm", async () => {
		await addThread({ kind: "favour", name: "Here", scene: "s1", hex: "5,9" });
		await addThread({ kind: "favour", name: "Elsewhere", scene: "s1", hex: "6,9" });
		expect(threadsInHex(scene, { col: 5, row: 9 }).map(({ name }) => name)).toEqual(["Here"]);
		expect(threadsInHex(null, { col: 5, row: 9 })).toEqual([]);
	});
});

describe("how a thread reads", () => {
	it("says whose it is, when it was left open, and what the last roll made of it", async () => {
		const id = await addThread({ kind: "situation", name: "The smoke", knight: "k1", scene: "s1", hex: "5,9" });
		await keepThreadRoll(id, { d6: 2, result: "worse" });
		const view = threadView(openThreads()[0], { scene });
		expect(view).toMatchObject({ id, kind: "situation", kindLabel: "threads.kinds.situation.label", name: "The smoke", hex: "Column 5, Row 9", hexKey: "5,9" });
		expect(view.details.split(" · ")).toHaveLength(3);
		expect(view.details).toContain("Sir Corvin");
		expect(view.details).toContain("refereeRolls.tables.unresolved.results.worse");
	});

	it("only names another Realm's hex, with no button to it", async () => {
		await addThread({ kind: "favour", name: "Here", scene: "s1", hex: "5,9" });
		const view = threadView(openThreads()[0], { scene: { id: "other" } });
		expect(view.hex).toBe("Column 5, Row 9");
		expect(view.hexKey).toBe("");
	});
});

describe("changing and settling", () => {
	it("changes what one says, keeping when it was left open and its rolls", async () => {
		const id = await addThread({ kind: "favour", name: "A favour earned by Sir Corvin", knight: "k1" });
		await keepThreadRoll(id, { d6: 5, result: "better" });
		answer = { kind: "favour", name: "The miller of Harrowgate owes Corvin", knight: "k1", place: true };
		expect(await editThread(id, scene, { col: 7, row: 11 })).toBe(true);
		expect(openThreads()[0]).toMatchObject({ name: "The miller of Harrowgate owes Corvin", scene: "s1", hex: "7,11", opened: { season: "harvest" } });
		expect(openThreads()[0].rolls).toHaveLength(1);
		expect(toolkit.system.threads[id].id).toBeUndefined();
	});

	it("keeps a session's rolls on their situations in one write", async () => {
		const smoke = await addThread({ kind: "situation", name: "The smoke" });
		const grain = await addThread({ kind: "situation", name: "The grain" });
		vi.mocked(toolkit.update).mockClear();
		expect(await keepThreadRolls([{ id: smoke, roll: { d6: 2, result: "worse" } }, { id: grain, roll: { d6: 6, result: "better" } }, { id: "gone", roll: { d6: 1, result: "worst" } }])).toBe(true);
		expect(toolkit.update).toHaveBeenCalledTimes(1);
		expect(openThreads().map(({ rolls }) => rolls.map(({ result }) => result))).toEqual([["worse"], ["better"]]);
	});

	it("keeps it with its Knight while it's changed, though they're Slain or gone since", async () => {
		const id = await addThread({ kind: "favour", name: "A favour earned by Dame Dead", knight: "k2" });
		answer = { kind: "favour", name: "Owed to Dame Dead's heirs", knight: "k2" };
		await editThread(id);
		const { knights } = inputDialog.mock.calls[0][0].context;
		expect(knights).toEqual([{ id: "k1", name: "Sir Corvin", selected: false }, { id: "k2", name: "threads.knightGone", selected: true }]);
		expect(openThreads()[0].knight).toBe("k2");
	});

	it("takes a settled one off the list and writes it on the Company's Timeline", async () => {
		const id = await addThread({ kind: "favour", name: "The miller's favour", scene: "s1", hex: "5,9" });
		expect(await settleThread(id)).toBe(true);
		expect(openThreads()).toEqual([]);
		// Written behind the settling, so the list changes without waiting on it.
		await Promise.resolve();
		expect(recordOnTrack).toHaveBeenCalledWith("company", expect.objectContaining({ source: "thread", key: `thread:${id}`, place: "Column 5, Row 9" }));
		expect(await settleThread(id)).toBe(false);
	});
});
