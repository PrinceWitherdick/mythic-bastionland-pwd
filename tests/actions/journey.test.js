import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPANY_MOVED_HOOK, COMPANY_PLACED_HOOK, JOURNEY_FLAG, forgetHexVisits, forgetMoveVisits, getJourney, heldBack, heldBackFrom, legHexes, markHexVisited, movesAsCompany, recordHexVisits, registerJourneyHooks, setHeldBack, COMPANY_MOVE_UNDONE_HOOK } from "../../module/actions/journey.js";
import { REALM_FLAG } from "../../module/rules/realm.js";
import { edgeKey, hexCentre, hexKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";
import { UNDOES_MOVE } from "../../module/canvas/undone-moves.js";

const g = realmGeometry();
const hex = (col, row) => ({ col, row });
const spring = { age: 1, year: 1, season: "spring", day: 2, phase: "afternoon" };

class ForcedDeletion {}

// What the Timeline makes of the hexes come to is timeline-events.js's to test.
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineArrivals: vi.fn(async () => {}) }));

/** A Realm Scene whose updates land on its own flags, as Foundry's would. */
function realmScene(tokens = []) {
	const scene = {
		id: "realm",
		flags: { [SYSTEM_ID]: { [REALM_FLAG]: { size: g.size, cols: g.cols, rows: g.rows } } },
		tokens,
		getFlag: (scope, key) => scene.flags[scope]?.[key],
		update: vi.fn(async (changes) => {
			for (const [path, value] of Object.entries(changes)) {
				const parts = path.split(".").slice(2);
				let node = scene.flags[SYSTEM_ID];
				for (const part of parts.slice(0, -1)) node = node[part] ??= {};
				if (value instanceof ForcedDeletion) delete node[parts.at(-1)];
				else node[parts.at(-1)] = structuredClone(value);
			}
		})
	};
	return scene;
}

/** A Token standing in a hex; positions it's handed are Scene points already. */
const token = (id, { company = false, playerOwned = false } = {}) => ({
	id,
	parent: null,
	actor: { hasPlayerOwner: playerOwned },
	getFlag: (scope, key) => scope === SYSTEM_ID && key === "company" && company,
	getCenterPoint: (position) => position
});

beforeEach(() => {
	globalThis.game = {
		user: { isGM: true },
		users: { activeGM: { isSelf: true } },
		settings: { get: () => spring }
	};
	globalThis.foundry = { data: { operators: { ForcedDeletion, ForcedReplacement: { create: (value) => value } } } };
});

afterEach(() => {
	delete globalThis.game;
	delete globalThis.foundry;
});

describe("recordHexVisits", () => {
	it("writes only the hexes come into, and counts on", async () => {
		const scene = realmScene();
		await recordHexVisits(scene, [hex(2, 2), hex(3, 2)]);
		const [[changes]] = scene.update.mock.calls;
		expect(Object.keys(changes).sort()).toEqual([
			`flags.${SYSTEM_ID}.${JOURNEY_FLAG}.hexes.2,2`,
			`flags.${SYSTEM_ID}.${JOURNEY_FLAG}.hexes.3,2`,
			`flags.${SYSTEM_ID}.${JOURNEY_FLAG}.next`,
			`flags.${SYSTEM_ID}.${JOURNEY_FLAG}.version`
		]);
		expect(getJourney(scene).hexes["3,2"]).toEqual({ count: 1, first: { when: spring, order: 2 }, last: { when: spring, order: 2 }, arrivals: [{ when: spring, order: 2 }] });
		expect(getJourney(scene).next).toBe(3);
	});

	it("counts a hex by hand, and forgets one as a key taken out", async () => {
		const scene = realmScene();
		await markHexVisited(scene, hex(4, 4));
		await markHexVisited(scene, hex(4, 4));
		expect(getJourney(scene).hexes["4,4"].count).toBe(2);
		await forgetHexVisits(scene, hex(4, 4));
		expect(scene.update.mock.calls.at(-1)[0][`flags.${SYSTEM_ID}.${JOURNEY_FLAG}.hexes.4,4`]).toBeInstanceOf(ForcedDeletion);
		expect(getJourney(scene).hexes).toEqual({});
	});

	it("writes nothing when nothing changes, for players, or off a Realm", async () => {
		const scene = realmScene();
		await expect(forgetHexVisits(scene, hex(1, 1))).resolves.toBe(false);
		await expect(recordHexVisits(scene, [])).resolves.toBe(false);
		await expect(recordHexVisits({ flags: {} }, [hex(1, 1)])).resolves.toBe(false);
		game.user.isGM = false;
		await expect(recordHexVisits(scene, [hex(1, 1)])).resolves.toBe(false);
		expect(scene.update).not.toHaveBeenCalled();
	});
});

