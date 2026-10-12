import { describe, expect, it, vi } from "vitest";
import { emptyJourney, recordVisits } from "../../module/rules/journey.js";
import { emptyRealm } from "../../module/rules/realm.js";
import { edgeKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { playerHexView } from "../../module/rules/travels.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const g = realmGeometry({ cols: 8, rows: 8 });
const hex = (col, row) => ({ col, row });
const when = { age: 1, season: "spring", day: 2, phase: "morning" };

// What the Referee hid by hand: the Holding at 5,5.
const handHidden = (at) => ({ terrain: false, holding: at.col === 5 && at.row === 5, seat: false });

const realm = {
	...emptyRealm(g),
	terrain: Array.from({ length: g.cols * g.rows }, (_, index) => (index % 12) + 1),
	holdings: [{ hex: hex(1, 1), style: "castle", name: "Tal", seat: true }, { hex: hex(5, 5), style: "town", name: "Fen", seat: false }],
	landmarks: [{ hex: hex(2, 3), type: "ruin", name: "The Grey Stones", revealed: true }, { hex: hex(6, 2), type: "curse", name: "", revealed: false }],
	myths: [{ hex: hex(3, 3), number: 4, revealed: true }, { hex: hex(4, 6), number: 2, revealed: false }],
	barriers: [{ edge: edgeKey(hex(1, 1), hex(1, 2)), revealed: true }, { edge: edgeKey(hex(3, 3), hex(3, 4)), revealed: false }]
};

const journey = recordVisits(emptyJourney(), [hex(1, 1), hex(1, 2), hex(2, 3), hex(1, 1)], when);
const scene = {
	id: "realm",
	flags: {
		[SYSTEM_ID]: {
			journey,
			hexShared: {
				version: 1,
				hexes: {
					"3,3": { told: [{ id: "t1", note: "A bell tolls here.", when }, { id: "t2", note: "Still tolling.", when }] },
					"1,2": { party: { text: "Good water.", by: "u1", byName: "Ann", when, at: 5 }, met: [{ edge: edgeKey(hex(1, 2), hex(2, 2)), byName: "Ann", when, at: 6 }] }
				}
			},
			hexNames: { version: 1, hexes: { "1,1": { name: "Tal's Keep" }, "7,7": { name: "Nobody's Hollow" } } },
			sighted: { "6,2": { note: "Smoke rises." }, "5,5": { note: "Walls." }, "2,3": { note: "Stones, once." } }
		}
	},
	getFlag: (scope, key) => scene.flags[scope]?.[key]
};

vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key, warn: vi.fn(), postCard: vi.fn() }));
vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn() }));
vi.mock("../../module/client-settings.js", () => ({ reducesMotion: () => true, read: () => false }));
vi.mock("../../module/canvas/shown-hex.js", () => ({ ringShownHex: vi.fn() }));
vi.mock("../../module/actions/calendar.js", () => ({ calendarLabel: () => "", seasonLabel: () => "", getCalendar: () => when }));
vi.mock("../../module/actions/company.js", () => ({ COMPANY_FLAG: "company", companyTokenHex: () => ({ col: 1, row: 2 }), findCompanyToken: () => null, wentSomewhere: () => false }));
vi.mock("../../module/actions/hex-lore.js", () => ({ hexesWithPeopleIn: () => new Set() }));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineArrivals: vi.fn(), timelinePartyNote: vi.fn(), timelineNoteForgotten: vi.fn() }));
vi.mock("../../module/actions/solo.js", () => ({ keptFromMe: () => false, realmKnown: (whole) => whole }));
vi.mock("../../module/actions/realm.js", () => ({
	isRealmScene: (at) => at?.id === "realm",
	getRealm: (at) => (at?.id === "realm" ? { realm } : null),
	getRealmLook: () => ({}),
	sceneGeometry: () => g,
	hexHiddenByHand: (_scene, at) => handHidden(at)
}));

// A Referee is looking: the players' view is read all the same.
globalThis.game = { user: { isGM: true } };

const { playersHexView, travelsSources } = await import("../../module/actions/travels.js");

describe("one hex as the players know it, read for that hex alone", () => {
	const whole = { ...travelsSources(scene), gm: false };

	it("is the hex the whole Realm's record gives the players", () => {
		const hexes = [hex(1, 1), hex(1, 2), hex(2, 3), hex(3, 3), hex(4, 6), hex(5, 5), hex(6, 2), hex(7, 7), hex(0, 0)];
		for (const at of hexes) expect(playersHexView(scene, at)).toEqual(playerHexView(whole, at));
	});

	it("reads what's there: a name, visits, a telling, a note, a mark, a Barrier", () => {
		expect(playersHexView(scene, hex(1, 1))).toMatchObject({ name: "Tal's Keep", visits: { count: 2 }, barriers: [expect.any(String)] });
		expect(playersHexView(scene, hex(1, 2))).toMatchObject({ party: { text: "Good water." }, here: true, met: [{ byName: "Ann" }] });
		expect(playersHexView(scene, hex(3, 3)).told.map(({ id }) => id)).toEqual(["t2", "t1"]);
		expect(playersHexView(scene, hex(6, 2))).toMatchObject({ sighted: { note: "Smoke rises." }, landmark: null });
		// A mark whose Landmark has since been found stands for nothing.
		expect(playersHexView(scene, hex(2, 3)).sighted).toBeNull();
		// A name the players have no place for stays the Referee's.
		expect(playersHexView(scene, hex(7, 7)).name).toBe("");
	});

	it("reads nothing off a Scene that isn't a Realm", () => {
		expect(playersHexView({ id: "other" }, hex(1, 1))).toBeNull();
	});
});
