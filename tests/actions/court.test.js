import { beforeEach, describe, expect, it, vi } from "vitest";

/** What the windows answer, what they were asked, and every update made. */
let formData;
let confirmed;
let asked;
let updates;

vi.mock("../../module/apps/ui.js", () => ({
	inputDialog: vi.fn(async (options) => {
		asked.push(options);
		return formData;
	}),
	confirmDialog: vi.fn(async (options) => {
		asked.push(options);
		return confirmed;
	})
}));
vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineCircle: vi.fn(), timelineCourtJoined: vi.fn(), timelineCourtLeft: vi.fn() }));

const { addCourtMember, editCourtMember, removeCourtMember, removeFromCourt, seatCircle, seatCouncilRetainers, takeIntoCourt } = await import("../../module/actions/court.js");
const timeline = await import("../../module/actions/timeline-events.js");

const member = (role, name, extra = {}) => ({ role, name, seat: "", leverage: "", note: "", at: 1, knight: "", ...extra });

/** A Domain with Coll, a Retainer, as its Steward. */
function fakeDomain(system = {}) {
	return {
		id: "d1",
		name: "Bramblewatch",
		type: "domain",
		isOwner: true,
		system: {
			ruler: "Tal",
			council: { steward: "r1", marshal: "", sheriff: "", envoy: "", circle: [] },
			court: { r1: member("retainer", "Coll"), c1: member("courtier", "Alda") },
			...system
		},
		update: vi.fn(async (changes) => updates.push(changes))
	};
}

/** A Knight, seen by a player only when given Limited or better. */
const knight = (id, name, { type = "knight", seen = true } = {}) => ({ id, name, type, visible: seen });

/** @returns {Actor[]} The world's Actors, looked up by id as Foundry's collection is. */
const actors = (...list) => Object.assign(list, { get: (id) => list.find((actor) => actor.id === id) });

beforeEach(() => {
	vi.clearAllMocks();
	formData = null;
	confirmed = true;
	asked = [];
	updates = [];
	globalThis.game = { user: { isGM: true }, actors: actors(knight("k1", "Tal"), knight("k2", "Moss")) };
	globalThis.ui = { notifications: { warn: vi.fn() } };
	let next = 0;
	globalThis.foundry = { utils: {
		randomID: () => `new${++next}`,
		expandObject: (data) => {
			const out = {};
			for (const [key, value] of Object.entries(data)) {
				const [head, tail] = key.split(".");
				if (tail) (out[head] ??= {})[tail] = value;
				else out[head] = value;
			}
			return out;
		}
	} };
});

describe("takeIntoCourt", () => {
	it("asks who they are before anybody joins, and takes them in", async () => {
		formData = { role: "petitioner", name: " Anne ", seat: "", leverage: "", note: "Asks for justice" };
		const domain = fakeDomain();
		expect(await takeIntoCourt(domain)).toBe("new1");
		expect(updates).toHaveLength(1);
		expect(updates[0]["system.court.new1"]).toMatchObject({ role: "petitioner", name: "Anne", note: "Asks for justice" });
	});

	it("takes nobody in without a name, and says why", async () => {
		formData = { role: "retainer", name: "  ", seat: "", leverage: "", note: "" };
		expect(await takeIntoCourt(fakeDomain())).toBeNull();
		expect(updates).toEqual([]);
		expect(ui.notifications.warn).toHaveBeenCalledWith("domain.court.nameNeeded");
	});

	it("takes nobody in when the window is closed", async () => {
		expect(await takeIntoCourt(fakeDomain())).toBeNull();
		expect(updates).toEqual([]);
	});
});