describe("a move taken back", () => {
	it("forgets the arrival the move made in each hex, and no later one", async () => {
		const scene = realmScene();
		await recordHexVisits(scene, [hex(2, 2), hex(3, 2)]);
		await recordHexVisits(scene, [hex(2, 2)]);
		const first = getJourney(scene).hexes["2,2"].first.order;
		await forgetMoveVisits(scene, [hex(2, 2), hex(3, 2)], { "2,2": first, "3,2": getJourney(scene).hexes["3,2"].last.order });
		// The later arrival in 2,2 stays; 3,2, come into only on that move, is forgotten.
		expect(getJourney(scene).hexes["2,2"].count).toBe(1);
		expect(getJourney(scene).hexes["2,2"].last.order).toBeGreaterThan(first);
		expect(getJourney(scene).hexes["3,2"]).toBeUndefined();
		// Without its arrivals, as on an older card, nothing is forgotten: the last may be a later move's.
		await expect(forgetMoveVisits(scene, [hex(2, 2)])).resolves.toBe(false);
		expect(getJourney(scene).hexes["2,2"].count).toBe(1);
	});

	it("tells what follows the Company the ids of the Tokens' moves that made a move, for an Undo to name", async () => {
		vi.useFakeTimers();
		const hooks = new Map();
		globalThis.Hooks = { on: (name, fn) => hooks.set(name, fn), callAll: vi.fn() };
		try {
			registerJourneyHooks();
			const company = { ...token("c", { company: true }), getCenterPoint: (position) => position ?? hexCentre(g, hex(3, 4)) };
			company.parent = Object.assign(realmScene([company]), { tiles: [], drawings: [] });
			// A long move, handed over a leg at a time under the one id.
			const leg = { id: "move1", method: "dragging", origin: hexCentre(g, hex(3, 6)), passed: { waypoints: [hexCentre(g, hex(3, 5))] }, pending: { waypoints: [hexCentre(g, hex(3, 4))] } };
			hooks.get("moveToken")(company, leg, {});
			hooks.get("moveToken")(company, { ...leg, origin: hexCentre(g, hex(3, 5)), passed: { waypoints: [hexCentre(g, hex(3, 4))] }, pending: { waypoints: [] } }, {});
			await vi.runAllTimersAsync();
			expect(Hooks.callAll).toHaveBeenCalledWith(COMPANY_MOVED_HOOK, company.parent, expect.objectContaining({ movements: ["move1"] }));
		} finally {
			vi.useRealTimers();
			delete globalThis.Hooks;
		}
	});

	it("with Undo tells what follows the Company of the hex it was put back in, and counts no visit", async () => {
		vi.useFakeTimers();
		const hooks = new Map();
		globalThis.Hooks = { on: (name, fn) => hooks.set(name, fn), callAll: vi.fn() };
		try {
			registerJourneyHooks();
			const company = { ...token("c", { company: true }), getCenterPoint: (position) => position ?? hexCentre(g, hex(3, 4)) };
			company.parent = realmScene([company]);
			const undo = { method: "undo", origin: hexCentre(g, hex(3, 5)), passed: { waypoints: [hexCentre(g, hex(3, 4))] }, pending: { waypoints: [] } };

			hooks.get("moveToken")(company, undo, {});
			await vi.runAllTimersAsync();
			expect(Hooks.callAll).toHaveBeenCalledWith(COMPANY_MOVE_UNDONE_HOOK, company.parent, hex(3, 4), null);
			expect(Hooks.callAll).toHaveBeenCalledTimes(1);
			expect(company.parent.update).not.toHaveBeenCalled();

			// An Undo naming the move it takes back says which, though it leaves the Company in its hex.
			Hooks.callAll.mockClear();
			hooks.get("moveToken")(company, { ...undo, origin: hexCentre(g, hex(3, 4)) }, { [UNDOES_MOVE]: { c: "move1" } });
			expect(Hooks.callAll).toHaveBeenCalledWith(COMPANY_MOVE_UNDONE_HOOK, company.parent, hex(3, 4), "move1");

			// Nor for a Token that isn't the Company, or an Undo that leaves it in its hex.
			Hooks.callAll.mockClear();
			const other = { ...token("k"), parent: company.parent, getCenterPoint: company.getCenterPoint };
			hooks.get("moveToken")(other, undo, {});
			hooks.get("moveToken")(company, { ...undo, origin: hexCentre(g, hex(3, 4)) }, {});
			expect(Hooks.callAll).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
			delete globalThis.Hooks;
		}
	});
});

