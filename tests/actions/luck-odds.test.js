import { beforeEach, describe, expect, it, vi } from "vitest";

/** What the odds question answers, what it was asked with, the d6 to roll, and the cards posted. */
let answer;
let asked;
let d6;
let posted;

vi.mock("../../module/apps/ui.js", () => ({
	chooseDialog: vi.fn(async (options) => {
		asked.push(options);
		return answer;
	})
}));
vi.mock("../../module/chat/cards.js", () => ({
	t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key),
	postCard: vi.fn(async (_actor, template, data) => posted.push({ template, data }))
}));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({}) }));

const { rollLuck } = await import("../../module/actions/referee-rolls.js");

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
	it("asks for the odds, with the table first and each stated odds naming what it needs", async () => {
		await rollLuck();
		expect(asked).toHaveLength(1);
		expect(asked[0].buttons.map(({ action }) => action)).toEqual(["table", "slim", "unlikely", "even", "likely", "high"]);
		expect(asked[0].buttons[0].default).toBe(true);
		expect(asked[0].buttons[3].label).toContain("\"needs\":4");
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
		answer = "slim";
		const rolled = await rollLuck();
		expect(rolled.favoured).toBe(true);
		expect(posted[0].data.result).toBe("refereeRolls.odds.favoured");
	});

	it("rolls on the table when that's picked", async () => {
		d6 = 1;
		answer = "table";
		const rolled = await rollLuck();
		expect(rolled).toEqual({ d6: 1, result: "crisis", side: null });
		expect(posted[0].data.result).toBe("refereeRolls.tables.luck.results.crisis {\"side\":\"\"}");
	});
});