describe("editCourtMember", () => {
	it("writes what the window says of them", async () => {
		formData = { role: "courtier", name: "Alda", leverage: "The old lord's letters", note: "" };
		expect(await editCourtMember(fakeDomain(), "c1")).toBe(true);
		expect(updates[0]).toEqual({ "system.court.c1": member("courtier", "Alda", { leverage: "The old lord's letters" }) });
	});

	it("says a seated Retainer holds their seat rather than asking whom they serve", async () => {
		formData = { role: "retainer", name: "Coll", leverage: "", note: "" };
		await editCourtMember(fakeDomain(), "r1");
		expect(asked[0].context.holdsSeat).toContain("domain.council.steward.label");
		expect(updates[0]).toEqual({ "system.court.r1": member("retainer", "Coll") });
	});

	it("keeps the Knight a member was seated as while their name stands, and lets go once they're renamed as somebody else", async () => {
		const court = { c1: member("courtier", "Tal", { knight: "k1" }) };
		formData = { role: "courtier", name: "tal", leverage: "", note: "A favourite" };
		await editCourtMember(fakeDomain({ court }), "c1");
		expect(updates[0]["system.court.c1"].knight).toBe("k1");
		formData = { role: "courtier", name: "Alda", leverage: "", note: "" };
		await editCourtMember(fakeDomain({ court }), "c1");
		expect(updates[1]["system.court.c1"].knight).toBe("");
	});

	it("gives up the seat of a Retainer made anything else", async () => {
		formData = { role: "courtier", name: "Coll", leverage: "", note: "" };
		await editCourtMember(fakeDomain(), "r1");
		expect(updates[0]).toEqual({ "system.court.r1": member("courtier", "Coll"), "system.council.steward": "" });
	});
});

describe("removeCourtMember", () => {
	it("leaves the seat of a Retainer who goes empty, once it's confirmed", async () => {
		expect(await removeCourtMember(fakeDomain(), "r1")).toBe(true);
		expect(asked[0].message).toContain("domain.court.removeConfirmSeated");
		expect(updates[0]).toEqual({ "system.court.-=r1": null, "system.council.steward": "" });
	});

	it("touches no seat for somebody who holds none", async () => {
		await removeCourtMember(fakeDomain(), "c1");
		expect(updates[0]).toEqual({ "system.court.-=c1": null });
	});

	it("keeps them when it isn't confirmed", async () => {
		confirmed = false;
		expect(await removeCourtMember(fakeDomain(), "r1")).toBe(false);
		expect(updates).toEqual([]);
	});

	it("lets them go without asking, seat and all", async () => {
		const domain = fakeDomain();
		expect(await removeFromCourt(domain, "r1")).toBe(true);
		expect(asked).toEqual([]);
		expect(updates[0]).toEqual({ "system.court.-=r1": null, "system.council.steward": "" });
		expect(timeline.timelineCourtLeft).toHaveBeenCalledWith(domain, "r1", expect.objectContaining({ name: "Coll" }));
		expect(await removeFromCourt(domain, "nobody")).toBe(false);
	});

	it("lets nobody go from a Domain this user doesn't own", async () => {
		const domain = { ...fakeDomain(), isOwner: false };
		expect(await removeFromCourt(domain, "r1")).toBe(false);
		expect(updates).toEqual([]);
		expect(timeline.timelineCourtLeft).not.toHaveBeenCalled();
	});
});

