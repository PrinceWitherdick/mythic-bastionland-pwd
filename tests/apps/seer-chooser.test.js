import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRealm } from "../../module/rules/realm.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const g = realmGeometry({ cols: 8, rows: 8 });
const here = { col: 3, row: 4 };
const there = { col: 6, row: 2 };
const scene = { id: "realm" };
let realm;

vi.mock("../../module/apps/BastionlandChooser.js", () => ({
	OWN_GROUP: "own",
	BastionlandChooser: class {
		static DEFAULT_OPTIONS = {};
		static PARTS = {};
		group = 1;
		roll = null;
		index = null;
		rendered = false;
		async _prepareContext() {
			return { groups: [] };
		}
		_cardFields({ d6 }) {
			return { d6, inGroup: d6 === this.group };
		}
		_pickRoll(roll) {
			this.roll = roll;
		}
		render = vi.fn();
	}
}));
// A Knight the Referee wrote, with their Seer.
let ownSeers = [];
vi.mock("../../module/actions/own-knights.js", () => ({
	isOwnKnightEntry: () => false,
	ownKnightIndexEntries: () => ({ knights: ownSeers.map(({ own }) => ({ own, roll: null, name: "The Ferry Knight" })), seers: ownSeers }),
	ownSeerLookup: ({ own }) => {
		const entry = ownSeers.find((seer) => seer.own === own) ?? null;
		return { roll: null, page: null, entry, name: entry?.name ?? "ownKnight.seerGone" };
	}
}));
vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));
vi.mock("../../module/actions/hex-names.js", () => ({ hexLabel: (hex) => `${hex.col}.${hex.row}` }));
vi.mock("../../module/actions/realm.js", () => ({
	getRealm: (one) => (one === scene ? { realm } : null),
	editRealmByHand: async (_scene, edit) => {
		realm = edit(realm, g);
	}
}));
vi.mock("../../module/apps/ui.js", () => ({ renderWhenIdle: vi.fn() }));
let knights = [];
vi.mock("../../module/actions/knights.js", () => ({ worldKnights: (keep = () => true) => knights.filter(keep), inCompany: (actor) => Boolean(actor?.hasPlayerOwner) }));

const { SeerChooser, companySeers, openSeerChooser } = await import("../../module/apps/SeerChooser.js");

const index = {
	knights: [{ roll: "1-01", name: "The True Knight" }, { roll: "3-07", name: "The Silk Knight" }],
	seers: [{ roll: "1-01", name: "The Dice Seer" }, { roll: "3-07", name: "The Loom Seer" }, { roll: "5-09", name: "The Ash Seer" }]
};
const knight = (name, system = {}, hasPlayerOwner = true) => ({ name, hasPlayerOwner, system: { seer: "", knightType: "", isSquire: false, ...system } });

beforeEach(() => {
	globalThis.game = { user: { isGM: true }, scenes: { get: (id) => (id === scene.id ? scene : null) } };
	realm = {
		...emptyRealm(g),
		landmarks: [
			{ id: null, hex: here, type: "sanctum", name: "", seer: { d6: 2, d12: 5 }, revealed: false },
			{ id: null, hex: there, type: "sanctum", name: "", seer: { d6: 4, d12: 1 }, revealed: false }
		]
	};
});

afterEach(() => {
	knights = [];
	delete globalThis.game;
});

