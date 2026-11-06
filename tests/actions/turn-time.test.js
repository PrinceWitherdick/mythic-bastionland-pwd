import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Time skipping ahead (p17): the Season, the Age, Weeks Pass and a journey to a
 * distant Realm, run through the real turns. What each does for the Company and
 * everybody else, and what it leaves behind for the next Phase.
 */

/** The world's calendar, who the Company dialog ticks, and where the Company stands. */
let calendar;
let ticked;
let standing;
let risk;
let nextEvent;

vi.mock("../../module/actions/actor-updates.js", () => import("../mocks/actor-updates.js"));
vi.mock("../../module/apps/ui.js", () => ({
	chooseDialog: vi.fn(async () => null),
	inputDialog: vi.fn(async (options) => {
		if (options.template !== "company") return null;
		return Object.fromEntries(options.context.members.flatMap((member) => [[`include-${member.index}`, ticked.includes(member.name)], [`older-${member.index}`, ticked.includes(member.name)]]));
	})
}));
vi.mock("../../module/apps/actor-pick.js", () => ({ chooseActor: vi.fn(async () => null), chooseOne: vi.fn(async () => null) }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => ({})), t: (key) => key, keyChoices: () => [] }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => null, mythEntry: () => ({ name: "Myth" }) }));
vi.mock("../../module/actions/calendar.js", () => ({
	getCalendar: () => ({ ...calendar }),
	setCalendar: vi.fn(async (next) => {
		calendar = { ...next };
	}),
	calendarLabel: () => "now"
}));
vi.mock("../../module/actions/ledger.js", () => ({ causedBy: () => ({}) }));
vi.mock("../../module/actions/glory.js", () => ({ adjustGlory: vi.fn(), gloryLines: () => [], recordRankReached: vi.fn(async () => null) }));
// Each Mutilation settled raises max GD by 3.
vi.mock("../../module/actions/scars.js", () => ({ settleScars: vi.fn(async (_actor, items, guardMax) => ({ rolls: [], lines: items.map(() => "settled"), guardMax: guardMax + 3 * items.length })) }));
vi.mock("../../module/actions/squires.js", () => ({ knightSquire: vi.fn() }));
vi.mock("../../module/actions/succession.js", () => ({ chooseSuccessor: vi.fn(), heirOf: () => null }));
vi.mock("../../module/actions/fallen.js", () => ({ announceFallenKnight: vi.fn(async () => null), companionsOf: () => [], worldCompanions: () => [] }));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineAged: vi.fn(), timelineSeasonTurn: vi.fn(async () => null) }));
vi.mock("../../module/actions/homecoming.js", () => ({ markLongAbsences: vi.fn(async () => null) }));
vi.mock("../../module/actions/pursuits.js", () => ({ followPursuits: vi.fn(async () => null), makingsFor: () => [] }));
vi.mock("../../module/actions/season-events.js", () => ({
	collectionEntry: () => ({ name: "collection", lines: [] }),
	markCollection: vi.fn(async () => null),
	markSeasonEvent: vi.fn(async (key) => ({ key })),
	seasonEventsNow: () => ({ next: nextEvent })
}));
vi.mock("../../module/actions/season-log.js", () => ({ recordSeasonTurn: vi.fn(async () => null) }));
vi.mock("../../module/actions/dominion.js", () => ({ settleDomains: vi.fn(async () => ({ entries: [], fell: [] })), worldDomains: () => [] }));
vi.mock("../../module/actions/court.js", () => ({ seatCircle: vi.fn() }));
vi.mock("../../module/actions/council-tasks.js", () => ({ tasksDueNotices: vi.fn(() => ["a task is due"]) }));
vi.mock("../../module/actions/knight-tables.js", () => ({ tableRenewalNotices: vi.fn(() => ["a table comes round"]) }));
vi.mock("../../module/actions/referee-rolls.js", () => ({
	direWeatherRisk: () => risk,
	forgetWeatherRun: vi.fn(async () => null),
	rollRefereeTable: vi.fn(async () => null)
}));
vi.mock("../../module/actions/phase-end.js", () => ({
	askPhaseEnd: vi.fn(),
	dieUntended: vi.fn(),
	forgetDeprived: vi.fn(async () => null),
	takeMorningLosses: vi.fn(async () => null)
}));
vi.mock("../../module/actions/wilderness.js", () => ({ companySituation: () => standing, wildernessRoll: vi.fn() }));
vi.mock("../../module/actions/knights.js", () => ({
	companyKnights: () => game.actors.filter((actor) => actor.type === "knight"),
	inCompany: () => true,
	playerCharacter: (actor) => Boolean(actor.player)
}));
vi.mock("../../module/actions/myth-notes.js", () => ({ getMythNotes: () => ({}) }));
vi.mock("../../module/actions/realm.js", () => ({ getRealm: () => ({ realm: { myths: [] } }), isRealmScene: () => false }));
vi.mock("../../module/actions/afflictions.js", () => ({ burnMorningAfflictions: vi.fn(), sufferMorningAfflictions: vi.fn(async () => null) }));

