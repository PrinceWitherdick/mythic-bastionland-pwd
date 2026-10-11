import { describe, expect, it } from "vitest";
import { boardView, defaultHiddenTracks, hiddenCount, kindMenu, periodChoices, threadMenu, trackView, yearsOnBySeason } from "../../module/rules/timeline-view.js";

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
		{ season: "1-spring", title: "Summer Begins", source: "season", body: "Virtues restored." },
		{ season: "2-6-winter", title: "Scarred", source: "scar" }
	) };

	it("lists the Seasons oldest first, marking where each Age begins", () => {
		const view = trackView(track, { nowKey: "2-6-winter" });
		expect(view.periods.map((p) => [p.season, p.age, p.startsAge])).toEqual([["", null, true], ["1-spring", 1, true], ["2-6-winter", 2, true]]);
		expect(view.periods.map((p) => p.above)).toEqual([true, false, true]);
		expect(view.periods[2].isNow).toBe(true);
	});

	it("writes a Season's turn in its heading, not as a card", () => {
		const [, spring] = trackView(track).periods;
		expect(spring.entries.map((e) => e.title)).toEqual(["Squired"]);
		expect(spring.notes).toEqual([{ id: "e2", trackId: "k1", title: "Summer Begins", body: "Virtues restored.", source: "season" }]);
		expect(spring.entries[0]).toMatchObject({ group: "hand", earlier: false, later: false, chip: { kind: "hand", tagged: false } });
	});

	it("hides a Filter line's kinds, and says when everything is hidden", () => {
		const view = trackView(track, { hidden: ["wounds"] });
		expect(view.periods.map((p) => p.season)).toEqual(["", "1-spring"]);
		expect(trackView(track, { hidden: ["hand", "time", "wounds"] }).allHidden).toBe(true);
		expect(trackView({ trackId: "x", entries: {} }).allHidden).toBe(false);
	});

	it("offers its writer an add slot in each Season, and the Season it is now even empty", () => {
		const view = trackView(track, { nowKey: "2-6-harvest", canEdit: true });
		expect(view.periods.map((p) => [p.season, p.ghost])).toEqual([["", false], ["1-spring", false], ["2-6-harvest", true], ["2-6-winter", false]]);
		expect(view.periods.every((p) => p.add?.season === p.season)).toBe(true);
		expect(trackView(track, { nowKey: "2-6-harvest" }).periods.some((p) => p.ghost || p.add)).toBe(false);
	});

	it("draws an empty thread its writer can write on as the Season it is now", () => {
		expect(trackView({ trackId: "x", entries: {} }, { nowKey: "1-spring", canEdit: true })).toMatchObject({ empty: false, periods: [{ season: "1-spring", ghost: true }] });
		expect(trackView({ trackId: "x", entries: {} }).empty).toBe(true);
	});

	it("files a tagged entry with its tag, a kind or one of the table's own", () => {
		const tags = [{ id: "tag-feast", name: "Feasts", colour: "#aa3300" }];
		const tagged = { trackId: "k", entries: entries({ season: "1-spring", tag: "wounds" }, { season: "1-spring", tag: "tag-feast" }, { season: "1-spring", tag: "tag-gone" }) };
		const cards = trackView(tagged, { tags }).periods[0].entries;
		expect(cards.map((c) => [c.group, c.chip.tagged])).toEqual([["wounds", true], ["custom", true], ["hand", false]]);
		expect(cards[1].chip).toMatchObject({ tagName: "Feasts", colour: "#aa3300" });
		expect(trackView(tagged, { tags, hidden: ["wounds", "tag-feast"] }).periods[0].entries).toHaveLength(1);
	});
});

