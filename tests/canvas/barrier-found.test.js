import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRealm } from "../../module/rules/realm.js";
import { edgeKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const g = realmGeometry();
const hidden = edgeKey({ col: 1, row: 1 }, { col: 2, row: 1 });
const shown = edgeKey({ col: 4, row: 4 }, { col: 4, row: 5 });
const realm = {
	...emptyRealm(g),
	barriers: [
		{ id: "b1", edge: hidden, revealed: false },
		{ id: "b2", edge: shown, revealed: true }
	]
};

// Writing the Realm is realm.js's business: here the edit is run on the Realm to see what it would write.
const edits = [];
vi.mock("../../module/actions/realm.js", () => ({
	getRealm: () => ({ realm }),
	isRealmScene: (scene) => Boolean(scene),
	sceneGeometry: () => g,
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

const { offerWastedPhase, onTurnedBack, reportTurnedBack } = await import("../../module/canvas/barrier-found.js");
const { advancePhase } = await import("../../module/actions/time.js");
const { recordBarriersMet } = await import("../../module/actions/hex-shared.js");

const scene = { id: "realm1" };
const from = { col: 1, row: 1 };
const to = { col: 2, row: 1 };
const turned = (edges, extra = {}) => ({ action: "turnedBack", sceneId: "realm1", edges, userId: "player", ...extra });

let emit;
let info;
beforeEach(() => {
	edits.length = 0;
	answer = null;
	asked = [];
	vi.mocked(advancePhase).mockClear();
	vi.mocked(recordBarriersMet).mockClear();
	emit = vi.fn();
	info = vi.fn();
	globalThis.ui = { notifications: { info } };
	globalThis.game = {
		user: { id: "player", isGM: false },
		socket: { emit },
		scenes: { get: (id) => (id === "realm1" ? scene : undefined) },
		users: { get: (id) => (id === "player" ? { name: "Alys" } : undefined), activeGM: { isSelf: true } },
		i18n: { localize: (key) => key, format: (key, data) => `${key}(${Object.values(data).join(",")})` }
	};
});

describe("a player's Company running into a hidden Barrier", () => {
	it("is sent to the GMs from a player's client, and not from a GM's", () => {
		reportTurnedBack(scene, { edges: [hidden] });
		expect(emit).toHaveBeenCalledWith(`system.${SYSTEM_ID}`, turned([hidden]));
		emit.mockClear();
		reportTurnedBack(scene, { edges: [] });
		game.user.isGM = true;
		reportTurnedBack(scene, { edges: [hidden] });
		expect(emit).not.toHaveBeenCalled();
	});

	it("tells each GM, and the active GM reveals the Barrier", async () => {
		game.user.isGM = true;
		await onTurnedBack(turned([hidden]));
		expect(info).toHaveBeenCalledWith("bastionland.realm.movement.found(Alys,bastionland.realm.hex(1,1),bastionland.realm.hex(2,1))");
		expect(edits).toHaveLength(1);
		expect(edits[0].barriers.find((barrier) => barrier.edge === hidden).revealed).toBe(true);
	});

	it("keeps the Barrier in the hex the Token was turned back into, under who met it", async () => {
		game.user.isGM = true;
		await onTurnedBack(turned([hidden], { from: to }));
		expect(recordBarriersMet).toHaveBeenCalledWith(scene, [{ hex: to, edges: [hidden] }], "Alys");
	});

	it("sends the hex the Token stood in with the message", () => {
		reportTurnedBack(scene, { edges: [hidden], from });
		expect(emit).toHaveBeenCalledWith(`system.${SYSTEM_ID}`, turned([hidden], { from }));
	});

	it("keeps nothing for a Barrier already known, nor on a GM who doesn't write", async () => {
		game.user.isGM = true;
		await onTurnedBack(turned([shown], { from }));
		game.users.activeGM = { isSelf: false };
		await onTurnedBack(turned([hidden], { from }));
		expect(recordBarriersMet).not.toHaveBeenCalled();
	});

	it("leaves the writing to the active GM", async () => {
		game.user.isGM = true;
		game.users.activeGM = { isSelf: false };
		await onTurnedBack(turned([hidden]));
		expect(info).toHaveBeenCalledTimes(1);
		expect(edits).toHaveLength(0);
	});

	it("takes only Barriers still hidden, and nothing on a player's client", async () => {
		await onTurnedBack(turned([hidden]));
		game.user.isGM = true;
		await onTurnedBack(turned([shown, "nonsense"]));
		await onTurnedBack({ action: "somethingElse", sceneId: "realm1", edges: [hidden] });
		expect(info).not.toHaveBeenCalled();
		expect(edits).toHaveLength(0);
	});
});

describe("a Company turned back by a Barrier", () => {
	it("is sent to the GMs even when the Barrier was known", () => {
		reportTurnedBack(scene, { edges: [], company: { from, to } });
		expect(emit).toHaveBeenCalledWith(`system.${SYSTEM_ID}`, turned([], { company: { from, to } }));
	});

	it("offers the active GM the Phase's end, spent travelling, saying what turned them back", async () => {
		game.user.isGM = true;
		answer = { phase: "afternoon" };
		await onTurnedBack(turned([], { company: { from, to } }));
		expect(asked).toEqual([{ scene, mode: "travel", atBarrier: true, note: expect.stringContaining("bastionland.realm.movement.wasted.text") }]);
	});

	it("reveals a hidden Barrier before asking", async () => {
		game.user.isGM = true;
		await onTurnedBack(turned([hidden], { company: { from, to } }));
		expect(edits).toHaveLength(1);
		expect(asked).toHaveLength(1);
		// With no hex of its own in the message, the Company's is used.
		expect(recordBarriersMet).toHaveBeenCalledWith(scene, [{ hex: from, edges: [hidden] }], "Alys");
	});

	it("keeps the Phase when the window is closed", async () => {
		game.user.isGM = true;
		answer = null;
		expect(await offerWastedPhase(scene, { from, to })).toBe(false);
		answer = { phase: "afternoon" };
		expect(await offerWastedPhase(scene, { from, to })).toBe(true);
	});

	it("asks only the active GM, and nothing for a message without two hexes", async () => {
		game.user.isGM = true;
		await onTurnedBack(turned([], { company: { from, to: "nowhere" } }));
		game.users.activeGM = { isSelf: false };
		await onTurnedBack(turned([], { company: { from, to } }));
		expect(asked).toHaveLength(0);
	});

	it("asks a GM who moved it themselves at once, with no message sent", async () => {
		game.user.isGM = true;
		reportTurnedBack(scene, { edges: [hidden], company: { from, to } });
		await vi.waitFor(() => expect(advancePhase).toHaveBeenCalled());
		expect(emit).not.toHaveBeenCalled();
		expect(edits).toHaveLength(0);
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
