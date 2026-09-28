import { describe, expect, it } from "vitest";
import { emptyRealm } from "../../module/rules/realm.js";
import { hexKey, neighbours, realmGeometry } from "../../module/rules/realm-geometry.js";
import {
	MAX_SIGHTED_NOTE,
	hiddenThere,
	normaliseSighted,
	sightable,
	sightedAt,
	sightedMarks,
	sightingChanges
} from "../../module/rules/sighted.js";

const g = realmGeometry({ cols: 12, rows: 12 });
const hex = (col, row) => ({ col, row });
const here = hex(6, 6);
const [west, east, far] = [neighbours(g, here)[0].hex, neighbours(g, here)[3].hex, hex(1, 1)];

/** Nothing hidden by hand, unless a hex is named. */
const byHand = (...hexes) => (at) => ({ holding: hexes.some((hidden) => hexKey(hidden) === hexKey(at)) });

function realmWith({ landmarks = [], holdings = [], myths = [] } = {}) {
	const realm = emptyRealm(g);
	realm.landmarks = landmarks.map(({ hex: where, type = "monument", revealed = false }, index) => ({ id: `l${index}`, hex: where, type, name: "", seer: null, revealed }));
	realm.holdings = holdings.map((where, index) => ({ id: `h${index}`, hex: where, style: "town", seat: false, name: "" }));
	realm.myths = myths.map((where, index) => ({ id: `m${index}`, hex: where, number: index + 1, d6: 1, d12: 1, omen: 0, revealed: false }));
	return realm;
}

describe("normaliseSighted", () => {
	it("keeps each hex's words, trimmed and kept short, and drops what isn't a mark", () => {
		const long = "smoke ".repeat(40);
		expect(normaliseSighted({ "5,7": { note: "  a structure, smoke rising " }, "2,2": { note: long }, bad: { note: "x" }, "3,3": "x", "4,4": {} })).toEqual({
			"5,7": { note: "a structure, smoke rising" },
			"2,2": { note: long.slice(0, MAX_SIGHTED_NOTE).trim() },
			"4,4": { note: "" }
		});
		expect(normaliseSighted(null)).toEqual({});
		expect(normaliseSighted("public")).toEqual({});
	});
});

describe("hiddenThere", () => {
	it("sees a Landmark not yet revealed, or a Holding the GM hid by hand", () => {
		const realm = realmWith({ landmarks: [{ hex: west }], holdings: [east, far] });
		expect(hiddenThere(realm, west, byHand())).toMatchObject({ landmark: { id: "l0" }, holding: null });
		expect(hiddenThere(realm, east, byHand(east))).toMatchObject({ landmark: null, holding: { id: "h0" } });
		expect(hiddenThere(realm, far, byHand())).toBeNull();
	});

	it("sees nothing of a revealed Landmark, or of a Myth", () => {
		const realm = realmWith({ landmarks: [{ hex: west, revealed: true }], myths: [east] });
		expect(hiddenThere(realm, west, byHand())).toBeNull();
		expect(hiddenThere(realm, east, byHand())).toBeNull();
	});
});

describe("sightable", () => {
	it("lists the neighbouring hexes something stands hidden in, with which way they lie", () => {
		const realm = realmWith({ landmarks: [{ hex: west }, { hex: far }, { hex: here }], holdings: [east] });
		const seen = sightable(realm, g, here, byHand(east));
		expect(seen.map((step) => [step.direction, hexKey(step.hex)])).toEqual([[0, hexKey(west)], [3, hexKey(east)]]);
		expect(seen[1].holding.id).toBe("h0");
	});
});

describe("sightedMarks", () => {
	it("draws a mark only where something seen still stands hidden", () => {
		const realm = realmWith({ landmarks: [{ hex: west }, { hex: east, revealed: true }] });
		const sighted = { [hexKey(west)]: { note: "a bridge" }, [hexKey(east)]: { note: "" }, [hexKey(far)]: { note: "" } };
		expect(sightedMarks(realm, sighted, byHand())).toEqual([{ hex: west, note: "a bridge" }]);
		expect(sightedMarks(realm, {}, byHand())).toEqual([]);
	});
});

describe("sightingChanges", () => {
	it("marks what was ticked with its words, and takes away marks unticked", () => {
		const sighted = { [hexKey(west)]: { note: "smoke" }, [hexKey(east)]: { note: "a bridge" } };
		const changes = sightingChanges(sighted, [
			{ hex: west, marked: false, note: "smoke" },
			{ hex: east, marked: true, note: " a crumbled bridge " },
			{ hex: far, marked: true }
		]);
		expect(changes).toEqual({ set: { [hexKey(east)]: { note: "a crumbled bridge" }, [hexKey(far)]: { note: "" } }, drop: [hexKey(west)] });
	});

	it("writes nothing for a mark left as it was, or an unticked hex never marked", () => {
		const sighted = { [hexKey(west)]: { note: "smoke" } };
		expect(sightingChanges(sighted, [{ hex: west, marked: true, note: "smoke" }, { hex: east, marked: false }])).toEqual({ set: {}, drop: [] });
		expect(sightedAt(sighted, west)).toEqual({ note: "smoke" });
		expect(sightedAt(sighted, east)).toBeNull();
	});
});