describe("boardView", () => {
	const tracks = [
		{ trackId: "company", kind: "company", portrait: "c.webp", entries: entries({ season: "1-spring", title: "Set out" }, { season: "1-spring", title: "Summer Begins", source: "season" }) },
		{ trackId: "k1", kind: "knight", entries: entries({ season: "1-harvest", title: "Knighted", source: "knighted" }, { season: "1-harvest", title: "Winter Begins", source: "season" }) },
		{ trackId: "d1", kind: "domain", entries: {} }
	];

	it("keeps the threads level: one row per Season any of them has", () => {
		const view = boardView(tracks);
		expect(view.lanes).toEqual([{ trackId: "company", kind: "company", portrait: "c.webp" }, { trackId: "k1", kind: "knight", portrait: "" }, { trackId: "d1", kind: "domain", portrait: "" }]);
		expect(view.periods.map((p) => p.season)).toEqual(["1-spring", "1-harvest"]);
		expect(view.periods[0].cells.map((c) => c.entries.length)).toEqual([1, 0, 0]);
		expect(view.periods[1].cells.map((c) => c.entries.length)).toEqual([0, 2, 0]);
	});

	it("writes only the Company's Season turns in the heading", () => {
		const view = boardView(tracks);
		expect(view.periods[0].notes.map((n) => [n.trackId, n.title])).toEqual([["company", "Summer Begins"]]);
		expect(view.periods[1].notes).toEqual([]);
		expect(view.periods[1].cells[1].entries.map((e) => e.title)).toEqual(["Knighted", "Winter Begins"]);
	});

	it("stamps every Season and cell with its Age, for the scrubber to stop at", () => {
		const view = boardView([{ trackId: "k", kind: "knight", entries: entries({ season: "", title: "Born" }, { season: "1-spring" }, { season: "2-winter" }) }]);
		expect(view.periods.map((p) => [p.ageKey, p.startsAge])).toEqual([["undated", true], ["1", true], ["2", true]]);
		expect(view.periods.map((p) => p.cells[0].ageKey)).toEqual(["undated", "1", "2"]);
	});

	it("gives each lane a cell in every Season, in the lanes' order, for reading across", () => {
		const view = boardView(tracks);
		expect(view.lanes.map((l) => l.trackId)).toEqual(["company", "k1", "d1"]);
		expect(view.periods.every((p) => p.cells.map((c) => c.trackId).join() === "company,k1,d1")).toBe(true);
		expect(view.periods.map((p) => p.cells[0].startsAge)).toEqual([true, false]);
	});

	it("leaves out an unticked thread and the Seasons only it had", () => {
		const view = boardView(tracks, { hiddenTracks: ["k1"] });
		expect(view.lanes.map((l) => l.trackId)).toEqual(["company", "d1"]);
		expect(view.periods.map((p) => p.season)).toEqual(["1-spring"]);
		expect(boardView(tracks, { hiddenTracks: ["company", "k1"] }).allHidden).toBe(true);
	});

	it("gives an add slot only in the lanes the reader can write, and the Season it is now", () => {
		const view = boardView(tracks, { nowKey: "1-2-spring", canEdit: (id) => id === "k1" });
		expect(view.periods.at(-1)).toMatchObject({ season: "1-2-spring", ghost: true });
		expect(view.periods[0].cells.map((c) => c.add)).toEqual([null, { season: "1-spring", trackId: "k1" }, null]);
		expect(boardView(tracks, { nowKey: "1-2-spring" }).periods.some((p) => p.ghost)).toBe(false);
	});
});

describe("menus", () => {
	it("ticks every kind the reader didn't hide, then the table's own tags", () => {
		const menu = kindMenu(["myth", "tag-a"], [{ id: "tag-a", name: "Alpha", colour: "#112233" }]);
		expect(menu.find((k) => k.key === "myth").shown).toBe(false);
		expect(menu.at(-1)).toMatchObject({ key: "tag-a", kind: "custom", tagName: "Alpha", shown: false });
		expect(threadMenu([{ trackId: "a", kind: "realm" }], ["a"])).toEqual([{ trackId: "a", kind: "realm", icon: "fa-solid fa-map", shown: false }]);
	});

	it("counts only what the menu still offers as hidden", () => {
		expect(hiddenCount(["myth", "tag-gone"], ["k1", "gone"], { kinds: ["myth"], tracks: ["k1"] })).toBe(2);
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
