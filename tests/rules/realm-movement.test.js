import { describe, expect, it } from "vitest";
import { edgeKey, hexCentre, realmGeometry } from "../../module/rules/realm-geometry.js";
import { movePathProblem, realmMoveProblem } from "../../module/rules/realm-movement.js";

const g = realmGeometry();
const hex = (col, row) => ({ col, row });

describe("realmMoveProblem", () => {
	const barriers = new Set([edgeKey(hex(1, 1), hex(2, 1))]);

	it("refuses a step across a Barrier and allows one beside it", () => {
		expect(realmMoveProblem(g, barriers, hex(1, 1), hex(2, 1))).toBe("barrier");
		expect(realmMoveProblem(g, barriers, hex(2, 1), hex(1, 1))).toBe("barrier");
		expect(realmMoveProblem(g, barriers, hex(1, 1), hex(1, 2))).toBeNull();
	});

	it("refuses a longer move when every shortest way there crosses a Barrier", () => {
		// Along the top row the only way from (1,1) to (3,1) in two steps is through (2,1).
		expect(realmMoveProblem(g, barriers, hex(1, 1), hex(3, 1))).toBe("barrier");
	});

	it("allows a longer move while any shortest way is clear", () => {
		const oneWayBlocked = new Set([edgeKey(hex(2, 2), hex(3, 3))]);
		expect(realmMoveProblem(g, oneWayBlocked, hex(2, 2), hex(3, 4))).toBeNull();
		const bothBlocked = new Set([...oneWayBlocked, edgeKey(hex(2, 2), hex(2, 3))]);
		expect(realmMoveProblem(g, bothBlocked, hex(2, 2), hex(3, 4))).toBe("barrier");
	});

	it("allows going round a Barrier a hex at a time", () => {
		const detour = [hex(1, 1), hex(1, 2), hex(2, 2), hex(2, 1)];
		detour.slice(1).forEach((to, index) => expect(realmMoveProblem(g, barriers, detour[index], to)).toBeNull());
	});

	it("refuses leaving the Realm, but lets a token come onto it", () => {
		expect(realmMoveProblem(g, barriers, hex(1, 1), null)).toBe("offMap");
		expect(realmMoveProblem(g, barriers, hex(12, 1), hex(13, 1))).toBe("offMap");
		expect(realmMoveProblem(g, barriers, null, hex(4, 4))).toBeNull();
		expect(realmMoveProblem(g, barriers, hex(4, 4), hex(4, 4))).toBeNull();
	});
});

describe("movePathProblem", () => {
	const barriers = new Set([edgeKey(hex(5, 5), hex(5, 6))]);
	const centre = (col, row) => hexCentre(g, hex(col, row));

	it("allows a clear path", () => {
		expect(movePathProblem(g, barriers, [centre(4, 4), centre(4, 5), centre(4, 7)])).toBeNull();
	});

	it("names the first step that is refused", () => {
		expect(movePathProblem(g, barriers, [centre(5, 4), centre(5, 5), centre(5, 6)]))
			.toEqual({ reason: "barrier", from: hex(5, 5), to: hex(5, 6) });
		expect(movePathProblem(g, barriers, [centre(2, 2), { x: 230.94, y: 10 }]))
			.toEqual({ reason: "offMap", from: hex(2, 2), to: null });
	});
});
