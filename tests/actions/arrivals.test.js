import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRealm } from "../../module/rules/realm.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";
import { companyPace } from "../../module/rules/journey.js";
import { SYSTEM_ID } from "../../module/system-id.js";

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
/** The move dire weather is holding back, and the hex keys it came into, as the Scene keeps them. */
let heldMove;
let heldKeys;

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
vi.mock("../../module/actions/journey.js", () => ({
	COMPANY_MOVED_HOOK: "moved",
	forgetMoveVisits: vi.fn(async () => true),
	heldBack: () => ({ move: heldMove, hexes: new Set(heldKeys), keys: solo ? new Set(heldKeys) : new Set() }),
	setHeldBack: vi.fn(async (_scene, hexes, { move = null } = {}) => {
		heldMove = hexes.length ? move : null;
		heldKeys = hexes.map(({ col, row }) => `${col},${row}`);
		return true;
	})
}));
// What else follows the Company into a hex, done once the Referee lets it on through dire weather.
vi.mock("../../module/actions/hex-lore.js", () => ({ rollFirstArrival: vi.fn(async () => []) }));
vi.mock("../../module/actions/homecoming.js", () => ({ welcomeHome: vi.fn(async () => []) }));
vi.mock("../../module/actions/sighted.js", () => ({ revealSighted: vi.fn(async () => []) }));
vi.mock("../../module/actions/night-travel.js", () => ({ settleBlindTravel: vi.fn(async () => landing) }));
vi.mock("../../module/actions/myth-notes.js", async () => {
	const { withoutResolved } = await import("../../module/rules/myth-notes.js");
	return { liveRealm: () => withoutResolved(realm, notes) };
});
vi.mock("../../module/actions/realm.js", () => ({ getRealm: () => ({ realm }), isRealmScene: (scene) => Boolean(scene?.realm) }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollRefereeTable: vi.fn(), weatherIn: () => weather }));
vi.mock("../../module/actions/steeds.js", () => ({ gallop: vi.fn() }));
vi.mock("../../module/actions/wilderness.js", () => ({ markOmenOnEntering: vi.fn(), wildernessRoll: vi.fn() }));
// What solo play finds in the hexes reached is solo.js's to work out; here only which hexes it's asked about.
let solo = false;
vi.mock("../../module/actions/solo.js", async () => {
	const { soloRealm } = await import("../../module/rules/solo.js");
	return { revealMythsReached: vi.fn(async () => []), realmKnown: (realm) => (solo ? soloRealm(realm) : realm), secretsKeptOn: () => solo };
});

