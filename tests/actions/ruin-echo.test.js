import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRealm } from "../../module/rules/realm.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";

/**
 * A Ruin hints at a Myth the Realm isn't playing out now, which may come back
 * (p14). One the group resolved is over, so a Ruin may echo it; one still
 * being played out it never does.
 */

const g = realmGeometry();
let realm;
/** The Myth numbers the group has resolved. */
let resolved;

vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(), t: (key) => key }));
vi.mock("../../module/actions/realm.js", () => ({
	editRealm: vi.fn(async (_scene, edit) => {
		realm = edit(realm, g);
	}),
	editRealmByHand: vi.fn(),
	getRealm: () => ({ realm }),
	isRealmScene: () => true,
	sceneGeometry: () => g
}));
vi.mock("../../module/actions/myth-notes.js", () => ({
	liveRealm: (_scene, whole) => ({ ...whole, myths: whole.myths.filter((myth) => !resolved.includes(myth.number)) })
}));
vi.mock("../../module/actions/gm-toolkit.js", () => ({ rollFreeMyth: vi.fn(async () => ({ d6: 6, d12: 12, rolls: [] })) }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => ({}), mythEntry: () => ({ name: "A Myth" }), pageNote: () => "" }));
vi.mock("../../module/book-art/myth-tables.js", () => ({ promptsForEntry: async () => [] }));
vi.mock("../../module/actions/book-flip.js", () => ({ throwSpread: vi.fn() }));
vi.mock("../../module/actions/company.js", () => ({ companyTokenHex: vi.fn(), setCompanyHex: vi.fn() }));
vi.mock("../../module/actions/journey.js", () => ({ getJourney: vi.fn() }));
vi.mock("../../module/actions/time.js", () => ({ advancePhase: vi.fn(), chooseCompany: vi.fn(), virtueLoss: vi.fn() }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollRefereeTable: vi.fn() }));
vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn() }));

const { echoRuin } = await import("../../module/actions/landmarks.js");
const { rollFreeMyth } = await import("../../module/actions/gm-toolkit.js");

const at = { col: 4, row: 4 };

beforeEach(() => {
	realm = emptyRealm(g);
	realm.myths = [
		{ id: "m1", number: 1, hex: { col: 1, row: 1 }, d6: 2, d12: 3, omen: 6 },
		{ id: "m2", number: 2, hex: { col: 9, row: 9 }, d6: 4, d12: 5, omen: 1 }
	];
	realm.landmarks = [{ id: "r", type: "ruin", hex: at, name: "", seer: null, revealed: true }];
	resolved = [1];
	vi.mocked(rollFreeMyth).mockClear();
	globalThis.game = { user: { isGM: true } };
});

describe("a Ruin's echo", () => {
	it("is rolled against the Myths still active, so a resolved one may come up (p14)", async () => {
		await echoRuin({ id: "s" }, at);
		const [[against]] = vi.mocked(rollFreeMyth).mock.calls;
		expect(against.myths.map((myth) => myth.number)).toEqual([2]);
		expect(realm.landmarks[0].echo).toEqual({ d6: 6, d12: 12 });
	});

	it("keeps the Myth it echoes once rolled", async () => {
		realm.landmarks[0].echo = { d6: 2, d12: 3 };
		const echo = await echoRuin({ id: "s" }, at);
		expect(rollFreeMyth).not.toHaveBeenCalled();
		expect(echo).toMatchObject({ d6: 2, d12: 3 });
	});
});
