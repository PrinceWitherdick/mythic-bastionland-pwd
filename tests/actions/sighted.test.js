import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRealm, REALM_FLAG } from "../../module/rules/realm.js";
import { hexCentre, hexKey, neighbours, realmGeometry } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const g = realmGeometry({ cols: 12, rows: 12 });
const hex = (col, row) => ({ col, row });
const here = hex(6, 6);
const [west, east] = [neighbours(g, here)[0].hex, neighbours(g, here)[3].hex];

/** What the next window answers with, what it was asked, and the hexes hidden by hand. */
let answer;
let asked;
let handHidden;

vi.mock("../../module/apps/ui.js", () => ({
	inputDialog: vi.fn(async (options) => {
		asked = options;
		return answer;
	})
}));
vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));
vi.mock("../../module/actions/journey.js", () => ({ COMPANY_MOVED_HOOK: "mythic-bastionland.companyMoved" }));
vi.mock("../../module/actions/realm.js", () => ({
	isRealmScene: (scene) => scene?.isRealm !== false,
	sceneGeometry: () => g,
	hexHiddenByHand: (_scene, at) => ({ terrain: false, holding: handHidden.has(hexKey(at)), seat: false })
}));

const { getSighted, offerSightings, registerSightings, revealSighted } = await import("../../module/actions/sighted.js");

/** A Tile standing in the middle of a hex, as a Realm draws it. */
const tile = (id, kind, at, hidden = true) => ({ id, hidden, ...hexCentre(g, at), flags: { [SYSTEM_ID]: { [REALM_FLAG]: { kind } } } });

/** A Realm Scene whose flag updates and Tile updates land on it. */
function fakeScene({ sighted = {}, tiles = [] } = {}) {
	const scene = {
		id: "realm",
		flags: { [SYSTEM_ID]: { sighted: { ...sighted } } },
		tiles,
		update: vi.fn(async (changes) => {
			for (const [path, value] of Object.entries(changes)) {
				const key = path.split(".").at(-1);
				if (key.startsWith("-=")) delete scene.flags[SYSTEM_ID].sighted[key.slice(2)];
				else scene.flags[SYSTEM_ID].sighted[key] = value;
			}
		}),
		updateEmbeddedDocuments: vi.fn(async (_type, updates) => {
			for (const { _id, hidden } of updates) tiles.find((candidate) => candidate.id === _id).hidden = hidden;
		})
	};
	return scene;
}

function realmWith({ landmarks = [], holdings = [] } = {}) {
	const realm = emptyRealm(g);
	realm.landmarks = landmarks.map(({ hex: where, type = "monument", name = "", revealed = false }, index) => ({ id: `l${index}`, hex: where, type, name, seer: null, revealed }));
	realm.holdings = holdings.map((where, index) => ({ id: `h${index}`, hex: where, style: "town", seat: false, name: "Oakwall" }));
	return realm;
}

beforeEach(() => {
	answer = null;
	asked = null;
	handHidden = new Set();
	globalThis.game = { user: { isGM: true } };
	globalThis.ui = { notifications: { info: vi.fn() } };
});

afterEach(() => {
	delete globalThis.game;
	delete globalThis.ui;
	vi.clearAllMocks();
});

