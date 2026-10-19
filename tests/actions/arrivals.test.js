import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRealm } from "../../module/rules/realm.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";
import { companyPace } from "../../module/rules/journey.js";

const g = realmGeometry();
const hex = (col, row) => ({ col, row });

/** The Realm, its Myth notes, the calendar, the weather, and the world's settings. */
let realm;
let notes;
let calendar;
let weather;
let settings;
/** Where a blind roll puts the Company, or null where it stays. */
let landing;

vi.mock("../../module/chat/cards.js", () => ({
	postCard: vi.fn(async () => ({})),
	registerCardButtons: vi.fn(),
	t: (key) => key,
	warn: vi.fn()
}));
vi.mock("../../module/chat/hex-target.js", () => ({ hexTarget: (at) => at }));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({ ...calendar }) }));
vi.mock("../../module/actions/company.js", () => ({ setCompanyHex: vi.fn() }));
vi.mock("../../module/actions/hex-names.js", () => ({ hexLabel: ({ col, row }) => `${col},${row}` }));
vi.mock("../../module/actions/journey.js", () => ({ COMPANY_MOVED_HOOK: "moved" }));
vi.mock("../../module/actions/night-travel.js", () => ({ settleBlindTravel: vi.fn(async () => landing) }));
vi.mock("../../module/actions/myth-notes.js", async () => {
	const { withoutResolved } = await import("../../module/rules/myth-notes.js");
	return { liveRealm: () => withoutResolved(realm, notes) };
});
vi.mock("../../module/actions/realm.js", () => ({ getRealm: () => ({ realm }), isRealmScene: (scene) => Boolean(scene?.realm) }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollRefereeTable: vi.fn(), weatherIn: () => weather }));
vi.mock("../../module/actions/steeds.js", () => ({ gallop: vi.fn() }));
vi.mock("../../module/actions/wilderness.js", () => ({ markOmenOnEntering: vi.fn(), wildernessRoll: vi.fn() }));

const { noticeArrival } = await import("../../module/actions/arrivals.js");
const { postCard } = await import("../../module/chat/cards.js");

const scene = { id: "realm", realm: true };

/** What the card posted last says, and the buttons it carries. */
const lastCard = () => vi.mocked(postCard).mock.calls.at(-1)?.[2] ?? null;

beforeEach(() => {
	vi.mocked(postCard).mockClear();
	realm = emptyRealm(g, "wild");
	realm.myths = [{ id: "m1", hex: hex(8, 6), number: 1, d6: 1, d12: 1, omen: 2, revealed: false }];
	realm.holdings = [{ id: "h1", hex: hex(2, 2), style: "castle", seat: true, name: "" }];
	notes = { version: 1, myths: {} };
	calendar = { age: 1, year: 1, season: "spring", day: 1, phase: "morning" };
	weather = null;
	settings = new Map();
	landing = null;
	globalThis.game = {
		user: { isGM: true },
		settings: { get: (_scope, key) => settings.get(key) ?? null, set: vi.fn(async (_scope, key, value) => settings.set(key, value)) }
	};
});

describe("companyPace", () => {
	it("reads a Phase's hexes as a Trek, Gallop or Cruise (p18)", () => {
		expect([0, 1, 2, 3, 4].map(companyPace)).toEqual(["trek", "trek", "gallop", "cruise", "beyond"]);
	});
});

describe("noticeArrival", () => {
	it("says nothing of a single hex's Trek into the wilds", async () => {
		expect(await noticeArrival(scene, { entered: [hex(5, 5)], ended: true, from: hex(5, 4) })).toBeNull();
	});

	it("offers a Myth's next Omen on entering its hex (p27), but not a resolved Myth's", async () => {
		await noticeArrival(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5) });
		expect(lastCard().actions.map(({ key }) => key)).toEqual(["omen"]);

		notes = { version: 1, myths: { 1: { roll: "1-01", note: "", resolved: true } } };
		vi.mocked(postCard).mockClear();
		calendar.phase = "afternoon";
		expect(await noticeArrival(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5) })).toBeNull();
	});

	it("calls a second hex in a Phase a Gallop, once, and a fresh Phase a Trek again", async () => {
		await noticeArrival(scene, { entered: [hex(5, 5)], ended: true, from: hex(5, 4) });
		await noticeArrival(scene, { entered: [hex(5, 6)], ended: true, from: hex(5, 5) });
		expect(lastCard().actions.map(({ key }) => key)).toEqual(["gallop"]);
		await noticeArrival(scene, { entered: [hex(5, 7)], ended: true, from: hex(5, 6) });
		expect(lastCard().lines).toEqual(["arrival.cruise"]);

		vi.mocked(postCard).mockClear();
		calendar.phase = "afternoon";
		expect(await noticeArrival(scene, { entered: [hex(5, 8)], ended: true, from: hex(5, 7) })).toBeNull();
	});

	it("keeps the Company in its hex in dire weather, and gauges a Holding's mood on arriving (p18)", async () => {
		weather = "dire";
		await noticeArrival(scene, { entered: [hex(2, 2)], ended: true, from: hex(2, 3) });
		expect(lastCard().actions).toEqual([
			expect.objectContaining({ key: "stay", hex: "2,3" }),
			expect.objectContaining({ key: "mood" })
		]);
	});

	it("leaves a move the Company didn't choose alone", async () => {
		weather = "dire";
		expect(await noticeArrival(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5), chosen: false })).toBeNull();
		expect(postCard).not.toHaveBeenCalled();
	});
});

describe("a move followed", () => {
	/** The Company moved hook, as registerArrivals hangs it. */
	let follow;

	beforeEach(async () => {
		const hooks = new Map();
		globalThis.Hooks = { on: (name, fn) => hooks.set(name, fn) };
		game.settings.register = vi.fn();
		const { registerArrivals } = await import("../../module/actions/arrivals.js");
		registerArrivals();
		follow = hooks.get("moved");
	});

	it("tells of the hex a blind roll drifted the Company into, not the one it made for (p18)", async () => {
		landing = hex(2, 2);
		follow(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5) });
		await vi.waitFor(() => expect(postCard).toHaveBeenCalled());
		expect(lastCard().target).toEqual(hex(2, 2));
		expect(lastCard().actions.map(({ key }) => key)).toEqual(["mood"]);
	});

	it("tells nothing where a blind roll sent the Company back where it set off", async () => {
		landing = hex(8, 5);
		follow(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5) });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(postCard).not.toHaveBeenCalled();
	});
});
