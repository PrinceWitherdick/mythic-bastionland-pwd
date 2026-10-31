import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRealm } from "../../module/rules/realm.js";
import { edgeKey, hexCentre, realmGeometry } from "../../module/rules/realm-geometry.js";

const g = realmGeometry();
const barred = edgeKey({ col: 3, row: 3 }, { col: 4, row: 3 });
const realm = { ...emptyRealm(g), barriers: [{ id: "b1", edge: barred, revealed: false }] };

vi.mock("../../module/actions/realm.js", () => ({
	getRealm: () => ({ realm }),
	isRealmScene: (scene) => Boolean(scene?.realm),
	sceneGeometry: () => g
}));
vi.mock("../../module/actions/journey.js", () => ({ movesAsCompany: (token) => Boolean(token.company) }));
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
// Telling the Referee what turned it back is barrier-found.js's to test.
vi.mock("../../module/canvas/barrier-found.js", () => ({ reportTurnedBack: vi.fn() }));

const { allowRealmMove, passesBarriers } = await import("../../module/canvas/realm-move.js");
const { reportTurnedBack } = await import("../../module/canvas/barrier-found.js");

const scene = { realm: true };
const at = (col, row) => hexCentre(g, { col, row });
/** A Token whose waypoints are the centres they name. */
const token = { parent: scene, company: true, getCenterPoint: (point) => point };
/** A move from one hex to another, set off by whatever means. */
const move = (from, to, extra = {}) => ({ origin: at(...from), passed: { waypoints: [] }, pending: { waypoints: [at(...to)] }, method: "dragging", ...extra });

let warn;
beforeEach(() => {
	warn = vi.fn();
	globalThis.ui = { notifications: { warn } };
	globalThis.game = { user: { isGM: false }, users: { activeGM: { id: "referee" } } };
	vi.mocked(reportTurnedBack).mockClear();
});

describe("a move on a Realm", () => {
	it("goes where nothing bars it", () => {
		expect(allowRealmMove(token, move([3, 3], [3, 4]))).toBe(true);
		expect(warn).not.toHaveBeenCalled();
	});

	it("is refused across a Barrier, and the Company's attempt told", () => {
		expect(allowRealmMove(token, move([3, 3], [4, 3]))).toBe(false);
		expect(warn).toHaveBeenCalledWith("realm.movement.barrier");
		expect(reportTurnedBack).toHaveBeenCalledWith(scene, { edges: [barred], from: { col: 3, row: 3 }, to: { col: 4, row: 3 }, via: [], company: true });
	});

	it("is refused off the edge of the map", () => {
		expect(allowRealmMove(token, move([1, 1], [0, 1]))).toBe(false);
		expect(warn).toHaveBeenCalledWith("realm.movement.offMap");
		expect(reportTurnedBack).not.toHaveBeenCalled();
	});

	it("is checked waypoint by waypoint", () => {
		const waypoints = { passed: { waypoints: [at(3, 4)] }, pending: { waypoints: [at(4, 3)] } };
		expect(allowRealmMove(token, move([3, 3], [3, 4], waypoints))).toBe(true);
	});

	it("tells the Referee the waypoints a drag came through before the leg a Barrier barred", () => {
		const waypoints = { origin: at(3, 5), passed: { waypoints: [] }, pending: { waypoints: [at(3, 4), at(3, 3), at(4, 3)] } };
		expect(allowRealmMove(token, move([3, 5], [4, 3], waypoints))).toBe(false);
		expect(reportTurnedBack).toHaveBeenCalledWith(scene, expect.objectContaining({ from: { col: 3, row: 3 }, to: { col: 4, row: 3 }, via: [{ col: 3, row: 5 }, { col: 3, row: 4 }] }));
	});

	it("taken back with Undo goes back where it came from, Barrier or none", () => {
		expect(allowRealmMove(token, move([3, 3], [4, 3], { method: "undo" }))).toBe(true);
		expect(warn).not.toHaveBeenCalled();
		expect(reportTurnedBack).not.toHaveBeenCalled();
	});

	it("passes a Barrier as the rules or the Referee put it", () => {
		expect(allowRealmMove(token, move([3, 3], [4, 3], { constrainOptions: { ignoreWalls: true } }))).toBe(true);
		expect(allowRealmMove(token, move([3, 3], [4, 3]), { bastionlandForced: true })).toBe(true);
		expect(passesBarriers({ method: "dragging" }, {})).toBe(false);
	});

	it("is refused for a player's Company with no Referee here to keep its journey", () => {
		game.users.activeGM = null;
		expect(allowRealmMove(token, move([3, 3], [3, 4]))).toBe(false);
		expect(warn).toHaveBeenCalledWith("realm.movement.travelNeedsGM");
		// Taken back with Undo too: nothing would be kept of that either.
		expect(allowRealmMove(token, move([3, 4], [3, 3], { method: "undo" }))).toBe(false);
	});

	it("goes with no Referee here for any Token but the Company's, and for the Referee's own", () => {
		game.users.activeGM = null;
		expect(allowRealmMove({ ...token, company: false }, move([3, 3], [3, 4]))).toBe(true);
		game.user.isGM = true;
		expect(allowRealmMove(token, move([3, 3], [3, 4]))).toBe(true);
		expect(warn).not.toHaveBeenCalled();
	});

	it("is anybody's business off a Realm", () => {
		expect(allowRealmMove({ ...token, parent: {} }, move([3, 3], [4, 3]))).toBe(true);
	});
});
