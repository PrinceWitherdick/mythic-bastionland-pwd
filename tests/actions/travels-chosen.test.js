import { describe, expect, it, vi } from "vitest";
import { realmGeometry } from "../../module/rules/realm-geometry.js";

vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
vi.mock("../../module/client-settings.js", () => ({ reducesMotion: () => true }));
vi.mock("../../module/canvas/shown-hex.js", () => ({ ringShownHex: vi.fn() }));
vi.mock("../../module/actions/calendar.js", () => ({ calendarLabel: () => "", seasonLabel: () => "" }));
vi.mock("../../module/actions/company.js", () => ({ companyTokenHex: () => null, findCompanyToken: () => null }));
vi.mock("../../module/actions/hex-names.js", () => ({ getHexNames: () => ({}) }));
vi.mock("../../module/actions/hex-shared.js", () => ({ getHexShared: () => ({ hexes: {} }), partyNoteBy: () => "" }));
vi.mock("../../module/actions/journey.js", () => ({ getJourney: () => ({ hexes: {} }), visitsLabel: () => "" }));
vi.mock("../../module/actions/realm.js", () => ({}));
vi.mock("../../module/actions/sighted.js", () => ({ getSighted: () => ({}) }));
vi.mock("../../module/actions/solo.js", () => ({ keptFromMe: () => false, realmKnown: (realm) => realm }));

const { chosenHex } = await import("../../module/actions/travels.js");

const g = realmGeometry({ cols: 8, rows: 8 });
const views = [
	{ key: "2,2", visits: { count: 1 }, here: false, openable: true },
	{ key: "4,4", visits: { count: 2 }, here: true, openable: true }
];

describe("chosenHex, the hex Places opens on", () => {
	it("takes a hex the players know when it's asked for", () => {
		expect(chosenHex(views, "2,2")).toBe("2,2");
		expect(chosenHex(views, "2,2", g)).toBe("2,2");
	});

	it("lets a GM choose any hex of the Realm, a player only those they know", () => {
		expect(chosenHex(views, "7,1", g)).toBe("7,1");
		expect(chosenHex(views, "7,1")).toBe("4,4");
	});

	it("falls back to where the Company stands for a hex off the Realm, or none asked", () => {
		expect(chosenHex(views, "9,9", g)).toBe("4,4");
		expect(chosenHex(views, null, g)).toBe("4,4");
		expect(chosenHex([], null, g)).toBeNull();
	});
});
