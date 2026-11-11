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
	courtPlacesOf,
	courtSize,
	domainRulerOf,
	dramaCandidates,
	seatHolders,
	knightPosts,
	leavePlan,
	seatPlan,
	newCourtMember,
	normalizeCourt,
	normalizeCourtMember,
	retainerChoices,
	seatHolder,
	seatOf,
	provenKnights,
	unworthyPosts,
	withProven
} from "../../module/rules/court.js";
import { COUNCIL_SEATS } from "../../module/rules/dominion.js";

const member = (role, name, extra = {}) => ({ role, name, seat: "", leverage: "", note: "", at: 1, knight: "", ...extra });

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

	it("never falls to one of the Company's Knights, though a Courtier Start seats them as Courtiers (p6)", () => {
		const knights = [{ id: "k1", name: "Sir Ash", type: "knight" }, { id: "k2", name: "Sir Rival", type: "npcKnight" }];
		const court = { a: member("courtier", "Sir Ash", { knight: "k1" }), b: member("courtier", "Sir Rival", { knight: "k2" }), c: member("retainer", "Coll") };
		expect(dramaCandidates(court, knights).map(({ name }) => name)).toEqual(["Sir Rival"]);
		// With only the Company's Knights at Court as Courtiers, it falls to anybody else there.
		const theirs = { a: member("courtier", "Sir Ash", { knight: "k1" }), c: member("retainer", "Coll") };
		expect(dramaCandidates(theirs, knights).map(({ name }) => name)).toEqual(["Coll"]);
		// Found by a name only they go by, too.
		expect(dramaCandidates({ a: member("courtier", "Sir Ash") }, knights)).toEqual([]);
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
	const knights = [{ id: "k1", name: "Moss" }, { id: "k2", name: "Brand" }];
	const system = {
		council: { [RETAINER_SEATS[0]]: "r1", [RETAINER_SEATS[1]]: "Old Name", [RETAINER_SEATS[3]]: "r2", circle: ["k1"] },
		court: {
			r1: { role: SERVES_A_SEAT, name: "Wren", seat: RETAINER_SEATS[0], at: 1 },
			r2: { role: SERVES_A_SEAT, name: "Sir Brand", at: 2, knight: "k2" }
		}
	};

	it("gives a Retainer seat its Retainer, or the name written in before the Court", () => {
		expect(seatHolders(system, RETAINER_SEATS[0], knights)).toEqual([{ id: "r1", name: "Wren", legacy: false, knight: "" }]);
		expect(seatHolders(system, RETAINER_SEATS[1], knights)).toEqual([{ id: "", name: "Old Name", legacy: true, knight: "" }]);
		expect(seatHolders(system, RETAINER_SEATS[2], knights)).toEqual([]);
	});

	it("says which Knight holds a Retainer's seat, by the place in the Court they were seated as", () => {
		expect(seatHolders(system, RETAINER_SEATS[3], knights)).toEqual([{ id: "r2", name: "Sir Brand", legacy: false, knight: "k2" }]);
	});

	it("gives the Circle its Knights", () => {
		expect(seatHolders(system, "circle", knights)).toEqual([{ id: "k1", name: "Moss", legacy: false, knight: "k1" }]);
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

describe("unworthyPosts", () => {
	const knight = (id, name, glory, extra = {}) => ({ id, name, system: { glory, ...extra } });
	const tal = knight("aaaaaaaaaaaaaaaa", "Tal", 4, { domain: "Actor.d1" });
	const moss = knight("bbbbbbbbbbbbbbbb", "Moss", 1);
	const brand = knight("cccccccccccccccc", "Brand", 2);
	const wren = knight("dddddddddddddddd", "Wren", 0, { isSquire: true });
	const knights = [tal, moss, brand, wren];

	it("names each Knight once, for the highest post they hold above their Rank (p6)", () => {
		const domain = {
			uuid: "Actor.d1",
			system: {
				ruler: "",
				seat: false,
				council: { steward: "r1", circle: [moss.id] },
				court: { r1: { role: "retainer", name: "Brand" }, c1: { role: "courtier", name: "Moss" }, p1: { role: "petitioner", name: "Wren" } }
			}
		};
		// The Council in the book's order: Brand the Steward before Moss of the Circle.
		expect(unworthyPosts(domain, knights)).toMatchObject([
			{ name: "Tal", post: "holding", rank: "tenant" },
			{ name: "Brand", post: "council", rank: "gallant" },
			{ name: "Moss", post: "council", rank: "gallant" }
		]);
	});

	it("knows a Slain Knight seated by id, so a living namesake isn't weighed in their place", () => {
		const twin = knight("eeeeeeeeeeeeeeee", "Moss", 0);
		const domain = { system: { ruler: "", council: {}, court: { c1: { role: "courtier", name: "Moss", knight: moss.id } } } };
		expect(unworthyPosts(domain, [{ ...moss, system: { ...moss.system, slain: true } }, twin])).toEqual([]);
	});

	it("weighs a name against the knighted and living alone, as the Knight's own Posts do", () => {
		const squire = knight("ffffffffffffffff", "Brand", 0, { isSquire: true });
		const domain = { system: { ruler: "", council: { steward: "r1" }, court: { r1: { role: "retainer", name: "Brand" } } } };
		expect(unworthyPosts(domain, [brand, squire])).toMatchObject([{ id: brand.id, post: "council" }]);
		expect(knightPosts(domain, brand, [brand, squire])).toEqual([expect.objectContaining({ post: "steward", member: "r1" })]);
	});

	it("knows a Courtier seated as a Knight by id, though the Knight has been renamed since", () => {
		const domain = { system: { ruler: "", seat: false, council: {}, court: { c1: { role: "courtier", name: "Moss the Green", knight: moss.id } } } };
		expect(unworthyPosts(domain, knights)).toMatchObject([{ name: "Moss", post: "court", rank: "gallant" }]);
	});

	it("weighs a Seat of Power's ruler found by name against Knight-Dominant, and passes over the worthy", () => {
		const domain = { system: { ruler: "Tal", seat: true, council: {}, court: { c1: { role: "courtier", name: "Tal" } } } };
		expect(unworthyPosts(domain, knights)).toMatchObject([{ name: "Tal", post: "seat", rank: "dominant" }]);
		expect(unworthyPosts(domain, [knight("aaaaaaaaaaaaaaaa", "Tal", 9)])).toEqual([]);
	});

	it("leaves out the slain, who face no opposition", () => {
		const domain = { system: { ruler: "", seat: false, council: {}, court: { c1: { role: "courtier", name: "Moss" } } } };
		expect(unworthyPosts(domain, [{ ...moss, system: { ...moss.system, slain: true } }])).toEqual([]);
	});

	it("leaves out Squires, a Petitioner, and names no Knight goes by", () => {
		const domain = { system: { ruler: "Wren", council: { circle: ["Somebody"] }, court: { p1: { role: "petitioner", name: "Moss" }, c1: { role: "courtier", name: "Stranger" } } } };
		expect(unworthyPosts(domain, knights)).toEqual([]);
	});

	it("says which Knight each is, and whether the Referee has ticked their worthiness proven (p6)", () => {
		const domain = { system: { ruler: "", seat: false, council: { circle: [moss.id] }, court: { c1: { role: "courtier", name: "Brand" } }, proven: [brand.id] } };
		expect(unworthyPosts(domain, knights)).toEqual([
			{ id: moss.id, name: "Moss", post: "council", rank: "gallant", proven: false },
			{ id: brand.id, name: "Brand", post: "court", rank: "gallant", proven: true }
		]);
	});
});

describe("worthiness proven (p6)", () => {
	it("keeps each Knight's id once, and nothing else", () => {
		expect(provenKnights(["a", "b", "a", "", 3, null])).toEqual(["a", "b"]);
		expect(provenKnights(undefined)).toEqual([]);
	});

	it("ticks a Knight in, or out", () => {
		expect(withProven(["a"], "b", true)).toEqual(["a", "b"]);
		expect(withProven(["a", "b"], "a", false)).toEqual(["b"]);
		expect(withProven(["a"], "a", true)).toEqual(["a"]);
		expect(withProven(null, "", true)).toEqual([]);
	});
});

describe("a Knight's own posts", () => {
	const eve = { id: "eveeveeveeveeve1", name: "Eve", system: { glory: 0 } };
	const tal = { id: "taltaltaltaltal1", name: "Tal", system: { glory: 12 } };
	const knights = [eve, tal];
	const ids = () => {
		let next = 0;
		return () => `new${++next}`;
	};
	const domain = (system = {}) => ({
		uuid: "Actor.d1",
		system: {
			ruler: "Tal",
			seat: false,
			council: { steward: "", marshal: "", sheriff: "", envoy: "", circle: [] },
			court: {},
			proven: [],
			...system
		}
	});

	describe("knightPosts", () => {
		it("finds none where the Knight holds nothing", () => {
			expect(knightPosts(domain(), eve, knights)).toEqual([]);
		});

		it("names one ruler, the Knight linked to it before one only bearing its ruler's name", () => {
			const linked = { ...eve, system: { glory: 0, domain: "Actor.d1" } };
			expect(knightPosts(domain(), linked, [linked, tal]).map((post) => post.post)).toEqual(["ruler"]);
			expect(knightPosts(domain(), tal, [linked, tal])).toEqual([]);
			expect(domainRulerOf(domain(), [linked, tal])).toBe(linked);
		});

		it("takes no Squire or Slain Knight for the ruler by name", () => {
			const slain = { ...tal, system: { glory: 12, slain: true } };
			expect(knightPosts(domain(), slain, [slain])).toEqual([]);
			expect(domainRulerOf(domain(), [slain])).toBeNull();
		});

		it("names the ruler, weighed against a Holding or the Seat of Power", () => {
			expect(knightPosts(domain(), tal, knights)).toEqual([expect.objectContaining({ post: "ruler", worth: "holding", rank: null })]);
			expect(knightPosts(domain({ seat: true, ruler: "Eve" }), eve, knights)).toEqual([expect.objectContaining({ post: "ruler", worth: "seat", rank: "dominant" })]);
		});

		it("names a seat held through the Court, by the id the Knight was seated as", () => {
			const system = { council: { steward: "r1", circle: [] }, court: { r1: member("retainer", "Old Name", { knight: eve.id }) } };
			expect(knightPosts(domain(system), eve, knights)).toEqual([
				{ post: "steward", role: "retainer", serves: "", member: "r1", worth: "council", rank: "gallant", proven: false }
			]);
		});

		it("names the Circle, and a place in the Court that holds no seat", () => {
			const system = { council: { circle: [eve.id] }, court: { c1: member("courtier", "Eve") }, proven: [eve.id] };
			expect(knightPosts(domain(system), eve, knights)).toEqual([
				expect.objectContaining({ post: "circle", worth: "council", rank: "gallant", proven: true }),
				expect.objectContaining({ post: "court", role: "courtier", member: "c1", worth: "court" })
			]);
		});

		it("asks no Rank of a Petitioner, and says which seat a Retainer serves", () => {
			const system = { court: { p1: member("petitioner", "Eve"), r1: member("retainer", "Eve", { seat: "sheriff" }) } };
			const posts = knightPosts(domain(system), { ...eve, name: "Eve" }, knights);
			expect(posts).toEqual([
				expect.objectContaining({ post: "court", role: "retainer", serves: "sheriff", worth: "court", rank: "gallant" }),
				expect.objectContaining({ post: "court", role: "petitioner", worth: "", rank: null })
			]);
		});
	});

	describe("seatPlan", () => {
		it("takes a Knight new to the Court on as a Retainer holding the seat", () => {
			const plan = seatPlan(domain().system, eve, "marshal", knights, ids(), 5);
			expect(plan.updates).toEqual({
				"system.court.new1": { role: "retainer", name: "Eve", seat: "", leverage: "", note: "", at: 5, knight: eve.id },
				"system.council.marshal": "new1"
			});
			expect(plan.joined).toEqual({ id: "new1", member: plan.updates["system.court.new1"] });
			expect(plan.unseated).toBe("");
		});

		it("makes a Courtier a Retainer, keeping what's written of them", () => {
			const court = { c1: member("courtier", "Eve", { note: "Sharp", leverage: "Debts" }) };
			const plan = seatPlan(domain({ court }).system, eve, "envoy", knights, ids(), 5);
			expect(plan.updates).toEqual({
				"system.court.c1": { role: "retainer", name: "Eve", seat: "", leverage: "Debts", note: "Sharp", at: 1, knight: eve.id },
				"system.council.envoy": "c1"
			});
			expect(plan.joined).toBeNull();
		});

		it("moves a Knight from one seat to another, and says who gave the new one up", () => {
			const court = { r1: member("retainer", "Eve", { knight: eve.id }), r2: member("retainer", "Coll") };
			const plan = seatPlan(domain({ court, council: { steward: "r1", sheriff: "r2", circle: [] } }).system, eve, "sheriff", knights, ids(), 5);
			expect(plan.updates).toEqual({ "system.council.steward": "", "system.council.sheriff": "r1" });
			expect(plan.unseated).toBe("Coll");
		});

		it("seats a Knight in the Circle, leaving any other seat", () => {
			const court = { r1: member("retainer", "Eve", { knight: eve.id }) };
			const plan = seatPlan(domain({ court, council: { steward: "r1", circle: ["Somebody"] } }).system, eve, "circle", knights, ids(), 5);
			expect(plan.updates).toEqual({ "system.council.steward": "", "system.council.circle": ["Somebody", eve.id] });
			expect(plan.circle).toBe("joined");
		});

		it("takes a Knight out of the Circle for a seat a Retainer holds", () => {
			const plan = seatPlan(domain({ council: { circle: [eve.id, tal.id] } }).system, eve, "steward", knights, ids(), 5);
			expect(plan.updates["system.council.circle"]).toEqual([tal.id]);
			expect(plan.updates["system.council.steward"]).toBe("new1");
			expect(plan.circle).toBe("left");
		});

		it("does nothing for the seat they hold already, or a seat there isn't", () => {
			const court = { r1: member("retainer", "Eve", { knight: eve.id }) };
			expect(seatPlan(domain({ court, council: { steward: "r1", circle: [] } }).system, eve, "steward", knights, ids(), 5).updates).toEqual({});
			expect(seatPlan(domain({ council: { circle: [eve.id] } }).system, eve, "circle", knights, ids(), 5).updates).toEqual({});
			expect(seatPlan(domain().system, eve, "throne", knights, ids(), 5).updates).toEqual({});
		});
	});

	describe("courtPlacesOf", () => {
		it("finds the Knight's places by the id they were seated as, or a name only they go by", () => {
			const court = {
				r1: member("retainer", "Old Name", { knight: eve.id }),
				c1: member("courtier", "Eve"),
				c2: member("courtier", "Eve", { knight: tal.id }),
				p1: member("petitioner", "Tal")
			};
			expect(courtPlacesOf(court, eve, knights).map((place) => place.id)).toEqual(["r1", "c1"]);
			expect(courtPlacesOf(court, eve, [...knights, { id: "eve2", name: "Eve" }]).map((place) => place.id)).toEqual(["r1"]);
		});
	});

	describe("leavePlan", () => {
		it("leaves the seat empty and the Court as it was", () => {
			const court = { r1: member("retainer", "Eve", { knight: eve.id }) };
			expect(leavePlan(domain({ court, council: { marshal: "r1", circle: [] } }).system, eve, knights))
				.toEqual({ updates: { "system.council.marshal": "" }, seats: ["marshal"], circle: false });
		});

		it("leaves the Circle, found by a name only they go by", () => {
			expect(leavePlan(domain({ council: { circle: ["Eve", tal.id] } }).system, eve, knights))
				.toEqual({ updates: { "system.council.circle": [tal.id] }, seats: ["circle"], circle: true });
		});

		it("finds the seats the Knight's own Posts list, a Squire of their name making them no less theirs", () => {
			const squire = { ...eve, id: "squire0000000000", system: { glory: 0, isSquire: true } };
			const system = domain({ court: { r1: member("retainer", "Eve") }, council: { marshal: "r1", circle: ["Eve"] } }).system;
			const world = [...knights, squire];
			expect(knightPosts({ system }, eve, world).map((post) => post.post)).toEqual(["marshal", "circle"]);
			expect(leavePlan(system, eve, world))
				.toEqual({ updates: { "system.council.marshal": "", "system.council.circle": [] }, seats: ["marshal", "circle"], circle: true });
			// Taking a seat reuses their place in the Court, rather than making another.
			expect(seatPlan(system, eve, "steward", world, ids(), 5).joined).toBeNull();
		});

		it("leaves only the one seat a Posts row names, the others kept", () => {
			const system = domain({ court: { r1: member("retainer", "Eve", { knight: eve.id }) }, council: { marshal: "r1", circle: ["Eve", tal.id] } }).system;
			expect(leavePlan(system, eve, knights, "circle"))
				.toEqual({ updates: { "system.council.circle": [tal.id] }, seats: ["circle"], circle: true });
			expect(leavePlan(system, eve, knights, "marshal"))
				.toEqual({ updates: { "system.council.marshal": "" }, seats: ["marshal"], circle: false });
		});

		it("has nothing to leave where they hold no seat", () => {
			expect(leavePlan(domain({ court: { c1: member("courtier", "Eve") } }).system, eve, knights).seats).toEqual([]);
		});
	});
});
