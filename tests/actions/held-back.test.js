import { beforeEach, describe, expect, it, vi } from "vitest";

const hex = (col, row) => ({ col, row });

/** The weather now, whether this client plays alone, and the hexes the Scene keeps held back from. */
let weather;
let solo;
let keptKeys;

vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({ age: 1, year: 1, season: "spring", day: 1, phase: "morning" }) }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ weatherIn: () => weather }));
vi.mock("../../module/actions/solo.js", () => ({ secretsKeptOn: () => solo }));
vi.mock("../../module/actions/journey.js", () => ({ heldBack: () => ({ move: "m1", hexes: new Set(keptKeys), keys: new Set(keptKeys) }) }));

const { hexesReached, keptBackByWeather } = await import("../../module/actions/held-back.js");

const scene = { id: "realm" };
const move = { entered: [hex(5, 5), hex(5, 6)], ended: true, from: hex(5, 4) };

beforeEach(() => {
	weather = "dire";
	solo = true;
	keptKeys = [];
});

describe("keptBackByWeather", () => {
	it("holds back a move that ended in a new hex in dire weather (p18)", () => {
		expect(keptBackByWeather(move)).toBe(true);
		expect(keptBackByWeather({ ...move, ended: false })).toBe(false);
		// Back where it set off, it went nowhere.
		expect(keptBackByWeather({ ...move, entered: [hex(5, 4)] })).toBe(false);
		weather = "foul";
		expect(keptBackByWeather(move)).toBe(false);
	});
});

describe("hexesReached", () => {
	it("keeps out of every hex of a chosen move dire weather may hold back, played alone", () => {
		expect(hexesReached(scene, move)).toEqual([]);
		// Played together, the Referee's card settles it, and nothing waits.
		solo = false;
		expect(hexesReached(scene, move)).toEqual(move.entered);
		solo = true;
		weather = null;
		expect(hexesReached(scene, move)).toEqual(move.entered);
	});

	it("reads a chosen move by its own weather, not the move held back before it", () => {
		weather = null;
		keptKeys = ["5,5"];
		expect(hexesReached(scene, move)).toEqual(move.entered);
	});

	it("keeps a move the Company didn't choose out of the hexes already held back from, as a blind drift", () => {
		keptKeys = ["5,6"];
		expect(hexesReached(scene, { ...move, chosen: false })).toEqual([hex(5, 5)]);
	});
});
