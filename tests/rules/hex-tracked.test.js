import { describe, expect, it } from "vitest";
import {
	TRACKED_HEXES_VERSION,
	emptyTrackedHexes,
	isTracked,
	normaliseTrackedHexes,
	setTracked,
	trackedInOrder
} from "../../module/rules/hex-tracked.js";

const hex = (col, row) => ({ col, row });

describe("normaliseTrackedHexes", () => {
	it("gives an empty store for anything that isn't one", () => {
		expect(normaliseTrackedHexes(null)).toEqual(emptyTrackedHexes());
		expect(normaliseTrackedHexes({ hexes: "no" })).toEqual(emptyTrackedHexes());
	});

	it("drops bad keys and records without a time added", () => {
		const tracked = normaliseTrackedHexes({ hexes: { "5,7": { added: 3 }, "nope": { added: 1 }, "1,1": {}, "2,2": { added: "soon" } } });
		expect(tracked).toEqual({ version: TRACKED_HEXES_VERSION, hexes: { "5,7": { added: 3 } } });
	});
});

describe("setTracked", () => {
	it("puts a hex on the list and takes it off", () => {
		const on = setTracked(emptyTrackedHexes(), hex(5, 7), true, 10);
		expect(isTracked(on, hex(5, 7))).toBe(true);
		const off = setTracked(on, hex(5, 7), false);
		expect(isTracked(off, hex(5, 7))).toBe(false);
		expect(off.hexes).toEqual({});
	});

	it("hands back the same store when nothing changes, so nothing is written", () => {
		const on = setTracked(emptyTrackedHexes(), hex(5, 7), true, 10);
		expect(setTracked(on, hex(5, 7), true, 20)).toBe(on);
		const empty = emptyTrackedHexes();
		expect(setTracked(empty, hex(1, 1), false)).toBe(empty);
	});

	it("leaves the other hexes' records as they were", () => {
		const one = setTracked(emptyTrackedHexes(), hex(1, 1), true, 1);
		const two = setTracked(one, hex(2, 2), true, 2);
		expect(two.hexes["1,1"]).toBe(one.hexes["1,1"]);
	});
});

describe("trackedInOrder", () => {
	it("lists the hexes the first added first", () => {
		let tracked = emptyTrackedHexes();
		tracked = setTracked(tracked, hex(9, 9), true, 30);
		tracked = setTracked(tracked, hex(1, 1), true, 10);
		tracked = setTracked(tracked, hex(4, 2), true, 20);
		expect(trackedInOrder(tracked)).toEqual([hex(1, 1), hex(4, 2), hex(9, 9)]);
	});

	it("lists nothing for no store", () => {
		expect(trackedInOrder(null)).toEqual([]);
	});
});