describe("heldBack", () => {
	/** @returns {object} A Realm Scene whose flags can be set and unset. */
	const flaggedScene = () => {
		const scene = realmScene();
		scene.setFlag = vi.fn(async (scope, key, value) => (scene.flags[scope][key] = structuredClone(value)));
		scene.unsetFlag = vi.fn(async (scope, key) => delete scene.flags[scope][key]);
		return scene;
	};

	it("keeps the hexes a move may be held back from under that move, and settles them", async () => {
		const scene = flaggedScene();
		await setHeldBack(scene, [hex(4, 4)], { move: "move1" });
		expect(heldBack(scene)).toEqual({ move: "move1", hexes: new Set(["4,4"]), keys: new Set(["4,4"]) });
		expect(heldBackFrom(scene, hex(4, 4))).toBe(true);
		expect(heldBackFrom(scene, hex(4, 5))).toBe(false);
		// Written only where it changes.
		await expect(setHeldBack(scene, [hex(4, 4)], { move: "move1" })).resolves.toBe(false);
		await setHeldBack(scene, []);
		expect(heldBack(scene)).toEqual({ move: null, hexes: new Set(), keys: new Set() });
		await expect(setHeldBack(scene, [])).resolves.toBe(false);
	});

	it("keeps a move held back played together, with nothing kept from being found", async () => {
		const scene = flaggedScene();
		await setHeldBack(scene, [hex(4, 4)], { move: "move1", kept: false });
		expect(heldBack(scene)).toEqual({ move: "move1", hexes: new Set(["4,4"]), keys: new Set() });
		expect(heldBackFrom(scene, hex(4, 4))).toBe(false);
	});

	it("still reads the hex keys alone", () => {
		const scene = realmScene();
		scene.flags[SYSTEM_ID].heldBack = ["2,3", 7];
		expect(heldBack(scene)).toEqual({ move: null, hexes: new Set(["2,3"]), keys: new Set(["2,3"]) });
	});
});

describe("movesAsCompany", () => {
	it("follows the Company Token where there is one, and any player's Token where there isn't", () => {
		const company = token("c", { company: true });
		const knight = token("k", { playerOwned: true });
		const withCompany = realmScene([company, knight]);
		company.parent = withCompany;
		knight.parent = withCompany;
		expect(movesAsCompany(company)).toBe(true);
		expect(movesAsCompany(knight)).toBe(false);

		const alone = token("k2", { playerOwned: true });
		alone.parent = realmScene([alone]);
		expect(movesAsCompany(alone)).toBe(true);
		const monster = token("m");
		monster.parent = realmScene([monster]);
		expect(movesAsCompany(monster)).toBe(false);
	});

	it("follows a Knight riding with the Company in solo play, where the Referee owns them all", () => {
		const solo = { type: "knight", hasPlayerOwner: false, getFlag: () => undefined };
		const theirs = { ...solo, getFlag: () => false };
		const knight = { ...token("k"), actor: solo };
		const ruler = { ...token("r"), actor: theirs };
		const scene = realmScene([knight, ruler]);
		knight.parent = scene;
		ruler.parent = scene;
		expect(movesAsCompany(knight)).toBe(false);
		game.settings.get = (_scope, key) => (key === "soloPlay" ? true : spring);
		expect(movesAsCompany(knight)).toBe(true);
		// A Holding's ruler the Referee marked as theirs isn't the Company.
		expect(movesAsCompany(ruler)).toBe(false);
	});

	it("follows only the first Company Token, not a copy of it pasted beside", () => {
		const company = token("c", { company: true });
		const copy = token("c2", { company: true });
		const scene = realmScene([company, copy]);
		company.parent = scene;
		copy.parent = scene;
		expect(movesAsCompany(company)).toBe(true);
		expect(movesAsCompany(copy)).toBe(false);
	});
});

