import { describe, expect, it } from "vitest";
import {
	KIND_GROUPS, TIMELINE_SOURCES, addEntry, canMove, entriesDiff, entrySeason, groupByPeriod, isLeftover,
	moveEntry, normalizeEntry, patchEntry, periodRank, readEntries, realmSceneId, realmTrackId, removeByKey, removeEntry, sortEntries, sourceGroup,
	timelineKeys, upsertByKey
} from "../../module/rules/timeline.js";

let n = 0;
const makeId = () => `id${++n}`;

describe("thread keys", () => {
	it("reads a Realm's thread back to its Scene", () => {
		expect(realmTrackId("abc")).toBe("realm:abc");
		expect(realmSceneId(realmTrackId("abc"))).toBe("abc");
	});

	it("puts every source in exactly one Filter line", () => {
		const grouped = Object.values(KIND_GROUPS).flat();
		expect([...grouped].sort()).toEqual([...TIMELINE_SOURCES].sort());
		expect(sourceGroup("crisis")).toBe("dominion");
		expect(sourceGroup("nonsense")).toBe("hand");
	});

	it("spells each milestone once", () => {
		expect(timelineKeys.visit("s1", { col: 2, row: 3 })).toBe("visit:s1:2,3");
		expect(timelineKeys.crisis("2-winter", 5)).toBe("crisis:2-winter:5");
		expect(timelineKeys.death()).toBe("death");
		expect(timelineKeys.death("k1")).toBe("death:k1");
	});
});

describe("normalizeEntry", () => {
	it("writes a Season's key as seasonKey would, and anything else as before the tale", () => {
		expect(entrySeason("2-1-winter")).toBe("2-winter");
		expect(entrySeason("2-3-winter")).toBe("2-3-winter");
		expect(entrySeason("autumn")).toBe("");
		expect(entrySeason(undefined)).toBe("");
	});

	it("makes a stored row whole, trusting nothing", () => {
		expect(normalizeEntry({ id: "a.b", source: "levelup", order: -2, title: " Hi " }, 3)).toEqual({
			id: "ab", season: "", order: 0, title: "Hi", place: "", body: "", source: "hand", key: "", createdAt: 0, authorId: ""
		});
		expect(normalizeEntry(null, 4).id).toBe("entry-4");
	});

	it("drops leftovers: rows with no id", () => {
		expect(isLeftover({ title: "x" })).toBe(true);
		expect(readEntries({ a: { id: "a" }, b: { title: "half-written" } }).map((e) => e.id)).toEqual(["a"]);
		expect(readEntries("nonsense")).toEqual([]);
	});
});

describe("order", () => {
	it("ranks before the tale first, then by Age, year and Season", () => {
		const keys = ["2-spring", "1-2-spring", "", "1-winter", "1-spring", "1-harvest"];
		expect([...keys].sort((a, b) => periodRank(a) - periodRank(b))).toEqual(["", "1-spring", "1-harvest", "1-winter", "1-2-spring", "2-spring"]);
	});

	it("puts the Season's turn last in its Season, whatever its order", () => {
		const entries = [
			{ id: "turn", season: "1-spring", source: "season", order: 0 },
			{ id: "later", season: "1-spring", source: "hand", order: 5 },
			{ id: "early", season: "1-spring", source: "hand", order: 1 }
		];
		expect(sortEntries(entries).map((e) => e.id)).toEqual(["early", "later", "turn"]);
	});

	it("gathers only the Seasons with something in them", () => {
		const periods = groupByPeriod([{ id: "a", season: "1-winter" }, { id: "b", season: "" }, { id: "c", season: "1-winter" }]);
		expect(periods.map((p) => [p.season, p.entries.length])).toEqual([["", 1], ["1-winter", 2]]);
	});
});

describe("changes", () => {
	const two = [{ id: "a", season: "1-spring", order: 0 }, { id: "b", season: "1-spring", order: 1 }];

	it("adds at the end of its Season and refuses a taken id", () => {
		const { entries, added } = addEntry(two, { title: "New", season: "1-spring" }, makeId);
		expect(added.order).toBe(2);
		expect(entries).toHaveLength(3);
		expect(addEntry(two, { id: "a" }).added).toBeNull();
	});

	it("closes the gap an entry leaves", () => {
		const { entries, removed } = removeEntry([...two, { id: "c", season: "1-spring", order: 2 }], "b");
		expect(removed.id).toBe("b");
		expect(entries.map((e) => [e.id, e.order])).toEqual([["a", 0], ["c", 1]]);
		expect(removeEntry(two, "zz").removed).toBeNull();
	});

	it("takes out every row a milestone wrote", () => {
		const rows = [{ id: "a", key: "myth:x", season: "1-spring" }, { id: "b", season: "1-spring", order: 1 }, { id: "c", key: "myth:x", season: "" }];
		const { entries, removed } = removeByKey(rows, "myth:x");
		expect(removed.map((e) => e.id)).toEqual(["a", "c"]);
		expect(entries.map((e) => [e.id, e.order])).toEqual([["b", 0]]);
		expect(removeByKey(rows, "").removed).toBeNull();
	});

	it("moves a re-dated entry to the end of its new Season", () => {
		const rows = [...two, { id: "c", season: "1-harvest", order: 0 }];
		const { entries, changed } = patchEntry(rows, "a", { season: "1-harvest" });
		expect(changed.order).toBe(1);
		expect(Object.fromEntries(entries.map((e) => [e.id, e.order]))).toEqual({ a: 1, b: 0, c: 0 });
		expect(patchEntry(rows, "a", { title: "" }).changed).toBeNull();
	});

	it("moves within a Season but not past either end or the Season's turn", () => {
		expect(moveEntry(two, "b", -1).entries.find((e) => e.id === "b").order).toBe(0);
		expect(moveEntry(two, "a", -1).moved).toBeNull();
		const withTurn = [...two, { id: "t", season: "1-spring", source: "season", order: 2 }];
		expect(moveEntry(withTurn, "b", 1).moved).toBeNull();
		const members = sortEntries(withTurn);
		expect(canMove(members, 1)).toEqual({ earlier: true, later: false });
	});

	it("writes a milestone once, refreshing only what it's told to", () => {
		const first = upsertByKey([], { key: "rank:gallant", title: "Gallant", season: "1-spring" }, { makeId });
		expect(first.added.title).toBe("Gallant");
		const again = upsertByKey(first.entries, { key: "rank:gallant", title: "Changed" });
		expect(again.added).toBeNull();
		expect(again.changed).toBeNull();
		const refreshed = upsertByKey(first.entries, { key: "rank:gallant", title: "Changed" }, { refresh: ["title"] });
		expect(refreshed.changed.title).toBe("Changed");
	});

	it("diffs entry by entry and field by field", () => {
		const stored = { a: { id: "a", title: "One" }, b: { id: "b" } };
		const diff = entriesDiff(stored, [{ id: "a", title: "Two" }, { id: "c" }]);
		expect(diff.changed).toEqual({ a: { title: "Two" } });
		expect(Object.keys(diff.added)).toEqual(["c"]);
		expect(diff.removed).toEqual(["b"]);
		expect(entriesDiff(stored, stored)).toBeNull();
	});
});
