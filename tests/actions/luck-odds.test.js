import { beforeEach, describe, expect, it, vi } from "vitest";

/** What the odds question answers, what it was asked with, the d6 to roll, and the cards posted. */
let answer;
let asked;
let d6;
let posted;

vi.mock("../../module/apps/ui.js", () => ({
	inputDialog: vi.fn(async (options) => {
		asked.push(options);
		return answer;
	})
}));
vi.mock("../../module/chat/cards.js", () => ({
	t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key),
	postCard: vi.fn(async (_actor, template, data) => posted.push({ template, data }))
}));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({}) }));

const { openRefereeRolls, rollLuck } = await import("../../module/actions/referee-rolls.js");

beforeEach(() => {
	answer = null;
	asked = [];
	d6 = 4;
	posted = [];
	globalThis.Roll = class {
		async evaluate() {
			this.total = d6;
			return this;
		}
	};
	globalThis.game = { user: { isGM: true }, settings: { get: () => null, set: vi.fn() } };
});

describe("rollLuck", () => {
	it("asks for the odds in one pick list, the table with its results and then each stated odds naming what it needs", async () => {
		await rollLuck();
		expect(asked).toHaveLength(1);
		expect(asked[0].template).toBe("luck-odds");
		expect(asked[0].buttons).toBeUndefined();
		expect(asked[0].context.bands.map(({ d6 }) => d6)).toEqual(["1", "2–3", "4–6"]);
		expect(asked[0].context.odds.map(({ key }) => key)).toEqual(["high", "likely", "even", "unlikely", "slim"]);
		expect(asked[0].context.odds[2].label).toContain("\"needs\":4");
		expect(posted).toEqual([]);
	});

	it("reads straight 50/50 as going against the players on a 2 (p184)", async () => {
		d6 = 2;
		const rolled = await rollLuck("even");
		expect(asked).toEqual([]);
		expect(rolled).toEqual({ d6: 2, odds: "even", favoured: false, needs: 4 });
		expect(posted[0].template).toBe("referee-roll");
		expect(posted[0].data.result).toBe("refereeRolls.odds.against");
	});

	it("favours the players on a 6 at a slim chance", async () => {
		d6 = 6;
		answer = { odds: "slim" };
		const rolled = await rollLuck();
		expect(rolled.favoured).toBe(true);
		expect(posted[0].data.result).toBe("refereeRolls.odds.favoured");
	});

	it("names the odds in bold on the card, with no page link", async () => {
		await rollLuck("slim");
		expect(posted[0].data.lead).toBe("refereeRolls.odds.slim");
		expect(posted[0].data.hint).toBe("refereeRolls.odds.hint {\"needs\":6}");
		expect(posted[0].data.page).toBeUndefined();
	});

	it("rolls on the table when that's picked", async () => {
		d6 = 1;
		answer = { odds: "table" };
		const rolled = await rollLuck();
		expect(rolled).toEqual({ d6: 1, result: "crisis", side: null });
		expect(posted[0].data.result).toBe("refereeRolls.tables.luck.results.crisis {\"side\":\"\"}");
		expect(posted[0].data.page).toBeNull();
	});
});

describe("openRefereeRolls", () => {
	it("lists the tables to pick one, then asks a Luck Roll's odds in the Luck Roll's own window", async () => {
		d6 = 6;
		answer = { table: "luck", odds: "slim" };
		const rolled = await openRefereeRolls();
		expect(asked.map(({ template }) => template)).toEqual(["referee-rolls", "luck-odds"]);
		expect(asked[0].context.tables.map(({ id }) => id)).toEqual(["luck", "passage", "unresolved", "blind", "weather", "mood"]);
		expect(asked[0].context.odds).toBeUndefined();
		expect(rolled).toMatchObject({ odds: "slim", favoured: true });
	});

	it("reads the Luck Roll on its table where that's picked, and rolls nothing when closed", async () => {
		d6 = 1;
		answer = { table: "luck", odds: "table" };
		expect(await openRefereeRolls()).toEqual({ d6: 1, result: "crisis", side: null });
		answer = null;
		posted = [];
		expect(await openRefereeRolls()).toBeNull();
		expect(posted).toEqual([]);
	});
});
