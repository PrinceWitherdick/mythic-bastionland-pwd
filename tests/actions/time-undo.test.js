import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID as SYS } from "../../module/system-id.js";

/**
 * A time advance noted as it runs and taken back by the Undo, through a small
 * world of documents whose writes run Foundry's hooks as the real ones do.
 */


vi.mock("../../module/chat/cards.js", () => ({
	t: (key) => key,
	plural: (key, count) => `${key}:${count}`,
	warn: vi.fn(),
	postCard: vi.fn(async () => ({})),
	registerCardButtons: vi.fn()
}));
vi.mock("../../module/apps/ui.js", () => ({ confirmDialog: vi.fn(async () => true), setAskingGate: vi.fn() }));
vi.mock("../../module/actions/ledger.js", () => ({ causedBy: (key) => ({ ledgerCause: key }) }));
vi.mock("../../module/actions/solo.js", () => ({ secretsKeptOn: vi.fn(() => false) }));
vi.mock("../../module/actions/calendar.js", () => ({
	getCalendar: () => ({ age: 1, year: 1, season: "spring", day: 1, phase: "morning", ...game.settings.get(SYS, "calendar") }),
	calendarLabel: (calendar) => calendar.phase,
	chronicleLabel: (calendar) => calendar.phase,
	setTurningScope: vi.fn()
}));

const { answeringWrite, captureAdvance, currentAdvanceId, advanceRecords, registerTimeCapture, watchWrites } = await import("../../module/actions/time-capture.js");
const { setTurningScope } = await import("../../module/actions/calendar.js");
const { registerTimeUndo, undoAdvance, undoOffer, undoMessage } = await import("../../module/actions/time-undo.js");
const { postCard, warn } = await import("../../module/chat/cards.js");
const { confirmDialog, setAskingGate } = await import("../../module/apps/ui.js");
const { secretsKeptOn } = await import("../../module/actions/solo.js");
const { registerQuery } = await import("../../module/queries.js");

/** @returns {Function} The gate time-capture.js hands the system's dialogs. */
const askingGate = () => vi.mocked(setAskingGate).mock.calls.at(-1)[0];

/** A dialog of the system's, as apps/ui.js opens one: through the gate, answered by `answer`. */
async function aDialog(answer) {
	const answered = await askingGate()();
	try {
		return await answer();
	} finally {
		await answered();
	}
}

/** @type {Map<string, Function[]>} */
let hooks;
/** @type {Map<string, object>} Every document, by UUID. */
let docs;
/** @type {Map<string, object>} The world's stored settings, by key. */
let stored;
let registered;

const fire = (name, ...args) => {
	for (const fn of hooks.get(name) ?? []) fn(...args);
};

/** Write changes into data as Foundry does: dotted keys, nested objects merged, `-=` deletes, `==` replaces. */
function apply(target, changes) {
	for (const [key, value] of Object.entries(changes)) {
		const parts = key.split(".");
		let here = target;
		for (const part of parts.slice(0, -1)) here = here[part] ??= {};
		const last = parts.at(-1);
		if (last.startsWith("-=")) delete here[last.slice(2)];
		else if (last.startsWith("==")) here[last.slice(2)] = structuredClone(value);
		else if (value && typeof value === "object" && !Array.isArray(value)) apply(here[last] ??= {}, value);
		else here[last] = structuredClone(value);
	}
}

function makeDoc(documentName, uuid, source, parent = null) {
	const doc = {
		documentName,
		uuid,
		id: uuid.split(".").at(-1),
		parent,
		_source: { _id: uuid.split(".").at(-1), ...structuredClone(source) },
		get name() {
			return this._source.name;
		},
		get flags() {
			return this._source.flags;
		},
		get content() {
			return this._source.content;
		},
		updateSource(data) {
			apply(this._source, data);
		},
		toObject() {
			return structuredClone(this._source);
		},
		async update(changes, options = {}) {
			fire(`preUpdate${documentName}`, doc, changes, options, "gm");
			apply(doc._source, changes);
			fire(`update${documentName}`, doc, changes, options, "gm");
			return doc;
		},
		async delete(options = {}) {
			fire(`preDelete${documentName}`, doc, options, "gm");
			docs.delete(uuid);
			fire(`delete${documentName}`, doc, options, "gm");
		}
	};
	docs.set(uuid, doc);
	return doc;
}

/** Make a document as Foundry's create does, its hooks and all. */
function create(documentName, uuid, data, parent = null) {
	const doc = makeDoc(documentName, uuid, data, parent);
	docs.delete(uuid);
	fire(`preCreate${documentName}`, doc, data, {}, "gm");
	docs.set(uuid, doc);
	fire(`create${documentName}`, doc, {}, "gm");
	return doc;
}

