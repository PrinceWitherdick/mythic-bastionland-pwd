import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REALM_FLAG } from "../../module/rules/realm.js";
import { SYSTEM_ID } from "../../module/system-id.js";

/**
 * A Myth's Omens go on the Timeline from the Tile hooks in omens.js, whatever
 * wrote them: marked by the Referee, heard of at Court, or taken back by Undo.
 * Foundry is played by a Scene whose writes run the hooks as Foundry does:
 * `preUpdateTile` on the writer's client before the write, then `updateTile` on
 * every client with the options as the server sends them back.
 */

vi.mock("../../module/chat/cards.js", () => ({
	t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key),
	postCard: vi.fn(async () => ({}))
}));
vi.mock("../../module/actions/timeline-record.js", () => ({
	recordOnTrack: vi.fn(async () => null),
	recordOnTracks: vi.fn(async () => []),
	forgetEverywhere: vi.fn(async () => {}),
	keptFromPlayers: () => false,
	timelineNow: () => "1-spring"
}));
vi.mock("../../module/actions/travels.js", () => ({ travelsSources: () => ({}), playersHexView: (_scene, hex) => ({ name: `Hex ${hex.col}.${hex.row}` }) }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => null, mythEntry: () => ({ name: "The Myth", page: 40, entry: null }) }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollSpark: vi.fn() }));
// The Realm's Seat stands on no Tile, so no card is left to seat the Knights later.
vi.mock("../../module/actions/found-domain.js", () => ({ offerRulerDomain: vi.fn(), seatCourtiers: vi.fn(), seatOfPower: () => null, seatName: (seat) => seat.name }));
vi.mock("../../module/actions/wilderness.js", () => ({ findCompany: () => ({ hex: { col: 2, row: 2 } }) }));
vi.mock("../../module/rules/wilderness.js", async (importOriginal) => ({
	...(await importOriginal()),
	wildernessSituation: (realm) => ({ nearest: realm.myths })
}));

/** The Scene the hooks hear of, and what its Realm reads as. */
let scene;
const realmOf = (from) => ({
	terrain: [],
	rivers: [],
	landmarks: [],
	barriers: [],
	holdings: [{ hex: { col: 5, row: 5 }, seat: true }],
	myths: [...from.tiles.values()].map((tile) => ({ id: tile.id, ...tile.flags[SYSTEM_ID][REALM_FLAG], hex: { col: 9, row: 9 } }))
});
vi.mock("../../module/actions/realm.js", () => {
	// As the real one does: the Realm edited, and each Myth whose count changed written whole, with the options it was given.
	const write = async (target, edit, operation = {}) => {
		const realm = realmOf(target);
		const next = edit(realm, {});
		if (next === realm) return false;
		const updates = next.myths
			.filter((myth) => myth.omen !== realm.myths.find((was) => was.id === myth.id).omen)
			.map(({ id, hex: _hex, ...flag }) => ({ _id: id, flags: { [SYSTEM_ID]: { [`==${REALM_FLAG}`]: flag } } }));
		await target.updateEmbeddedDocuments("Tile", updates, { ...operation });
		return true;
	};
	return {
		isRealmScene: (candidate) => Boolean(candidate?.isRealm),
		sceneGeometry: () => ({}),
		getRealm: () => ({ realm: realmOf(scene) }),
		editRealm: vi.fn(write),
		editRealmByHand: vi.fn(write)
	};
});

const record = await import("../../module/actions/timeline-record.js");
const { markMythOmen, readOmens, writeOmens } = await import("../../module/actions/omens.js");
const { announceStart } = await import("../../module/actions/starts.js");
const { omensMet } = await import("../../module/actions/timeline-events.js");

/** @param {string} path Relative to the repository root. */
const source = (path) => readFileSync(join(import.meta.dirname, "../..", path), "utf8");

/** @param {object} update Flattened or not, with a `==` key for a flag written whole. */
function expand(update) {
	const out = {};
	for (const [path, value] of Object.entries(update)) {
		const keys = path.split(".");
		const last = keys.pop();
		let at = out;
		for (const key of keys) at = at[key] ??= {};
		at[last] = value;
	}
	return out;
}

