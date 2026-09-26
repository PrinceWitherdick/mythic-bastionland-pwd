import { describe, expect, it } from "vitest";
import {
	TASK_OUTCOMES,
	TASK_RISKS,
	TASK_SCOPES,
	TASK_SCOPE_ICONS,
	bringsCrisis,
	councilTasks,
	isSaveRisk,
	isTaskDue,
	newTask,
	normalizeTask,
	normalizeTasks,
	taskCount,
	taskDueAt,
	taskOutcome,
	tasksDue
} from "../../module/rules/council-tasks.js";
import { COUNCIL_SEATS } from "../../module/rules/dominion.js";
import { VIRTUES } from "../../module/rules/virtues.js";

const day = (day, phase = "morning", season = "spring", age = 1, year = 1) => ({ age, year, season, day, phase });

const task = (seat, extra = {}) => ({
	seat,
	what: "",
	scope: "phase",
	risk: "none",
	started: day(1),
	at: 1,
	...extra
});

describe("TASK_SCOPES", () => {
	it("holds the three the book gives, in its order", () => {
		expect(TASK_SCOPES).toEqual(["phase", "week", "season"]);
	});

	it("draws each one", () => {
		expect(Object.keys(TASK_SCOPE_ICONS).sort()).toEqual([...TASK_SCOPES].sort());
	});
});

describe("TASK_RISKS", () => {
	it("settles a task by nothing, by the Luck Roll, or by a Save in one Virtue (p16)", () => {
		expect(TASK_RISKS).toEqual(["none", "luck", ...VIRTUES]);
	});

	it("knows which are Saves", () => {
		expect(TASK_RISKS.filter(isSaveRisk)).toEqual([...VIRTUES]);
	});
});

describe("normalizeTask", () => {
	it("refuses anything that isn't a Council seat's", () => {
		expect(normalizeTask(null)).toBeNull();
		expect(normalizeTask({ what: "Restock the treasury" })).toBeNull();
		expect(normalizeTask({ seat: "courtier" })).toBeNull();
	});

	it("keeps a task that hasn't been written yet, since one can be set in a hurry", () => {
		expect(normalizeTask({ seat: "steward" })).toEqual(task("steward", { started: day(1), at: 0 }));
	});

	it("trims what was typed", () => {
		expect(normalizeTask({ seat: "marshal", what: "  Muster the Warbands  " }).what).toBe("Muster the Warbands");
	});

	it("falls back to the shortest scope and no risk where either is unreadable", () => {
		const read = normalizeTask({ seat: "sheriff", scope: "year", risk: "glory" });
		expect(read).toMatchObject({ scope: "phase", risk: "none" });
	});

	it("keeps the calendar the work began on, however bad", () => {
		expect(normalizeTask({ seat: "envoy", started: { age: 2, season: "winter", day: 4, phase: "night" } }).started)
			.toEqual({ age: 2, year: 1, season: "winter", day: 4, phase: "night" });
		expect(normalizeTask({ seat: "envoy", started: "yesterday" }).started).toEqual(day(1));
	});
});

describe("normalizeTasks", () => {
	it("drops whatever isn't a task", () => {
		const read = normalizeTasks({ a: { seat: "steward" }, b: { seat: "nobody" }, c: null });
		expect(Object.keys(read)).toEqual(["a"]);
	});

	it("reads nothing out of nothing", () => {
		expect(normalizeTasks(undefined)).toEqual({});
	});
});

describe("councilTasks", () => {
	const tasks = {
		later: task("steward", { at: 2, what: "Second" }),
		early: task("steward", { at: 1, what: "First" }),
		marshal: task("marshal", { at: 0, what: "Muster" })
	};

	it("lists them by seat in the book's order, then in the order they were set", () => {
		expect(councilTasks(tasks).map((entry) => entry.what)).toEqual(["First", "Second", "Muster"]);
	});

	it("carries each id", () => {
		expect(councilTasks(tasks).map((entry) => entry.id)).toEqual(["early", "later", "marshal"]);
	});

	it("counts them all", () => {
		expect(taskCount(tasks)).toBe(3);
	});
});

describe("newTask", () => {
	it("makes one ready to store", () => {
		expect(newTask("envoy", { what: "Treat with the neighbours", scope: "season", risk: "cla", started: day(3), at: 7 }))
			.toEqual({ seat: "envoy", what: "Treat with the neighbours", scope: "season", risk: "cla", started: day(3), at: 7 });
	});

	it("refuses a seat the Council doesn't have", () => {
		expect(newTask("courtier", {})).toBeNull();
	});
});