const { noticeArrival } = await import("../../module/actions/arrivals.js");
const { postCard, registerCardButtons } = await import("../../module/chat/cards.js");
const { setCompanyHex } = await import("../../module/actions/company.js");
const { markOmenOnEntering, wildernessRoll } = await import("../../module/actions/wilderness.js");
const { revealMythsReached } = await import("../../module/actions/solo.js");
const { forgetMoveVisits, setHeldBack } = await import("../../module/actions/journey.js");
const { settleBlindTravel } = await import("../../module/actions/night-travel.js");
const { rollFirstArrival } = await import("../../module/actions/hex-lore.js");
const { welcomeHome } = await import("../../module/actions/homecoming.js");
const { revealSighted } = await import("../../module/actions/sighted.js");

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
	heldMove = null;
	heldKeys = [];
	let moves = 0;
	globalThis.foundry = { utils: { randomID: () => `move${++moves}` } };
	globalThis.ui = { notifications: { info: vi.fn(), warn: vi.fn() } };
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

	it("tells a Referee playing alone of a Myth's hex only once it's found", async () => {
		solo = true;
		try {
			weather = "dire";
			await noticeArrival(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5) });
			expect(lastCard().actions.map(({ key }) => key)).toEqual(["stay", "onward"]);
			realm.myths[0].revealed = true;
			calendar.phase = "afternoon";
			await noticeArrival(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5) });
			expect(lastCard().actions.map(({ key }) => key)).toEqual(["stay", "onward", "omen"]);
		} finally {
			solo = false;
		}
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

	/**
	 * Press one of the last arrival card's buttons.
	 * @param {string} key
	 * @param {string} [at] The hex it carries.
	 */
	const press = (key, at) => {
		const { handler } = vi.mocked(registerCardButtons).mock.calls.at(-1)[0];
		const [, , , { flags }] = vi.mocked(postCard).mock.calls.at(-1);
		game.scenes = { get: () => scene };
		return handler({ dataset: { arrival: key, arrivalHex: at } }, { flags });
	};

	it("takes a move dire weather sent back off the Phase's pace, so the next hex is no Gallop (p18)", async () => {
		weather = "dire";
		await noticeArrival(scene, { entered: [hex(5, 5)], ended: true, from: hex(5, 4) });
		await press("stay", "5,4");
		expect(setCompanyHex).toHaveBeenCalledWith(scene, hex(5, 4), { forced: true });
		expect(settings.get("companyPace").count).toBe(0);
		// Never come into, so not kept as been to.
		expect(forgetMoveVisits).toHaveBeenCalledWith(scene, [hex(5, 5)], null);

		weather = null;
		vi.mocked(postCard).mockClear();
		expect(await noticeArrival(scene, { entered: [hex(5, 5)], ended: true, from: hex(5, 4) })).toBeNull();
	});

	it("keeps an Omen shown on entering for the Phase the Company came in, though pressed later (p27)", async () => {
		vi.mocked(wildernessRoll).mockResolvedValueOnce({});
		await noticeArrival(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5) });
		calendar.phase = "afternoon";
		await press("omen", "8,6");
		expect(markOmenOnEntering).toHaveBeenCalledWith(scene, hex(8, 6), expect.objectContaining({ phase: "morning" }));
	});

	it("finds a Myth only in the hexes the Company really came into, after a blind roll or dire weather (p18)", async () => {
		vi.mocked(revealMythsReached).mockClear();
		landing = hex(2, 2);
		follow(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5) });
		await vi.waitFor(() => expect(revealMythsReached).toHaveBeenCalled());
		expect(revealMythsReached).toHaveBeenLastCalledWith(scene, [hex(8, 5), hex(2, 2)]);

		// Dire weather may hold a chosen move back, so only the hex set off from is found.
		vi.mocked(revealMythsReached).mockClear();
		landing = null;
		weather = "dire";
		follow(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5) });
		await vi.waitFor(() => expect(revealMythsReached).toHaveBeenCalled());
		expect(revealMythsReached).toHaveBeenLastCalledWith(scene, [hex(8, 5)]);

		// A drift the Company didn't choose has no Stay to press: it is where it drifted. Put there, as by
		// Stay or a blind roll sending it back, it was never in the hex it was put back from.
		vi.mocked(revealMythsReached).mockClear();
		follow(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5), chosen: false });
		await vi.waitFor(() => expect(revealMythsReached).toHaveBeenCalled());
		expect(revealMythsReached).toHaveBeenLastCalledWith(scene, [hex(8, 6)]);
	});

	it("finds the hexes dire weather held the Company back from once the Referee lets it go on", async () => {
		solo = true;
		try {
			weather = "dire";
			heldMove = "move9";
			await noticeArrival(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5) }, { move: "move9" });
			vi.mocked(revealMythsReached).mockClear();
			// Found as it's let on, its Myth's Omen is offered on a card of its own.
			vi.mocked(revealMythsReached).mockImplementationOnce(async () => {
				realm.myths[0].revealed = true;
				return [realm.myths[0]];
			});
			await press("onward");
			expect(setHeldBack).toHaveBeenLastCalledWith(scene, []);
			expect(revealMythsReached).toHaveBeenCalledWith(scene, [hex(8, 6)]);
			// And all else held back from it: what was seen there from afar, its land rolled, a ruler home.
			expect(revealSighted).toHaveBeenCalledWith(scene, [hex(8, 6)]);
			expect(rollFirstArrival).toHaveBeenCalledWith({ scene, hex: hex(8, 6) });
			expect(welcomeHome).toHaveBeenCalledWith(scene, [hex(8, 6)]);
			expect(lastCard().actions).toEqual([expect.objectContaining({ key: "omen", hex: "8,6" })]);
		} finally {
			solo = false;
		}
	});

	it("keeps the move dire weather may hold the Company back on, under its own id, till another move", async () => {
		weather = "dire";
		landing = null;
		vi.mocked(setHeldBack).mockClear();
		follow(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5) });
		await vi.waitFor(() => expect(postCard).toHaveBeenCalled());
		// Played together, kept for its card's sake, with nothing kept from being found.
		expect(setHeldBack).toHaveBeenLastCalledWith(scene, [hex(8, 6)], { move: "move1", kept: false });

		solo = true;
		try {
			vi.mocked(postCard).mockClear();
			follow(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5) });
			await vi.waitFor(() => expect(postCard).toHaveBeenCalled());
			// Under the move's own id, which its card keeps.
			expect(setHeldBack).toHaveBeenLastCalledWith(scene, [hex(8, 6)], { move: "move2", kept: true });
			expect(vi.mocked(postCard).mock.calls.at(-1)[3].flags[SYSTEM_ID].arrived).toMatchObject({ held: [hex(8, 6)], move: "move2" });

			weather = null;
			vi.mocked(setHeldBack).mockClear();
			follow(scene, { entered: [hex(8, 7)], ended: true, from: hex(8, 6) });
			await vi.waitFor(() => expect(setHeldBack).toHaveBeenCalled());
			expect(setHeldBack).toHaveBeenLastCalledWith(scene, [], { move: null, kept: true });
		} finally {
			solo = false;
		}
	});

	it("keeps the hexes held back from before travelling blind asks anything", async () => {
		solo = true;
		try {
			weather = "dire";
			let keptWhileAsked = null;
			vi.mocked(settleBlindTravel).mockImplementationOnce(async () => {
				keptWhileAsked = heldKeys;
				return null;
			});
			follow(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5) });
			await vi.waitFor(() => expect(postCard).toHaveBeenCalled());
			expect(keptWhileAsked).toEqual(["8,6"]);
		} finally {
			solo = false;
		}
	});

	it("leaves the hexes held back from held as a blind drift on that move puts the Company in them", async () => {
		solo = true;
		try {
			weather = "dire";
			follow(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5) });
			await vi.waitFor(() => expect(postCard).toHaveBeenCalled());
			vi.mocked(setHeldBack).mockClear();
			vi.mocked(revealMythsReached).mockClear();
			follow(scene, { entered: [hex(8, 6)], ended: true, from: hex(7, 6), chosen: false });
			await vi.waitFor(() => expect(revealMythsReached).toHaveBeenCalled());
			// Still held back, so its Myth isn't found, and Stay or Onward still answers it.
			expect(revealMythsReached).toHaveBeenLastCalledWith(scene, []);
			expect(setHeldBack).not.toHaveBeenCalled();
			expect(heldMove).toBe("move1");

			// Put somewhere else by the Referee, it's settled.
			follow(scene, { entered: [hex(2, 2)], ended: true, from: hex(8, 6), chosen: false });
			await vi.waitFor(() => expect(setHeldBack).toHaveBeenCalledWith(scene, []));
			expect(heldMove).toBeNull();
		} finally {
			solo = false;
		}
	});

	it("does nothing on an old Stay once the Company has moved since, played together too", async () => {
		weather = "dire";
		follow(scene, { entered: [hex(5, 5)], ended: true, from: hex(5, 4) });
		await vi.waitFor(() => expect(postCard).toHaveBeenCalled());
		weather = null;
		follow(scene, { entered: [hex(5, 6)], ended: true, from: hex(5, 5) });
		await vi.waitFor(() => expect(heldMove).toBeNull());
		vi.mocked(setCompanyHex).mockClear();
		vi.mocked(forgetMoveVisits).mockClear();
		expect(await press("stay", "5,4")).toBe(true);
		expect(setCompanyHex).not.toHaveBeenCalled();
		expect(forgetMoveVisits).not.toHaveBeenCalled();
		expect(ui.notifications.info).toHaveBeenCalledWith("arrival.movedOn");
	});

	it("keeps on the card the arrivals the held move made, so Stay forgets those and no later one", async () => {
		weather = "dire";
		follow(scene, { entered: [hex(5, 5)], ended: true, from: hex(5, 4), orders: Promise.resolve({ "5,5": 7, "9,9": 3 }) });
		await vi.waitFor(() => expect(postCard).toHaveBeenCalled());
		expect(vi.mocked(postCard).mock.calls.at(-1)[3].flags[SYSTEM_ID].arrived.orders).toEqual({ "5,5": 7 });
		vi.mocked(forgetMoveVisits).mockClear();
		await press("stay", "5,4");
		expect(forgetMoveVisits).toHaveBeenCalledWith(scene, [hex(5, 5)], { "5,5": 7 });
	});

	it("makes Stay and Onward one choice, so pressing either takes both off", async () => {
		solo = true;
		try {
			weather = "dire";
			await noticeArrival(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5) });
			const held = lastCard().actions.filter((action) => ["stay", "onward"].includes(action.key));
			expect(held.map((action) => action.group)).toEqual(["held", "held"]);
		} finally {
			solo = false;
		}
	});

	it("does nothing on an old card once the Company has moved since, played alone", async () => {
		solo = true;
		try {
			weather = "dire";
			await noticeArrival(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5) }, { move: "old" });
			heldMove = "newer";
			vi.mocked(setCompanyHex).mockClear();
			vi.mocked(setHeldBack).mockClear();
			vi.mocked(revealMythsReached).mockClear();
			// Done with, so the buttons go, but nothing is moved, forgotten, found or settled.
			expect(await press("stay", "8,5")).toBe(true);
			expect(await press("onward")).toBe(true);
			expect(setCompanyHex).not.toHaveBeenCalled();
			expect(revealMythsReached).not.toHaveBeenCalled();
			expect(setHeldBack).not.toHaveBeenCalled();
			expect(heldMove).toBe("newer");
			expect(ui.notifications.info).toHaveBeenCalledWith("arrival.movedOn");
		} finally {
			solo = false;
		}
	});

	it("tells nothing where a blind roll sent the Company back where it set off", async () => {
		landing = hex(8, 5);
		follow(scene, { entered: [hex(8, 6)], ended: true, from: hex(8, 5) });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(postCard).not.toHaveBeenCalled();
	});
});