/** Merge changes into a Tile's data, as Foundry does, a `==` key replacing whole. */
function apply(data, changes) {
	for (const [key, value] of Object.entries(changes)) {
		if (key.startsWith("==")) data[key.slice(2)] = structuredClone(value);
		else if (value && typeof value === "object") apply(data[key] ??= {}, value);
		else data[key] = value;
	}
}

/**
 * A Realm's Scene with one Tile for each Myth. Its writes run the Tile hooks,
 * on this client as the writer and on a second as somebody else.
 * @param {object[]} myths
 */
function realmScene(myths) {
	const target = { id: "s1", name: "The Vale", isRealm: true, tiles: new Map() };
	for (const { id, ...myth } of myths) target.tiles.set(id, { id, parent: target, flags: { [SYSTEM_ID]: { [REALM_FLAG]: { kind: "myth", ...myth } } } });
	target.updateEmbeddedDocuments = vi.fn(async (_type, updates, operation = {}) => {
		// Foundry hands the hooks a copy of the options, then sends what they wrote to the server and back.
		const options = { ...operation };
		const writes = updates.map(({ _id, ...update }) => [target.tiles.get(_id), expand(update)]);
		for (const [tile, changes] of writes) readOmens(tile, changes, options);
		const sent = JSON.stringify(options);
		for (const [tile, changes] of writes) apply(tile, changes);
		for (const userId of ["gm", "other"]) {
			const echoed = JSON.parse(sent);
			for (const [tile, changes] of writes) {
				game.user.id = userId;
				await writeOmens(tile, changes, echoed, "gm");
			}
		}
		game.user.id = "gm";
	});
	return target;
}

const calls = (fn) => vi.mocked(fn).mock.calls;
/** The keys of every row written, each time. */
const keysWritten = () => calls(record.recordOnTracks).flatMap(([, met]) => met.map((row) => row.key));

beforeEach(() => {
	vi.clearAllMocks();
	globalThis.game = { user: { id: "gm", isGM: true } };
	scene = realmScene([{ id: "t3", number: 3, d6: 2, d12: 7, omen: 1 }, { id: "t4", number: 4, d6: 5, d12: 1, omen: 0 }]);
});

describe("an Omen marked by the Referee", () => {
	it("writes each Omen met once, where the Company stands, on the Company's thread and the Realm's", async () => {
		expect(await markMythOmen(scene, 3, 3)).toBe(true);
		expect(calls(record.recordOnTracks)).toHaveLength(1);
		const [[targets, met]] = calls(record.recordOnTracks);
		expect(targets).toEqual(["company", scene]);
		expect(met).toEqual([
			expect.objectContaining({ source: "omen", key: "omen:s1.3.2-7:2", title: 'timeline.auto.omen {"number":3}', place: "Hex 2.2" }),
			expect.objectContaining({ source: "omen", key: "omen:s1.3.2-7:3", title: 'timeline.auto.omen {"number":3}', place: "Hex 2.2" })
		]);
	});

	it("steps from the count as it stands, takes rows back when lowered, and writes nothing that changes nothing", async () => {
		await markMythOmen(scene, 3, (myth) => myth.omen - 1);
		expect(calls(record.forgetEverywhere)).toEqual([[["omen:s1.3.2-7:1"], ["company", scene]]]);
		vi.clearAllMocks();
		expect(await markMythOmen(scene, 3, 0)).toBe(false);
		expect(await markMythOmen(scene, 9, 2)).toBe(false);
		expect(await markMythOmen({ id: "x" }, 3, 2)).toBe(false);
		expect(calls(record.recordOnTracks)).toEqual([]);
		expect(calls(record.forgetEverywhere)).toEqual([]);
	});

	it("is kept for the map's Undo when stepped in Edit this hex, still written where the Company stands", async () => {
		const { editRealm, editRealmByHand } = await import("../../module/actions/realm.js");
		expect(await markMythOmen(scene, 3, 2, { byHand: true })).toBe(true);
		expect(editRealmByHand).toHaveBeenCalledOnce();
		expect(editRealm).not.toHaveBeenCalled();
		expect(calls(record.recordOnTracks)[0][1]).toEqual([expect.objectContaining({ key: "omen:s1.3.2-7:2", place: "Hex 2.2" })]);
	});
});