const { advancePhase, journeyToDistantRealm, turnAge, turnSeason, weeksPass } = await import("../../module/actions/time.js");
const { postCard } = await import("../../module/chat/cards.js");
const { rollRefereeTable, forgetWeatherRun } = await import("../../module/actions/referee-rolls.js");
const { askPhaseEnd, forgetDeprived, takeMorningLosses } = await import("../../module/actions/phase-end.js");
const { markSeasonEvent } = await import("../../module/actions/season-events.js");
const { tasksDueNotices } = await import("../../module/actions/council-tasks.js");
const { tableRenewalNotices } = await import("../../module/actions/knight-tables.js");
const { timelineSeasonTurn } = await import("../../module/actions/timeline-events.js");

const low = () => ({ vig: { value: 3, max: 12 }, cla: { value: 4, max: 11 }, spi: { value: 5, max: 10 } });

/** Somebody in the world, whose updates land on them and are kept to read. */
function someone(name, { type = "knight", items = [], ...system } = {}) {
	const actor = {
		id: name,
		name,
		type,
		isOwner: true,
		items,
		system: { virtues: low(), guard: { value: 1, max: 6 }, fatigued: false, exposed: false, mortalWound: false, age: "young", ...system },
		update: vi.fn(async () => actor)
	};
	return actor;
}

/** What one actor was written with, all their updates together. */
const written = (actor) => Object.assign({}, ...actor.update.mock.calls.map(([update]) => update));

const mutilation = () => ({ type: "scar", system: { roll: 10, resolved: false } });
const oath = () => ({ type: "ability", system: { oath: true, inEffect: true } });
const seasonCard = () => vi.mocked(postCard).mock.calls.find(([, template, data]) => template === "report" && ["spring", "harvest", "winter"].includes(data.tone));

beforeEach(() => {
	vi.clearAllMocks();
	calendar = { age: 1, year: 1, season: "harvest", day: 4, phase: "afternoon" };
	ticked = [];
	standing = { situation: { holding: false } };
	risk = "winter";
	nextEvent = { key: "eldermass", collection: false };
	globalThis.game = { user: { isGM: true }, actors: [], scenes: [] };
	globalThis.canvas = { tokens: { controlled: [] } };
	globalThis.ui = { notifications: { info: vi.fn(), warn: vi.fn() } };
	globalThis.Roll = class {
		async evaluate() {
			this.total = 4;
			return this;
		}
	};
	// Many world actors in one write, each landing on its own actor.
	globalThis.Actor = { updateDocuments: vi.fn(async (updates) => Promise.all(updates.map(({ _id, ...update }) => game.actors.find((actor) => actor.id === _id).update(update)))) };
});

afterEach(() => {
	delete globalThis.game;
	delete globalThis.canvas;
	delete globalThis.ui;
	delete globalThis.Roll;
	delete globalThis.Actor;
});

describe("the Season's turn, for the Company", () => {
	it("tends a Mortal Wound, and gives back GD, Fatigue and Exposed with the Virtues (p8, p9)", async () => {
		const sir = someone("Sir Ash", { mortalWound: true, fatigued: true, exposed: true });
		game.actors = [sir];
		ticked = ["Sir Ash"];
		await turnSeason();
		expect(written(sir)).toMatchObject({
			"system.mortalWound": false,
			"system.fatigued": false,
			"system.exposed": false,
			"system.guard.value": 6,
			"system.virtues.vig.value": 12,
			"system.virtues.cla.value": 11,
			"system.virtues.spi.value": 10
		});
	});

	it("keeps a sworn Knight's GD down until the quest is done (p94), but still lifts their Fatigue", async () => {
		const sworn = someone("Sir Vow", { fatigued: true, items: [oath()] });
		game.actors = [sworn];
		ticked = ["Sir Vow"];
		await turnSeason();
		expect(written(sworn)).not.toHaveProperty("system.guard.value");
		expect(written(sworn)).toMatchObject({ "system.fatigued": false });
	});

	it("fills GD to the max a settled Mutilation has just raised", async () => {
		const sir = someone("Sir Ash", { items: [mutilation()] });
		game.actors = [sir];
		ticked = ["Sir Ash"];
		await turnSeason();
		expect(written(sir)).toMatchObject({ "system.guard.max": 9, "system.guard.value": 9 });
	});
});