/** A document class as the Undo writes through it: one at a time, or a batch in one place. */
function documentClass(name) {
	const uuidIn = (parent, id) => (parent ? `${parent.uuid}.${name}.${id}` : `${name}.${id}`);
	return {
		create: async (data, { parent }) => create(name, uuidIn(parent, data._id), data, parent),
		createDocuments: async (data, { parent }) => data.map((one) => create(name, uuidIn(parent, one._id), one, parent)),
		updateDocuments: async (updates, { parent, ...options }) => {
			for (const { _id, ...changes } of updates) await docs.get(uuidIn(parent, _id)).update(changes, options);
		},
		deleteDocuments: async (ids, { parent, ...options }) => {
			for (const id of ids) await docs.get(uuidIn(parent, id)).delete(options);
		}
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	hooks = new Map();
	docs = new Map();
	stored = new Map();
	registered = new Map();
	const on = (name, fn) => hooks.set(name, [...(hooks.get(name) ?? []), fn]);
	globalThis.Hooks = { on, once: on };
	globalThis.CONFIG = { queries: {} };
	globalThis.ui = { chat: { updateMessage: vi.fn() } };
	globalThis.foundry = {
		utils: { randomID: () => `id${Math.random().toString(36).slice(2, 8)}`, deepClone: structuredClone, getDocumentClass: documentClass },
		data: {}
	};
	globalThis.fromUuidSync = (uuid) => docs.get(uuid) ?? null;
	globalThis.ChatMessage = { implementation: { deleteDocuments: vi.fn(async (ids, options) => Promise.all(ids.map((id) => docs.get(`ChatMessage.${id}`)?.delete(options)))) } };
	globalThis.game = {
		user: { id: "gm", isGM: true },
		users: { activeGM: { isSelf: true } },
		get messages() {
			return [...docs.values()].filter((doc) => doc.documentName === "ChatMessage");
		},
		scenes: {
			get active() {
				return [...docs.values()].find((doc) => doc.documentName === "Scene" && doc._source.active) ?? null;
			}
		},
		settings: {
			settings: registered,
			register: (namespace, key, config) => registered.set(`${namespace}.${key}`, { ...config, namespace, key }),
			get: (namespace, key) => {
				const doc = stored.get(`${namespace}.${key}`);
				return doc ? JSON.parse(doc._source.value) : structuredClone(registered.get(`${namespace}.${key}`)?.default);
			},
			set: async (namespace, key, value, options = {}) => {
				const id = `${namespace}.${key}`;
				const json = JSON.stringify(value);
				const doc = stored.get(id);
				if (doc) {
					fire("preUpdateSetting", doc, { value: json }, options, "gm");
					doc._source.value = json;
				} else {
					const made = { key: id, _source: { value: json } };
					fire("preCreateSetting", made, { key: id, value: json }, options, "gm");
					stored.set(id, made);
				}
				registered.get(id)?.onChange?.(value);
				return value;
			},
			storage: { get: () => ({ getSetting: (key) => stored.get(key) }) }
		}
	};
	game.settings.register(SYS, "calendar", { scope: "world", default: {} });
	game.settings.register(SYS, "deprived", { scope: "world", default: [] });
	game.settings.register(SYS, "weather", { scope: "world", default: null });
	// Queries other users ask of this client: a player's Spend, and one that waits on the Referee's answer.
	CONFIG.queries[`${SYS}.spend`] = async ({ uuid, changes }) => docs.get(uuid).update(changes);
	CONFIG.queries[`${SYS}.ask`] = async ({ until }) => aDialog(() => until);
	CONFIG.queries[`${SYS}.askOpened`] = async ({ opened, until }) => aDialog(() => {
		opened();
		return until;
	});
	registerTimeCapture();
	registerTimeUndo();
	watchWrites();
});

afterEach(() => {
	for (const name of ["Hooks", "CONFIG", "foundry", "fromUuidSync", "ChatMessage", "game", "ui"]) delete globalThis[name];
});

/** Sir Ash with a torch, at Afternoon with clear weather. */
async function aWorld() {
	await game.settings.set(SYS, "calendar", { phase: "afternoon", day: 3 });
	await game.settings.set(SYS, "weather", "clear");
	const ash = makeDoc("Actor", "Actor.ash", { name: "Sir Ash", system: { virtues: { vig: { value: 9, max: 12 } }, court: {} }, flags: { [SYS]: { ledger: [] } } });
	const torch = makeDoc("Item", "Actor.ash.Item.torch", { name: "Torch", system: { quantity: { value: 0, max: 3 } } }, ash);
	return { ash, torch };
}

/** Next Phase as the system runs it: Virtues lost, a restock, a card, the weather and Deprived, and the calendar on. */
const nextPhase = ({ ash, torch }) => captureAdvance("phase", async () => {
	await ash.update({ "system.virtues.vig.value": 4, [`flags.${SYS}.ledger`]: [{ id: "line" }] });
	await ash.update({ system: { court: { fool: { name: "Fool" } } } });
	await torch.update({ system: { quantity: { value: 3 } } });
	create("ChatMessage", `ChatMessage.card${currentAdvanceId()}`, { content: "<h3 class=\"bastionland-card__title\">Night</h3>", flags: {} });
	await game.settings.set(SYS, "deprived", ["ash"]);
	await game.settings.set(SYS, "weather", "rain");
	await game.settings.set(SYS, "calendar", { phase: "night", day: 3 });
	return "night";
});

