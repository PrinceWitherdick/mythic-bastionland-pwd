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

const { onBarriersFound, reportBarriersFound } = await import("../../module/canvas/barrier-found.js");

const scene = { id: "realm1" };
const found = (edges, userId = "player") => ({ action: "barriersFound", sceneId: "realm1", edges, userId });

let emit;
let info;
beforeEach(() => {
	edits.length = 0;
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
		reportBarriersFound(scene, [hidden]);
		expect(emit).toHaveBeenCalledWith(`system.${SYSTEM_ID}`, found([hidden]));
		emit.mockClear();
		reportBarriersFound(scene, []);
		game.user.isGM = true;
		reportBarriersFound(scene, [hidden]);
		expect(emit).not.toHaveBeenCalled();
	});

	it("tells each GM, and the active GM reveals the Barrier", async () => {
		game.user.isGM = true;
		await onBarriersFound(found([hidden]));
		expect(info).toHaveBeenCalledWith("bastionland.realm.movement.found(Alys,bastionland.realm.hex(1,1),bastionland.realm.hex(2,1))");
		expect(edits).toHaveLength(1);
		expect(edits[0].barriers.find((barrier) => barrier.edge === hidden).revealed).toBe(true);
	});

	it("leaves the writing to the active GM", async () => {
		game.user.isGM = true;
		game.users.activeGM = { isSelf: false };
		await onBarriersFound(found([hidden]));
		expect(info).toHaveBeenCalledTimes(1);
		expect(edits).toHaveLength(0);
	});

	it("takes only Barriers still hidden, and nothing on a player's client", async () => {
		await onBarriersFound(found([hidden]));
		game.user.isGM = true;
		await onBarriersFound(found([shown, "nonsense"]));
		await onBarriersFound({ action: "somethingElse", sceneId: "realm1", edges: [hidden] });
		expect(info).not.toHaveBeenCalled();
		expect(edits).toHaveLength(0);
	});
});
