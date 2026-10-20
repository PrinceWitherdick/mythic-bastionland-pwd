import { beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

/**
 * A Courtier Start made before the Knights (p6) whispers the Referee a card
 * whose button seats them at the Seat's Court once they're made.
 */

/** The cards posted, the card buttons registered, and what seating gives back. */
let posted;
let buttons;
let seated;

vi.mock("../../module/chat/cards.js", () => ({
	t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key),
	postCard: vi.fn(async (_actor, template, data, options) => posted.push({ template, data, options })),
	registerCardButtons: (options) => buttons.push(options),
	warn: vi.fn()
}));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => null, mythEntry: () => ({}) }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollSpark: vi.fn() }));
vi.mock("../../module/actions/timeline-events.js", () => ({ omensMet: () => ({}) }));
vi.mock("../../module/actions/found-domain.js", () => ({
	offerRulerDomain: vi.fn(),
	seatCourtiers: vi.fn(async () => seated),
	seatOfPower: () => holdings.find((holding) => holding.seat && holding.id) ?? null,
	seatName: (seat) => seat.name
}));

/** The Realm's Holdings, its Seat of Power first. */
let holdings;
vi.mock("../../module/actions/realm.js", () => ({
	isRealmScene: (scene) => Boolean(scene?.isRealm),
	sceneGeometry: () => ({}),
	getRealm: () => ({ realm: { holdings, myths: [] } })
}));

const { announceStart, registerSeatingLater } = await import("../../module/actions/starts.js");
const { seatCourtiers } = await import("../../module/actions/found-domain.js");
const { warn } = await import("../../module/chat/cards.js");

const scene = { id: "s1", isRealm: true };

beforeEach(() => {
	posted = [];
	buttons = [];
	seated = null;
	holdings = [{ id: "h0", name: "High Keep", hex: { col: 1, row: 1 }, seat: true }];
	vi.mocked(seatCourtiers).mockClear();
	vi.mocked(warn).mockClear();
	globalThis.game = { user: { isGM: true }, scenes: { get: (id) => (id === "s1" ? scene : null) } };
});

describe("a Courtier Start made before the Knights", () => {
	it("whispers the Referee a card to seat them later, naming the Seat and remembering the Realm", async () => {
		await announceStart(scene, "courtier");
		expect(posted).toHaveLength(1);
		expect(posted[0].template).toBe("note");
		expect(posted[0].data.action).toMatchObject({ data: "seat-courtiers" });
		expect(posted[0].data.text).toContain("High Keep");
		expect(posted[0].options).toMatchObject({ mode: "gm", flags: { [SYSTEM_ID]: { seatCourtiers: "s1" } } });
	});

	it("posts no card once the Knights are seated, or in a Realm with no Seat", async () => {
		seated = { name: "High Keep" };
		await announceStart(scene, "courtier");
		seated = null;
		holdings = [{ id: "h1", name: "Mill", hex: { col: 2, row: 2 }, seat: false }];
		await announceStart(scene, "courtier");
		expect(posted).toEqual([]);
	});

	it("seats them from the card's button, for the Referee alone, and says so when there's still nobody", async () => {
		registerSeatingLater();
		expect(buttons).toHaveLength(1);
		expect(buttons[0]).toMatchObject({ selector: "[data-seat-courtiers]", gmOnly: true });
		const message = { flags: { [SYSTEM_ID]: { seatCourtiers: "s1" } } };
		seated = { name: "High Keep" };
		expect(await buttons[0].handler(null, message)).toBe(seated);
		expect(vi.mocked(seatCourtiers)).toHaveBeenCalledWith(scene);
		seated = null;
		await buttons[0].handler(null, message);
		expect(vi.mocked(warn)).toHaveBeenCalledWith("company.starts.courtier.noKnights");
		await buttons[0].handler(null, { flags: { [SYSTEM_ID]: { seatCourtiers: "gone" } } });
		expect(vi.mocked(warn)).toHaveBeenCalledWith("company.starts.courtier.realmGone");
		// A Seat taken off the map isn't mistaken for there being no Knights.
		holdings = [];
		vi.mocked(seatCourtiers).mockClear();
		await buttons[0].handler(null, message);
		expect(vi.mocked(warn)).toHaveBeenLastCalledWith("company.starts.courtier.seatGone");
		expect(vi.mocked(seatCourtiers)).not.toHaveBeenCalled();
	});
});
