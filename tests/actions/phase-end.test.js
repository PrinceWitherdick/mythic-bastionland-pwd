import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRealm } from "../../module/rules/realm.js";
import { hexCentre, realmGeometry } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const g = realmGeometry();
const hex = (col, row) => ({ col, row });

/** What the Phase's end answers, and every window asked with the Phase it was asked in. */
let answer;
let asked;
/** The world's calendar, its other settings, and the Realm every Realm Scene holds. */
let calendar;
let settings;
let realm;
/** When the lands are at the mercy of dire weather, and what the weather came to. */
let risk;
let weather;

vi.mock("../../module/apps/ui.js", () => ({
	chooseDialog: vi.fn(async () => null),
	inputDialog: vi.fn(async (options) => {
		asked.push({ ...options, phase: calendar.phase });
		return typeof answer === "function" ? answer(options) : answer;
	})
}));
vi.mock("../../module/chat/cards.js", () => ({
	keyChoices: (keys, _path, { chosen = keys[0] } = {}) => keys.map((key) => ({ key, checked: key === chosen })),
	postCard: vi.fn(async () => ({})),
	t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key)
}));
vi.mock("../../module/actions/realm.js", () => ({
	isRealmScene: (scene) => Boolean(scene?.realm),
	sceneGeometry: () => g,
	getRealm: () => ({ realm })
}));
vi.mock("../../module/actions/calendar.js", () => ({
	getCalendar: () => ({ ...calendar }),
	setCalendar: vi.fn(async (next) => {
		calendar = { ...next };
	}),
	calendarLabel: () => "now"
}));
vi.mock("../../module/book-art/art-index.js", () => ({
	loadArtIndex: async () => null,
	mythEntry: (_index, myth) => ({ name: `Myth ${myth.number}`, page: 30, entry: null }),
	seerEntry: () => ({ name: "Seer", page: 28 })
}));
vi.mock("../../module/actions/city-quest.js", () => ({ cityOmensSeen: () => 0, rollCityOmen: vi.fn() }));
vi.mock("../../module/actions/landmarks.js", () => ({
	landmarkOfferView: () => ({}),
	nameLandmarkFromPrompt: async () => null,
	strikeOffCourse: vi.fn()
}));
vi.mock("../../module/actions/council-tasks.js", () => ({ tasksDueNotices: () => [] }));
vi.mock("../../module/actions/knight-tables.js", () => ({ tableRenewalNotices: () => [] }));
vi.mock("../../module/actions/afflictions.js", () => ({ sufferMorningAfflictions: vi.fn() }));
vi.mock("../../module/actions/ledger.js", () => ({ causedBy: () => ({}) }));
vi.mock("../../module/actions/fallen.js", () => ({ announceFallenKnight: vi.fn() }));
vi.mock("../../module/actions/referee-rolls.js", () => ({
	direWeatherRisk: () => risk,
	rollRefereeTable: vi.fn(),
	weatherIn: () => weather
}));

const { advancePhase } = await import("../../module/actions/time.js");
const { postCard } = await import("../../module/chat/cards.js");
const { rollRefereeTable } = await import("../../module/actions/referee-rolls.js");
const { announceFallenKnight } = await import("../../module/actions/fallen.js");

/** A Realm Scene with the Company's own Token standing in a hex. */
function realmScene(id, where) {
	const point = hexCentre(g, where);
	const token = { getFlag: (_scope, key) => key === "company", getCenterPoint: () => point };
	return { id, realm: true, tokens: [token], updateEmbeddedDocuments: vi.fn() };
}

/** Put the Company in a hex of the one Realm, shown on the canvas. */
function standAt(where) {
	const scene = realmScene("realm", where);
	globalThis.canvas = { scene, tokens: { controlled: [] } };
	game.scenes = Object.assign([scene], { active: scene });
	return scene;
}

/** A Knight a player owns, whose Virtue updates land on it. */
function knight(id, { vig = 10, cla = 10, spi = 10 } = {}) {
	const actor = {
		id,
		name: id,
		type: "knight",
		hasPlayerOwner: true,
		system: { virtues: { vig: { value: vig }, cla: { value: cla }, spi: { value: spi } } },
		update: vi.fn(async (changes) => {
			for (const [path, value] of Object.entries(changes)) actor.system.virtues[path.split(".")[2]].value = value;
		})
	};
	return actor;
}

/** The cards posted with this template. */
const cardsOf = (template) => vi.mocked(postCard).mock.calls.filter(([, name]) => name === template);

