import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRealm, featureAt } from "../../module/rules/realm.js";
import { hexKey, realmGeometry, sameHex } from "../../module/rules/realm-geometry.js";
import { pairPonds, placeFeature } from "../../module/rules/realm-edits.js";
import { soloRealm } from "../../module/rules/solo.js";

const g = realmGeometry();
const hex = (col, row) => ({ col, row });

/** The Realm as the Scene keeps it, and whether it's played alone. */
let realm;
let solo;

vi.mock("../../module/actions/hex-names.js", () => ({ hexLabel: (at) => hexKey(at) }));
vi.mock("../../module/actions/realm.js", () => ({
	getRealm: () => ({ realm }),
	realmUndoState: () => ({ canUndo: false, canRedo: false }),
	// Each edit lands on the Realm, as the Scene's would, and says whether anything changed.
	editRealmByHand: vi.fn(async (_scene, edit) => {
		const next = edit(realm, g);
		const changed = next !== realm;
		realm = next;
		return changed;
	})
}));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: vi.fn(), mythEntry: () => ({}), mythLookup: vi.fn(), seerEntry: () => null, withPage: (name) => name }));
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
vi.mock("../../module/actions/blog-landmarks.js", () => ({ offeredLandmarks: () => ["ruin", "pond", "bridge"] }));
vi.mock("../../module/actions/omens.js", () => ({ markMythOmen: vi.fn() }));
vi.mock("../../module/actions/solo.js", () => ({ secretsKeptOn: () => solo }));
vi.mock("../../module/apps/MythChooser.js", () => ({ openMythChooser: vi.fn() }));
vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn() }));

const { hexEditContext, writeHexField } = await import("../../module/apps/hex-edit.js");

const scene = { id: "realm" };
const pondAt = (at) => realm.landmarks.find((landmark) => sameHex(landmark.hex, at));

beforeEach(() => {
	// Ponds A and F found and paired; C found, paired with D still to be found; E found and alone.
	realm = emptyRealm(g, "ponds");
	realm.terrain.fill(8);
	for (const col of [1, 2, 3, 4, 5, 6]) realm = placeFeature(realm, g, hex(col, 5), { kind: "landmark", type: "pond" });
	realm = pairPonds(pairPonds(realm, hex(1, 5), hex(6, 5)), hex(3, 5), hex(4, 5));
	for (const col of [1, 2, 3, 4, 5, 6]) pondAt(hex(col, 5)).revealed = col !== 4;
	solo = true;
});

const context = (at) => hexEditContext({ scene, realm, known: solo ? soloRealm(realm) : realm, g, hex: at, index: null });

describe("Edit this hex, played alone, keeps an unfound Pond paired", () => {
	it("locks the type and Leads To of a Pond whose partner is still to be found", () => {
		const template = readFileSync(join(import.meta.dirname, "../../templates/apps/parts/hex-edit.hbs"), "utf8");
		expect(template).toContain('<select id="{{@root.partId}}-type" name="type" {{#if landmark.pairLocked}}disabled{{/if}}>');
		expect(template).toContain('<select id="{{@root.partId}}-pair" name="pair" {{#if landmark.pairLocked}}disabled{{/if}}>');
		expect(context(hex(3, 5)).landmark.pairLocked).toBe(true);
		expect(context(hex(5, 5)).landmark.pairLocked).toBe(false);
	});

	it("leaves a found Pond as a Pond while its partner is unfound", async () => {
		await writeHexField(scene, hex(3, 5), "type", "ruin");
		expect(featureAt(realm, hex(3, 5)).landmark.type).toBe("pond");
		expect(pondAt(hex(4, 5)).pair).toBeDefined();
		// A Pond with no hidden partner changes as any other.
		await writeHexField(scene, hex(5, 5), "type", "ruin");
		expect(featureAt(realm, hex(5, 5)).landmark.type).toBe("ruin");
	});

	it("offers no Pond in Leads To whose own partner is still to be found", () => {
		const offered = context(hex(5, 5)).landmark.pairs.map((option) => option.value);
		expect(offered).toEqual(["", "1,5", "2,5", "6,5"]);
	});

	it("offers and changes every Pond the same when not played alone", async () => {
		solo = false;
		const offered = context(hex(5, 5)).landmark.pairs.map((option) => option.value);
		expect(offered).toEqual(["", "1,5", "2,5", "3,5", "4,5", "6,5"]);
		await writeHexField(scene, hex(3, 5), "type", "ruin");
		expect(featureAt(realm, hex(3, 5)).landmark.type).toBe("ruin");
	});
});
