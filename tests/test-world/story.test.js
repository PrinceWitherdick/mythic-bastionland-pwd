import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rollLabel } from "../../module/rules/book-art.js";
import { hexDistance, hexKey } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";

/**
 * The whole test world played out, with the system's writers swapped for
 * ones that keep what they're given, so each Season's code runs and the story
 * can be checked: the dates things happen on, Glory, Scars, the road.
 */
const world = vi.hoisted(() => ({}));

vi.mock("../../module/actions/calendar.js", () => ({
	getCalendar: () => ({ ...world.calendar }),
	setCalendar: vi.fn(async (calendar) => { world.calendar = { ...calendar }; }),
	calendarLabel: (calendar) => `Age ${calendar.age}, ${calendar.season}, day ${calendar.day}, ${calendar.phase}`
}));

vi.mock("../../module/actions/realm.js", async () => {
	const { generateRealm } = await import("../../module/rules/realm-generator.js");
	const { realmGeometry } = await import("../../module/rules/realm-geometry.js");
	return {
		createRealmScene: vi.fn(async ({ name, seed }) => {
			world.g = realmGeometry();
			world.realm = generateRealm({ seed, geometry: world.g });
			world.scene = new world.Document({ name, flags: {} });
			return world.scene;
		}),
		editRealm: vi.fn(async (_scene, edit) => {
			const next = edit(world.realm, world.g);
			if (!next || next === world.realm) return false;
			world.realm = next;
			return true;
		}),
		getRealm: () => ({ realm: world.realm }),
		sceneGeometry: () => world.g
	};
});

vi.mock("../../module/actions/company.js", () => ({ setCompanyHex: vi.fn() }));

vi.mock("../../module/actions/dominion.js", () => ({
	linkKnightDomain: vi.fn(async (knight, domain) => {
		knight.system.domain = domain.uuid;
		domain.system.ruler ||= knight.name;
	}),
	settleDomains: vi.fn(async () => []),
	worldDomains: () => world.actors.filter((actor) => actor.type === "domain")
}));

vi.mock("../../module/actions/glory.js", () => ({
	adjustGlory: vi.fn(async (actor, amount) => {
		actor.system.glory += amount;
		return [`Glory ${actor.system.glory}`];
	})
}));

vi.mock("../../module/actions/gm-toolkit.js", () => ({ openGmToolkit: vi.fn(), theGmToolkit: () => world.toolkit }));

vi.mock("../../module/actions/hex-lore.js", () => ({
	rollHexSpark: vi.fn(),
	rollHexSparkSet: vi.fn(),
	tellPlayersAboutHex: vi.fn(),
	writeHexNote: vi.fn()
}));

vi.mock("../../module/actions/journey.js", () => ({
	recordHexVisits: vi.fn(async (_scene, hexes) => { world.visits.push(...hexes.map((hex) => ({ hex, when: { ...world.calendar } }))); })
}));

vi.mock("../../module/actions/myth-notes.js", () => ({ editMythNote: vi.fn() }));

vi.mock("../../module/actions/npc.js", () => ({ actorData: (block) => ({ type: "npc", name: block.name, system: { notes: "" }, items: [] }) }));

vi.mock("../../module/actions/season-log.js", () => ({ recordSeasonTurn: vi.fn(), writeSeasonNotes: vi.fn() }));

vi.mock("../../module/actions/sites.js", () => ({ SITE_FLAG: "site", SITE_SHEET_CLASS: "mythic-bastionland-pwd.SiteSheet" }));

vi.mock("../../module/actions/time.js", () => ({
	announcePhase: vi.fn(),
	announceSeason: vi.fn(),
	hardshipFor: vi.fn(async () => []),
	// The Season turn's own work is tested with it; here it gives the Glory a new Age brings.
	passTime: vi.fn(async (company, { newAge }) => ({
		rolls: [],
		entries: company.map(({ actor, pursuit }) => {
			if (newAge) actor.system.glory += 1;
			return { name: actor.name, pursuit, lines: ["Virtues restored."] };
		})
	})),
	rollAging: vi.fn(async (actor, age) => { actor.system.age = age; })
}));

