import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRealm } from "../../module/rules/realm.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";

/**
 * What a Landmark offers, taken up from its card or the hex window (p14): a
 * Monument restores SPI and a Hazard costs d6 of a Virtue to everybody who takes
 * part, steeds and followers among them; a card's button only works while its
 * Landmark is still there; and a Ruin's kept Myth gives way once that Myth comes
 * into the Realm.
 */

const g = realmGeometry();
let realm;

vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(), t: (key) => key }));
vi.mock("../../module/actions/realm.js", () => ({
	editRealm: vi.fn(async (_scene, edit) => {
		realm = edit(realm, g);
	}),
	editRealmByHand: vi.fn(),
	getRealm: () => ({ realm }),
	isRealmScene: (scene) => Boolean(scene),
	sceneGeometry: () => g
}));
vi.mock("../../module/actions/myth-notes.js", () => ({ liveRealm: (_scene, whole) => whole }));
vi.mock("../../module/actions/gm-toolkit.js", () => ({ rollFreeMyth: vi.fn(async () => ({ d6: 6, d12: 12, rolls: [] })) }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => ({}), mythEntry: () => ({ name: "A Myth" }), pageNote: () => "" }));
vi.mock("../../module/book-art/myth-tables.js", () => ({ promptsForEntry: async () => [] }));
vi.mock("../../module/actions/book-flip.js", () => ({ throwSpread: vi.fn() }));
vi.mock("../../module/actions/company.js", () => ({ companyTokenHex: vi.fn(), setCompanyHex: vi.fn() }));
vi.mock("../../module/actions/journey.js", () => ({ getJourney: vi.fn() }));
vi.mock("../../module/actions/time.js", () => ({ advancePhase: vi.fn(), chooseCompany: vi.fn(), virtueLoss: vi.fn(async () => []) }));
vi.mock("../../module/actions/recovery.js", () => ({ restoreVirtueOfEach: vi.fn(async () => []) }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollRefereeTable: vi.fn() }));
vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn() }));

const { echoRuin, pushThroughHazard, restoreAtMonument, takeLandmarkOffer } = await import("../../module/actions/landmarks.js");
const { rollFreeMyth } = await import("../../module/actions/gm-toolkit.js");
const { chooseCompany, virtueLoss } = await import("../../module/actions/time.js");
const { restoreVirtueOfEach } = await import("../../module/actions/recovery.js");
const { inputDialog } = await import("../../module/apps/ui.js");

const at = { col: 4, row: 4 };
const scene = { id: "s" };
const knight = { name: "Knight" };
const steed = { name: "Steed" };
const warn = vi.fn();

const landmark = (type, extra = {}) => ({ id: "l", type, hex: at, name: "", seer: null, revealed: true, ...extra });

beforeEach(() => {
	realm = emptyRealm(g);
	realm.myths = [{ id: "m1", number: 1, hex: { col: 1, row: 1 }, d6: 2, d12: 3, omen: 1 }];
	vi.clearAllMocks();
	vi.mocked(chooseCompany).mockResolvedValue([{ actor: knight }, { actor: steed }]);
	globalThis.game = { user: { isGM: true } };
	globalThis.ui = { notifications: { warn, info: vi.fn() } };
});

describe("a Monument", () => {
	it("offers steeds and followers too, and restores SPI to all who take part", async () => {
		await restoreAtMonument();
		expect(vi.mocked(chooseCompany).mock.calls[0][0]).toMatchObject({ companions: true });
		expect(restoreVirtueOfEach).toHaveBeenCalledWith([knight, steed], "spi", "landmark");
	});
});

describe("pushing through a Hazard", () => {
	it("asks for the Virtue from a list with VIG first, then costs it to all who push through", async () => {
		vi.mocked(inputDialog).mockResolvedValue({ virtue: "cla" });
		await pushThroughHazard();
		const [[asked]] = vi.mocked(inputDialog).mock.calls;
		expect(asked.template).toBe("virtue-pick");
		expect(asked.context.virtues.map((each) => each.id)).toEqual(["vig", "cla", "spi"]);
		expect(vi.mocked(chooseCompany).mock.calls[0][0]).toMatchObject({ companions: true });
		expect(vi.mocked(virtueLoss).mock.calls[0].slice(0, 2)).toEqual([[knight, steed], "cla"]);
	});

	it("does nothing when the list is closed", async () => {
		vi.mocked(inputDialog).mockResolvedValue(null);
		expect(await pushThroughHazard()).toBeNull();
		expect(chooseCompany).not.toHaveBeenCalled();
	});
});

describe("a card's Landmark button", () => {
	it("works while that Landmark still offers it", async () => {
		realm.landmarks = [landmark("monument")];
		await takeLandmarkOffer("restoreSpirit", { scene, hex: at });
		expect(restoreVirtueOfEach).toHaveBeenCalled();
		expect(warn).not.toHaveBeenCalled();
	});

	it("is refused once the Landmark is taken away", async () => {
		realm.landmarks = [];
		expect(await takeLandmarkOffer("restoreSpirit", { scene, hex: at })).toBeNull();
		expect(chooseCompany).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledWith("realm.landmarks.offerGone");
	});

	it("is refused once the Landmark has become another kind", async () => {
		realm.landmarks = [landmark("dwelling", { echo: { d6: 5, d12: 5 } })];
		expect(await takeLandmarkOffer("echoMyth", { scene, hex: at })).toBeNull();
		expect(rollFreeMyth).not.toHaveBeenCalled();
	});

	it("still offers a Hazard's way back", async () => {
		realm.landmarks = [landmark("hazard")];
		await takeLandmarkOffer("goBack", { scene, hex: at });
		expect(warn).not.toHaveBeenCalledWith("realm.landmarks.offerGone");
	});
});

describe("a Ruin's kept echo", () => {
	it("gives way to a new one once its Myth has come into the Realm (p14)", async () => {
		realm.landmarks = [landmark("ruin", { echo: { d6: 2, d12: 3 } })];
		const echo = await echoRuin(scene, at);
		expect(rollFreeMyth).toHaveBeenCalled();
		expect(echo).toMatchObject({ d6: 6, d12: 12 });
		expect(realm.landmarks[0].echo).toEqual({ d6: 6, d12: 12 });
	});

	it("stands while its Myth is still away", async () => {
		realm.landmarks = [landmark("ruin", { echo: { d6: 5, d12: 5 } })];
		expect(await echoRuin(scene, at)).toMatchObject({ d6: 5, d12: 5 });
		expect(rollFreeMyth).not.toHaveBeenCalled();
	});
});