beforeEach(() => {
	answer = (options) => ({ mode: options.context.modes.find((mode) => mode.checked).key, wilderness: options.context.wilderness?.checked });
	asked = [];
	calendar = { age: 1, year: 1, season: "spring", day: 1, phase: "morning" };
	settings = new Map();
	risk = "winter";
	weather = null;
	realm = emptyRealm(g, "wild");
	realm.myths = [{ id: "m1", hex: hex(8, 6), number: 1, d6: 1, d12: 1, omen: 2, revealed: false }];
	realm.holdings = [{ id: "h1", hex: hex(2, 2), style: "castle", seat: true, name: "" }];
	globalThis.Roll = class {
		constructor(formula) {
			this.formula = formula;
			this.total = 5;
		}

		async evaluate() {
			return this;
		}
	};
	globalThis.game = {
		user: { isGM: true },
		actors: [],
		scenes: Object.assign([], { active: null }),
		settings: {
			get: (scope, key) => (scope === SYSTEM_ID ? settings.get(key) ?? null : null),
			set: vi.fn(async (_scope, key, value) => settings.set(key, value))
		}
	};
	globalThis.canvas = { scene: null, tokens: { controlled: [] } };
	globalThis.ui = { notifications: { warn: vi.fn() } };
	vi.mocked(postCard).mockClear();
	vi.mocked(rollRefereeTable).mockClear();
});

afterEach(() => {
	delete globalThis.Roll;
	delete globalThis.game;
	delete globalThis.canvas;
	delete globalThis.ui;
});

describe("the Phase's end", () => {
	it("asks how the Phase was spent before moving on, and rolls when the Company travelled", async () => {
		standAt(hex(6, 6));
		await advancePhase();
		expect(asked).toHaveLength(1);
		expect(asked[0].phase).toBe("morning");
		expect(asked[0].context.modes.map(({ key, checked }) => [key, checked])).toEqual([["travel", true], ["camp", false], ["indoors", false]]);
		expect(asked[0].context.wilderness).toMatchObject({ offered: true, checked: true });
		expect(asked[0].context.morning).toBeNull();
		expect(cardsOf("wilderness")).toHaveLength(1);
		expect(calendar.phase).toBe("afternoon");
	});

	it("makes no roll for a Phase spent indoors, or with the roll unticked", async () => {
		standAt(hex(6, 6));
		answer = { mode: "indoors", wilderness: true };
		await advancePhase();
		answer = { mode: "travel", wilderness: false };
		await advancePhase();
		expect(cardsOf("wilderness")).toHaveLength(0);
		expect(calendar.phase).toBe("night");
	});

	it("keeps the Phase when the window is closed", async () => {
		standAt(hex(6, 6));
		answer = null;
		expect(await advancePhase()).toBeNull();
		expect(calendar.phase).toBe("morning");
	});

	it("expects a Holding to be spent indoors, with no roll to offer", async () => {
		standAt(hex(2, 2));
		await advancePhase();
		expect(asked[0].context.modes.find(({ checked }) => checked).key).toBe("indoors");
		expect(asked[0].context.wilderness).toMatchObject({ offered: false });
		expect(cardsOf("wilderness")).toHaveLength(0);
	});

	it("shows a Myth's next Omen in its own hex", async () => {
		standAt(hex(8, 6));
		await advancePhase();
		expect(cardsOf("wilderness")[0][2].result).toBe("realm.wilderness.results.mythHex");
	});

	it("moves straight on where no Realm shows the Company and no Night ends", async () => {
		await advancePhase();
		expect(asked).toHaveLength(0);
		expect(calendar.phase).toBe("afternoon");
	});

	it("rolls for a Phase wasted at a Barrier, even setting out from a Holding", async () => {
		const scene = standAt(hex(2, 2));
		await advancePhase({ scene, mode: "travel", atBarrier: true, note: "turned back" });
		expect(asked[0].context.note).toBe("turned back");
		expect(asked[0].context.wilderness).toMatchObject({ offered: true, checked: true });
		expect(cardsOf("wilderness")[0][2].d6).toBe(5);
	});

	it("starts where Search says, spent exploring", async () => {
		const scene = standAt(hex(6, 6));
		calendar.phase = "night";
		await advancePhase({ scene, mode: "travel" });
		expect(asked[0].context.modes.find(({ checked }) => checked).key).toBe("travel");
	});
});

