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

vi.mock("../../module/actions/city-quest.js", () => ({ rollCityOmen: vi.fn() }));

vi.mock("../../module/actions/council-tasks.js", () => ({
	settleTask: vi.fn(async (domain, id) => {
		delete domain.system.tasks[id];
		return "success";
	})
}));

vi.mock("../../module/actions/knight-tables.js", () => ({
	fillKnightFromBook: vi.fn(async (knight) => {
		if (world.index) knight.system.bookTable = { name: "Table", columns: ["A"], rows: [["1"], ["2"], ["3"], ["4"], ["5"], ["6"]], rolls: [] };
		return Boolean(world.index);
	}),
	rollKnightTable: vi.fn(async (knight) => ({
		card: Promise.resolve({}),
		save: async () => { knight.system.bookTable.rolls = [3]; }
	}))
}));

vi.mock("../../module/actions/landmarks.js", () => ({ echoRuin: vi.fn() }));

vi.mock("../../module/actions/myth-cast.js", () => ({ castKey: (_scene, myth) => `${myth.d6}-${myth.d12}` }));

vi.mock("../../module/actions/referee-rolls.js", () => ({
	rollRefereeTable: vi.fn(async () => ({ d6: 4, result: "worse" })),
	rollSpark: vi.fn(async () => ({ results: [{ roll: 1, entry: "One" }, { roll: 2, entry: "Two" }] }))
}));

vi.mock("../../module/actions/season-events.js", () => ({
	collectionEntry: (collection) => ({ name: collection.key, lines: [] }),
	markCollection: vi.fn(async (_key, season) => ({ key: { spring: "tax", harvest: "tithe", winter: "levy" }[season] })),
	markSeasonEvent: vi.fn(async (key) => ({ key }))
}));

vi.mock("../../module/actions/session-end.js", () => ({ endTheSession: vi.fn(async () => true) }));

vi.mock("../../module/actions/warbands.js", () => ({ MUSTERED_FLAG: "musteredBy", ORIGIN_FLAG: "warbandOrigin", wearWarbandDown: vi.fn() }));

vi.mock("../../module/actions/weather.js", () => ({
	drawWeather: vi.fn(),
	setWeather: vi.fn(async (sky) => { world.settings.weather = sky; })
}));

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

vi.mock("../../module/actions/gm-toolkit.js", async (importOriginal) => ({ ...(await importOriginal()), openGmToolkit: vi.fn(), theGmToolkit: () => world.toolkit }));

vi.mock("../../module/actions/hex-lore.js", async () => {
	const { hexKey: key } = await import("../../module/rules/realm-geometry.js");
	return {
		keepTableRoll: vi.fn(),
		rollHexSparkSet: vi.fn(),
		// What's told is what the GM's note says then, as the real one tells it.
		tellPlayersAboutHex: vi.fn(async ({ hex }) => { world.told.push({ hex, note: world.notes[key(hex)], when: { ...world.calendar } }); }),
		writeHexNote: vi.fn(async (_scene, hex, note) => { world.notes[key(hex)] = note; })
	};
});

vi.mock("../../module/actions/hex-shared.js", async () => {
	const { recordBarrierMet, setPartyNote } = await vi.importActual("../../module/rules/hex-shared.js");
	return {
		keepPartyNote: vi.fn(async (_scene, hex, text, user) => {
			world.shared = setPartyNote(world.shared, hex, { text, by: user.id, byName: user.name, when: { ...world.calendar }, at: Date.now() });
		}),
		recordBarriersMet: vi.fn(async (_scene, met, byName) => {
			for (const { hex, edges } of met) {
				for (const edge of edges) world.shared = recordBarrierMet(world.shared, hex, { edge, byName, when: { ...world.calendar }, at: Date.now() });
			}
		})
	};
});

vi.mock("../../module/actions/sighted.js", () => ({
	writeSightings: vi.fn(async (_scene, { set }) => { Object.assign(world.sighted, set); })
}));

vi.mock("../../module/actions/journey.js", () => ({
	recordHexVisits: vi.fn(async (_scene, hexes) => { world.visits.push(...hexes.map((hex) => ({ hex, when: { ...world.calendar } }))); })
}));

vi.mock("../../module/actions/myth-notes.js", () => ({ editMythNote: vi.fn() }));

