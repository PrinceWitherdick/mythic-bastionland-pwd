import { describe, expect, it } from "vitest";
import { completedMythId, crisisRollsDue, normalizeSeasonRecord, seasonLogView, seasonTurn, withCompletedMyth, withoutCompletedMyth } from "../../module/rules/season-log.js";
import { SEASONS, SEASON_ICONS, parseSeasonKey } from "../../module/rules/time.js";

const now = (age, season, year = 1) => ({ age, year, season, day: 3, phase: "afternoon" });
const turn = (title) => ({ kind: "season", title, when: 5, entries: [{ name: "Sir Tam", pursuit: "Courtesy", lines: ["Virtues restored."] }], note: null });

describe("parseSeasonKey", () => {
	it("reads a Season's key and refuses anything else", () => {
		expect(parseSeasonKey("2-winter")).toEqual({ age: 2, year: 1, season: "winter" });
		expect(parseSeasonKey("2-3-winter")).toEqual({ age: 2, year: 3, season: "winter" });
		expect(parseSeasonKey("0-spring")).toBeNull();
		expect(parseSeasonKey("1-0-spring")).toBeNull();
		expect(parseSeasonKey("1-autumn")).toBeNull();
		expect(parseSeasonKey("")).toBeNull();
		expect(parseSeasonKey(undefined)).toBeNull();
	});
});

describe("normalizeSeasonRecord", () => {
	it("reads nothing stored as a Season with no notes that hasn't ended", () => {
		expect(normalizeSeasonRecord(undefined)).toEqual({ notes: "", events: [], myths: [], turn: null });
		expect(normalizeSeasonRecord({ turn: { kind: "sleep" } })).toEqual({ notes: "", events: [], myths: [], turn: null });
	});

	it("keeps a turn's entries as plain text", () => {
		const record = normalizeSeasonRecord({ notes: "Met the Seer.", turn: { kind: "age", title: "Age 2 Begins", entries: [{ name: "Sir Tam", lines: [1] }] } });
		expect(record).toEqual({
			notes: "Met the Seer.",
			events: [],
			myths: [],
			turn: { kind: "age", title: "Age 2 Begins", when: 0, entries: [{ name: "Sir Tam", pursuit: null, lines: ["1"] }], note: null }
		});
	});
});

describe("completed Myths", () => {
	const plague = { id: completedMythId("scene", { number: 3, d6: 2, d12: 7 }), name: "The Plague" };

	it("names a Myth by its Realm, number and roll", () => {
		expect(plague.id).toBe("scene.3.2-7");
		expect(completedMythId("other", { number: 3, d6: 2, d12: 7 })).not.toBe(plague.id);
	});

	it("keeps each Myth once, and takes one back out", () => {
		const myths = withCompletedMyth([], plague);
		expect(withCompletedMyth(myths, plague)).toBe(myths);
		expect(withoutCompletedMyth(myths, plague.id)).toEqual([]);
	});

	it("reads only Myths with an id", () => {
		expect(normalizeSeasonRecord({ myths: [plague, { name: "No id" }, null] }).myths).toEqual([plague]);
	});
});

describe("seasonTurn", () => {
	it("gives back the turn as it's stored", () => {
		expect(seasonTurn({ ...turn("Harvest Begins"), note: "The Company arrives in Oldmere." })).toMatchObject({
			kind: "season",
			title: "Harvest Begins",
			when: 5,
			note: "The Company arrives in Oldmere."
		});
	});
});

describe("seasonLogView", () => {
	it("always shows the Season the world is in, even with nothing written", () => {
		expect(seasonLogView({}, now(1, "spring"))).toEqual([
			{ age: 1, seasons: [{ key: "1-spring", age: 1, year: 1, season: "spring", current: true, record: { notes: "", events: [], myths: [], turn: null } }] }
		]);
	});

	it("keeps a Season that only has a Myth resolved in it", () => {
		const myths = [{ id: "scene.3.2-7", name: "The Plague" }];
		const view = seasonLogView({ "1-spring": { myths } }, now(1, "winter"));
		expect(view[0].seasons.map(({ key }) => key)).toEqual(["1-spring", "1-winter"]);
		expect(view[0].seasons[0].record.myths).toEqual(myths);
	});

	it("leaves out a past Season that only has an event marked against it", () => {
		const view = seasonLogView({ "1-spring": { events: ["sceptremass"] } }, now(1, "winter"));
		expect(view[0].seasons.map(({ key }) => key)).toEqual(["1-winter"]);
	});

	it("groups Seasons by Age, the newest Age first and each Age's Seasons in order", () => {
		const log = {
			"1-winter": { turn: turn("Spring Begins") },
			"1-spring": { turn: turn("Harvest Begins") },
			"1-harvest": { notes: "", turn: null },
			"2-spring": { notes: "The Seer spoke." },
			nonsense: { notes: "kept out" }
		};
		const view = seasonLogView(log, now(2, "harvest"));
		expect(view.map(({ age }) => age)).toEqual([2, 1]);
		expect(view[0].seasons.map(({ key, current }) => [key, current])).toEqual([["2-spring", false], ["2-harvest", true]]);
		// A Season with nothing written that never ended is left out.
		expect(view[1].seasons.map(({ key }) => key)).toEqual(["1-spring", "1-winter"]);
	});

	it("keeps each year's Spring of one Age apart, in the order they came", () => {
		const log = {
			"1-spring": { notes: "The first Spring." },
			"1-winter": { turn: turn("Spring Begins") },
			"1-2-spring": { notes: "The second Spring." }
		};
		const view = seasonLogView(log, now(1, "harvest", 2));
		expect(view[0].seasons.map(({ key, current }) => [key, current])).toEqual([["1-spring", false], ["1-winter", false], ["1-2-spring", false], ["1-2-harvest", true]]);
	});
});

describe("crisisRollsDue", () => {
	it("lists the Domains that haven't made this Season's Crisis Roll", () => {
		const rolled = { name: "Ashwood", system: { crisisRolled: "2-winter" } };
		const stale = { name: "Greymoor", system: { crisisRolled: "2-harvest" } };
		const never = { name: "Fenwick", system: { crisisRolled: "" } };
		expect(crisisRollsDue([rolled, stale, never], now(2, "winter"))).toEqual([stale, never]);
	});
});

it("gives every Season an icon", () => {
	for (const season of SEASONS) expect(SEASON_ICONS[season]).toMatch(/^fa-/);
});
