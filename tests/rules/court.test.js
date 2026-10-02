import { describe, expect, it } from "vitest";
import {
	COURT_ROLES,
	DRAMA_ROLE,
	RETAINER_SEATS,
	SERVES_A_SEAT,
	circleEntries,
	circleKnights,
	councilSeatPlan,
	courtMembers,
	courtSize,
	dramaCandidates,
	seatHolders,
	newCourtMember,
	normalizeCourt,
	normalizeCourtMember,
	retainerChoices,
	seatHolder,
	seatOf
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

describe("RETAINER_SEATS", () => {
	it("holds every seat but the Circle, which is for visiting Knights", () => {
		expect(RETAINER_SEATS).toEqual(COUNCIL_SEATS.filter((seat) => seat !== "circle"));
	});
});

describe("seatHolder", () => {
	const court = { r1: member("retainer", "Coll") };

	it("finds the member of the Court a seat holds", () => {
		expect(seatHolder({ steward: "r1" }, court, "steward")).toEqual({ id: "r1", name: "Coll", legacy: false });
	});

	it("gives back a name written in before seats came from the Court", () => {
		expect(seatHolder({ steward: " Alda " }, court, "steward")).toEqual({ id: "", name: "Alda", legacy: true });
	});

	it("finds nobody in an empty seat", () => {
		expect(seatHolder({ steward: "" }, court, "steward")).toBeNull();
		expect(seatHolder(undefined, court, "steward")).toBeNull();
	});
});

describe("seatOf", () => {
	it("names the seat a member holds, or none", () => {
		const council = { steward: "r1", marshal: "r2" };
		expect(seatOf(council, "r2")).toBe("marshal");
		expect(seatOf(council, "r3")).toBe("");
		expect(seatOf(council, "")).toBe("");
	});
});

describe("retainerChoices", () => {
	const court = {
		r1: member("retainer", "Coll", { at: 1 }),
		r2: member("retainer", "Dunn", { at: 2 }),
		r3: member("retainer", "", { at: 3 }),
		c1: member("courtier", "Alda", { at: 4 })
	};

	it("offers the named Retainers who hold no other seat, marking this seat's holder", () => {
		expect(retainerChoices({ steward: "r1" }, court, "steward")).toEqual([
			{ id: "r1", name: "Coll", selected: true },
			{ id: "r2", name: "Dunn", selected: false }
		]);
	});

	it("leaves out a Retainer seated elsewhere", () => {
		expect(retainerChoices({ steward: "r1" }, court, "marshal").map(({ id }) => id)).toEqual(["r2"]);
	});

	it("offers nobody when the Court has no Retainers", () => {
		expect(retainerChoices({}, { c1: member("courtier", "Alda") }, "steward")).toEqual([]);
	});
});

describe("circleEntries", () => {
	it("reads the Circle as stored now, and as the names it once ran together", () => {
		expect(circleEntries(["k1", " k2 ", ""])).toEqual(["k1", "k2"]);
		expect(circleEntries("Moss, Brand,")).toEqual(["Moss", "Brand"]);
		expect(circleEntries(undefined)).toEqual([]);
	});
});

describe("seatHolders", () => {
	const knights = [{ id: "k1", name: "Moss" }];
	const system = {
		council: { [RETAINER_SEATS[0]]: "r1", [RETAINER_SEATS[1]]: "Old Name", circle: ["k1"] },
		court: { r1: { role: SERVES_A_SEAT, name: "Wren", seat: RETAINER_SEATS[0], at: 1 } }
	};

	it("gives a Retainer seat its Retainer, or the name written in before the Court", () => {
		expect(seatHolders(system, RETAINER_SEATS[0], knights)).toEqual([{ id: "r1", name: "Wren", legacy: false }]);
		expect(seatHolders(system, RETAINER_SEATS[1], knights)).toEqual([{ id: "", name: "Old Name", legacy: true }]);
		expect(seatHolders(system, RETAINER_SEATS[2], knights)).toEqual([]);
	});

	it("gives the Circle its Knights", () => {
		expect(seatHolders(system, "circle", knights)).toEqual([{ id: "k1", name: "Moss", legacy: false }]);
		expect(seatHolders(null, "circle", knights)).toEqual([]);
	});
});

describe("circleKnights", () => {
	const knights = [{ id: "k1", name: "Moss" }, { id: "k2", name: "Brand" }, { id: "k3", name: "Brand" }];

	it("finds each Knight by id, or by a name only one Knight goes by", () => {
		expect(circleKnights(["k2", "moss"], knights)).toEqual([
			{ id: "k2", name: "Brand", legacy: false },
			{ id: "k1", name: "Moss", legacy: false }
		]);
	});

	it("keeps a name no single Knight answers to as it was written", () => {
		expect(circleKnights("Brand, Sir Nobody", knights)).toEqual([
			{ id: "", name: "Brand", legacy: true },
			{ id: "", name: "Sir Nobody", legacy: true }
		]);
	});

	it("seats nobody twice", () => {
		expect(circleKnights(["k1", "Moss"], knights)).toHaveLength(1);
	});

	it("leaves out the id of a Knight who is gone, not taking it for a name", () => {
		expect(circleKnights(["kX3b9QpLm2Zt7aB1", "k1"], knights)).toEqual([{ id: "k1", name: "Moss", legacy: false }]);
	});
});

describe("councilSeatPlan", () => {
	const knights = [{ id: "k1", name: "Moss" }];
	let ids;
	const makeId = () => ids.shift();

	it("makes a Retainer of each name written into a seat, and seats them", () => {
		ids = ["new1"];
		const plan = councilSeatPlan({ council: { steward: "Alda", marshal: "", circle: [] }, court: {} }, knights, makeId, 100);
		expect(plan).toEqual({
			"system.court.new1": member("retainer", "Alda", { at: 100 }),
			"system.council.steward": "new1"
		});
	});

	it("seats a Retainer already going by that name rather than making another", () => {
		ids = [];
		const court = { r1: member("retainer", "alda") };
		expect(councilSeatPlan({ council: { sheriff: "Alda", circle: [] }, court }, knights, makeId, 100)).toEqual({ "system.council.sheriff": "r1" });
	});

	it("leaves a seat that already holds a member of the Court alone", () => {
		ids = [];
		const court = { r1: member("retainer", "Coll") };
		expect(councilSeatPlan({ council: { steward: "r1", circle: ["k1"] }, court }, knights, makeId, 100)).toEqual({});
	});

	it("turns the Circle's names into its Knights' ids, keeping a name no Knight has", () => {
		ids = [];
		expect(councilSeatPlan({ council: { circle: "Moss, Sir Nobody" }, court: {} }, knights, makeId, 100)).toEqual({ "system.council.circle": ["k1", "Sir Nobody"] });
	});
});