vi.mock("../../module/book-art/art-index.js", async () => {
	const { rollLabel: label } = await import("../../module/rules/book-art.js");
	const findByRoll = (list, roll) => list?.find((entry) => entry.roll === roll) ?? null;
	const lookup = (list, { d6, d12 }) => {
		const roll = label(d6, d12);
		const entry = findByRoll(list, roll);
		return { roll, page: 30, entry, name: entry?.name ?? `Unnamed ${roll}` };
	};
	return {
		findByRoll,
		loadArtIndex: async () => world.index,
		mythEntry: (index, myth) => lookup(index?.myths, myth),
		seerEntry: (index, seer) => lookup(index?.seers, seer)
	};
});

vi.mock("../../module/chat/cards.js", () => ({
	postCard: vi.fn(async () => ({})),
	statLabels: () => ({ vig: "VIG", cla: "CLA", spi: "SPI", guard: "GD" }),
	t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key)
}));

const { populateTestWorld, BEFORE_FLAG, TEST_FLAG } = await import("../../module/test-world/populate.js");
const { recordSeasonTurn, writeSeasonNotes } = await import("../../module/actions/season-log.js");
const { setCompanyHex } = await import("../../module/actions/company.js");
const { editMythNote } = await import("../../module/actions/myth-notes.js");
const { hardshipFor, rollAging } = await import("../../module/actions/time.js");
const { rollHexSpark, rollHexSparkSet } = await import("../../module/actions/hex-lore.js");

/** Set a value at a dotted path, making objects on the way. */
function setPath(target, path, value) {
	const keys = path.split(".");
	let node = target;
	for (const key of keys.slice(0, -1)) node = node[key] ??= {};
	node[keys.at(-1)] = value;
}

/** @returns {object} Dotted keys made nested. */
function expandObject(flat) {
	const nested = {};
	for (const [path, value] of Object.entries(flat)) setPath(nested, path, value);
	return nested;
}

/** Rolls a formula such as "1d12 + 6" with Math.random. */
class FakeRoll {
	constructor(formula) {
		this.formula = formula;
	}

	async evaluate() {
		this.total = this.formula.split("+").reduce((sum, term) => {
			const dice = /(\d*)d(\d+)/.exec(term);
			if (!dice) return sum + Number(term.trim());
			let rolled = 0;
			for (let die = 0; die < (Number(dice[1]) || 1); die++) rolled += 1 + Math.floor(Math.random() * Number(dice[2]));
			return sum + rolled;
		}, 0);
		return this;
	}
}

let nextId = 0;

/** Just enough of a document: its data, dotted updates, embedded items and flags. */
class FakeDocument {
	constructor({ items = [], ...data }) {
		Object.assign(this, structuredClone(data));
		this.id = `doc${++nextId}`;
		this.uuid = `Actor.${this.id}`;
		this.system ??= {};
		this.flags ??= {};
		// What DomainModel starts a Domain with.
		if (this.type === "domain") this.system = { ruler: "", crises: [], crisisRolled: "", ...this.system };
		this.items = items.map((item) => structuredClone(item));
		this.sheet = { render: vi.fn() };
	}

	async update(changes) {
		for (const [path, value] of Object.entries(changes)) setPath(this, path, value);
		return this;
	}

	async createEmbeddedDocuments(_type, items) {
		this.items.push(...items);
		return items;
	}

	getFlag(scope, key) {
		return this.flags?.[scope]?.[key];
	}
}

/** @returns {object} A world collection over a list. */
const collection = (list) => ({ some: (test) => list.some(test), filter: (test) => list.filter(test), find: (test) => list.find(test) });

/** The book's Knights, Seers and Myths in the art index's shape, in words of the test's own. */
function fakeIndex() {
	const every = (make) => Array.from({ length: 72 }, (_, index) => make(rollLabel(Math.floor(index / 12) + 1, (index % 12) + 1)));
	const knight = (roll, name, property) => ({
		roll, name, path: `art/${roll}.webp`, token: `art/${roll}-token.webp`, property,
		ability: { name: `${name} ability`, text: "Does a thing." }, passion: { name: `${name} passion`, text: "Restore SPI sometimes." }
	});
	return {
		knights: [
			knight("1-01", "The Test Knight", ["Rusty sword (d8 hefty), mail (A1)", "Round shield (d4, A1)", "Old steed (VIG 10, CLA 10, SPI 5, 3GD)"]),
			knight("1-10", "The Probe Knight", ["Short bow (d6 long), gambeson (A1)", "Lucky coin", "Grey horse (VIG 8, CLA 12, SPI 5, 2GD)"]),
			knight("4-07", "The Fixture Knight", ["Big axe (d10 long), plate (A1)", "Charger (VIG 14, CLA 6, SPI 5, 3GD, d6 trample)"])
		],
		seers: every((roll) => ({ roll, name: `The ${roll} Seer`, path: `art/seer-${roll}.webp`, stats: { vig: 8, cla: 10, spi: 14, guard: 3 }, lines: ["Watches."] })),
		myths: every((roll) => ({ roll, name: `The ${roll} Myth`, path: `art/myth-${roll}.webp`, omens: ["1", "2", "3", "4", "5", "6"], cast: [{ name: `Cast of ${roll}`, stats: { vig: 10, cla: 10, spi: 10, guard: 3 }, lines: [] }] })),
		spark: [{ key: "nature", tables: [] }, { key: "civilisation", tables: [] }]
	};
}

