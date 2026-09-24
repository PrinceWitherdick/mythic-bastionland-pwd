import { describe, expect, it } from "vitest";
import {
	COURT_ROLES,
	DRAMA_ROLE,
	SERVES_A_SEAT,
	courtByRole,
	courtMembers,
	courtSize,
	dramaCandidates,
	newCourtMember,
	normalizeCourt,
	normalizeCourtMember
} from "../../module/rules/court.js";
import { COUNCIL_SEATS } from "../../module/rules/dominion.js";

const member = (role, name, extra = {}) => ({ role, name, seat: "", leverage: "", note: "", at: 1, ...extra });

describe("COURT_ROLES", () => {
	it("holds the four the book lists, in its order", () => {
		expect(COURT_ROLES).toEqual(["retainer", "courtier", "petitioner", "seer"]);
	});

	it("takes the drama to the Courtiers, and the seat to the Retainers", () => {
		expect(COURT_ROLES).toContain(DRAMA_ROLE);
		expect(COURT_ROLES).toContain(SERVES_A_SEAT);
		expect(DRAMA_ROLE).toBe("courtier");
		expect(SERVES_A_SEAT).toBe("retainer");
	});
});

describe("normalizeCourtMember", () => {
	it("refuses anything without one of the Court's roles", () => {
		expect(normalizeCourtMember(null)).toBeNull();
		expect(normalizeCourtMember({ name: "Alda" })).toBeNull();
		expect(normalizeCourtMember({ role: "steward", name: "Alda" })).toBeNull();
	});

	it("keeps a member who hasn't been named yet, since a row is added before it's filled", () => {
		expect(normalizeCourtMember({ role: "courtier" })).toEqual(member("courtier", "", { at: 0 }));
	});

	it("trims what was typed", () => {
		expect(normalizeCourtMember({ role: "seer", name: "  The Salt Seer  ", note: " Sent an acolyte " }))
			.toMatchObject({ name: "The Salt Seer", note: "Sent an acolyte" });
	});

	it("gives a Retainer the Council seat they serve, and refuses one that isn't a seat", () => {
		expect(normalizeCourtMember({ role: "retainer", seat: COUNCIL_SEATS[0] }).seat).toBe(COUNCIL_SEATS[0]);
		expect(normalizeCourtMember({ role: "retainer", seat: "cook" }).seat).toBe("");
	});

	it("gives no seat to anybody but a Retainer, since only they are taken on by a Council member", () => {
		expect(normalizeCourtMember({ role: "courtier", seat: "steward" }).seat).toBe("");
		expect(normalizeCourtMember({ role: "seer", seat: "envoy" }).seat).toBe("");
	});
});

describe("normalizeCourt", () => {
	it("reads nothing stored as an empty Court", () => {
		expect(normalizeCourt(undefined)).toEqual({});
		expect(normalizeCourt("nobody")).toEqual({});
	});

	it("drops whoever doesn't belong to the Court and keeps the rest", () => {
		const court = normalizeCourt({ a: { role: "courtier", name: "Alda" }, b: { role: "knight", name: "Sir Tam" } });
		expect(Object.keys(court)).toEqual(["a"]);
	});
});

describe("courtMembers", () => {
	it("lists them by role in book order, then in the order they joined", () => {
		const court = {
			c: member("seer", "The Salt Seer", { at: 1 }),
			a: member("courtier", "Alda", { at: 3 }),
			b: member("courtier", "Bryn", { at: 2 }),
			d: member("retainer", "Coll", { at: 9 })
		};
		expect(courtMembers(court).map(({ name }) => name)).toEqual(["Coll", "Bryn", "Alda", "The Salt Seer"]);
	});

	it("settles two who joined at the same moment by id, so the list never shuffles", () => {
		const court = { z: member("courtier", "Zeb"), a: member("courtier", "Alda") };
		expect(courtMembers(court).map(({ name }) => name)).toEqual(["Alda", "Zeb"]);
	});

	it("counts the Court", () => {
		expect(courtSize({ a: member("courtier", "Alda"), b: member("seer", "") })).toBe(2);
		expect(courtSize({})).toBe(0);
	});
});

describe("courtByRole", () => {
	it("shows every role, even one nobody fills", () => {
		const view = courtByRole({ a: member("petitioner", "Wyn") });
		expect(view.map(({ role }) => role)).toEqual([...COURT_ROLES]);
		expect(view.find(({ role }) => role === "petitioner").members.map(({ name }) => name)).toEqual(["Wyn"]);
		expect(view.find(({ role }) => role === "courtier").members).toEqual([]);
	});
});

describe("newCourtMember", () => {
	it("joins the Court unnamed, at the moment given", () => {
		expect(newCourtMember("courtier", 500)).toEqual(member("courtier", "", { at: 500 }));
	});

	it("gives nothing for a role the Court doesn't have", () => {
		expect(newCourtMember("marshal", 1)).toBeNull();
	});
});

describe("dramaCandidates", () => {
	it("falls to the Courtiers, who the book says breed the problems", () => {
		const court = { a: member("courtier", "Alda"), b: member("seer", "The Salt Seer"), c: member("retainer", "Coll") };
		expect(dramaCandidates(court).map(({ name }) => name)).toEqual(["Alda"]);
	});

	it("falls to anybody in the Court where no Courtier serves", () => {
		const court = { b: member("seer", "The Salt Seer", { at: 2 }), c: member("retainer", "Coll", { at: 1 }) };
		expect(dramaCandidates(court).map(({ name }) => name)).toEqual(["Coll", "The Salt Seer"]);
	});

	it("passes over rows nobody has named yet", () => {
		const court = { a: member("courtier", ""), b: member("seer", "The Salt Seer") };
		expect(dramaCandidates(court).map(({ name }) => name)).toEqual(["The Salt Seer"]);
	});

	it("finds nobody in an empty Court", () => {
		expect(dramaCandidates({})).toEqual([]);
		expect(dramaCandidates({ a: member("courtier", "") })).toEqual([]);
	});
});
