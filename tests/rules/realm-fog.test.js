import { describe, expect, it } from "vitest";
import { hexCentre, realmGeometry } from "../../module/rules/realm-geometry.js";
import { REALM_BUTTONS, REALM_TOOLS, realmToolNames } from "../../module/rules/realm.js";
import {
	BRUSH_VEIL_ALPHA,
	FOG_SORT_LAYER,
	GM_VEIL_ALPHA,
	fogAlpha,
	fogCoverKey,
	fogLook,
	fogPolygon,
	foggedKeys,
	hexCleared,
	lastOrder,
	liftFog,
	normaliseFog,
	toggleFogAt,
	tokenFogged,
	veilFog
} from "../../module/rules/realm-fog.js";

/** Visits as the Journey keeps them, one arrival for each order given. */
const visits = (...orders) => ({
	count: orders.length,
	first: { when: null, order: orders[0] },
	last: { when: null, order: orders.at(-1) },
	arrivals: orders.map((order) => ({ when: null, order }))
});

const fogOn = (hexes = {}) => normaliseFog({ version: 1, on: true, hexes });

describe("normaliseFog", () => {
	it("is off with no hexes where nothing is kept", () => {
		expect(normaliseFog(undefined)).toEqual({ on: false, holdings: false, hexes: {} });
		expect(normaliseFog("nonsense")).toEqual({ on: false, holdings: false, hexes: {} });
	});

	it("keeps on and holdings only when they are true", () => {
		expect(normaliseFog({ on: true, holdings: true })).toMatchObject({ on: true, holdings: true });
		expect(normaliseFog({ on: "yes", holdings: 1 })).toMatchObject({ on: false, holdings: false });
	});

	it("drops a record both lifted and veiled, an unknown lifter, and a bad key", () => {
		const fog = normaliseFog({
			on: true,
			hexes: {
				"1,1": { lifted: { by: "hand", at: 5 }, veiled: { after: 2 } },
				"1,2": { lifted: { by: "wind", at: 5 } },
				"1,3": { lifted: { by: "vantage", at: 9 } },
				"1,4": { veiled: { after: 3 } },
				"1,5": { veiled: { after: -1 } },
				nowhere: { lifted: { by: "hand", at: 1 } }
			}
		});
		expect(fog.hexes).toEqual({ "1,3": { lifted: { by: "vantage", at: 9 } }, "1,4": { veiled: { after: 3 } } });
	});
});

describe("lastOrder", () => {
	it("is the last arrival's order", () => {
		expect(lastOrder(visits(3, 5, 8))).toBe(8);
	});

	it("is 0 for no visits", () => {
		expect(lastOrder(null)).toBe(0);
	});
});

describe("hexCleared", () => {
	it("clears a hex the Company has reached, and not one it hasn't till it's lifted", () => {
		expect(hexCleared(fogOn(), "2,2", visits(1))).toBe(true);
		expect(hexCleared(fogOn(), "2,2", null)).toBe(false);
		expect(hexCleared(fogOn({ "2,2": { lifted: { by: "hand", at: 1 } } }), "2,2", null)).toBe(true);
	});

	it("keeps a hex fogged again till an arrival after it was", () => {
		const fog = fogOn({ "2,2": { veiled: { after: 5 } } });
		expect(hexCleared(fog, "2,2", visits(5))).toBe(false);
		expect(hexCleared(fog, "2,2", visits(5, 6))).toBe(true);
	});

	it("keeps an older record without arrivals under the fog brought back", () => {
		const fog = fogOn({ "2,2": { veiled: { after: 0 } } });
		expect(hexCleared(fog, "2,2", { count: 2 })).toBe(false);
	});
});

describe("foggedKeys", () => {
	const g = realmGeometry({ cols: 3, rows: 3 });

	it("is empty while the fog is off", () => {
		expect(foggedKeys(g, normaliseFog({ on: false }), {}).size).toBe(0);
	});

	it("leaves out the hexes reached or lifted", () => {
		const fog = fogOn({ "3,3": { lifted: { by: "told", at: 1 } } });
		const fogged = foggedKeys(g, fog, { "1,1": visits(1), "2,1": visits(2) });
		expect(fogged.size).toBe(6);
		expect([...fogged]).not.toContain("1,1");
		expect([...fogged]).not.toContain("3,3");
	});
});

describe("liftFog and veilFog", () => {
	it("hand back the fog itself when nothing changes", () => {
		const fog = fogOn({ "1,1": { lifted: { by: "hand", at: 1 } } });
		const journey = { "2,2": visits(4) };
		expect(liftFog(fog, ["1,1", "2,2"], "hand", 9, journey)).toBe(fog);
		expect(veilFog(fog, ["3,3"], journey)).toBe(fog);
		const veiled = fogOn({ "2,2": { veiled: { after: 4 } } });
		expect(veilFog(veiled, ["2,2"], journey)).toBe(veiled);
	});

	it("lift only the hexes still fogged, and keep the rest's records as they were", () => {
		const fog = fogOn({ "1,1": { lifted: { by: "hand", at: 1 } } });
		const lifted = liftFog(fog, ["1,1", "1,2", "1,2"], "vantage", 9, {});
		expect(lifted).not.toBe(fog);
		expect(lifted.hexes["1,1"]).toBe(fog.hexes["1,1"]);
		expect(lifted.hexes["1,2"]).toEqual({ lifted: { by: "vantage", at: 9 } });
		expect(fog.hexes["1,2"]).toBeUndefined();
	});

	it("lift a hex fogged again over a visit", () => {
		const fog = fogOn({ "2,2": { veiled: { after: 4 } } });
		expect(liftFog(fog, ["2,2"], "hand", 3, { "2,2": visits(4) }).hexes["2,2"]).toEqual({ lifted: { by: "hand", at: 3 } });
	});

	it("bring the fog back over a visit by its last arrival", () => {
		const veiled = veilFog(fogOn(), ["2,2"], { "2,2": visits(2, 7) });
		expect(veiled.hexes["2,2"]).toEqual({ veiled: { after: 7 } });
	});

	it("take the record away from a hex lifted that the Company hasn't reached", () => {
		const fog = fogOn({ "1,1": { lifted: { by: "hand", at: 1 } } });
		const veiled = veilFog(fog, ["1,1"], {});
		expect(veiled.hexes).toEqual({});
		expect(hexCleared(veiled, "1,1", null)).toBe(false);
	});
});

