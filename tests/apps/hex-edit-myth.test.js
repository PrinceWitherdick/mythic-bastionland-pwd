import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRealm } from "../../module/rules/realm.js";
import { hexKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { placeFeature } from "../../module/rules/realm-edits.js";
import { freshRandom } from "../../module/rules/random.js";

const g = realmGeometry();
const at = { col: 4, row: 5 };

/** The Realm as the Scene keeps it. */
let realm;

vi.mock("../../module/actions/hex-names.js", () => ({ hexLabel: (hex) => hexKey(hex) }));
vi.mock("../../module/actions/realm.js", () => ({
	getRealm: () => ({ realm }),
	realmUndoState: () => ({ canUndo: false, canRedo: false }),
	editRealmByHand: vi.fn(async (_scene, edit) => {
		// As the real one does, each edit by hand is handed a fresh die.
		const next = edit(realm, g, { random: freshRandom() });
		const changed = next !== realm;
		realm = next;
		return changed;
	})
}));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: vi.fn(), mythEntry: () => ({}), mythLookup: vi.fn(), seerEntry: () => null, withPage: (name) => name }));
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
vi.mock("../../module/actions/blog-landmarks.js", () => ({ offeredLandmarks: () => ["ruin"] }));
vi.mock("../../module/actions/omens.js", () => ({ markMythOmen: vi.fn() }));
vi.mock("../../module/actions/solo.js", () => ({ secretsKeptOn: () => false }));
vi.mock("../../module/apps/MythChooser.js", () => ({ openMythChooser: vi.fn() }));
vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn() }));

const { rollHexMyth, writeHexField } = await import("../../module/apps/hex-edit.js");

const scene = { id: "realm" };
const mythHere = () => realm.myths.find((myth) => myth.number === 2);

beforeEach(() => {
	realm = emptyRealm(g, "myths");
	realm.terrain.fill(8);
	realm = placeFeature(realm, g, at, { kind: "myth", number: 2, d6: 1, d12: 5, omen: 3, revealed: true });
});

describe("the Myth die in Edit this hex", () => {
	it("rolls a Myth the Realm hasn't got, under the same number, with none of its Omens met (p18, p27)", async () => {
		await rollHexMyth(scene, at);
		const rolled = mythHere();
		expect(`${rolled.d6}-${rolled.d12}`).not.toBe("1-5");
		expect(rolled.omen).toBe(0);
		expect(rolled.number).toBe(2);
		expect(rolled.hex).toEqual(at);
	});

	it("leaves the Omens met when a die is typed in, as a correction", async () => {
		await writeHexField(scene, at, "d12", "6");
		expect(mythHere()).toMatchObject({ d6: 1, d12: 6, omen: 3 });
	});
});