describe("Undo and Redo", () => {
	/** A Realm write with no Omen context, as stepRealmHistory's is. */
	const step = (id, flag) => scene.updateEmbeddedDocuments("Tile", [{ _id: id, [`flags.${SYSTEM_ID}.==${REALM_FLAG}`]: flag }]);

	it("takes back the rows of Omens Undo unmarks, and Redo writes them again with no hex", async () => {
		await markMythOmen(scene, 3, 3);
		vi.clearAllMocks();
		await step("t3", { kind: "myth", number: 3, d6: 2, d12: 7, omen: 1 });
		expect(calls(record.forgetEverywhere)).toEqual([[["omen:s1.3.2-7:2", "omen:s1.3.2-7:3"], ["company", scene]]]);
		expect(calls(record.recordOnTracks)).toEqual([]);

		await step("t3", { kind: "myth", number: 3, d6: 2, d12: 7, omen: 3 });
		expect(keysWritten()).toEqual(["omen:s1.3.2-7:2", "omen:s1.3.2-7:3"]);
		expect(calls(record.recordOnTracks)[0][1][0].place).toBe("The Vale");
	});

	it("writes nothing for a Tile that stands for another Myth now, or that isn't a Myth's", async () => {
		await step("t3", { kind: "myth", number: 3, d6: 2, d12: 8, omen: 0 });
		scene.tiles.set("h1", { id: "h1", parent: scene, flags: { [SYSTEM_ID]: { [REALM_FLAG]: { kind: "holding", omen: 0 } } } });
		await step("h1", { kind: "holding", omen: 2 });
		expect(calls(record.recordOnTracks)).toEqual([]);
		expect(calls(record.forgetEverywhere)).toEqual([]);
	});
});

describe("the Courtier start", () => {
	it("writes the nearest Myth's first Omen as news heard at the Seat, straight to its Tile", async () => {
		vi.spyOn(Math, "random").mockReturnValue(0.9);
		await announceStart(scene, "courtier");
		vi.mocked(Math.random).mockRestore();
		expect(scene.tiles.get("t4").flags[SYSTEM_ID][REALM_FLAG].omen).toBe(1);
		expect(calls(record.recordOnTracks)).toHaveLength(1);
		const [[, met]] = calls(record.recordOnTracks);
		expect(met).toEqual([expect.objectContaining({ key: "omen:s1.4.5-1:1", title: 'timeline.auto.omenNews {"number":4}', place: "Hex 5.5" })]);
	});
});

describe("the Tile hooks", () => {
	it("write one row for one change, however many clients hear it, and once if the hook is heard again", async () => {
		const options = omensMet({ hex: { col: 1, row: 1 } });
		const tile = scene.tiles.get("t4");
		const changes = expand({ [`flags.${SYSTEM_ID}.${REALM_FLAG}.omen`]: 1 });
		readOmens(tile, changes, options);
		apply(tile, changes);
		await writeOmens(tile, changes, options, "gm");
		await writeOmens(tile, changes, options, "gm");
		expect(keysWritten()).toEqual(["omen:s1.4.5-1:1"]);
	});

	it("are registered after the Realm is forgotten, and the Realm's writes carry the Omen context while Undo's don't", () => {
		const hooks = source("module/canvas/realm-hooks.js");
		expect(hooks.indexOf(`Hooks.on("updateTile", writeOmens)`)).toBeGreaterThan(hooks.indexOf("Hooks.on(name, onDocument)"));
		expect(hooks).toContain(`Hooks.on("preUpdateTile", readOmens)`);
		const realm = source("module/actions/realm.js");
		expect(realm).toContain(`writes[step], step === "create" ? { ...operation, keepId: true } : { ...operation })`);
		expect(realm).toContain("writeRealm(scene, next, g, textures, { operation })");
		expect(realm).toMatch(/writeRealm\(scene, target, sceneGeometry\(scene\), currentRealmTextures\(scene\)\);/);
		expect(realm).not.toContain("REALM_STEPPED_HOOK");
	});
});