describe("the Season's turn, for everybody else", () => {
	it("settles an unticked Knight's Mutilation too, on the card and their Timeline (p9)", async () => {
		const away = someone("Sir Away", { player: true, items: [mutilation()] });
		game.actors = [away];
		await turnSeason();
		expect(written(away)).toMatchObject({ "system.guard.max": 9, "system.guard.value": 9, "system.virtues.vig.value": 12 });
		const [, , card] = seasonCard();
		expect(card.entries).toContainEqual(expect.objectContaining({ name: "Sir Away", lines: ["settled"] }));
		expect(vi.mocked(timelineSeasonTurn).mock.calls[0][1].knights).toContainEqual(expect.objectContaining({ actorId: "Sir Away", lines: ["settled"] }));
	});

	it("gives an NPC whose Virtues are whole their GD and lost Fatigue back", async () => {
		const npc = someone("Guide", { type: "npc", fatigued: true, virtues: { vig: { value: 9, max: 9 }, cla: { value: 9, max: 9 }, spi: { value: 9, max: 9 } } });
		game.actors = [npc];
		await turnSeason();
		expect(written(npc)).toMatchObject({ "system.guard.value": 6, "system.fatigued": false });
	});

	it("leaves the dying, the dead and a structure as they are", async () => {
		const dying = someone("Dying", { type: "npc", mortalWound: true });
		const dead = someone("Dead", { type: "npc", slain: true, items: [mutilation()] });
		const wall = someone("Wall", { type: "structure" });
		game.actors = [dying, dead, wall];
		await turnSeason();
		expect(dying.update).not.toHaveBeenCalled();
		expect(dead.update).not.toHaveBeenCalled();
		expect(wall.update).not.toHaveBeenCalled();
	});
});

describe("the Age's turn", () => {
	it("takes d12 from an Old NPC's VIG, and restores the rest of them with it (p17)", async () => {
		const mage = someone("Old Mage", { type: "npc", age: "old" });
		game.actors = [mage];
		await turnAge();
		expect(written(mage)).toMatchObject({ "system.virtues.vig.max": 8, "system.virtues.vig.value": 8, "system.virtues.cla.value": 11, "system.guard.value": 6 });
	});

	it("grows a ticked Knight a stage older, and gives them a Glory", async () => {
		const sir = someone("Sir Ash", { glory: 2, gainsGlory: true });
		game.actors = [sir];
		ticked = ["Sir Ash"];
		await turnAge();
		expect(written(sir)).toMatchObject({ "system.glory": 3, "system.age": "mature" });
		expect(calendar).toMatchObject({ age: 2, season: "spring", phase: "morning" });
	});

	it("gives every living Knight 1 Glory, ticked or not, the Referee's NPC Knights too, but no Squire or the Slain (p6, p17)", async () => {
		const ticks = someone("Sir Ash", { glory: 2, gainsGlory: true });
		const unticked = someone("Sir Away", { player: true, glory: 5, gainsGlory: true });
		const npcKnight = someone("Sir Rival", { type: "npcKnight", glory: 8, gainsGlory: true });
		const squire = someone("Young Tam", { glory: 0, gainsGlory: false, isSquire: true });
		const slain = someone("Sir Fallen", { type: "npcKnight", glory: 4, gainsGlory: true, slain: true });
		const npc = someone("Guide", { type: "npc" });
		game.actors = [ticks, unticked, npcKnight, squire, slain, npc];
		ticked = ["Sir Ash"];
		await turnAge();
		expect(written(ticks)["system.glory"]).toBe(3);
		expect(written(unticked)["system.glory"]).toBe(6);
		expect(written(npcKnight)["system.glory"]).toBe(9);
		expect(written(squire)["system.glory"]).toBeUndefined();
		expect(slain.update).not.toHaveBeenCalled();
		expect(written(npc)["system.glory"]).toBeUndefined();
		// A Rank reached that way goes on their thread as the Company's does.
		const { recordRankReached } = await import("../../module/actions/glory.js");
		const reached = vi.mocked(recordRankReached).mock.calls.map(([actor, change]) => [actor.name, change.to]);
		expect(reached).toEqual(expect.arrayContaining([["Sir Ash", 3], ["Sir Away", 6], ["Sir Rival", 9]]));
		expect(reached.map(([name]) => name)).not.toContain("Young Tam");
	});

	it("gives no Glory to anybody left unticked as only the Season turns", async () => {
		const unticked = someone("Sir Away", { player: true, glory: 5, gainsGlory: true });
		game.actors = [unticked];
		await turnSeason();
		expect(written(unticked)["system.glory"]).toBeUndefined();
	});
});

