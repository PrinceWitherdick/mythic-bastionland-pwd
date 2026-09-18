import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JOURNEY_FLAG, forgetHexVisits, getJourney, legHexes, markHexVisited, movesAsCompany, recordHexVisits } from "../../module/actions/journey.js";
import { REALM_FLAG } from "../../module/rules/realm.js";
import { hexCentre, hexKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const g = realmGeometry();
const hex = (col, row) => ({ col, row });
const spring = { age: 1, season: "spring", day: 2, phase: "afternoon" };

class ForcedDeletion {}

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
	globalThis.foundry = { data: { operators: { ForcedDeletion } } };
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
		expect(getJourney(scene).hexes["3,2"]).toEqual({ count: 1, first: { when: spring, order: 2 }, last: { when: spring, order: 2 } });
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