describe("as Morning comes", () => {
	beforeEach(() => {
		calendar.phase = "night";
	});

	it("expects camping, and costs nothing to a Company that slept", async () => {
		standAt(hex(6, 6));
		game.actors = [knight("Alys")];
		answer = (options) => ({ mode: options.context.modes.find((mode) => mode.checked).key, "include-0": true });
		await advancePhase();
		expect(asked[0].context.modes.find(({ checked }) => checked).key).toBe("camp");
		expect(asked[0].context.morning.members).toEqual([{ index: 0, name: "Alys", included: true, deprived: false }]);
		expect(cardsOf("report").filter(([, , context]) => context.title === "phaseEnd.morning.title")).toHaveLength(0);
		expect(calendar.phase).toBe("morning");
	});

	it("takes SPI and CLA for travelling through the Night, and VIG in Winter, on one card", async () => {
		standAt(hex(6, 6));
		calendar.season = "winter";
		const alys = knight("Alys");
		game.actors = [alys];
		answer = { mode: "travel", "include-0": true };
		await advancePhase();
		expect(alys.system.virtues).toEqual({ vig: { value: 5 }, cla: { value: 5 }, spi: { value: 5 } });
		const morning = cardsOf("report").filter(([, , context]) => context.title === "phaseEnd.morning.title");
		expect(morning).toHaveLength(1);
		expect(morning[0][2].entries[0].lines).toHaveLength(3);
	});

	it("takes each one's own lost sleep and hunger, and remembers who went without", async () => {
		const alys = knight("Alys");
		const bors = knight("Bors");
		game.actors = [alys, bors];
		answer = { mode: "indoors", "include-0": true, "nosleep-0": true, "include-1": true, "deprived-1": true };
		await advancePhase();
		expect(alys.system.virtues.cla.value).toBe(5);
		expect(bors.system.virtues.vig.value).toBe(5);
		expect(settings.get("deprived")).toEqual(["Bors"]);

		calendar.phase = "night";
		asked = [];
		answer = null;
		await advancePhase();
		expect(asked[0].context.morning.members.map(({ deprived }) => deprived)).toEqual([false, true]);
	});

	it("leaves those not with the Company alone", async () => {
		const alys = knight("Alys");
		game.actors = [alys];
		answer = { mode: "travel", "include-0": false };
		await advancePhase();
		expect(alys.update).not.toHaveBeenCalled();
	});

	it("lets nobody outdoors sleep in dire weather", async () => {
		standAt(hex(6, 6));
		weather = "dire";
		const alys = knight("Alys");
		game.actors = [alys];
		answer = { mode: "camp", "include-0": true };
		await advancePhase();
		expect(asked[0].context.morning.rules).toContain("phaseEnd.morning.rules.dire");
		expect(alys.system.virtues.cla.value).toBe(5);
	});

	it("expects travel through a Night the Company was seen moving in", async () => {
		standAt(hex(6, 6));
		settings.set("nightTravel", { when: { ...calendar }, blind: false });
		await advancePhase();
		expect(asked[0].context.modes.find(({ checked }) => checked).key).toBe("travel");
	});
});

describe("dying untended", () => {
	const wounded = (name, vig = 4) => ({ name, type: "knight", system: { mortalWound: true, virtues: { vig: { value: vig } } }, update: vi.fn() });

	it("asks after the Mortally Wounded even with nothing else to ask, and those left ticked die (p8)", async () => {
		const tal = wounded("Tal");
		const moss = wounded("Moss");
		game.actors = [tal, moss, wounded("Already slain", 0), { name: "Well", system: { mortalWound: false, virtues: { vig: { value: 9 } } } }];
		const loose = { ...wounded("Bandit"), type: "npc" };
		canvas.scene = { tokens: [{ actorLink: false, actor: loose }, { actorLink: true, actor: tal }] };
		answer = () => ({ "dying-0": true, "dying-1": false, "dying-2": true });
		vi.mocked(announceFallenKnight).mockClear();
		await advancePhase();
		expect(asked[0].context.dying.map(({ name }) => name)).toEqual(["Tal", "Moss", "Bandit"]);
		expect(tal.update).toHaveBeenCalledWith({ "system.virtues.vig.value": 0, "system.mortalWound": false }, {});
		expect(moss.update).not.toHaveBeenCalled();
		expect(loose.update).toHaveBeenCalled();
		expect(cardsOf("report").at(-1)[2].entries.map(({ name }) => name)).toEqual(["Tal", "Bandit"]);
		expect(announceFallenKnight).toHaveBeenCalledWith(tal, "slain");
		expect(calendar.phase).toBe("afternoon");
	});

	it("lists nobody when nobody is dying", async () => {
		standAt(hex(6, 6));
		await advancePhase();
		expect(asked[0].context.dying).toEqual([]);
	});
});

describe("the weather as a Phase begins", () => {
	it("rolls in Winter out in the Wilderness", async () => {
		standAt(hex(6, 6));
		calendar.season = "winter";
		answer = { mode: "travel", wilderness: false };
		await advancePhase();
		expect(rollRefereeTable).toHaveBeenCalledWith("weather");
	});

	it("rolls no weather in a Holding, out of Winter, or where the lands are never at its mercy", async () => {
		standAt(hex(2, 2));
		calendar.season = "winter";
		await advancePhase();
		standAt(hex(6, 6));
		answer = { mode: "travel", wilderness: false };
		calendar.season = "summer";
		await advancePhase();
		risk = "never";
		calendar.season = "winter";
		await advancePhase();
		expect(rollRefereeTable).not.toHaveBeenCalled();
		risk = "always";
		calendar.season = "summer";
		await advancePhase();
		expect(rollRefereeTable).toHaveBeenCalledOnce();
	});
});