const cards = () => [...docs.keys()].filter((uuid) => uuid.startsWith("ChatMessage."));

describe("noting a time advance", () => {
	it("keeps one record of everything it wrote, the calendar before and after", async () => {
		const world = await aWorld();
		expect(await nextPhase(world)).toBe("night");
		const [record] = advanceRecords();
		expect(record).toMatchObject({ kind: "phase", before: { phase: "afternoon" }, after: { phase: "night" } });
		const ash = record.docs.find(({ uuid }) => uuid === "Actor.ash");
		// Each note says when it was made, to put two clients' notes in order.
		expect(ash.fields["system.virtues.vig.value"]).toEqual({ had: true, before: 9, has: true, after: 4, at: expect.any(Number) });
		expect(ash.fields["system.court.fool"]).toEqual({ had: false, before: null, has: true, after: { name: "Fool" }, at: expect.any(Number) });
		// The Ledger keeps its lines.
		expect(Object.keys(ash.fields).some((path) => path.includes("ledger"))).toBe(false);
		expect(record.created).toHaveLength(1);
		expect(docs.get(record.created[0].uuid).flags[SYS].timeAdvance).toBe(record.id);
		expect(record.settings.map(({ key }) => key.split(".").at(-1)).sort()).toEqual(["calendar", "deprived", "weather"]);
	});

	it("keeps nothing when time never moved", async () => {
		const { ash } = await aWorld();
		await captureAdvance("phase", () => ash.update({ "system.virtues.vig.value": 4 }));
		expect(advanceRecords()).toEqual([]);
	});

	it("takes an advance run inside another as part of it", async () => {
		const world = await aWorld();
		await captureAdvance("distant", () => nextPhase(world));
		expect(advanceRecords().map(({ kind }) => kind)).toEqual(["distant"]);
	});

	it("keeps what the advance made that outlasts it, such as the GM Toolkit, but puts back what was written in it", async () => {
		const world = await aWorld();
		let toolkit;
		await captureAdvance("weeks", async () => {
			toolkit = create("Actor", "Actor.toolkit", { name: "Referee Toolkit", system: { seasons: {} } });
			await toolkit.update({ "system.seasons.s1": { events: ["feast"] } });
			await game.settings.set(SYS, "calendar", { phase: "morning", day: 4 });
		});
		const [record] = advanceRecords();
		expect(record.created).toEqual([]);
		await undoAdvance();
		expect(docs.has("Actor.toolkit")).toBe(true);
		expect(toolkit._source.system.seasons).toEqual({});
		expect(world.ash._source.system.virtues.vig.value).toBe(9);
	});
});