const BEFORE = Object.freeze({ age: 3, season: "winter", day: 9, phase: "night" });

beforeEach(() => {
	Object.assign(world, {
		calendar: { ...BEFORE },
		visits: [],
		actors: [],
		journal: [],
		folders: [],
		index: null,
		Document: FakeDocument
	});
	world.toolkit = new FakeDocument({ type: "gmToolkit", system: { notes: "<p>Mine</p>", seasons: { "3-winter": { notes: "Mine" } } } });
	const documentClass = (list) => ({
		create: vi.fn(async (data) => {
			const document = new FakeDocument(data);
			list?.push(document);
			return document;
		}),
		deleteDocuments: vi.fn(async () => [])
	});
	world.classes = { Folder: documentClass(world.folders), JournalEntry: documentClass(world.journal), Actor: documentClass(world.actors), Scene: documentClass(), ChatMessage: documentClass() };
	globalThis.foundry = {
		utils: {
			expandObject,
			deepClone: (value) => structuredClone(value),
			isEmpty: (value) => !Object.keys(value ?? {}).length,
			escapeHTML: (value) => String(value),
			getRoute: (path) => `/${path}`,
			getDocumentClass: (name) => world.classes[name]
		},
		applications: { api: { DialogV2: { confirm: vi.fn(async () => true) } } },
		data: { operators: { ForcedReplacement: { create: (value) => ({ replaced: value }) }, ForcedDeletion: class {} } }
	};
	globalThis.Actor = { implementation: world.classes.Actor };
	globalThis.Roll = FakeRoll;
	globalThis.Hooks = { on: vi.fn(() => 7), off: vi.fn() };
	globalThis.ui = { notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
	globalThis.canvas = { scene: null };
	globalThis.game = {
		user: { isGM: true, id: "gm" },
		actors: collection(world.actors),
		scenes: collection([]),
		journal: collection(world.journal),
		folders: collection(world.folders),
		messages: collection([])
	};
	// No canvas in Node, so the Knights' arms can't be painted; the story goes on without them.
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no server"));
	vi.clearAllMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
	for (const key of ["foundry", "Actor", "Roll", "Hooks", "ui", "canvas", "game"]) delete globalThis[key];
});

/** The Knights, by name. */
const knights = () => Object.fromEntries(world.actors.filter((actor) => actor.type === "knight").map((actor) => [actor.name, actor]));

describe.each([["with the book imported", true], ["without it", false]])("the test world, %s", (_label, imported) => {
	beforeEach(() => {
		if (imported) world.index = fakeIndex();
	});

	it("plays five Seasons to the Afternoon of Harvest in Age 2, and says it's done", async () => {
		await populateTestWorld();
		expect(ui.notifications.error).not.toHaveBeenCalled();
		expect(world.calendar).toEqual({ age: 2, season: "harvest", day: expect.any(Number), phase: "afternoon" });
		expect(ui.notifications.info).toHaveBeenLastCalledWith(expect.stringContaining("The test world is ready"));
		expect(world.toolkit.sheet.render).toHaveBeenCalledWith({ force: true, tab: "places" });
	});

	it("keeps what it changes on the GM Toolkit, to put back", async () => {
		await populateTestWorld();
		expect(world.toolkit.flags[SYSTEM_ID][BEFORE_FLAG]).toEqual({ calendar: BEFORE, notes: "<p>Mine</p>", seasons: { "3-winter": { notes: "Mine" } } });
		expect(world.toolkit.system.notes).toContain("<h2>Where we left off</h2>");
	});

	it("flags everything it makes", async () => {
		await populateTestWorld();
		for (const document of [...world.actors, ...world.journal, ...world.folders, world.scene]) {
			expect(document.flags[SYSTEM_ID][TEST_FLAG]).toBe(true);
		}
		expect(Hooks.on).toHaveBeenCalledWith("preCreateChatMessage", expect.any(Function));
		expect(Hooks.off).toHaveBeenCalledWith("preCreateChatMessage", 7);
	});

	it("gives the Knights the Glory, Ranks and Ages the story says", async () => {
		await populateTestWorld();
		const company = knights();
		expect(Object.keys(company)).toEqual(["Dame Isolde Marrow", "Sir Corvin Ashby", "Sir Oswin Hale"]);
		const { "Dame Isolde Marrow": isolde, "Sir Corvin Ashby": corvin, "Sir Oswin Hale": oswin } = company;
		expect([isolde.system.glory, corvin.system.glory, oswin.system.glory]).toEqual([7, 5, 6]);
		expect([isolde.system.age, corvin.system.age, oswin.system.age]).toEqual(["old", "mature", "mature"]);
		expect(rollAging).toHaveBeenCalledWith(isolde, "old");
		expect(corvin.system.successor).toBe(oswin.uuid);
		expect(corvin.system.fatigued).toBe(true);
		for (const knight of [isolde, corvin, oswin]) {
			expect(knight.system.steed).toMatch(/^Actor\./);
			expect(knight.system.notes).toContain("<h2>Chronicle</h2>");
			expect(knight.items.some((item) => item.type === "weapon")).toBe(true);
			expect(knight.items.some((item) => item.type === "armour")).toBe(true);
		}
	});

	it("records each Scar in the Season it was taken", async () => {
		await populateTestWorld();
		const scars = Object.fromEntries(Object.entries(knights()).map(([name, actor]) => [name, actor.items.filter((item) => item.type === "scar").map((item) => [item.system.roll, item.system.season])]));
		expect(scars).toEqual({
			"Dame Isolde Marrow": [[10, "1-harvest"]],
			"Sir Corvin Ashby": [[1, "1-spring"], [11, "2-harvest"]],
			"Sir Oswin Hale": [[12, "2-spring"]]
		});
	});

	it("turns three Seasons and one Age, and writes about all five", async () => {
		await populateTestWorld();
		expect(recordSeasonTurn.mock.calls.map(([key, turn]) => [key, turn.kind])).toEqual([["1-spring", "season"], ["1-harvest", "season"], ["1-winter", "age"], ["2-spring", "season"]]);
		expect(writeSeasonNotes.mock.calls.map(([key]) => key)).toEqual(["1-spring", "1-harvest", "1-winter", "2-spring", "2-harvest"]);
		const succession = recordSeasonTurn.mock.calls[2][1].entries.find((entry) => entry.name === "Sir Corvin Ashby");
		expect(succession.pursuit).toBe("time.pursuits.succession.label");
		expect(hardshipFor).toHaveBeenCalledWith(expect.objectContaining({ key: "winter" }), expect.any(Array));
	});

	it("walks one unbroken road from the Seat, a Phase a hex, and camps a hex further on", async () => {
		await populateTestWorld();
		const seat = world.realm.holdings.find((holding) => holding.seat);
		expect(world.visits[0]).toEqual({ hex: seat.hex, when: { age: 1, season: "spring", day: 1, phase: "morning" } });
		for (let index = 1; index < world.visits.length; index++) {
			expect(hexDistance(world.visits[index - 1].hex, world.visits[index].hex)).toBe(1);
		}
		const order = (when) => [when.age, ["spring", "harvest", "winter"].indexOf(when.season), when.day, ["morning", "afternoon", "night"].indexOf(when.phase)];
		const sorted = world.visits.map(({ when }) => order(when));
		for (let index = 1; index < sorted.length; index++) expect(sorted[index].join() >= sorted[index - 1].join()).toBe(true);
		// The Company's Token counts the camp as it's put there, so this Season's travel doesn't.
		const [[, camp]] = setCompanyHex.mock.calls;
		expect(hexDistance(world.visits.at(-1).hex, camp)).toBe(1);
		const thisSeason = world.visits.filter(({ when }) => when.age === 2 && when.season === "harvest");
		expect(thisSeason.some(({ hex }) => hexKey(hex) === hexKey(camp))).toBe(false);
	});

	it("resolves the first Myth and replaces it, and leaves two more part met", async () => {
		const { editRealm } = await import("../../module/actions/realm.js");
		await populateTestWorld();
		const resolved = editMythNote.mock.calls.find(([, , changes]) => changes.resolved === true);
		expect(resolved).toBeTruthy();
		const [, first] = resolved;
		const now = world.realm.myths.find((myth) => myth.number === first.number);
		expect(now.omen).toBe(0);
		expect([now.d6, now.d12]).not.toEqual([first.d6, first.d12]);
		const omens = world.realm.myths.map((myth) => myth.omen).sort();
		expect(omens).toEqual([0, 0, 0, 0, 1, 3]);
		expect(editRealm).toHaveBeenCalled();
	});

	it("grants a Domain facing one Crisis from its Spring roll, and makes two Sites", async () => {
		await populateTestWorld();
		const [domain] = world.actors.filter((actor) => actor.type === "domain");
		expect(domain.system.crises).toHaveLength(1);
		expect(domain.system.crisisRolled).toBe("2-spring");
		expect(domain.system.council.circle).toBe("Sir Oswin Hale");
		expect(knights()["Dame Isolde Marrow"].system.domain).toBe(domain.uuid);
		expect(world.journal.map((entry) => entry.flags.core.sheetClass)).toEqual(["mythic-bastionland-pwd.SiteSheet", "mythic-bastionland-pwd.SiteSheet"]);
		expect(world.journal[0].flags[SYSTEM_ID].site.points).toBeTruthy();
	});

	it(imported ? "rolls Spark Tables and makes the Seer and a Myth's Cast from the book" : "leaves the book's Spark Tables and people out", async () => {
		await populateTestWorld();
		const npcs = world.actors.filter((actor) => actor.type === "npc").map((actor) => actor.name);
		if (imported) {
			expect(rollHexSpark).toHaveBeenCalled();
			expect(rollHexSparkSet).toHaveBeenCalled();
			expect(npcs.some((name) => / Seer$/.test(name))).toBe(true);
			expect(npcs.some((name) => /^Cast of /.test(name))).toBe(true);
		} else {
			expect(rollHexSpark).not.toHaveBeenCalled();
			expect(rollHexSparkSet).not.toHaveBeenCalled();
			expect(npcs).toHaveLength(3);
		}
	});
});

describe("running it again", () => {
	it("deletes what it made and puts the calendar and the GM Toolkit back", async () => {
		const flagged = (id) => ({ id, flags: { [SYSTEM_ID]: { [TEST_FLAG]: true } } });
		const plain = { id: "mine", flags: {} };
		world.toolkit.flags = { [SYSTEM_ID]: { [BEFORE_FLAG]: { calendar: BEFORE, notes: "<p>Mine</p>", seasons: { "3-winter": { notes: "Mine" } } } } };
		world.toolkit.update = vi.fn();
		game.actors = collection([plain, flagged("knight")]);
		game.messages = collection([flagged("card")]);
		const { setCalendar } = await import("../../module/actions/calendar.js");

		await populateTestWorld();
		expect(world.classes.Actor.deleteDocuments).toHaveBeenCalledWith(["knight"]);
		expect(world.classes.ChatMessage.deleteDocuments).toHaveBeenCalledWith(["card"]);
		expect(world.classes.Scene.deleteDocuments).not.toHaveBeenCalled();
		expect(setCalendar).toHaveBeenCalledWith(BEFORE);
		expect(world.toolkit.update).toHaveBeenCalledWith({
			"system.notes": "<p>Mine</p>",
			"system.seasons": { replaced: { "3-winter": { notes: "Mine" } } },
			[`flags.${SYSTEM_ID}.${BEFORE_FLAG}`]: expect.any(foundry.data.operators.ForcedDeletion)
		});
		expect(ui.notifications.info).toHaveBeenCalledWith(expect.stringContaining("Removed the test world"));
	});

	it("does nothing unless the GM confirms", async () => {
		foundry.applications.api.DialogV2.confirm.mockResolvedValue(false);
		game.actors = collection([{ id: "knight", flags: { [SYSTEM_ID]: { [TEST_FLAG]: true } } }]);
		await populateTestWorld();
		expect(world.classes.Actor.deleteDocuments).not.toHaveBeenCalled();
	});
});