describe("what a time skip leaves behind", () => {
	it("breaks a run of Looming weather and forgets last Night's Deprived ticks", async () => {
		await turnSeason();
		expect(forgetWeatherRun).toHaveBeenCalled();
		expect(forgetDeprived).toHaveBeenCalled();
	});

	it("rolls the first Morning of Winter's weather where the lands are at its mercy (p18)", async () => {
		await turnSeason();
		expect(calendar).toMatchObject({ season: "winter", phase: "morning" });
		expect(rollRefereeTable).toHaveBeenCalledWith("weather");
	});

	it("rolls no weather for a Morning in Spring, or with the Company indoors in a Holding", async () => {
		calendar.season = "spring";
		await turnSeason();
		expect(rollRefereeTable).not.toHaveBeenCalled();
		calendar.season = "harvest";
		standing = { situation: { holding: true } };
		await turnSeason();
		expect(rollRefereeTable).not.toHaveBeenCalled();
	});

	it("rolls the weather once as the Age turns, and not before the window is answered", async () => {
		calendar.season = "winter";
		vi.mocked(postCard).mockClear();
		const closed = vi.mocked((await import("../../module/apps/ui.js")).inputDialog);
		closed.mockResolvedValueOnce(null);
		expect(await turnAge()).toBeNull();
		expect(rollRefereeTable).not.toHaveBeenCalled();
		expect(forgetWeatherRun).not.toHaveBeenCalled();
	});

	it("rolls a distant Realm's weather once, after the journey, not as the Season turns", async () => {
		await journeyToDistantRealm();
		expect(vi.mocked(rollRefereeTable).mock.calls.filter(([key]) => key === "weather")).toHaveLength(1);
	});
});

describe("Weeks Pass", () => {
	it("lists on the event's card what falls due on the Morning the weeks end on (p20)", async () => {
		const after = await weeksPass();
		expect(after).toMatchObject({ day: 5, phase: "morning" });
		expect(tasksDueNotices).toHaveBeenCalledWith(after);
		expect(tableRenewalNotices).toHaveBeenCalledWith(["night", "day"]);
		expect(markSeasonEvent).toHaveBeenCalledWith("eldermass", { weeks: true, due: ["a task is due", "a table comes round"] });
	});

	it("breaks the weather's run, forgets Deprived ticks, and rolls a Winter Morning's weather", async () => {
		calendar.season = "winter";
		await weeksPass();
		expect(forgetWeatherRun).toHaveBeenCalled();
		expect(forgetDeprived).toHaveBeenCalled();
		expect(rollRefereeTable).toHaveBeenCalledWith("weather");
	});

	it("moves nothing on when there's no event left to reach", async () => {
		nextEvent = null;
		expect(await weeksPass()).toBeNull();
		expect(forgetWeatherRun).not.toHaveBeenCalled();
		expect(calendar.day).toBe(4);
	});
});

describe("a Night's end and the Deprived ticks", () => {
	const night = (members) => ({ mode: "camp", scene: null, wilderness: false, dire: false, sky: null, members, dying: [] });

	it("forgets them when a Night ends with nobody of the Company ticked", async () => {
		calendar.phase = "night";
		vi.mocked(askPhaseEnd).mockResolvedValueOnce(night([]));
		await advancePhase();
		expect(takeMorningLosses).not.toHaveBeenCalled();
		expect(forgetDeprived).toHaveBeenCalled();
	});

	it("leaves them to the Morning's losses when somebody is ticked", async () => {
		calendar.phase = "night";
		vi.mocked(askPhaseEnd).mockResolvedValueOnce(night([{ actor: someone("Sir Ash"), noSleep: false, deprived: true }]));
		await advancePhase();
		expect(takeMorningLosses).toHaveBeenCalled();
		expect(forgetDeprived).not.toHaveBeenCalled();
	});
});
