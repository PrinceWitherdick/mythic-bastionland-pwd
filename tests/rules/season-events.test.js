import { describe, expect, it } from "vitest";
import {
	EVENT_KEYS,
	EVENT_STAGES,
	SEASON_EVENTS,
	canMarkEvent,
	collectionFor,
	eventsFor,
	findEvent,
	nextEventFor,
	normalizeEvents,
	seasonEventsView,
	withEventPassed
} from "../../module/rules/season-events.js";
import { SEASONS } from "../../module/rules/time.js";

describe("SEASON_EVENTS", () => {
	it("gives every Season the three events the book prints, in order", () => {
		expect(Object.keys(SEASON_EVENTS)).toEqual([...SEASONS]);
		for (const season of SEASONS) {
			expect(eventsFor(season).map(({ stage }) => stage)).toEqual([...EVENT_STAGES]);
		}
	});

	it("names the Feast, the mass and the collection of each Season", () => {
		expect(eventsFor("spring").map(({ key }) => key)).toEqual(["feastOfTheSun", "sceptremass", "tax"]);
		expect(eventsFor("harvest").map(({ key }) => key)).toEqual(["feastOfTheStars", "eldermass", "tithe"]);
		expect(eventsFor("winter").map(({ key }) => key)).toEqual(["feastOfTheMoon", "kindlemass", "levy"]);
	});

	it("ends each Season with its collection, and marks nothing else as one", () => {
		for (const season of SEASONS) {
			const collection = collectionFor(season);
			expect(collection.stage).toBe("ends");
			expect(eventsFor(season).filter(({ collection: is }) => is)).toEqual([collection]);
		}
		expect(collectionFor("spring").key).toBe("tax");
		expect(collectionFor("harvest").key).toBe("tithe");
		expect(collectionFor("winter").key).toBe("levy");
	});

	it("keeps every key unique, since a record only stores the key", () => {
		expect(EVENT_KEYS).toHaveLength(new Set(EVENT_KEYS).size);
		expect(EVENT_KEYS).toHaveLength(SEASONS.length * EVENT_STAGES.length);
	});

	it("gives no events for anything that isn't a Season", () => {
		expect(eventsFor("autumn")).toEqual([]);
		expect(eventsFor(undefined)).toEqual([]);
		expect(collectionFor("autumn")).toBeNull();
	});
});

describe("findEvent", () => {
	it("says which Season an event belongs to", () => {
		expect(findEvent("kindlemass")).toMatchObject({ season: "winter", stage: "middle" });
		expect(findEvent("tax")).toMatchObject({ season: "spring", collection: true });
	});

	it("gives nothing for a key that isn't an event", () => {
		expect(findEvent("harvestmass")).toBeNull();
		expect(findEvent(undefined)).toBeNull();
	});
});

describe("normalizeEvents", () => {
	it("reads nothing stored as no event having come to pass", () => {
		expect(normalizeEvents(undefined)).toEqual([]);
		expect(normalizeEvents(null)).toEqual([]);
		expect(normalizeEvents("sceptremass")).toEqual([]);
	});

	it("drops anything that isn't an event, and counts each one once", () => {
		expect(normalizeEvents(["sceptremass", "nonsense", "sceptremass"])).toEqual(["sceptremass"]);
	});

	it("gives them back in book order, whatever order they were written in", () => {
		expect(normalizeEvents(["tax", "feastOfTheSun", "sceptremass"], "spring")).toEqual([
			"feastOfTheSun",
			"sceptremass",
			"tax"
		]);
	});

	it("keeps only the Season's own events when a Season is given", () => {
		expect(normalizeEvents(["feastOfTheSun", "kindlemass"], "winter")).toEqual(["kindlemass"]);
		expect(normalizeEvents(["feastOfTheSun", "kindlemass"])).toEqual(["feastOfTheSun", "kindlemass"]);
	});
});

describe("nextEventFor", () => {
	it("starts with the Feast that begins the Season", () => {
		expect(nextEventFor("harvest", [])).toMatchObject({ key: "feastOfTheStars" });
	});

	it("moves on as each comes to pass, ending with the collection", () => {
		expect(nextEventFor("harvest", ["feastOfTheStars"])).toMatchObject({ key: "eldermass" });
		expect(nextEventFor("harvest", ["feastOfTheStars", "eldermass"])).toMatchObject({ key: "tithe", collection: true });
	});

	it("gives nothing once all three have come to pass", () => {
		expect(nextEventFor("harvest", ["feastOfTheStars", "eldermass", "tithe"])).toBeNull();
	});

	it("ignores events stored against the wrong Season", () => {
		expect(nextEventFor("harvest", ["feastOfTheSun", "kindlemass"])).toMatchObject({ key: "feastOfTheStars" });
	});
});

describe("canMarkEvent", () => {
	it("allows one of this Season's events that hasn't come to pass", () => {
		expect(canMarkEvent("winter", "kindlemass", [])).toBe(true);
	});

	it("refuses an event that has already come to pass", () => {
		expect(canMarkEvent("winter", "kindlemass", ["kindlemass"])).toBe(false);
	});

	it("refuses an event of another Season, or no event at all", () => {
		expect(canMarkEvent("winter", "sceptremass", [])).toBe(false);
		expect(canMarkEvent("winter", "nonsense", [])).toBe(false);
	});
});

describe("withEventPassed", () => {
	it("adds the event in book order", () => {
		expect(withEventPassed("spring", "feastOfTheSun", ["sceptremass"])).toEqual(["feastOfTheSun", "sceptremass"]);
	});

	it("changes nothing when the event has already come to pass", () => {
		expect(withEventPassed("spring", "sceptremass", ["sceptremass"])).toEqual(["sceptremass"]);
	});

	it("changes nothing, and keeps the Season's own record, for another Season's event", () => {
		expect(withEventPassed("spring", "kindlemass", ["feastOfTheSun"])).toEqual(["feastOfTheSun"]);
	});
});

describe("seasonEventsView", () => {
	it("marks what has come to pass and which one is next", () => {
		expect(seasonEventsView("spring", ["feastOfTheSun"])).toEqual([
			{ key: "feastOfTheSun", stage: "begins", icon: "fa-solid fa-sun", collection: false, passed: true, next: false },
			{ key: "sceptremass", stage: "middle", icon: "fa-solid fa-scroll", collection: false, passed: false, next: true },
			{ key: "tax", stage: "ends", icon: "fa-solid fa-coins", collection: true, passed: false, next: false }
		]);
	});

	it("marks none as next once the Season's events are all behind it", () => {
		const view = seasonEventsView("spring", ["feastOfTheSun", "sceptremass", "tax"]);
		expect(view.every(({ passed }) => passed)).toBe(true);
		expect(view.some(({ next }) => next)).toBe(false);
	});

	it("gives nothing for anything that isn't a Season", () => {
		expect(seasonEventsView("autumn", [])).toEqual([]);
	});
});
