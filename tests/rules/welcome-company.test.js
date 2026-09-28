import { describe, expect, it } from "vitest";
import {
	COMPANY_MAX,
	COMPANY_MIN,
	clampCompany,
	pairKnights,
	playersAwaitingKnights,
	suggestedCompany,
	unchosenNames
} from "../../module/rules/welcome-company.js";

const users = [
	{ id: "gm", isGM: true, active: true },
	{ id: "ann", isGM: false, active: true },
	{ id: "bob", isGM: false, active: false },
	{ id: "cat", isGM: false, active: true },
	{ id: "dan", isGM: false, active: true }
];

describe("the Welcome's Company", () => {
	it("holds the count between one and twelve, in whole Knights", () => {
		expect(clampCompany(0)).toBe(COMPANY_MIN);
		expect(clampCompany(-3)).toBe(COMPANY_MIN);
		expect(clampCompany(99)).toBe(COMPANY_MAX);
		expect(clampCompany(3.4)).toBe(3);
		expect(clampCompany("4")).toBe(4);
		expect(clampCompany(NaN)).toBe(COMPANY_MIN);
	});

	it("waits on the players signed in who hold no Knight, never a GM", () => {
		const waiting = playersAwaitingKnights(users, new Set(["dan"]));
		expect(waiting.map((user) => user.id)).toEqual(["ann", "cat"]);
	});

	it("suggests a Knight per player waiting, and one when nobody is on", () => {
		expect(suggestedCompany(3)).toBe(3);
		expect(suggestedCompany(0)).toBe(1);
		expect(suggestedCompany(40)).toBe(COMPANY_MAX);
	});

	it("names each Knight for the player they go to, and the rest as Create Actor would", () => {
		const players = [{ name: "Ann" }, { name: "Cat" }];
		expect(unchosenNames(3, players, "Knight", [])).toEqual(["Ann", "Cat", "Knight"]);
		expect(unchosenNames(1, players, "Knight", [])).toEqual(["Ann"]);
		expect(unchosenNames(0, players, "Knight", [])).toEqual([]);
	});

	it("numbers a name already taken, as Foundry does", () => {
		expect(unchosenNames(3, [], "Knight", [])).toEqual(["Knight", "Knight (2)", "Knight (3)"]);
		expect(unchosenNames(2, [], "Knight", ["Knight", "Knight (3)"])).toEqual(["Knight (2)", "Knight (4)"]);
		expect(unchosenNames(2, [{ name: "Ann" }, { name: "Ann" }], "Knight", ["Ann"])).toEqual(["Ann (2)", "Ann (3)"]);
	});

	it("falls back on the stand-in for a player with a blank name", () => {
		expect(unchosenNames(1, [{ name: "  " }], "Knight", [])).toEqual(["Knight"]);
	});

	it("gives each player one Knight, and leaves the rest to nobody yet", () => {
		const pairs = pairKnights(["k1", "k2", "k3"], [{ id: "ann" }, { id: "cat" }]);
		expect(pairs).toEqual([
			{ knight: "k1", userId: "ann" },
			{ knight: "k2", userId: "cat" },
			{ knight: "k3", userId: "" }
		]);
		expect(pairKnights(["k1"], [{ id: "ann" }, { id: "cat" }])).toEqual([{ knight: "k1", userId: "ann" }]);
	});
});
