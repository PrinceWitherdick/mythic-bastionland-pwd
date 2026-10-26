import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRealm } from "../../module/rules/realm.js";
import { edgeKey, hexCentre, realmGeometry } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const g = realmGeometry();
const hidden = edgeKey({ col: 1, row: 1 }, { col: 2, row: 1 });
const shown = edgeKey({ col: 4, row: 4 }, { col: 4, row: 5 });
// Hidden too, and nowhere near where the Company was turned back.
const far = edgeKey({ col: 8, row: 8 }, { col: 8, row: 9 });
const realm = {
	...emptyRealm(g),
	barriers: [
		{ id: "b1", edge: hidden, revealed: false },
		{ id: "b2", edge: shown, revealed: true },
		{ id: "b3", edge: far, revealed: false }
	]
};

// Writing the Realm is realm.js's business: here the edit is run on the Realm to see what it would write.
const edits = [];
vi.mock("../../module/actions/realm.js", () => ({
	getRealm: () => ({ realm }),
	isRealmScene: (scene) => Boolean(scene),
	sceneGeometry: () => g,
	// Found by travelling, so it's written as play, which Undo on the map doesn't take back.
	editRealm: async (scene, edit) => edits.push(edit(realm, g))
}));
/** What the Phase's end answers, the new Phase or null for a window closed, and what it was asked. */
let answer;
let asked;
// The Phase's end, and the Wilderness Roll it offers, are time.js's to test.
vi.mock("../../module/actions/time.js", () => ({
	advancePhase: vi.fn(async (known) => {
		asked.push(known);
		return answer;
	})
}));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({ phase: "morning" }) }));
// Keeping the Barrier in the players' record of the hex is hex-shared.js's to test.
vi.mock("../../module/actions/hex-shared.js", () => ({ recordBarriersMet: vi.fn(async () => true) }));
// Which Token is the Company is journey.js's to test: here it's whichever says so.
vi.mock("../../module/actions/journey.js", () => ({ movesAsCompany: (token) => Boolean(token.company) }));
// Whether this Realm's secrets are kept from the Referee is solo.js's to work out: here only what follows from it.
let kept = false;
vi.mock("../../module/actions/solo.js", () => ({ secretsKeptOn: vi.fn(() => kept) }));

const { offerWastedPhase, onBarrierFound, onTurnedBackQuery, registerTurnedBackQuery, reportTurnedBack } = await import("../../module/canvas/barrier-found.js");
const { advancePhase } = await import("../../module/actions/time.js");
const { secretsKeptOn } = await import("../../module/actions/solo.js");
const { recordBarriersMet } = await import("../../module/actions/hex-shared.js");

const alys = { id: "player", name: "Alys" };
const from = { col: 1, row: 1 };
const to = { col: 2, row: 1 };

/**
 * A Token on the Realm, standing in a hex.
 * @param {{col: number, row: number}} hex
 * @param {object} [options]
 * @param {string[]} [options.owners] Ids of the users who own it.
 * @param {boolean} [options.company] Whether it moves as the Company.
 */
const token = (hex, { owners = ["player"], company = false } = {}) => ({
	company,
	getCenterPoint: () => hexCentre(g, hex),
	testUserPermission: (user, level) => level === "OWNER" && owners.includes(user.id)
});

const scene = { id: "realm1", tokens: [] };
const QUERY = `${SYSTEM_ID}.turnedBack`;

/** A player's report, as their client sends it. */
const report = (edges, extra = {}) => ({ sceneId: "realm1", edges, from, to, company: false, ...extra });

/** The active GM answering, asked by Alys unless somebody else is named. */
const answerAs = (data, user = alys) => onTurnedBackQuery(data, { user });

