import { beforeEach, describe, expect, it, vi } from "vitest";
import { GUARDED_LANDMARK, emptyRealm } from "../../module/rules/realm.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";

const g = realmGeometry();
const hex = { col: 4, row: 4 };

/** The Realm as written, and which writes Undo on the map could take back. */
let realm;
const writes = [];
const write = (byHand) => vi.fn(async (_scene, edit) => {
	realm = edit(realm, g);
	writes.push({ byHand, fields: { ...realm.landmarks[0] } });
	return true;
});

vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(), t: (key) => key }));
vi.mock("../../module/actions/realm.js", () => ({
	editRealm: write(false),
	editRealmByHand: write(true),
	getRealm: () => ({ realm }),
	isRealmScene: (scene) => Boolean(scene?.realm),
	sceneGeometry: () => g
}));
vi.mock("../../module/actions/glory.js", () => ({ awardGloryTo: vi.fn(async () => true) }));
vi.mock("../../module/actions/time.js", () => ({ advancePhase: vi.fn(), chooseCompany: vi.fn(), virtueLoss: vi.fn() }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollRefereeTable: vi.fn() }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: vi.fn(), mythEntry: vi.fn(), pageNote: vi.fn() }));
vi.mock("../../module/book-art/myth-tables.js", () => ({ promptsForEntry: vi.fn() }));
vi.mock("../../module/apps/ui.js", () => ({ chooseDialog: vi.fn() }));

const { markBridgeWon } = await import("../../module/actions/landmarks.js");
const { awardGloryTo } = await import("../../module/actions/glory.js");

const scene = { id: "realm", realm: true };

beforeEach(() => {
	realm = { ...emptyRealm(g), landmarks: [{ id: "bridge", hex, type: GUARDED_LANDMARK, revealed: true }] };
	writes.length = 0;
	vi.mocked(awardGloryTo).mockClear();
	globalThis.game = { user: { isGM: true } };
});

describe("a Bridge's Knight beaten", () => {
	it("keeps the mark for Undo, but not the Glory given, so Undo can't have it given twice", async () => {
		expect(await markBridgeWon(scene, hex, true)).toBe(true);
		expect(awardGloryTo).toHaveBeenCalledWith("bridge");
		expect(writes.map(({ byHand, fields }) => [byHand, Boolean(fields.won), Boolean(fields.gloried)])).toEqual([
			[true, true, false],
			[false, true, true]
		]);
	});

	it("gives no Glory again once given, though the mark is taken off and put back", async () => {
		await markBridgeWon(scene, hex, true);
		await markBridgeWon(scene, hex, false);
		await markBridgeWon(scene, hex, true);
		expect(awardGloryTo).toHaveBeenCalledOnce();
	});
});
