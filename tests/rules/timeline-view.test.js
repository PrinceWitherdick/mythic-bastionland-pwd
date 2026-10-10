import { describe, expect, it } from "vitest";
import { boardView, defaultHiddenTracks, kindMenu, periodChoices, threadMenu, trackView, yearsOnBySeason } from "../../module/rules/timeline-view.js";

const entries = (...rows) => Object.fromEntries(rows.map((row, i) => [row.id ?? `e${i}`, { id: `e${i}`, ...row }]));

describe("years on", () => {
	it("counts each Season from the first of its name in its Age", () => {
		const on = yearsOnBySeason(["1-harvest", "1-2-harvest", "1-4-harvest", "2-5-harvest", "", "1-2-spring"]);
		expect(on.get("1-harvest")).toBe(0);
		expect(on.get("1-2-harvest")).toBe(1);
		expect(on.get("1-4-harvest")).toBe(3);
		expect(on.get("2-5-harvest")).toBe(0);
		expect(on.has("")).toBe(false);
	});
});

describe("trackView", () => {
	const track = { trackId: "k1", kind: "knight", entries: entries(
		{ season: "", title: "Born" },
		{ season: "1-spring", title: "Squired", source: "hand" },
		{ season: "1-spring", title: "Spring ends", source: "season" },
		{ season: "2-6-winter", title: "Scarred", source: "scar" }
	) };

	it("gathers Seasons under Ages, before the tale first", () => {
		const view = trackView(track, { nowKey: "2-6-winter" });
		expect(view.ages.map((a) => a.age)).toEqual([null, 1, 2]);
		const [spring] = view.ages[1].periods;
		expect(spring).toMatchObject({ season: "1-spring", name: "spring", age: 1, isNow: false, undated: false });
		expect(spring.entries.map((e) => [e.title, e.group, e.earlier, e.later])).toEqual([["Squired", "hand", false, false], ["Spring ends", "time", false, false]]);
		expect(view.ages[2].periods[0].isNow).toBe(true);
	});

	it("hides a Filter line's kinds, and says when everything is hidden", () => {
		const view = trackView(track, { hidden: ["wounds"] });
		expect(view.ages.map((a) => a.age)).toEqual([null, 1]);
		expect(trackView(track, { hidden: ["hand", "time", "wounds"] }).allHidden).toBe(true);
		expect(trackView({ trackId: "x", entries: {} }).allHidden).toBe(false);
	});
});

describe("boardView", () => {
	const tracks = [
		{ trackId: "company", kind: "company", entries: entries({ season: "1-spring", title: "Set out" }) },
		{ trackId: "k1", kind: "knight", entries: entries({ season: "1-harvest", title: "Knighted", source: "knighted" }) },
		{ trackId: "d1", kind: "domain", entries: {} }
	];

	it("keeps the threads level: one row per Season any of them has", () => {
		const view = boardView(tracks);
		expect(view.lanes.map((l) => l.trackId)).toEqual(["company", "k1", "d1"]);
		const rows = view.ages[0].periods;
		expect(rows.map((p) => p.season)).toEqual(["1-spring", "1-harvest"]);
		expect(rows[0].cells.map((c) => c.entries.length)).toEqual([1, 0, 0]);
		expect(rows[1].cells.map((c) => c.entries.length)).toEqual([0, 1, 0]);
	});

	it("leaves out an unticked thread and the Seasons only it had", () => {
		const view = boardView(tracks, { hiddenTracks: ["k1"] });
		expect(view.lanes.map((l) => l.trackId)).toEqual(["company", "d1"]);
		expect(view.ages[0].periods.map((p) => p.season)).toEqual(["1-spring"]);
		expect(boardView(tracks, { hiddenTracks: ["company", "k1"] }).allHidden).toBe(true);
	});
});

describe("menus", () => {
	it("ticks every kind the reader didn't hide", () => {
		expect(kindMenu(["myth"]).find((k) => k.group === "myth").shown).toBe(false);
		expect(threadMenu([{ trackId: "a", kind: "realm" }], ["a"])).toEqual([{ trackId: "a", kind: "realm", shown: false }]);
	});

	it("opens a player's board on the Company and their own", () => {
		const tracks = [{ trackId: "company", kind: "company" }, { trackId: "k1", kind: "knight" }, { trackId: "k2", kind: "knight" }, { trackId: "realm:s", kind: "realm" }];
		expect(defaultHiddenTracks(tracks, (t) => t.trackId === "k1")).toEqual(["k2", "realm:s"]);
		expect(defaultHiddenTracks(tracks, () => false)).toEqual([]);
	});

	it("offers now, the Seasons kept newest first, then before the tale", () => {
		const choices = periodChoices(["1-spring", "1-2-spring", "1-harvest"], "1-2-harvest");
		expect(choices.map((c) => c.season)).toEqual(["1-2-harvest", "1-2-spring", "1-harvest", "1-spring", ""]);
		expect(choices[0]).toMatchObject({ isNow: true, selected: true, yearsOn: 1 });
		expect(periodChoices([], "1-spring", "").at(-1).selected).toBe(true);
	});
});