let query;
let info;
let warn;
let emit;
beforeEach(() => {
	edits.length = 0;
	kept = false;
	answer = null;
	asked = [];
	scene.tokens = [token(from), token(to, { owners: [] })];
	vi.mocked(advancePhase).mockClear();
	vi.mocked(recordBarriersMet).mockClear();
	query = vi.fn(async () => true);
	info = vi.fn();
	warn = vi.fn();
	emit = vi.fn();
	globalThis.ui = { notifications: { info, warn } };
	globalThis.CONFIG = { queries: {} };
	globalThis.game = {
		user: { id: "player", isGM: false },
		socket: { emit, on: vi.fn() },
		scenes: { get: (id) => (id === "realm1" ? scene : undefined) },
		users: { get: (id) => (id === "player" ? alys : undefined), activeGM: { isSelf: true, query } },
		i18n: { localize: (key) => key, format: (key, data) => `${key}(${Object.values(data).join(",")})` }
	};
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("a player's Token running into a hidden Barrier", () => {
	it("is told to the active GM from a player's client, and not from a GM's", () => {
		reportTurnedBack(scene, { edges: [hidden], from, to });
		expect(query).toHaveBeenCalledWith(QUERY, report([hidden]), { timeout: 10000 });
		query.mockClear();
		reportTurnedBack(scene, { edges: [], from, to });
		game.user.isGM = true;
		reportTurnedBack(scene, { edges: [hidden], from, to });
		expect(query).not.toHaveBeenCalled();
	});

	it("tells the player when no Referee is here to hear it", () => {
		game.users.activeGM = null;
		reportTurnedBack(scene, { edges: [hidden], from, to });
		expect(warn).toHaveBeenCalledWith("bastionland.realm.movement.needsGM");
	});

	it("keeps a query that fails from going unhandled", async () => {
		const failed = vi.spyOn(console, "warn").mockImplementation(() => {});
		query.mockRejectedValueOnce(new Error("timed out"));
		reportTurnedBack(scene, { edges: [hidden], from, to });
		await vi.waitFor(() => expect(failed).toHaveBeenCalled());
	});

	it("is answered by the GM's query, which this registers", () => {
		registerTurnedBackQuery();
		expect(CONFIG.queries[QUERY]).toBe(onTurnedBackQuery);
		expect(game.socket.on).toHaveBeenCalledWith(`system.${SYSTEM_ID}`, onBarrierFound);
	});

	it("is told to every other GM by the one who revealed it", async () => {
		game.user.isGM = true;
		await answerAs(report([hidden]));
		expect(emit).toHaveBeenCalledWith(`system.${SYSTEM_ID}`, { action: "barrierFound", sceneId: "realm1", edges: [hidden], name: "Alys" });
	});

	it("is told on another GM's client only for Barriers the Realm shows revealed", () => {
		game.user.isGM = true;
		onBarrierFound({ action: "barrierFound", sceneId: "realm1", edges: [shown, hidden, 7], name: "Alys" });
		expect(info).toHaveBeenCalledTimes(1);
		expect(info.mock.calls[0][0]).toContain("Alys");
		info.mockClear();
		game.user.isGM = false;
		onBarrierFound({ action: "barrierFound", sceneId: "realm1", edges: [shown], name: "Alys" });
		expect(info).not.toHaveBeenCalled();
	});

	it("is revealed by the active GM, under the name of whoever asked", async () => {
		game.user.isGM = true;
		// Whatever the data says of who sent it.
		expect(await answerAs({ ...report([hidden]), userId: "someoneElse" })).toBe(true);
		expect(info).toHaveBeenCalledWith("bastionland.realm.movement.found(Alys,bastionland.realm.hex(1,1),bastionland.realm.hex(2,1))");
		expect(edits).toHaveLength(1);
		expect(edits[0].barriers.find((barrier) => barrier.edge === hidden).revealed).toBe(true);
	});

	it("tells the GM a hex by the name they gave it, as the readout does", async () => {
		game.user.isGM = true;
		scene.tokens = [token(from, { company: true })];
		scene.flags = { [SYSTEM_ID]: { hexNames: { version: 1, hexes: { "2,1": { name: "Weeping Fen" } } } } };
		try {
			await answerAs(report([hidden], { company: true }));
			expect(info.mock.calls[0][0]).toContain("Weeping Fen");
			expect(asked[0].note).toContain("Weeping Fen");
		} finally {
			delete scene.flags;
		}
	});

	it("keeps the Barrier in the hex the Token was turned back into, under who met it", async () => {
		game.user.isGM = true;
		scene.tokens = [token(to)];
		await answerAs(report([hidden], { from: to, to: from }));
		expect(recordBarriersMet).toHaveBeenCalledWith(scene, [{ hex: to, edges: [hidden] }], "Alys");
	});

	it("takes only Barriers still hidden", async () => {
		game.user.isGM = true;
		scene.tokens = [token({ col: 4, row: 4 })];
		expect(await answerAs(report([shown, "nonsense"], { from: { col: 4, row: 4 }, to: { col: 4, row: 5 } }))).toBe(true);
		expect(info).not.toHaveBeenCalled();
		expect(edits).toHaveLength(0);
	});
});

describe("a report the Realm doesn't bear out", () => {
	beforeEach(() => {
		game.user.isGM = true;
	});

	/** Whether the report was refused, with nothing revealed, kept or offered. */
	const refused = async (data, user) => {
		expect(await answerAs(data, user)).toBe(false);
		expect(edits).toHaveLength(0);
		expect(recordBarriersMet).not.toHaveBeenCalled();
		expect(asked).toHaveLength(0);
	};

	it("is refused when nobody says who asked, or on a player's client", async () => {
		expect(await onTurnedBackQuery(report([hidden]), {})).toBe(false);
		game.user.isGM = false;
		await refused(report([hidden]));
	});

	it("is refused for a Scene that isn't there, or a hex off the Realm", async () => {
		await refused(report([hidden], { sceneId: "gone" }));
		await refused(report([hidden], { from: { col: 0, row: 1 } }));
		await refused(report([hidden], { to: null }));
		await refused({ ...report([hidden]), edges: hidden });
	});

	it("reveals nothing that move didn't run into, however many Barriers it names", async () => {
		expect(await answerAs(report([hidden, far]))).toBe(true);
		expect(edits[0].barriers.find((barrier) => barrier.edge === far).revealed).toBe(false);
		expect(recordBarriersMet).toHaveBeenCalledWith(scene, [{ hex: from, edges: [hidden] }], "Alys");
	});

	it("is refused for a move nothing bars", async () => {
		scene.tokens = [token({ col: 8, row: 8 })];
		await refused(report([far], { from: { col: 8, row: 8 }, to: { col: 7, row: 8 } }));
	});

	it("is refused unless a Token the asker may move set off from there", async () => {
		// Only somebody else's Token stands there.
		scene.tokens = [token(from, { owners: ["other"] })];
		await refused(report([hidden]));
		// Theirs stands across the Barrier, which it can't have crossed to get there.
		scene.tokens = [token(to)];
		await refused(report([hidden]));
		// And nobody else's report is signed with their name.
		scene.tokens = [token(from)];
		await refused(report([hidden]), { id: "other", name: "Bors" });
	});

	it("takes a move set off from a waypoint the Token could reach", async () => {
		scene.tokens = [token({ col: 1, row: 3 })];
		expect(await answerAs(report([hidden]))).toBe(true);
		expect(edits).toHaveLength(1);
	});

	it("reveals far Barriers only for a move that really ran into them", async () => {
		scene.tokens = [token({ col: 8, row: 8 })];
		await refused(report([far]));
		expect(await answerAs(report([far], { from: { col: 8, row: 8 }, to: { col: 8, row: 9 } }))).toBe(true);
		expect(edits[0].barriers.find((barrier) => barrier.edge === far).revealed).toBe(true);
	});
});

describe("a Company turned back by a Barrier", () => {
	it("is told to the active GM even when the Barrier was known", () => {
		reportTurnedBack(scene, { edges: [], from, to, company: true });
		expect(query).toHaveBeenCalledWith(QUERY, report([], { company: true }), { timeout: 10000 });
	});

	it("offers the active GM the Phase's end, spent travelling, saying what turned them back", async () => {
		game.user.isGM = true;
		scene.tokens = [token({ col: 4, row: 4 }, { company: true })];
		answer = { phase: "afternoon" };
		expect(await answerAs(report([], { from: { col: 4, row: 4 }, to: { col: 4, row: 5 }, company: true }))).toBe(true);
		expect(asked).toEqual([{ scene, mode: "travel", atBarrier: true, note: expect.stringContaining("bastionland.realm.movement.wasted.text") }]);
	});

	it("answers the player before the Referee answers the Phase's end", async () => {
		game.user.isGM = true;
		scene.tokens = [token(from, { company: true })];
		let settle;
		vi.mocked(advancePhase).mockImplementationOnce((known) => {
			asked.push(known);
			return new Promise((resolve) => (settle = resolve));
		});
		expect(await answerAs(report([hidden], { company: true }))).toBe(true);
		expect(asked).toHaveLength(1);
		// Closed, so the next ask isn't taken for this one.
		settle(null);
		await new Promise((resolve) => setTimeout(resolve));
	});

	it("reveals a hidden Barrier before asking", async () => {
		game.user.isGM = true;
		scene.tokens = [token(from, { company: true })];
		await answerAs(report([hidden], { company: true }));
		expect(edits).toHaveLength(1);
		expect(asked).toHaveLength(1);
		expect(recordBarriersMet).toHaveBeenCalledWith(scene, [{ hex: from, edges: [hidden] }], "Alys");
	});

	it("offers nothing for a Token that isn't the Company, or a move nothing barred", async () => {
		game.user.isGM = true;
		// Alys's own Knight stands there, but the Company is across the Barrier.
		scene.tokens = [token(from), token(to, { company: true })];
		expect(await answerAs(report([], { company: true }))).toBe(false);
		scene.tokens = [token({ col: 3, row: 3 }, { company: true })];
		expect(await answerAs(report([], { from: { col: 3, row: 3 }, to: { col: 3, row: 4 }, company: true }))).toBe(false);
		expect(asked).toHaveLength(0);
	});

	it("keeps the Phase when the window is closed", async () => {
		game.user.isGM = true;
		answer = null;
		expect(await offerWastedPhase(scene, { from, to })).toBe(false);
		answer = { phase: "afternoon" };
		expect(await offerWastedPhase(scene, { from, to })).toBe(true);
	});

	it("asks a GM who moved it themselves at once, with nothing sent", async () => {
		game.user.isGM = true;
		reportTurnedBack(scene, { edges: [hidden], from, to, company: true });
		await vi.waitFor(() => expect(advancePhase).toHaveBeenCalled());
		expect(query).not.toHaveBeenCalled();
		expect(edits).toHaveLength(0);
	});

	it("played alone, has the Referee's own Company find a hidden Barrier, save on a Realm whose secrets they're placing", async () => {
		game.user.isGM = true;
		kept = true;
		reportTurnedBack(scene, { edges: [hidden], from, to, company: true });
		await vi.waitFor(() => expect(advancePhase).toHaveBeenCalled());
		expect(secretsKeptOn).toHaveBeenCalledWith(scene);
		expect(edits).toHaveLength(1);
		expect(recordBarriersMet).toHaveBeenCalledWith(scene, [{ hex: from, edges: [hidden] }], game.user.name);

		// Drawing a Realm and placing its secrets by hand, they're in view, so nothing is found.
		edits.length = 0;
		kept = false;
		vi.mocked(advancePhase).mockClear();
		reportTurnedBack(scene, { edges: [hidden], from, to, company: true });
		await vi.waitFor(() => expect(advancePhase).toHaveBeenCalled());
		expect(edits).toHaveLength(0);
	});

	it("says which failed, the Barrier found or the Phase offered", async () => {
		game.user.isGM = true;
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.mocked(advancePhase).mockRejectedValueOnce(new Error("no"));
		reportTurnedBack(scene, { edges: [], from, to, company: true });
		await vi.waitFor(() => expect(logged).toHaveBeenCalled());
		expect(logged.mock.calls[0][0]).toContain("Couldn't offer the Phase wasted");
	});

	it("asks once while the window is still open", async () => {
		game.user.isGM = true;
		let settle;
		vi.mocked(advancePhase).mockImplementationOnce((known) => {
			asked.push(known);
			return new Promise((resolve) => (settle = resolve));
		});
		const first = offerWastedPhase(scene, { from, to });
		expect(await offerWastedPhase(scene, { from, to })).toBe(false);
		settle({ phase: "afternoon" });
		expect(await first).toBe(true);
		expect(asked).toHaveLength(1);
	});
});