describe("offerSightings", () => {
	it("lists each neighbouring hex something stands hidden in, ticked, and marks those left ticked", async () => {
		const scene = fakeScene();
		handHidden.add(hexKey(east));
		const realm = realmWith({ landmarks: [{ hex: west, name: "Eternal Hearth" }], holdings: [east] });
		answer = { "sight-0": true, "note-0": "a structure, smoke rising", "sight-1": false, "note-1": "" };
		const changes = await offerSightings({ scene, realm, g, where: here });

		expect(asked.template).toBe("sighted");
		expect(asked.context.hexes.map(({ index, note }) => [index, note])).toEqual([[0, ""], [1, ""]]);
		// The Referee's window names what stands there, so they know what they're marking.
		expect(asked.context.hexes[0].label).toContain("Eternal Hearth");
		expect(asked.context.hexes[1].label).toContain("Oakwall");
		expect(changes).toEqual({ set: { [hexKey(west)]: { note: "a structure, smoke rising" } }, drop: [] });
		expect(getSighted(scene)).toEqual({ [hexKey(west)]: { note: "a structure, smoke rising" } });
		expect(ui.notifications.info).toHaveBeenCalledWith(expect.stringContaining("seenFromAfar.marked"));
	});

	it("shows the words already written, and takes a mark away when it's unticked", async () => {
		const scene = fakeScene({ sighted: { [hexKey(west)]: { note: "a bridge" } } });
		const realm = realmWith({ landmarks: [{ hex: west }] });
		answer = { "sight-0": false, "note-0": "a bridge" };
		await offerSightings({ scene, realm, g, where: here });
		expect(asked.context.hexes[0].note).toBe("a bridge");
		expect(getSighted(scene)).toEqual({});
	});

	it("asks nothing where nothing stands hidden around, or when the window is closed", async () => {
		const scene = fakeScene();
		expect(await offerSightings({ scene, realm: realmWith({ landmarks: [{ hex: west, revealed: true }] }), g, where: here })).toBeNull();
		expect(asked).toBeNull();
		expect(await offerSightings({ scene, realm: realmWith({ landmarks: [{ hex: west }] }), g, where: here })).toBeNull();
		expect(scene.update).not.toHaveBeenCalled();
	});

	it("asks nothing of a player", async () => {
		game.user.isGM = false;
		expect(await offerSightings({ scene: fakeScene(), realm: realmWith({ landmarks: [{ hex: west }] }), g, where: here })).toBeNull();
		expect(asked).toBeNull();
	});
});

describe("revealSighted", () => {
	it("shows what the Company saw from afar once it gets there, and takes the mark away", async () => {
		const tiles = [tile("landmark", "landmark", west), tile("myth", "myth", west), tile("holding", "holding", east), tile("seat", "seat", east)];
		const scene = fakeScene({ sighted: { [hexKey(west)]: { note: "smoke" }, [hexKey(east)]: { note: "" } }, tiles });
		expect(await revealSighted(scene, [here, west])).toEqual([west]);
		expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith("Tile", [{ _id: "landmark", hidden: false }]);
		// A Myth isn't what was seen, so it keeps its secret.
		expect(tiles.find(({ id }) => id === "myth").hidden).toBe(true);
		expect(getSighted(scene)).toEqual({ [hexKey(east)]: { note: "" } });
		expect(ui.notifications.info).toHaveBeenCalledWith("seenFromAfar.reached");
	});

	it("shows a Holding hidden by hand with its Seat's badge", async () => {
		const tiles = [tile("holding", "holding", east), tile("seat", "seat", east), tile("terrain", "terrain", east)];
		const scene = fakeScene({ sighted: { [hexKey(east)]: { note: "" } }, tiles });
		await revealSighted(scene, [east]);
		expect(scene.updateEmbeddedDocuments.mock.calls[0][1].map(({ _id }) => _id)).toEqual(["holding", "seat"]);
	});

	it("leaves a hex nobody marked alone", async () => {
		const scene = fakeScene({ tiles: [tile("landmark", "landmark", west)] });
		expect(await revealSighted(scene, [west])).toEqual([]);
		expect(scene.updateEmbeddedDocuments).not.toHaveBeenCalled();
		expect(scene.update).not.toHaveBeenCalled();
	});

	it("follows the Company's moves", () => {
		const on = vi.fn();
		globalThis.Hooks = { on };
		registerSightings();
		expect(on).toHaveBeenCalledWith("mythic-bastionland.companyMoved", expect.any(Function));
		delete globalThis.Hooks;
	});
});
