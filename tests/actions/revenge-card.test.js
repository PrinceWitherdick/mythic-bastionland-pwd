import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => ({})), t: (key) => key }));
vi.mock("../../module/actions/knights.js", () => ({ worldKnights: vi.fn(() => []) }));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({}) }));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineScar: vi.fn(), timelineScarSettled: vi.fn() }));
vi.mock("../../module/rules/scars.js", async (importOriginal) => ({ ...(await importOriginal()), awaitsRevengeOn: () => true }));

const { postCard } = await import("../../module/chat/cards.js");
const { worldKnights } = await import("../../module/actions/knights.js");
const { offerRevenge } = await import("../../module/actions/scars.js");

afterEach(() => {
	vi.clearAllMocks();
});

describe("a revenge card (players' audit)", () => {
	it("is posted for all to see, so a Referee rolling privately doesn't hide its button from the Knight's player", async () => {
		const scar = { uuid: "Actor.kay.Item.s1", type: "scar", name: "Humiliation", system: {} };
		const kay = { name: "Ser Kay", items: [scar] };
		scar.parent = kay;
		worldKnights.mockReturnValue([kay]);
		await offerRevenge({ uuid: "Actor.wolf", name: "The Wolf" });
		expect(postCard).toHaveBeenCalledWith(kay, "revenge", expect.anything(), { mode: "public" });
	});
});