describe("taking it back", () => {
	it("puts everything back as it was, deletes its card, and turns the calendar back last", async () => {
		const world = await aWorld();
		await nextPhase(world);
		expect(undoOffer()?.label).toBe("timeUndo.banner");
		const order = [];
		registered.get(`${SYS}.calendar`).onChange = () => order.push(`calendar:${advanceRecords().length}`);
		registered.get(`${SYS}.weather`).onChange = () => order.push("weather");

		expect(await undoAdvance()).toBe(true);
		expect(world.ash._source.system.virtues.vig.value).toBe(9);
		expect(world.ash._source.system.court).toEqual({});
		expect(world.torch._source.system.quantity.value).toBe(0);
		expect(cards()).toEqual([]);
		expect(game.settings.get(SYS, "deprived")).toEqual([]);
		expect(game.settings.get(SYS, "weather")).toBe("clear");
		expect(game.settings.get(SYS, "calendar")).toEqual({ phase: "afternoon", day: 3 });
		// The record is gone before the calendar turns, so the banner never offers it again.
		expect(order).toEqual(["weather", "calendar:0"]);
		expect(advanceRecords()).toEqual([]);
		expect(postCard).toHaveBeenCalledWith(null, "report", expect.objectContaining({ title: "timeUndo.card.title", tone: "afternoon", hint: "timeUndo.card.hint" }));
		// Nothing the Undo wrote is noted as an advance of its own.
		expect(undoOffer()).toBeNull();
	});

	it("keeps a value changed since, and says so before it starts", async () => {
		const world = await aWorld();
		await nextPhase(world);
		await world.ash.update({ "system.virtues.vig.value": 2 });
		await undoAdvance();
		const [{ message }] = vi.mocked(confirmDialog).mock.calls[0];
		expect(message.join(" ")).toContain("timeUndo.confirm.kept");
		expect(world.ash._source.system.virtues.vig.value).toBe(2);
		expect(world.ash._source.system.court).toEqual({});
		expect(world.torch._source.system.quantity.value).toBe(0);
	});

	it("does nothing when the Referee keeps it", async () => {
		const world = await aWorld();
		await nextPhase(world);
		vi.mocked(confirmDialog).mockResolvedValueOnce(false);
		expect(await undoAdvance()).toBe(false);
		expect(world.ash._source.system.virtues.vig.value).toBe(4);
		expect(advanceRecords()).toHaveLength(1);
	});

	it("goes back one advance at a time, newest first", async () => {
		const world = await aWorld();
		await nextPhase(world);
		await captureAdvance("phase", async () => {
			await world.ash.update({ "system.virtues.vig.value": 1 });
			await game.settings.set(SYS, "calendar", { phase: "morning", day: 4 });
		});
		const [older, newer] = advanceRecords();
		expect(await undoAdvance(older.id)).toBe(false);
		expect(warn).toHaveBeenCalledWith("timeUndo.notNewest");
		expect(await undoAdvance(newer.id)).toBe(true);
		expect(world.ash._source.system.virtues.vig.value).toBe(4);
		expect(await undoAdvance()).toBe(true);
		expect(world.ash._source.system.virtues.vig.value).toBe(9);
		expect(game.settings.get(SYS, "calendar")).toEqual({ phase: "afternoon", day: 3 });
	});

	it("isn't offered once time has moved on by hand", async () => {
		const world = await aWorld();
		await nextPhase(world);
		await game.settings.set(SYS, "calendar", { phase: "morning", day: 4 });
		expect(undoOffer()).toBeNull();
		expect(await undoAdvance()).toBe(false);
		expect(warn).toHaveBeenCalledWith("timeUndo.moved");
	});

	it("does nothing, and keeps the advance, when the calendar was written over since at the same moment", async () => {
		const world = await aWorld();
		await nextPhase(world);
		// Saved again by another client, the same Phase written another way, so it can't be turned back.
		stored.get(`${SYS}.calendar`)._source.value = JSON.stringify({ day: 3, phase: "night" });
		expect(await undoAdvance()).toBe(false);
		expect(warn).toHaveBeenCalledWith("timeUndo.moved");
		expect(world.torch._source.system.quantity.value).toBe(3);
		expect(advanceRecords()).toHaveLength(1);
		expect(cards()).toHaveLength(1);
	});

	it("makes again what the advance deleted", async () => {
		const world = await aWorld();
		await captureAdvance("season", async () => {
			await world.torch.delete();
			await game.settings.set(SYS, "calendar", { phase: "morning", season: "summer" });
		});
		expect(docs.has("Actor.ash.Item.torch")).toBe(false);
		await undoAdvance();
		expect(docs.get("Actor.ash.Item.torch")?._source.name).toBe("Torch");
	});

	it("tells the Referee what it will take back, and which cards had buttons pressed since", async () => {
		const world = await aWorld();
		await nextPhase(world);
		const [record] = advanceRecords();
		docs.get(record.created[0].uuid)._source.flags[SYS].spentButtons = ["[data-x]#0"];
		const { undoPlan } = await import("../../module/rules/time-undo.js");
		const plan = undoPlan(record, { sourceOf: (uuid) => docs.get(uuid)?._source ?? null, settingOf: (key) => stored.get(key)?._source.value, lastKey: `${SYS}.calendar` });
		const message = undoMessage(record, plan).join(" ");
		expect(message).toContain("timeUndo.confirm.names");
		expect(message).toContain("timeUndo.confirm.cards:1");
		expect(message).toContain("timeUndo.confirm.settings:2");
		expect(message).toContain("timeUndo.confirm.pressed");
	});
});

const CAPTURE = `${SYS}.timeCapture`;
const UNDO = `${SYS}.timeUndo`;
/** What a query handler is told of who sent it, as v14 tells it. */
const from = (id) => ({ user: { id, isGM: true } });

/** Wait for the next turn of the event loop, as an edit made by hand begins in. */
const nextTurn = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the Undo button on the advance's own card", () => {
	it("is drawn again once the advance is kept, and again once it's let go", async () => {
		const world = await aWorld();
		await nextPhase(world);
		const [card] = game.messages;
		// The card was drawn before its record was written, so it's drawn again to show its button.
		expect(ui.chat.updateMessage).not.toHaveBeenCalled();
		card._source.content = "<button data-undo-time>";
		ui.chat.updateMessage.mockClear();
		await game.settings.set(SYS, "timeUndo", { records: [] });
		expect(ui.chat.updateMessage).toHaveBeenCalledWith(card);
	});

	it("draws the card again as its record is written", async () => {
		const world = await aWorld();
		await captureAdvance("phase", async () => {
			create("ChatMessage", "ChatMessage.night", { content: "<button data-undo-time>", flags: {} });
			await game.settings.set(SYS, "calendar", { phase: "night", day: 3 });
			await world.ash.update({ "system.glory": 1 });
		});
		expect(ui.chat.updateMessage).toHaveBeenCalledWith(docs.get("ChatMessage.night"));
	});
});