vi.mock("../../module/actions/npc.js", () => ({ actorData: (block) => ({ type: "npc", name: block.name, system: { notes: "" }, items: [] }) }));

vi.mock("../../module/actions/season-log.js", () => ({ recordMythCompleted: vi.fn(), recordSeasonTurn: vi.fn(), writeSeasonNotes: vi.fn() }));

vi.mock("../../module/actions/sites.js", () => ({ SITE_FLAG: "site", SITE_SHEET_CLASS: "mythic-bastionland-pwd.SiteSheet" }));

vi.mock("../../module/actions/site-journals.js", () => ({ SITE_JOURNALS_SETTING: "siteJournals", deleteSiteJournals: vi.fn(), keepSiteJournal: vi.fn() }));

vi.mock("../../module/actions/timeline-events.js", async (importOriginal) => ({ ...(await importOriginal()), timelineMythCompleted: vi.fn() }));

vi.mock("../../module/actions/time.js", () => ({
	announcePhase: vi.fn(),
	closeSeason: vi.fn(),
	hardshipFor: vi.fn(async () => []),
	// The Season turn's own work is tested with it; here it gives the Glory a new Age brings.
	passTime: vi.fn(async (company, { newAge }) => ({
		rolls: [],
		entries: company.map(({ actor, pursuit }) => {
			if (newAge) actor.system.glory += 1;
			return { name: actor.name, actorId: actor.id, pursuit, lines: [] };
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
const { recordMythCompleted, writeSeasonNotes } = await import("../../module/actions/season-log.js");
const { setCompanyHex } = await import("../../module/actions/company.js");
const { editMythNote } = await import("../../module/actions/myth-notes.js");
const { closeSeason, hardshipFor, rollAging } = await import("../../module/actions/time.js");
const { timelineMythCompleted } = await import("../../module/actions/timeline-events.js");
const { keepTableRoll, rollHexSparkSet, tellPlayersAboutHex } = await import("../../module/actions/hex-lore.js");
const { markCollection, markSeasonEvent } = await import("../../module/actions/season-events.js");
const { settleTask } = await import("../../module/actions/council-tasks.js");
const { wearWarbandDown } = await import("../../module/actions/warbands.js");
const { endTheSession } = await import("../../module/actions/session-end.js");
const { rollCityOmen } = await import("../../module/actions/city-quest.js");
const { echoRuin } = await import("../../module/actions/landmarks.js");
const { rollKnightTable } = await import("../../module/actions/knight-tables.js");

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
		spark: ["nature", "civilisation", "people", "combat"].map((key) => ({
			key,
			tables: Array.from({ length: 9 }, (_, index) => ({ name: `${key} ${index}`, columns: ["A", "B"], rows: [] }))
		}))
	};
}

const BEFORE = Object.freeze({ age: 3, season: "winter", day: 9, phase: "night" });

beforeEach(() => {
	Object.assign(world, {
		calendar: { ...BEFORE },
		visits: [],
		notes: {},
		told: [],
		shared: { version: 1, hexes: {} },
		sighted: {},
		actors: [],
		journal: [],
		folders: [],
		index: null,
		settings: { weather: "clear", cityQuest: { seen: [4] }, sessionEnd: { promised: null }, siteJournals: false },
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
			randomID: () => `id${++nextId}`,
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
		user: { isGM: true, id: "gm", name: "Gamemaster" },
		users: [{ isGM: true, id: "gm", name: "Gamemaster" }, { isGM: false, id: "alys", name: "Alys" }, { isGM: false, id: "bram", name: "Bram" }],
		settings: {
			get: (_scope, key) => world.settings[key],
			set: vi.fn(async (_scope, key, value) => { world.settings[key] = value; })
		},
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
const knights = () => Object.fromEntries(world.actors.filter((actor) => actor.type === "knight" && !actor.system.isSquire).map((actor) => [actor.name, actor]));

describe.each([["with the book imported", true], ["without it", false]])("the test world, %s", (_label, imported) => {
	beforeEach(() => {
		if (imported) world.index = fakeIndex();
	});

	it("plays five Seasons to the Afternoon of Harvest in Age 2, and says it's done", async () => {
		await populateTestWorld();
		expect(ui.notifications.error).not.toHaveBeenCalled();
		expect(world.calendar).toEqual({ age: 2, year: expect.any(Number), season: "harvest", day: expect.any(Number), phase: "afternoon" });
		expect(ui.notifications.info).toHaveBeenLastCalledWith(expect.stringContaining("The test world is ready"));
		expect(world.toolkit.sheet.render).toHaveBeenCalledWith({ force: true, tab: "places" });
	});

	it("keeps what it changes on the GM Toolkit, to put back", async () => {
		await populateTestWorld();
		expect(world.toolkit.flags[SYSTEM_ID][BEFORE_FLAG]).toEqual({
			calendar: BEFORE,
			notes: "<p>Mine</p>",
			seasons: { "3-winter": { notes: "Mine" } },
			settings: { weather: "clear", cityQuest: { seen: [4] }, sessionEnd: { promised: null }, siteJournals: false }
		});
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
			"Sir Corvin Ashby": [[1, "1-spring"], [11, "2-2-harvest"]],
			"Sir Oswin Hale": [[12, "2-2-spring"]]
		});
	});

	it("turns three Seasons and one Age, and writes about all five", async () => {
		await populateTestWorld();
		expect(closeSeason.mock.calls.map(([, key, turn]) => [key, turn.kind])).toEqual([["1-spring", "season"], ["1-harvest", "season"], ["1-winter", "age"], ["2-2-spring", "season"]]);
		expect(writeSeasonNotes.mock.calls.map(([key]) => key)).toEqual(["1-spring", "1-harvest", "1-winter", "2-2-spring", "2-2-harvest"]);
		expect(recordMythCompleted).toHaveBeenCalledTimes(1);
		// The Myth goes on the Timeline too, with the Knights who took Glory for it.
		expect(timelineMythCompleted).toHaveBeenCalledTimes(1);
		expect(vi.mocked(timelineMythCompleted).mock.calls[0][0].knights).toHaveLength(3);
		const succession = closeSeason.mock.calls[2][2].knights.find((entry) => entry.name === "Sir Corvin Ashby");
		expect(succession.pursuit).toBe("time.pursuits.succession.label");
		expect(hardshipFor).toHaveBeenCalledWith(expect.objectContaining({ key: "winter" }), expect.any(Array));
	});

	it("walks one unbroken road from the Seat, a Phase a hex, and camps a hex further on", async () => {
		await populateTestWorld();
		const seat = world.realm.holdings.find((holding) => holding.seat);
		expect(world.visits[0]).toEqual({ hex: seat.hex, when: { age: 1, season: "spring", day: 1, phase: "morning" } });
		for (let index = 1; index < world.visits.length; index++) {
			expect(hexDistance(world.g, world.visits[index - 1].hex, world.visits[index].hex)).toBe(1);
		}
		const order = (when) => [when.age, ["spring", "harvest", "winter"].indexOf(when.season), when.day, ["morning", "afternoon", "night"].indexOf(when.phase)];
		const sorted = world.visits.map(({ when }) => order(when));
		for (let index = 1; index < sorted.length; index++) expect(sorted[index].join() >= sorted[index - 1].join()).toBe(true);
		// The Company's Token counts the camp as it's put there, so this Season's travel doesn't.
		const [[, camp]] = setCompanyHex.mock.calls;
		expect(hexDistance(world.g, world.visits.at(-1).hex, camp)).toBe(1);
		const thisSeason = world.visits.filter(({ when }) => when.age === 2 && when.season === "harvest");
		expect(thisSeason.some(({ hex }) => hexKey(hex) === hexKey(camp))).toBe(false);
	});

	it("writes up open country along the road as well as the places, and tells the players some of it", async () => {
		await populateTestWorld();
		const walked = new Set(world.visits.map(({ hex }) => hexKey(hex)));
		const [[, camp]] = setCompanyHex.mock.calls;
		walked.add(hexKey(camp));
		const { isWilderness } = await import("../../module/test-world/plan.js");
		const noted = Object.keys(world.notes);
		const wild = noted.filter((key) => {
			const [col, row] = key.split(",").map(Number);
			return isWilderness(world.realm, { col, row });
		});
		expect(noted.length).toBeGreaterThanOrEqual(12);
		expect(wild.length).toBeGreaterThanOrEqual(4);
		// The GM only writes up the wilds the Company went through.
		for (const key of wild) expect(walked.has(key)).toBe(true);
		expect(world.told.length).toBeGreaterThanOrEqual(8);
		for (const { hex } of world.told) expect(walked.has(hexKey(hex))).toBe(true);
		// Told quietly, so a notification for each doesn't bury the build's own.
		for (const [options] of tellPlayersAboutHex.mock.calls) expect(options.quiet).toBe(true);
	});

	it("tells the players more of some wayside hexes in a later Season, and the Company rewrites its note", async () => {
		await populateTestWorld();
		const byHex = Object.groupBy(world.told, ({ hex }) => hexKey(hex));
		const retold = Object.entries(byHex).filter(([, told]) => new Set(told.map(({ note }) => note)).size > 1);
		expect(retold.length).toBeGreaterThanOrEqual(3);
		for (const [key, told] of retold) {
			expect(told.at(-1).note).toBe(world.notes[key]);
			expect(world.shared.hexes[key]?.party?.text).toBeTruthy();
		}
		// A Company's note can run to more than one line.
		expect(Object.values(world.shared.hexes).some((record) => record.party?.text.includes("\n"))).toBe(true);
	});

	it("keeps the hidden Barriers the Company ran into, each with who found it", async () => {
		const { recordBarriersMet } = await import("../../module/actions/hex-shared.js");
		await populateTestWorld();
		const walked = new Set(world.visits.map(({ hex }) => hexKey(hex)));
		expect(recordBarriersMet).toHaveBeenCalled();
		for (const [, met, byName] of recordBarriersMet.mock.calls) {
			expect(byName).toBeTruthy();
			for (const { hex, edges } of met) {
				expect(walked.has(hexKey(hex))).toBe(true);
				for (const edge of edges) expect(edge.split("|")).toContain(hexKey(hex));
			}
		}
		const revealed = world.realm.barriers.filter((barrier) => barrier.revealed).map((barrier) => barrier.edge);
		for (const [, met] of recordBarriersMet.mock.calls) for (const { edges } of met) for (const edge of edges) expect(revealed).toContain(edge);
	});

	it("marks only hidden things beside the end of the road as seen from afar", async () => {
		const { neighbours } = await import("../../module/rules/realm-geometry.js");
		const { hiddenThere } = await import("../../module/rules/sighted.js");
		await populateTestWorld();
		const [[, camp]] = setCompanyHex.mock.calls;
		const near = new Set([camp, ...world.visits.slice(-4).map(({ hex }) => hex)]
			.flatMap((hex) => neighbours(world.g, hex).map(({ hex: next }) => hexKey(next))));
		expect(Object.keys(world.sighted).length).toBeGreaterThan(0);
		for (const [key, mark] of Object.entries(world.sighted)) {
			const [col, row] = key.split(",").map(Number);
			expect(near.has(key)).toBe(true);
			expect(hiddenThere(world.realm, { col, row }, () => ({}))).not.toBeNull();
			expect(mark.note).toBeTruthy();
		}
	});

	it("tells the players of a place heard of at Court before the Company goes there", async () => {
		await populateTestWorld();
		const dwelling = world.told.find(({ note }) => note?.includes("Said at Court"));
		expect(dwelling?.when).toMatchObject({ age: 1, season: "spring" });
	});

	it("keeps what the players were told of the Seat as it was, though the GM's note has moved on", async () => {
		await populateTestWorld();
		const seat = world.realm.holdings.find((holding) => holding.seat);
		const told = world.told.find(({ hex }) => hexKey(hex) === hexKey(seat.hex));
		expect(told.when).toMatchObject({ age: 1, season: "spring" });
		expect(told.note).not.toContain("owes money");
		expect(world.notes[hexKey(seat.hex)]).toContain("owes money");
	});

	it("has the players take turns writing the Company's notes on places they've been", async () => {
		await populateTestWorld();
		const notes = Object.entries(world.shared.hexes).filter(([, record]) => record.party).map(([key, record]) => [key, record.party]);
		expect(notes.length).toBeGreaterThanOrEqual(8);
		expect(new Set(notes.map(([, party]) => party.byName))).toEqual(new Set(["Alys", "Bram"]));
		for (const [, party] of notes) expect(party).toMatchObject({ text: expect.any(String), when: expect.objectContaining({ age: expect.any(Number) }) });
	});

	it("signs the Company's notes as the GM in a world with no players", async () => {
		game.users = [game.user];
		await populateTestWorld();
		const names = Object.values(world.shared.hexes).filter((record) => record.party).map((record) => record.party.byName);
		expect(names.length).toBeGreaterThan(0);
		expect(new Set(names)).toEqual(new Set(["Gamemaster"]));
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
		expect(domain.system.crisisRolled).toBe("2-2-spring");
		expect(domain.system.council.circle).toEqual([knights()["Sir Oswin Hale"].id]);
		expect(knights()["Dame Isolde Marrow"].system.domain).toBe(domain.uuid);
		expect(world.journal.map((entry) => entry.flags.core.sheetClass)).toEqual(["mythic-bastionland-pwd.SiteSheet", "mythic-bastionland-pwd.SiteSheet"]);
		expect(world.journal[0].flags[SYSTEM_ID].site.points).toBeTruthy();
	});

	it("turns Site journals on and makes each Site's at once, and removing it deletes them", async () => {
		const { deleteSiteJournals, keepSiteJournal } = await import("../../module/actions/site-journals.js");
		await populateTestWorld();
		expect(world.settings.siteJournals).toBe(true);
		expect(keepSiteJournal.mock.calls.map(([entry]) => entry)).toEqual(world.journal);

		await populateTestWorld();
		expect(deleteSiteJournals).toHaveBeenCalledWith(world.journal.map((entry) => entry.id));
		expect(world.settings.siteJournals).toBe(false);
	});

	it("gives the Domain an heir, a Court, Council tasks and a Warband it feeds too little", async () => {
		await populateTestWorld();
		const [domain] = world.actors.filter((actor) => actor.type === "domain");
		expect(domain.system.successor).toBe("Sir Oswin Hale");
		expect(Object.values(domain.system.court).map((member) => member.role)).toEqual(["retainer", "retainer", "retainer", "retainer", "retainer", "courtier", "courtier", "petitioner", "seer"]);
		// Each of the four great seats is held by one of those Retainers.
		const seated = ["steward", "marshal", "sheriff", "envoy"].map((seat) => domain.system.court[domain.system.council[seat]]);
		expect(seated.map((member) => member?.role)).toEqual(["retainer", "retainer", "retainer", "retainer"]);
		expect(Object.values(domain.system.court).every((member) => member.name)).toBe(true);
		// The Circle's week is settled; the steward's Season and the envoy's are still in hand.
		expect(settleTask).toHaveBeenCalledTimes(1);
		expect(Object.values(domain.system.tasks).map((task) => [task.seat, task.scope, task.started.season])).toEqual([["steward", "season", "spring"], ["envoy", "season", "harvest"]]);
		const [warband] = world.actors.filter((actor) => actor.system.scale === "warband");
		expect(warband.flags[SYSTEM_ID]).toMatchObject({ musteredBy: domain.id, warbandOrigin: "vassals", [TEST_FLAG]: true });
		expect(wearWarbandDown).toHaveBeenCalledWith(warband, "poorlyFed");
	});

	it("gives Dame Isolde a Squire on a pony, and each Knight a folder of their own", async () => {
		await populateTestWorld();
		const { "Dame Isolde Marrow": isolde } = knights();
		const squire = world.actors.find((actor) => actor.system.isSquire);
		expect(squire.system.serves).toBe(isolde.uuid);
		expect(isolde.system.squire).toBe(squire.uuid);
		expect(world.actors.find((actor) => actor.uuid === squire.system.steed)?.type).toBe("npc");
		for (const knight of Object.values(knights())) {
			const folder = world.folders.find((candidate) => candidate.id === knight.folder);
			expect(folder.flags[SYSTEM_ID].knight).toBe(knight.id);
		}
	});

	it("makes the mere's ferry and pike with their sheets filled in", async () => {
		await populateTestWorld();
		const ferry = world.actors.find((actor) => actor.name === "The Grey Heron");
		expect(ferry).toMatchObject({ type: "structure", system: { kind: "ship", armour: 1, guard: { value: 3, max: 6 } } });
		expect(ferry.system.carries).not.toBe("");
		expect(ferry.items.map((item) => item.type)).toEqual(["weapon", "weapon", "gear", "gear", "gear"]);
		const pike = world.actors.find((actor) => actor.name === "Old Gullet");
		expect(pike).toMatchObject({ type: "npc", system: { age: "old", wields: "free", weakness: { known: true }, feats: { deny: true } } });
		expect(pike.system.inflicts).toHaveLength(1);
		expect(pike.flags[SYSTEM_ID][TEST_FLAG]).toBe(true);
	});

	it("marks each Season's feasts and masses, and its collection as it turns", async () => {
		await populateTestWorld();
		expect(markSeasonEvent.mock.calls.map(([key]) => key)).toEqual([
			"feastOfTheSun", "sceptremass", "feastOfTheStars", "eldermass", "feastOfTheMoon", "kindlemass", "feastOfTheSun", "sceptremass", "feastOfTheStars"
		]);
		expect(markCollection.mock.calls.map(([key]) => key)).toEqual(["1-spring", "1-harvest", "1-winter", "2-2-spring"]);
		expect(closeSeason.mock.calls[0][2].collection.name).toBe("tax");
	});

	it("leaves it raining, with two City Omens met, a Ruin's echo and the session ended", async () => {
		await populateTestWorld();
		expect(world.settings.weather).toBe("rain");
		expect(rollCityOmen).toHaveBeenCalledTimes(2);
		expect(echoRuin).toHaveBeenCalledTimes(1);
		expect(endTheSession).toHaveBeenCalledWith(expect.objectContaining({ step: "none", situations: [expect.objectContaining({ d6: 4 }), expect.objectContaining({ d6: 4 })] }));
	});

	it(imported ? "rolls each Knight's table from the book" : "leaves the Knights' tables empty", async () => {
		await populateTestWorld();
		expect(rollKnightTable).toHaveBeenCalledTimes(imported ? 3 : 0);
		if (imported) for (const knight of Object.values(knights())) expect(knight.system.bookTable.rolls).toEqual([3]);
	});

	it(imported ? "rolls Spark Tables and makes the Seer and a Myth's Cast from the book" : "leaves the book's Spark Tables and people out", async () => {
		await populateTestWorld();
		const npcs = world.actors.filter((actor) => actor.type === "npc").map((actor) => actor.name);
		if (imported) {
			expect(keepTableRoll.mock.calls.length).toBeGreaterThanOrEqual(10);
			expect(new Set(keepTableRoll.mock.calls.map(([{ page }]) => page.key))).toEqual(new Set(["nature", "civilisation", "people", "combat"]));
			// The Wilderness tables are rolled for a hex once, however often the story passes it.
			const wilds = rollHexSparkSet.mock.calls.map(([{ hex }]) => hexKey(hex));
			expect(wilds.length).toBeGreaterThanOrEqual(4);
			expect(new Set(wilds).size).toBe(wilds.length);
			expect(npcs.some((name) => / Seer$/.test(name))).toBe(true);
			const cast = world.actors.find((actor) => /^Cast of /.test(actor.name));
			expect(cast.flags[SYSTEM_ID].cast).toEqual({ myth: expect.any(String), from: cast.name });
			expect(world.folders.find((folder) => folder.id === cast.folder).flags[SYSTEM_ID].cast).toBe(cast.flags[SYSTEM_ID].cast.myth);
		} else {
			expect(keepTableRoll).not.toHaveBeenCalled();
			expect(rollHexSparkSet).not.toHaveBeenCalled();
			// Three steeds, the Squire's pony, the Domain's levy and the mere's pike.
			expect(npcs).toHaveLength(6);
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
		// A test world made before the settings were kept leaves them alone.
		expect(game.settings.set).not.toHaveBeenCalled();
	});

	it("puts back the weather, the City Quest and the session's memory it kept", async () => {
		const kept = { weather: "fog", cityQuest: { seen: [] }, sessionEnd: { promised: "season" }, siteJournals: false };
		world.toolkit.flags = { [SYSTEM_ID]: { [BEFORE_FLAG]: { calendar: BEFORE, notes: "", seasons: {}, settings: kept } } };
		world.toolkit.update = vi.fn();
		const { drawWeather } = await import("../../module/actions/weather.js");

		await populateTestWorld();
		expect(world.settings).toEqual(kept);
		expect(drawWeather).toHaveBeenCalled();
	});

	it("does nothing unless the GM confirms", async () => {
		foundry.applications.api.DialogV2.confirm.mockResolvedValue(false);
		game.actors = collection([{ id: "knight", flags: { [SYSTEM_ID]: { [TEST_FLAG]: true } } }]);
		await populateTestWorld();
		expect(world.classes.Actor.deleteDocuments).not.toHaveBeenCalled();
	});
});