describe("choosing a Sanctum's Seer", () => {
	it("opens on the Seer living there now, at their d6 result", () => {
		const chooser = openSeerChooser({ scene, hex: here });
		expect(chooser.roll).toBe("2-05");
		expect(chooser.group).toBe(2);
		expect(openSeerChooser({ scene: null, hex: here })).toBeNull();
	});

	it("lays out all 72, marking the Seer here and any living at another Sanctum", async () => {
		const chooser = openSeerChooser({ scene, hex: here });
		const context = await chooser._prepareContext({});
		expect(context.cards).toHaveLength(72);
		expect(context.cards.filter(({ here: lives }) => lives).map(({ roll }) => roll)).toEqual(["2-05"]);
		expect(context.cards.find(({ roll }) => roll === "4-01").takenLabel).toBe('seerChooser.livesAt {"hex":"6.2"}');
		// The Seer here already can't be given again.
		expect(context.picked.free).toBe(false);
		expect(context.picked.note).toBe("seerChooser.already");
		// One at another Sanctum can, with a word that they live there too.
		chooser.roll = "4-01";
		const other = await chooser._prepareContext({});
		expect(other.picked.free).toBe(true);
		expect(other.picked.note).toBe('seerChooser.alsoAt {"hex":"6.2"}');
	});

	it("finds each player Knight's Seer by the name on their sheet, or else on their own page of the table", () => {
		expect(companySeers([
			knight("Brand", { seer: " dice seer ", knightType: "Silk" }),
			knight("Eve", { knightType: "Silk" }),
			knight("Wren", { seer: "The Ash Seer" }),
			knight("Odd", { seer: "Someone the book doesn't know" }),
			knight("Ivo", { knightType: "True" })
		], index)).toEqual([
			{ roll: "1-01", knights: ["Brand", "Ivo"] },
			{ roll: "3-07", knights: ["Eve"] },
			{ roll: "5-09", knights: ["Wren"] }
		]);
		expect(companySeers([knight("Brand", { seer: "The Dice Seer" })], null)).toEqual([]);
	});

	it("puts the Seers of the players' Knights on top, and every other in the table", async () => {
		knights = [knight("Wren", { seer: "The Ash Seer" }), knight("Pip", { seer: "The Dice Seer", isSquire: true }), knight("Rook", { seer: "The Dice Seer" }, false)];
		const chooser = openSeerChooser({ scene, hex: here });
		chooser.index = index;
		const context = await chooser._prepareContext({});
		// Squires and the Referee's own Knights don't count.
		expect(context.company.map(({ roll, name, knighted }) => [roll, name, knighted])).toEqual([["5-09", "The Ash Seer", 'seerChooser.knighted {"knights":"Wren"}']]);
		expect(context.cards).toHaveLength(71);
		expect(context.cards.some(({ roll }) => roll === "5-09")).toBe(false);
	});

	it("makes the Seer picked the one living at the Sanctum, and nothing else of it", async () => {
		const chooser = openSeerChooser({ scene, hex: here });
		chooser.roll = "6-12";
		await SeerChooser.DEFAULT_OPTIONS.actions.useSeer.call(chooser);
		const sanctum = realm.landmarks.find((landmark) => landmark.hex.col === here.col && landmark.hex.row === here.row);
		expect(sanctum.seer).toEqual({ d6: 6, d12: 12 });
		expect(sanctum.type).toBe("sanctum");
		expect(realm.landmarks).toHaveLength(2);
	});

	it("offers the Seers the Referee wrote under Yours, and gives one to the Sanctum", async () => {
		ownSeers = [{ own: "j1", roll: null, name: "The Reed Seer", path: null }];
		try {
			const chooser = openSeerChooser({ scene, hex: here });
			chooser.index = index;
			const context = await chooser._prepareContext({});
			expect(context.ownGroup).toEqual({ d6: "own", active: false });
			const card = context.cards.find(({ roll }) => roll === "own:j1");
			expect(card).toMatchObject({ name: "The Reed Seer", own: true, d6: "own" });
			chooser._pickRoll("own:j1");
			expect(chooser.group).toBe("own");
			await SeerChooser.DEFAULT_OPTIONS.actions.useSeer.call(chooser);
			const sanctum = realm.landmarks.find((landmark) => landmark.hex.col === here.col && landmark.hex.row === here.row);
			expect(sanctum.seer).toEqual({ own: "j1" });
			// Opened again, it shows the Seer living there now.
			const again = openSeerChooser({ scene, hex: here });
			expect([again.roll, again.group]).toEqual(["own:j1", "own"]);
			again.index = index;
			expect((await again._prepareContext({})).cards.find(({ roll }) => roll === "own:j1").here).toBe(true);
		} finally {
			ownSeers = [];
		}
	});

	it("opens on Yours without an import, the written Seers being all there are by name", async () => {
		ownSeers = [{ own: "j1", roll: null, name: "The Reed Seer", path: null }];
		realm.landmarks[0].seer = null;
		try {
			const chooser = openSeerChooser({ scene, hex: here });
			chooser.index = null;
			const context = await chooser._prepareContext({});
			expect(context.notice).toBe("seerChooser.noIndexOwn");
			expect(chooser.group).toBe("own");
			// Only the first time: a d6 result the Referee goes to afterwards is left as they chose.
			chooser.group = 3;
			await chooser._prepareContext({});
			expect(chooser.group).toBe(3);
		} finally {
			ownSeers = [];
		}
		expect((await openSeerChooser({ scene, hex: here })._prepareContext({})).notice).toBe("seerChooser.noIndex");
	});

	it("draws itself again as the Realm changes, and is opened from the Sanctum's tab", () => {
		expect(read("module/canvas/realm-hooks.js")).toContain("refreshSeerChooser(sceneId);");
		const template = read("templates/apps/seer-chooser.hbs");
		for (const action of ["showGroup", "pick", "useSeer"]) expect(template, action).toContain(`data-action="${action}"`);
		expect(read("templates/apps/parts/hex-gm.hbs")).toContain('data-action="chooseSeer"');
	});
});
