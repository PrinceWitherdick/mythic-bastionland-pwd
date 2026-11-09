import { beforeEach, describe, expect, it, vi } from "vitest";

/** The new Season's card names each resolved Myth owed a replacement (p27): played alone, never one not yet met. */

vi.mock("../../module/apps/ui.js", () => ({ chooseDialog: vi.fn(), inputDialog: vi.fn() }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => null, mythEntry: (_index, myth) => ({ name: `The Myth of ${myth.number}` }) }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => null), t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));
vi.mock("../../module/actions/calendar.js", () => ({ calendarLabel: () => "", getCalendar: () => ({ age: 1, year: 1, season: "spring" }), setCalendar: vi.fn() }));
vi.mock("../../module/actions/dominion.js", () => ({ settleDomains: vi.fn(), worldDomains: () => [] }));
vi.mock("../../module/actions/council-tasks.js", () => ({ tasksDueNotices: () => [] }));
vi.mock("../../module/actions/knight-tables.js", () => ({ tableRenewalNotices: () => [] }));
vi.mock("../../module/actions/time-capture.js", () => ({ captureAdvance: vi.fn(), currentAdvanceId: () => null }));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineAged: vi.fn(), timelineSeasonTurn: vi.fn() }));
/** The Realm the Scene holds, and which Myths are resolved in its notes. */
let realm;
vi.mock("../../module/actions/realm.js", () => ({ getRealm: () => ({ realm }), isRealmScene: (scene) => Boolean(scene?.realm) }));
vi.mock("../../module/actions/myth-notes.js", async () => {
	const { mythRoll } = await import("../../module/rules/myth-notes.js");
	// Both of the Realm's Myths are resolved, each note kept against its roll.
	return { getMythNotes: () => ({ version: 1, myths: Object.fromEntries(realm.myths.map((myth) => [myth.number, { note: "", resolved: true, roll: mythRoll(myth) }])) }) };
});
let solo = false;
vi.mock("../../module/actions/solo.js", async () => {
	const { mythKnown } = await import("../../module/rules/solo.js");
	return { mythKeptFromMe: (myth) => Boolean(myth) && solo && !mythKnown(myth) };
});

const { announceSeason } = await import("../../module/actions/time.js");
const { postCard } = await import("../../module/chat/cards.js");

const scene = { id: "realm", realm: true };

beforeEach(() => {
	vi.clearAllMocks();
	solo = false;
	realm = {
		myths: [
			{ id: "m2", number: 2, hex: { col: 2, row: 2 }, d6: 1, d12: 2, omen: 3, revealed: true },
			{ id: "m5", number: 5, hex: { col: 5, row: 5 }, d6: 1, d12: 5, omen: 0, revealed: false }
		]
	};
	globalThis.game = { scenes: [scene], user: { isGM: true } };
});

const seasonCard = async () => {
	await announceSeason({ age: 1, year: 1, season: "spring" }, { title: "Spring", entries: [] });
	return vi.mocked(postCard).mock.calls.at(-1)[2];
};

describe("the new Season's resolved Myths", () => {
	it("names every resolved Myth with others at the table", async () => {
		const card = await seasonCard();
		expect(card.replaceMyths.map(({ number, name }) => [number, name])).toEqual([[2, "The Myth of 2"], [5, "The Myth of 5"]]);
	});

	it("names no Myth the Company never met, played alone, though it was resolved", async () => {
		solo = true;
		const card = await seasonCard();
		expect(card.replaceMyths.map(({ number, name }) => [number, name])).toEqual([[2, "The Myth of 2"], [5, "solo.unknownMyth"]]);
		expect(card.due.join(" ")).not.toContain("The Myth of 5");
		expect(card.replaceMyths[1].label).not.toContain("The Myth of 5");
	});
});
