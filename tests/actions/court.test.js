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

const { editCourtMember, removeCourtMember, seatCircle, seatCouncilRetainers, takeIntoCourt } = await import("../../module/actions/court.js");

const member = (role, name, extra = {}) => ({ role, name, seat: "", leverage: "", note: "", at: 1, ...extra });

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

const knight = (id, name) => ({ id, name, type: "knight" });

beforeEach(() => {
	formData = null;
	confirmed = true;
	asked = [];
	updates = [];
	globalThis.game = { actors: [knight("k1", "Tal"), knight("k2", "Moss")] };
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
});

describe("seatCircle", () => {
	it("offers every Knight but the ruler, and seats those ticked by id", async () => {
		formData = { "circle.k2": true };
		expect(await seatCircle(fakeDomain())).toBe(true);
		expect(asked[0].context.circle.map(({ name }) => name)).toEqual(["Moss"]);
		expect(updates[0]).toEqual({ "system.council.circle": ["k2"] });
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
		game.actors = [...game.actors, older, { ...current, id: "d2" }];
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
