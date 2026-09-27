import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyJourney, recordVisits } from "../../module/rules/journey.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";

const g = realmGeometry();
const hex = (col, row) => ({ col, row });

/** Where the Company's Token stands, and the journey that brought it there. */
let standing;
let journey;

vi.mock("../../module/chat/cards.js", () => ({
	postCard: vi.fn(),
	t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key)
}));
vi.mock("../../module/actions/realm.js", () => ({
	editRealm: vi.fn(),
	getRealm: () => ({ realm: {} }),
	isRealmScene: (scene) => Boolean(scene?.realm),
	sceneGeometry: () => g
}));
vi.mock("../../module/actions/company.js", () => ({
	companyTokenHex: () => standing,
	setCompanyHex: vi.fn(async (_scene, to) => {
		standing = to;
	})
}));
vi.mock("../../module/actions/journey.js", () => ({ getJourney: () => journey }));
// What a Hazard's other offers need is theirs to test.
vi.mock("../../module/actions/time.js", () => ({ chooseCompany: vi.fn(), virtueLoss: vi.fn() }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollRefereeTable: vi.fn() }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: vi.fn(), mythEntry: vi.fn() }));
vi.mock("../../module/book-art/myth-tables.js", () => ({ promptsForEntry: vi.fn() }));
vi.mock("../../module/apps/ui.js", () => ({ chooseDialog: vi.fn() }));

const { goBackTheWayYouCame, landmarkOfferView, takeLandmarkOffer } = await import("../../module/actions/landmarks.js");
const { setCompanyHex } = await import("../../module/actions/company.js");

const scene = { id: "realm", realm: true };

beforeEach(() => {
	standing = hex(5, 3);
	journey = recordVisits(emptyJourney(), [hex(3, 3), hex(4, 3), hex(5, 3)]);
	vi.mocked(setCompanyHex).mockClear();
	globalThis.game = { user: { isGM: true } };
	globalThis.ui = { notifications: { info: vi.fn(), warn: vi.fn() } };
});

describe("going back the way you came from a Hazard", () => {
	it("steps the Company back into the hex it came from", async () => {
		expect(await takeLandmarkOffer("goBack", { scene, hex: hex(5, 3) })).toEqual(hex(4, 3));
		expect(setCompanyHex).toHaveBeenCalledWith(scene, hex(4, 3));
		expect(ui.notifications.info).toHaveBeenCalledOnce();
	});

	it("leaves it to the Referee where the way here isn't known", async () => {
		journey = emptyJourney();
		expect(await goBackTheWayYouCame(scene)).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith("realm.landmarks.goBack.unknown");
		expect(setCompanyHex).not.toHaveBeenCalled();
	});

	it("moves only the Company's own Token, and only for a GM", async () => {
		standing = null;
		expect(await goBackTheWayYouCame(scene)).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith("realm.landmarks.goBack.noToken");
		standing = hex(5, 3);
		game.user.isGM = false;
		expect(await goBackTheWayYouCame(scene)).toBeNull();
		expect(setCompanyHex).not.toHaveBeenCalled();
	});

	it("is offered beside pushing through, on a Hazard alone", () => {
		expect(landmarkOfferView("hazard").offers.map((offer) => offer.key)).toEqual(["pushThrough", "goBack"]);
		expect(landmarkOfferView("ruin").offers.map((offer) => offer.key)).toEqual(["echoMyth"]);
		expect(landmarkOfferView("dwelling").offers).toEqual([]);
	});
});