describe("toggleFogAt", () => {
	it("goes there and back", () => {
		const journey = { "2,2": visits(3) };
		const start = fogOn();
		const lifted = toggleFogAt(start, "1,1", 5, journey);
		expect(lifted.hexes["1,1"]).toEqual({ lifted: { by: "hand", at: 5 } });
		const back = toggleFogAt(lifted, "1,1", 6, journey);
		expect(back.hexes).toEqual({});
		const visitedVeiled = toggleFogAt(start, "2,2", 7, journey);
		expect(hexCleared(visitedVeiled, "2,2", journey["2,2"])).toBe(false);
		const visitedLifted = toggleFogAt(visitedVeiled, "2,2", 8, journey);
		expect(hexCleared(visitedLifted, "2,2", journey["2,2"])).toBe(true);
	});
});

describe("fogLook and fogAlpha", () => {
	it("covers each of the four", () => {
		expect(fogLook({ on: false, gm: true, solo: false })).toBe("none");
		expect(fogLook({ on: true, gm: false, solo: false })).toBe("full");
		expect(fogLook({ on: true, gm: true, solo: false })).toBe("veil");
		expect(fogLook({ on: true, gm: true, solo: true })).toBe("full");
	});

	it("lies thicker with the brush in hand, for the Referee alone", () => {
		expect(fogAlpha("veil")).toBe(GM_VEIL_ALPHA);
		expect(fogAlpha("veil", { brush: true })).toBe(BRUSH_VEIL_ALPHA);
		expect(fogAlpha("full", { brush: true })).toBe(1);
		expect(fogAlpha("none")).toBe(0);
	});
});

describe("fogCoverKey", () => {
	const g = realmGeometry({ cols: 3, rows: 3 });
	const base = { alpha: 1, paper: 0xf4ecd8, g, fogged: new Set(["1,1", "2,2"]) };

	it("stays the same for the same fog, whatever order its hexes come in", () => {
		expect(fogCoverKey(base)).toBe(fogCoverKey({ ...base, fogged: ["2,2", "1,1"] }));
	});

	it("changes with the paper, the hexes fogged and the thickness", () => {
		const key = fogCoverKey(base);
		expect(fogCoverKey({ ...base, paper: 0xffffff })).not.toBe(key);
		expect(fogCoverKey({ ...base, fogged: ["1,1"] })).not.toBe(key);
		expect(fogCoverKey({ ...base, alpha: GM_VEIL_ALPHA })).not.toBe(fogCoverKey({ ...base, alpha: BRUSH_VEIL_ALPHA }));
	});

	it("is empty with nothing to draw", () => {
		expect(fogCoverKey({ ...base, alpha: 0 })).toBe("");
		expect(fogCoverKey({ ...base, fogged: [] })).toBe("");
	});
});

describe("fogPolygon", () => {
	it("reaches a little past each corner", () => {
		const g = realmGeometry({ cols: 3, rows: 3 });
		const hex = { col: 2, row: 2 };
		const points = fogPolygon(g, hex, 1);
		const centre = hexCentre(g, hex);
		expect(points).toHaveLength(12);
		for (let index = 0; index < 12; index += 2) {
			expect(Math.hypot(points[index] - centre.x, points[index + 1] - centre.y)).toBeCloseTo(g.radius + 1, 6);
		}
	});
});

describe("tokenFogged", () => {
	it("hides a stranger's Token in the fog, not the Company or one's own", () => {
		expect(tokenFogged({ fogged: true, company: false, owner: false })).toBe(true);
		expect(tokenFogged({ fogged: true, company: true, owner: false })).toBe(false);
		expect(tokenFogged({ fogged: true, company: false, owner: true })).toBe(false);
		expect(tokenFogged({ fogged: false, company: false, owner: false })).toBe(false);
	});

	it("lies above the map's Tiles", () => {
		expect(FOG_SORT_LAYER).toBe(550);
	});
});

describe("the Referee's tools", () => {
	it("lists the fog brush only while the Realm's fog is on, and its window always, as a button", () => {
		expect(realmToolNames({ fogOn: false })).not.toContain("fog");
		expect(realmToolNames({ fogOn: false })).toContain("fogOfWar");
		expect(realmToolNames({ fogOn: true })).toEqual([...REALM_TOOLS]);
		expect(REALM_BUTTONS).toContain("fogOfWar");
		expect(REALM_BUTTONS).not.toContain("fog");
	});
});