describe("seatCircle", () => {
	it("offers every Knight but the ruler, and seats those ticked by id", async () => {
		formData = { "circle.k2": true };
		expect(await seatCircle(fakeDomain())).toBe(true);
		expect(asked[0].context.circle.map(({ name }) => name)).toEqual(["Moss"]);
		expect(updates[0]).toEqual({ "system.council.circle": ["k2"] });
	});

	it("offers the Referee's NPC Knights too", async () => {
		game.actors = actors(knight("k1", "Tal"), knight("k2", "Moss"), knight("n1", "Sir Brand", { type: "npcKnight" }));
		await seatCircle(fakeDomain());
		expect(asked[0].context.circle.map(({ name }) => name)).toEqual(["Moss", "Sir Brand"]);
	});

	it("offers a player only the Knights they can see, but keeps those already seated", async () => {
		game.user = { isGM: false };
		game.actors = actors(
			knight("k1", "Tal"),
			knight("k2", "Moss"),
			knight("n1", "Sir Brand", { type: "npcKnight", seen: false }),
			knight("n2", "Dame Ash", { type: "npcKnight", seen: false })
		);
		formData = { "circle.k2": true, "circle.n2": true };
		await seatCircle(fakeDomain({ council: { steward: "", marshal: "", sheriff: "", envoy: "", circle: ["n2"] } }));
		expect(asked[0].context.circle.map(({ name }) => name)).toEqual(["Moss", "Dame Ash"]);
		expect(updates[0]).toEqual({ "system.council.circle": ["k2", "n2"] });
	});

	it("offers no Squire or Slain Knight, and offers one Slain since they were seated unticked (p7, p20)", async () => {
		game.actors = actors(
			knight("k1", "Tal"),
			knight("k2", "Moss"),
			{ ...knight("s1", "Pip"), system: { isSquire: true } },
			{ ...knight("k3", "Brand"), system: { slain: true } },
			{ ...knight("k4", "Ash"), system: { slain: true } }
		);
		await seatCircle(fakeDomain({ council: { steward: "", marshal: "", sheriff: "", envoy: "", circle: ["k4"] } }));
		const circle = asked[0].context.circle;
		expect(circle.map(({ id }) => id)).toEqual(["k2", "k4"]);
		expect(circle[1]).toMatchObject({ checked: false, name: expect.stringContaining("domain.council.circle.slainName") });
	});

	it("changes nothing when the window is closed", async () => {
		expect(await seatCircle(fakeDomain())).toBe(false);
		expect(updates).toEqual([]);
	});
});

describe("seatCouncilRetainers", () => {
	it("makes Retainers of the names older Domains wrote into their seats, in one update", async () => {
		const updateDocuments = vi.fn();
		globalThis.Actor = { implementation: { updateDocuments } };
		const older = fakeDomain({ council: { steward: "Piers", marshal: "", sheriff: "", envoy: "", circle: ["Moss"] }, court: {} });
		const current = fakeDomain();
		game.actors = actors(...game.actors, older, { ...current, id: "d2" });
		await seatCouncilRetainers();
		expect(updateDocuments).toHaveBeenCalledTimes(1);
		const [[sent]] = updateDocuments.mock.calls;
		expect(sent).toEqual([{
			_id: "d1",
			"system.court.new1": expect.objectContaining({ role: "retainer", name: "Piers" }),
			"system.council.steward": "new1",
			"system.council.circle": ["k2"]
		}]);
	});
});

describe("the Timeline", () => {
	it("writes who joins the Court by name, and nobody nameless", async () => {
		formData = { role: "petitioner", name: "Anne", seat: "", leverage: "", note: "" };
		const domain = fakeDomain();
		await takeIntoCourt(domain);
		expect(timeline.timelineCourtJoined).toHaveBeenCalledWith(domain, "new1", expect.objectContaining({ name: "Anne" }));
		vi.mocked(timeline.timelineCourtJoined).mockClear();
		await addCourtMember(domain, "courtier");
		expect(timeline.timelineCourtJoined).not.toHaveBeenCalled();
	});

	it("writes who leaves, but never an edit", async () => {
		const domain = fakeDomain();
		await removeCourtMember(domain, "c1");
		expect(timeline.timelineCourtLeft).toHaveBeenCalledWith(domain, "c1", expect.objectContaining({ name: "Alda" }));
		formData = { role: "courtier", name: "Alda", leverage: "Letters", note: "" };
		await editCourtMember(domain, "c1");
		expect(timeline.timelineCourtJoined).not.toHaveBeenCalled();
	});

	it("writes only the Knights a new Circle seats or unseats", async () => {
		const moss = knight("k2", "Moss");
		const reed = knight("k3", "Reed");
		game.actors = actors(knight("k1", "Tal"), moss, reed);
		formData = { "circle.k3": true };
		await seatCircle(fakeDomain({ council: { steward: "", marshal: "", sheriff: "", envoy: "", circle: ["k2"] } }));
		const [[, change]] = vi.mocked(timeline.timelineCircle).mock.calls;
		expect(change.joined).toEqual([expect.objectContaining({ id: "k3", actor: reed })]);
		expect(change.left).toEqual([expect.objectContaining({ id: "k2", actor: moss })]);
	});
});