describe("taskDueAt", () => {
	it("gives a Phase's work the next Phase", () => {
		expect(taskDueAt(task("steward", { scope: "phase", started: day(2, "morning") }))).toEqual(day(2, "afternoon"));
	});

	it("carries a Phase's work begun at Night into the next Morning", () => {
		expect(taskDueAt(task("steward", { scope: "phase", started: day(2, "night") }))).toEqual(day(3, "morning"));
	});

	it("gives a Week's work the next Day, which is how weeks pass", () => {
		expect(taskDueAt(task("marshal", { scope: "week", started: day(2, "afternoon") }))).toEqual(day(3, "morning"));
	});

	it("gives a Season's work the next Season", () => {
		expect(taskDueAt(task("envoy", { scope: "season", started: day(9, "night") }))).toEqual(day(1, "morning", "harvest"));
	});
});

describe("isTaskDue", () => {
	it("waits for the Phase to turn", () => {
		const phase = task("steward", { scope: "phase", started: day(2, "morning") });
		expect(isTaskDue(phase, day(2, "morning"))).toBe(false);
		expect(isTaskDue(phase, day(2, "afternoon"))).toBe(true);
	});

	it("holds a Week's work through the Day it was begun on", () => {
		const week = task("marshal", { scope: "week", started: day(2, "morning") });
		expect(isTaskDue(week, day(2, "night"))).toBe(false);
		expect(isTaskDue(week, day(3, "morning"))).toBe(true);
	});

	it("holds a Season's work until the Season turns, however many Days pass", () => {
		const season = task("envoy", { scope: "season", started: day(2) });
		expect(isTaskDue(season, day(40))).toBe(false);
		expect(isTaskDue(season, day(1, "morning", "harvest"))).toBe(true);
		expect(isTaskDue(season, day(1, "morning", "spring", 2))).toBe(true);
	});

	it("brings work begun late in Winter due in the next year's Spring", () => {
		const week = task("marshal", { scope: "week", started: day(6, "night", "winter") });
		expect(isTaskDue(week, day(1, "morning", "spring", 1, 2))).toBe(true);
		const season = task("envoy", { scope: "season", started: day(6, "night", "winter") });
		expect(taskDueAt(season)).toEqual(day(1, "morning", "spring", 1, 2));
		expect(isTaskDue(season, day(1, "morning", "spring", 1, 2))).toBe(true);
	});

	it("leaves the work unfinished again where the calendar is set back", () => {
		const phase = task("sheriff", { scope: "phase", started: day(4, "afternoon") });
		expect(isTaskDue(phase, day(2, "morning"))).toBe(false);
	});

	it("picks out those waiting to be settled", () => {
		const tasks = {
			soon: task("steward", { scope: "phase", started: day(1, "morning") }),
			late: task("marshal", { scope: "season", started: day(1, "morning") })
		};
		expect(tasksDue(tasks, day(1, "afternoon")).map((entry) => entry.id)).toEqual(["soon"]);
		expect(tasksDue(tasks, day(1, "morning")).map((entry) => entry.id)).toEqual([]);
	});
});

describe("taskOutcome", () => {
	it("simply finishes an action with no risk, which needs no roll (p16)", () => {
		expect(taskOutcome("none")).toBe("success");
	});

	it("reads a Save as passed or failed, and failure brings the Crisis (p20)", () => {
		expect(taskOutcome("cla", { passed: true })).toBe("success");
		expect(taskOutcome("cla", { passed: false })).toBe("crisis");
	});

	it("reads a Luck Roll on its own bands: a Crisis on 1, a Problem on 2-3, the work done on 4-6", () => {
		expect([1, 2, 3, 4, 5, 6].map((d6) => taskOutcome("luck", { d6 })))
			.toEqual(["crisis", "problem", "problem", "success", "success", "success"]);
	});

	it("gives every outcome the book allows for", () => {
		expect(TASK_OUTCOMES).toEqual(["success", "problem", "crisis"]);
		expect(TASK_OUTCOMES.filter(bringsCrisis)).toEqual(["crisis"]);
	});
});

describe("COUNCIL_SEATS", () => {
	it("is what a task can be set to", () => {
		expect(COUNCIL_SEATS.every((seat) => newTask(seat, {}))).toBe(true);
	});
});