describe("legHexes", () => {
	const at = (col, row) => hexCentre(g, hex(col, row));
	const company = token("c", { company: true });

	it("comes into each hex a walked move passes through", () => {
		const movement = { method: "dragging", origin: at(1, 1), passed: { waypoints: [at(2, 1), at(3, 2), at(3, 2)] } };
		expect(legHexes(company, movement, g).map(hexKey)).toEqual(["2,1", "3,2"]);
		expect(legHexes(company, { ...movement, method: "keyboard" }, g).map(hexKey)).toEqual(["2,1", "3,2"]);
	});

	it("comes into each hex a straight drag crosses, not only where it turns", () => {
		const movement = { method: "dragging", origin: at(2, 2), passed: { waypoints: [at(5, 2)] } };
		const entered = legHexes(company, movement, g).map(hexKey);
		expect(entered).toHaveLength(3);
		expect(entered.at(-1)).toBe("5,2");
	});

	it("comes into the hexes of the way round a Barrier across a straight drag", () => {
		const movement = { method: "dragging", origin: at(2, 2), passed: { waypoints: [at(5, 6)] } };
		const straight = legHexes(company, movement, g).map(hexKey);
		const barriers = new Set([edgeKey(hex(3, 3), hex(3, 4))]);
		const round = legHexes(company, movement, g, barriers).map(hexKey);
		expect(straight).toContain("3,4");
		expect(round).not.toContain("3,4");
		expect(round).toHaveLength(straight.length);
		expect(round.at(-1)).toBe("5,6");
	});

	it("comes into only the end of a move that isn't walked, such as the Hex panel's", () => {
		const movement = { method: "api", origin: at(1, 1), passed: { waypoints: [at(2, 1), at(3, 1), at(6, 6)] } };
		expect(legHexes(company, movement, g).map(hexKey)).toEqual(["6,6"]);
	});

	it("comes into nothing for a move that stays put or has no path", () => {
		expect(legHexes(company, { method: "dragging", origin: at(4, 4), passed: { waypoints: [at(4, 4)] } }, g)).toEqual([]);
		expect(legHexes(company, { method: "dragging", passed: { waypoints: [] } }, g)).toEqual([]);
		expect(legHexes(company, null, g)).toEqual([]);
	});
});

describe("the Company set down", () => {
	afterEach(() => {
		vi.useRealTimers();
		delete globalThis.Hooks;
	});

	it("tells what follows the Company of the hex its Token was first put in, apart from a move", async () => {
		vi.useFakeTimers();
		const hooks = new Map();
		globalThis.Hooks = { on: (name, fn) => hooks.set(name, fn), callAll: vi.fn() };
		registerJourneyHooks();
		const company = { ...token("c", { company: true }), getCenterPoint: () => hexCentre(g, hex(3, 4)) };
		company.parent = realmScene([company]);

		hooks.get("createToken")(company);
		await vi.runAllTimersAsync();
		expect(Hooks.callAll).toHaveBeenCalledWith(COMPANY_PLACED_HOOK, company.parent, [hex(3, 4)]);
		expect(Hooks.callAll).not.toHaveBeenCalledWith(COMPANY_MOVED_HOOK, expect.anything(), expect.anything());
	});

	it("counts no visit for a Token made again where the Company stood when it went", async () => {
		vi.useFakeTimers();
		const hooks = new Map();
		globalThis.Hooks = { on: (name, fn) => hooks.set(name, fn), callAll: vi.fn() };
		registerJourneyHooks();
		const company = { ...token("c", { company: true }), getCenterPoint: () => hexCentre(g, hex(3, 4)) };
		company.parent = realmScene([company]);

		hooks.get("createToken")(company, { bastionlandNotAMove: true });
		await vi.runAllTimersAsync();
		expect(Hooks.callAll).not.toHaveBeenCalled();
		expect(company.parent.update).not.toHaveBeenCalled();
	});
});
