import { beforeEach, describe, expect, it, vi } from "vitest";
import { hexCentre, realmGeometry } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const g = realmGeometry({ cols: 3, rows: 3 });

/** Just enough of a PIXI display object to be drawn into and thrown away. */
class FakeDisplay {
	children = [];
	destroyed = false;
	eventMode = "auto";
	addChild(child) {
		this.children.push(child);
		child.parent = this;
		return child;
	}
	removeChild(child) {
		this.children = this.children.filter((each) => each !== child);
		child.parent = null;
		return child;
	}
	destroy() {
		this.destroyed = true;
	}
}

/** Foundry's PrimaryGraphics, keeping count of what's drawn into it. */
class FakePrimaryGraphics extends FakeDisplay {
	static made = 0;
	elevation = null;
	sortLayer = null;
	fills = [];
	polygons = [];
	constructor() {
		super();
		FakePrimaryGraphics.made++;
	}
	clear() {
		this.fills = [];
		this.polygons = [];
	}
	beginFill(colour, alpha) {
		this.fills.push({ colour, alpha });
	}
	drawPolygon(points) {
		this.polygons.push(points);
	}
	endFill() {}
}

let fog;
let fogged;
let paper;
/** The hexes this client can't see into, and the Realm's fog as kept. */
let mine;
let kept;

vi.mock("../../module/actions/realm.js", () => ({ isRealmScene: () => true, sceneGeometry: () => g }));
vi.mock("../../module/actions/realm-fog.js", () => ({
	realmFogLook: () => (!fog.on ? "none" : fog.gm && !fog.solo ? "veil" : "full"),
	foggedForPlayers: () => fogged,
	foggedForMe: () => mine,
	realmFogHoldingsShow: () => kept.on && kept.holdings
}));
vi.mock("../../module/compat.js", () => ({ scenePaper: () => ({ colour: paper }) }));

const { HOLDINGS_SORT_LAYER, clearRealmFog, drawRealmFog, liftingHoldings, tokenInFog } = await import("../../module/canvas/realm-fog.js");

/** @returns {FakePrimaryGraphics|undefined} The fog on the canvas now. */
const cover = () => canvas.primary.children[0];

beforeEach(() => {
	clearRealmFog();
	FakePrimaryGraphics.made = 0;
	fog = { on: true, gm: false, solo: false };
	fogged = new Set(["1,1", "2,1", "3,3"]);
	paper = "#ffeedd";
	mine = new Set();
	kept = { on: true, holdings: false };
	globalThis.foundry = { canvas: { primary: { PrimaryGraphics: FakePrimaryGraphics } } };
	globalThis.canvas = { ready: true, primary: new FakeDisplay(), scene: { id: "realm" }, realm: null };
});

describe("drawRealmFog", () => {
	it("draws nothing while the fog is off", () => {
		fog.on = false;
		drawRealmFog();
		expect(canvas.primary.children).toHaveLength(0);
	});

	it("covers each hex in the fog with the paper, whole, for a player", () => {
		drawRealmFog();
		expect(cover()).toMatchObject({ elevation: 0, sortLayer: 550, eventMode: "none" });
		expect(cover().fills).toEqual([{ colour: 0xffeedd, alpha: 1 }]);
		expect(cover().polygons).toHaveLength(3);
	});

	it("lays a veil for a Referee, thicker with the brush in hand", () => {
		fog.gm = true;
		drawRealmFog();
		expect(cover().fills).toEqual([{ colour: 0xffeedd, alpha: 0.45 }]);
		canvas.realm = { active: true, tool: "fog" };
		drawRealmFog();
		expect(cover().fills).toEqual([{ colour: 0xffeedd, alpha: 0.7 }]);
	});

	it("covers whole for a Referee playing alone", () => {
		Object.assign(fog, { gm: true, solo: true });
		drawRealmFog();
		expect(cover().fills[0].alpha).toBe(1);
	});

	it("draws nothing again while the fog is as it was, and again once it changes", () => {
		drawRealmFog();
		const first = cover();
		first.polygons.push("untouched");
		drawRealmFog();
		expect(cover().polygons).toContain("untouched");
		fogged = new Set(["1,1"]);
		drawRealmFog();
		expect(cover()).toBe(first);
		expect(cover().polygons).toHaveLength(1);
		expect(FakePrimaryGraphics.made).toBe(1);
	});

	it("falls back on the sheet's paper where the Scene's can't be read", () => {
		paper = undefined;
		drawRealmFog();
		expect(cover().fills[0].colour).toBe(0xf4ecd8);
	});

	it("takes the fog away once every hex is clear, and makes it again on a new canvas", () => {
		drawRealmFog();
		fogged = new Set();
		drawRealmFog();
		expect(canvas.primary.children).toHaveLength(0);
		fogged = new Set(["2,2"]);
		canvas.primary = new FakeDisplay();
		drawRealmFog();
		expect(cover().polygons).toHaveLength(1);
	});
});

/** A Realm Tile of a kind, as Foundry's Tile class keeps it: put back among the Tiles on each refresh. */
class FakeTile {
	constructor(kind) {
		this.document = { parent: { id: "realm" }, flags: { [SYSTEM_ID]: { realm: { kind } } } };
		this.mesh = { sortLayer: null };
	}
	_refreshState() {
		this.mesh.sortLayer = 500;
	}
}

describe("liftingHoldings", () => {
	const Tile = liftingHoldings(FakeTile);
	const refreshed = (kind) => {
		const tile = new Tile(kind);
		tile._refreshState();
		return tile.mesh.sortLayer;
	};

	it("draws the Holdings and the Seat over the fog while they show through it", () => {
		kept = { on: true, holdings: true };
		expect(refreshed("holding")).toBe(HOLDINGS_SORT_LAYER);
		expect(refreshed("seat")).toBe(HOLDINGS_SORT_LAYER);
		expect(refreshed("landmark")).toBe(500);
	});

	it("leaves them among the Tiles otherwise", () => {
		expect(refreshed("holding")).toBe(500);
		kept = { on: false, holdings: true };
		expect(refreshed("holding")).toBe(500);
	});
});

describe("tokenInFog", () => {
	const at = (hex, { company = false, owner = false } = {}) => {
		const point = hexCentre(g, hex);
		return {
			isCompany: company,
			document: {
				parent: { id: "realm" },
				isOwner: owner,
				getCenterPoint: () => point
			}
		};
	};

	it("keeps a stranger in a fogged hex off the map, and not the Company or one's own", () => {
		mine = new Set(["2,2"]);
		expect(tokenInFog(at({ col: 2, row: 2 }))).toBe(true);
		expect(tokenInFog(at({ col: 1, row: 1 }))).toBe(false);
		expect(tokenInFog(at({ col: 2, row: 2 }, { company: true }))).toBe(false);
		expect(tokenInFog(at({ col: 2, row: 2 }, { owner: true }))).toBe(false);
	});

	it("keeps nobody off where this client sees through the fog", () => {
		expect(tokenInFog(at({ col: 2, row: 2 }))).toBe(false);
	});
});