describe("a journey to a distant Realm", () => {
	it("makes the Scene active before active again, rather than leaving none", async () => {
		await aWorld();
		const home = makeDoc("Scene", "Scene.home", { name: "Home", active: true });
		const away = makeDoc("Scene", "Scene.away", { name: "Away", active: false });
		await captureAdvance("distant", async () => {
			await game.settings.set(SYS, "calendar", { phase: "morning", season: "summer" });
			// The server deactivates the Scene before without a hook on this client.
			await away.update({ active: true });
			home._source.active = false;
		});
		const [record] = advanceRecords();
		expect(record.scenes).toEqual({ before: "Scene.home", after: "Scene.away", beforeName: "Home", afterName: "Away" });
		expect(record.docs.some(({ uuid }) => uuid === "Scene.away")).toBe(false);
		const writes = vi.spyOn(away, "update");
		await undoAdvance();
		expect(home._source.active).toBe(true);
		expect(writes).not.toHaveBeenCalled();
	});
});

describe("another Referee's advance, noted by the active GM", () => {
	it("is given up once they leave", async () => {
		const world = await aWorld();
		expect(await CONFIG.queries[CAPTURE]({ step: "start", id: "far" }, from("other"))).toBe(true);
		fire("userConnected", { id: "other" }, false);
		await world.ash.update({ "system.glory": 4 });
		expect(await CONFIG.queries[CAPTURE]({ step: "finish", id: "far" }, from("other"))).toBeNull();
	});

	it("is given up when nothing more is heard from them", async () => {
		vi.useFakeTimers();
		try {
			await CONFIG.queries[CAPTURE]({ step: "start", id: "far" }, from("other"));
			vi.advanceTimersByTime(5 * 60 * 1000 + 1);
			expect(await CONFIG.queries[CAPTURE]({ step: "finish", id: "far" }, from("other"))).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("isn't joined by the active GM's own advance, which waits its turn", async () => {
		await aWorld();
		await CONFIG.queries[CAPTURE]({ step: "start", id: "far" }, from("other"));
		const run = vi.fn(async () => "night");
		expect(await captureAdvance("phase", run)).toBeNull();
		expect(run).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledWith("timeUndo.busy");
		fire("userConnected", { id: "other" }, false);
	});

	it("is held while one of their windows is open", async () => {
		const world = await aWorld();
		await CONFIG.queries[CAPTURE]({ step: "start", id: "far" }, from("other"));
		await answeringWrite("other", () => world.ash.update({ "system.glory": 2 }));
		await CONFIG.queries[CAPTURE]({ step: "pause", id: "far" }, from("other"));
		await world.torch.update({ "system.quantity.value": 1 });
		await CONFIG.queries[CAPTURE]({ step: "resume", id: "far" }, from("other"));
		const part = await CONFIG.queries[CAPTURE]({ step: "finish", id: "far" }, from("other"));
		expect(part.docs.map(({ uuid }) => uuid)).toEqual(["Actor.ash"]);
	});

	it("is told the calendar's turning, which it answers in the scope it hands calendar.js", () => {
		expect(setTurningScope).toHaveBeenCalledWith(answeringWrite);
	});

	it("leaves out the active GM's own edit, made right after their calendar turning was answered", async () => {
		const world = await aWorld();
		await CONFIG.queries[CAPTURE]({ step: "start", id: "far" }, from("other"));
		// Nothing of theirs has reached it yet: an edit now is the active GM's own.
		await world.torch.update({ "system.quantity.value": 2 });
		await answeringWrite("other", () => world.ash.update({ "system.glory": 2 }));
		await nextTurn();
		await world.torch.update({ "system.quantity.value": 1 });
		const part = await CONFIG.queries[CAPTURE]({ step: "finish", id: "far" }, from("other"));
		expect(part.docs.map(({ uuid }) => uuid)).toEqual(["Actor.ash"]);
	});

	it("leaves out a turning another user answered, and the active GM's own", async () => {
		const world = await aWorld();
		await CONFIG.queries[CAPTURE]({ step: "start", id: "far" }, from("other"));
		await answeringWrite("third", () => world.ash.update({ "system.glory": 2 }));
		await answeringWrite(null, () => world.torch.update({ "system.quantity.value": 1 }));
		const part = await CONFIG.queries[CAPTURE]({ step: "finish", id: "far" }, from("other"));
		expect(part.docs).toEqual([]);
	});

	it("takes in an answer however slow, and finishing waits on it", async () => {
		const world = await aWorld();
		vi.useFakeTimers();
		try {
			await CONFIG.queries[CAPTURE]({ step: "start", id: "far" }, from("other"));
			const answered = answeringWrite("other", async () => {
				await new Promise((resolve) => setTimeout(resolve, 4000));
				await world.ash.update({ "system.glory": 2 });
			});
			const finished = CONFIG.queries[CAPTURE]({ step: "finish", id: "far" }, from("other"));
			await vi.advanceTimersByTimeAsync(4000 + 1000);
			await answered;
			const part = await finished;
			expect(part.docs.map(({ uuid }) => uuid)).toEqual(["Actor.ash"]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("takes in what the hooks of a write of theirs set off at once, and nothing in a later turn", async () => {
		const world = await aWorld();
		Hooks.on("updateJournalEntry", (_entry, _changes, _options, userId) => {
			// A hook of the active GM's own, answering what reached it.
			if (userId === "other") world.ash.update({ "system.glory": 2 });
		});
		await CONFIG.queries[CAPTURE]({ step: "start", id: "far" }, from("other"));
		fire("updateJournalEntry", { uuid: "JournalEntry.log" }, {}, {}, "other");
		await nextTurn();
		await world.torch.update({ "system.quantity.value": 1 });
		const part = await CONFIG.queries[CAPTURE]({ step: "finish", id: "far" }, from("other"));
		expect(part.docs.map(({ uuid }) => uuid)).toEqual(["Actor.ash"]);
	});

	it("takes in the next write of a chain answering theirs, set off as the first is heard back", async () => {
		const world = await aWorld();
		Hooks.on("updateActor", (actor, _changes, _options, userId) => {
			if (userId === "gm" && actor === world.ash) world.torch.update({ "system.quantity.value": 1 });
		});
		await CONFIG.queries[CAPTURE]({ step: "start", id: "far" }, from("other"));
		await answeringWrite("other", () => world.ash.update({ "system.glory": 2 }));
		const part = await CONFIG.queries[CAPTURE]({ step: "finish", id: "far" }, from("other"));
		expect(part.docs.map(({ uuid }) => uuid).sort()).toEqual(["Actor.ash", "Actor.ash.Item.torch"]);
	});

	it("takes in what the active GM writes for them through a query, but not for anyone else", async () => {
		await aWorld();
		await CONFIG.queries[CAPTURE]({ step: "start", id: "far" }, from("other"));
		await CONFIG.queries[`${SYS}.spend`]({ uuid: "Actor.ash.Item.torch", changes: { "system.quantity.value": 2 } }, from("other"));
		await CONFIG.queries[`${SYS}.spend`]({ uuid: "Actor.ash", changes: { "system.glory": 3 } }, from("player"));
		const part = await CONFIG.queries[CAPTURE]({ step: "finish", id: "far" }, from("other"));
		expect(part.docs.map(({ uuid }) => uuid)).toEqual(["Actor.ash.Item.torch"]);
	});
});

describe("what isn't part of the advance", () => {
	it("leaves out what the Referee does while one of the advance's windows is open", async () => {
		const world = await aWorld();
		await captureAdvance("phase", async () => {
			await world.ash.update({ "system.virtues.vig.value": 4 });
			await aDialog(() => world.torch.update({ "system.quantity.value": 2 }));
			await game.settings.set(SYS, "calendar", { phase: "night", day: 3 });
		});
		const [record] = advanceRecords();
		expect(record.docs.map(({ uuid }) => uuid)).toEqual(["Actor.ash"]);
		await undoAdvance();
		expect(world.torch._source.system.quantity.value).toBe(2);
	});

	it("leaves out what this client writes answering another user's query, such as a player's Spend", async () => {
		const world = await aWorld();
		await captureAdvance("phase", async () => {
			await CONFIG.queries[`${SYS}.spend`]({ uuid: "Actor.ash.Item.torch", changes: { "system.quantity.value": 2 } }, from("player"));
			await world.ash.update({ "system.virtues.vig.value": 4 });
			await game.settings.set(SYS, "calendar", { phase: "night", day: 3 });
		});
		await undoAdvance();
		expect(world.torch._source.system.quantity.value).toBe(2);
		expect(world.ash._source.system.virtues.vig.value).toBe(9);
	});

	it("still notes the advance while a query waits on the Referee's answer", async () => {
		const world = await aWorld();
		let answer;
		const asked = new Promise((resolve) => (answer = resolve));
		const query = CONFIG.queries[`${SYS}.ask`]({ until: asked }, from("player"));
		await captureAdvance("phase", async () => {
			await world.ash.update({ "system.virtues.vig.value": 4 });
			await game.settings.set(SYS, "calendar", { phase: "night", day: 3 });
		});
		answer();
		await query;
		expect(advanceRecords()[0].docs.map(({ uuid }) => uuid)).toEqual(["Actor.ash"]);
	});

	it("notes the advance on while a window opened for a player's query waits", async () => {
		const world = await aWorld();
		let answer;
		const asked = new Promise((resolve) => (answer = resolve));
		await captureAdvance("phase", async () => {
			let opened;
			const open = new Promise((resolve) => (opened = resolve));
			const query = CONFIG.queries[`${SYS}.askOpened`]({ opened, until: asked }, from("player"));
			await open;
			await world.ash.update({ "system.virtues.vig.value": 4 });
			await game.settings.set(SYS, "calendar", { phase: "night", day: 3 });
			answer();
			await query;
		});
		expect(advanceRecords()[0].docs.map(({ uuid }) => uuid)).toEqual(["Actor.ash"]);
	});

	it("leaves out what a query handler registered since the world was ready writes for a player", async () => {
		const world = await aWorld();
		registerQuery(`${SYS}.late`, async ({ uuid, changes }) => docs.get(uuid).update(changes));
		await captureAdvance("phase", async () => {
			await CONFIG.queries[`${SYS}.late`]({ uuid: "Actor.ash.Item.torch", changes: { "system.quantity.value": 2 } }, from("player"));
			await game.settings.set(SYS, "calendar", { phase: "night", day: 3 });
		});
		expect(advanceRecords()[0].docs.map(({ uuid }) => uuid)).not.toContain("Actor.ash.Item.torch");
		expect(world.torch._source.system.quantity.value).toBe(2);
	});

	it("sees a write as hooks registered after it have left it", async () => {
		hooks.clear();
		Hooks.on("preUpdateActor", (_actor, changes) => {
			if (changes["system.glory"]) changes["system.seat"] = "hall";
		});
		registerTimeCapture();
		watchWrites();
		const world = await aWorld();
		await captureAdvance("phase", async () => {
			await world.ash.update({ "system.glory": 3 });
			await game.settings.set(SYS, "calendar", { phase: "night", day: 3 });
		});
		await undoAdvance();
		expect(world.ash._source.system.seat).toBeUndefined();
	});
});

describe("when not all of it goes back", () => {
	it("keeps the advance and the calendar, so another Undo finishes it", async () => {
		const world = await aWorld();
		await nextPhase(world);
		const write = vi.spyOn(world.torch, "update").mockRejectedValue(new Error("offline"));
		const quiet = vi.spyOn(console, "warn").mockImplementation(() => {});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(await undoAdvance()).toBe(false);
		expect(warn).toHaveBeenCalledWith("timeUndo.partly");
		expect(advanceRecords()).toHaveLength(1);
		expect(game.settings.get(SYS, "calendar")).toEqual({ phase: "night", day: 3 });
		expect(postCard).not.toHaveBeenCalled();
		write.mockRestore();
		expect(await undoAdvance()).toBe(true);
		expect(world.torch._source.system.quantity.value).toBe(0);
		expect(world.ash._source.system.virtues.vig.value).toBe(9);
		expect(game.settings.get(SYS, "calendar")).toEqual({ phase: "afternoon", day: 3 });
		error.mockRestore();
		quiet.mockRestore();
	});

	it("writes each place's changes in one batch, and one at a time should the batch fail", async () => {
		const world = await aWorld();
		await nextPhase(world);
		const batches = [];
		const real = foundry.utils.getDocumentClass;
		foundry.utils.getDocumentClass = (name) => {
			const cls = real(name);
			return { ...cls, updateDocuments: async (updates) => {
				batches.push(updates.map(({ _id }) => _id));
				throw new Error("busy");
			} };
		};
		const quiet = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(await undoAdvance()).toBe(true);
		expect(batches).toEqual([["ash"], ["torch"]]);
		expect(world.torch._source.system.quantity.value).toBe(0);
		expect(world.ash._source.system.virtues.vig.value).toBe(9);
		foundry.utils.getDocumentClass = real;
		quiet.mockRestore();
	});

	it("makes a parent again before what was deleted from it before it went", async () => {
		const world = await aWorld();
		await captureAdvance("season", async () => {
			await world.torch.delete();
			await world.ash.delete();
			await game.settings.set(SYS, "calendar", { phase: "morning", season: "summer" });
		});
		await undoAdvance();
		expect(docs.get("Actor.ash")?._source.name).toBe("Sir Ash");
		expect(docs.get("Actor.ash.Item.torch")?._source.name).toBe("Torch");
	});

	it("counts something whose parent has gone as not put back", async () => {
		const world = await aWorld();
		await captureAdvance("season", async () => {
			await world.torch.delete();
			await game.settings.set(SYS, "calendar", { phase: "morning", season: "summer" });
		});
		await world.ash.delete();
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(await undoAdvance()).toBe(false);
		expect(warn).toHaveBeenCalledWith("timeUndo.partly");
		expect(advanceRecords()).toHaveLength(1);
		error.mockRestore();
	});
});

describe("places kept as they stand", () => {
	it("keeps the Ledger's lines inside a flags object the advance gave a document", async () => {
		await aWorld();
		const page = makeDoc("Actor", "Actor.page", { name: "Page", system: {} });
		await captureAdvance("phase", async () => {
			await page.update({ flags: { [SYS]: { seen: true } } });
			await page.update({ [`flags.${SYS}.ledger`]: [{ id: "during" }] });
			await game.settings.set(SYS, "calendar", { phase: "night", day: 3 });
		});
		await page.update({ [`flags.${SYS}.ledger`]: [{ id: "during" }, { id: "after" }] });
		await undoAdvance();
		expect(page._source.flags[SYS]).toEqual({ ledger: [{ id: "during" }, { id: "after" }] });
	});

	it("keeps a thing the advance made that was changed since, and deletes one that wasn't", async () => {
		const world = await aWorld();
		await captureAdvance("phase", async () => {
			create("Item", "Actor.ash.Item.rope", { name: "Rope", system: { quantity: { value: 1 } } }, world.ash);
			create("Item", "Actor.ash.Item.salt", { name: "Salt", system: { quantity: { value: 1 } } }, world.ash);
			await game.settings.set(SYS, "calendar", { phase: "night", day: 3 });
		});
		await docs.get("Actor.ash.Item.rope").update({ "system.quantity.value": 3 });
		await undoAdvance();
		const [{ message }] = vi.mocked(confirmDialog).mock.calls[0];
		expect(message.join(" ")).toContain("timeUndo.confirm.kept");
		expect(docs.has("Actor.ash.Item.rope")).toBe(true);
		expect(docs.has("Actor.ash.Item.salt")).toBe(false);
	});

	describe("played alone", () => {
		/** A Realm with a hidden Myth and an unnamed Landmark, found by an advance. */
		async function aFind() {
			const world = await aWorld();
			const realm = makeDoc("Scene", "Scene.realm", { name: "Realm" });
			const myth = makeDoc("Tile", "Scene.realm.Tile.myth", { hidden: true, flags: { [SYS]: { realm: { kind: "myth", number: 3, omen: 0 } } } }, realm);
			const landmark = makeDoc("Tile", "Scene.realm.Tile.mark", { hidden: true, flags: { [SYS]: { realm: { kind: "landmark", type: "dwelling", name: "" } } } }, realm);
			await captureAdvance("phase", async () => {
				await myth.update({ hidden: false, [`flags.${SYS}.realm.omen`]: 1 });
				await landmark.update({ hidden: false });
				await landmark.update({ [`flags.${SYS}.==realm`]: { kind: "landmark", type: "dwelling", name: "Hollow Mill" } });
				await world.ash.update({ "system.virtues.vig.value": 4 });
				await game.settings.set(SYS, "calendar", { phase: "night", day: 3 });
			});
			return { world, myth, landmark };
		}

		it("keeps what was found, as the map's own Undo does, and takes back the rest", async () => {
			vi.mocked(secretsKeptOn).mockReturnValue(true);
			const { world, myth, landmark } = await aFind();
			await undoAdvance();
			vi.mocked(secretsKeptOn).mockReturnValue(false);
			expect(myth._source.hidden).toBe(false);
			expect(myth._source.flags[SYS].realm.omen).toBe(1);
			expect(landmark._source.hidden).toBe(false);
			expect(landmark._source.flags[SYS].realm.name).toBe("Hollow Mill");
			expect(world.ash._source.system.virtues.vig.value).toBe(9);
		});

		it("takes finds back too when the Referee isn't playing alone", async () => {
			const { myth, landmark } = await aFind();
			await undoAdvance();
			expect(myth._source.hidden).toBe(true);
			expect(myth._source.flags[SYS].realm.omen).toBe(0);
			expect(landmark._source.flags[SYS].realm.name).toBe("");
		});
	});
});

describe("two Referees", () => {
	it("has the active GM carry the Undo out", async () => {
		const world = await aWorld();
		await nextPhase(world);
		const [record] = advanceRecords();
		const query = vi.fn(async () => "done");
		game.users.activeGM = { isSelf: false, query };
		expect(await undoAdvance()).toBe(true);
		expect(query).toHaveBeenCalledWith(UNDO, { id: record.id }, expect.objectContaining({ timeout: expect.any(Number) }));
		// Nothing is put back here: the active GM does that.
		expect(world.ash._source.system.virtues.vig.value).toBe(4);
	});

	it("runs one Undo at a time on the active GM's client", async () => {
		const world = await aWorld();
		await nextPhase(world);
		const [record] = advanceRecords();
		const first = CONFIG.queries[UNDO]({ id: record.id }, from("one"));
		expect(await CONFIG.queries[UNDO]({ id: record.id }, from("two"))).toBe("busy");
		expect(await first).toBe("done");
		expect(await CONFIG.queries[UNDO]({ id: record.id }, from("two"))).toBe("moved");
		expect(world.ash._source.system.virtues.vig.value).toBe(9);
	});

	it("tells the Referee when the active GM didn't answer", async () => {
		const world = await aWorld();
		await nextPhase(world);
		game.users.activeGM = { isSelf: false, query: vi.fn(async () => false) };
		expect(await undoAdvance()).toBe(false);
		expect(warn).toHaveBeenCalledWith("timeUndo.unanswered");
	});
});
