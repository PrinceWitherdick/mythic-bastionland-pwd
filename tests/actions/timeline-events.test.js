import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));
vi.mock("../../module/actions/timeline-record.js", () => ({
	recordOnTrack: vi.fn(async () => null),
	recordOnTracks: vi.fn(async () => []),
	forgetEverywhere: vi.fn(async () => {}),
	keptFromPlayers: (target) => Boolean(target?.secret),
	timelineNow: () => "2-harvest"
}));
let view = null;
vi.mock("../../module/actions/travels.js", () => ({ travelsSources: () => ({}) }));
vi.mock("../../module/rules/travels.js", () => ({ playerHexView: (sources) => (sources.gm === false ? view : null) }));

const record = await import("../../module/actions/timeline-record.js");
const events = await import("../../module/actions/timeline-events.js");

const knight = (id, name = `Sir ${id}`) => ({ id, name, type: "knight" });
const calls = (fn) => vi.mocked(fn).mock.calls;

beforeEach(() => {
	vi.mocked(record.recordOnTrack).mockClear();
	vi.mocked(record.recordOnTracks).mockClear();
	vi.mocked(record.forgetEverywhere).mockClear();
	view = null;
	const actors = { a: knight("a"), b: knight("b"), d1: { id: "d1", type: "domain", name: "Tal's Domain" } };
	globalThis.game = { actors: { get: (id) => actors[id] } };
});

describe("the Season turns", () => {
	it("closes the Season on the Company's thread, each Knight's something befell, and each Domain's", async () => {
		await events.timelineSeasonTurn("1-spring", {
			kind: "season",
			title: "Harvest Begins",
			note: null,
			collection: { name: "Collection", lines: ["Taxes are paid."] },
			knights: [{ actorId: "a", pursuit: null, lines: [] }, { actorId: "b", pursuit: "Courtesy", lines: ["Made a contact."] }],
			domains: [{ domainId: "d1", lines: ["Fell into misrule."] }]
		});
		const rows = calls(record.recordOnTrack);
		const [company, second, domain] = rows;
		expect(company[0]).toBe("company");
		expect(company[1]).toMatchObject({ source: "season", key: "turn:1-spring", title: "Harvest Begins", body: "Taxes are paid." });
		expect(company[2]).toEqual({ when: "1-spring" });
		// Sir a only had their Virtues restored, which every Season does.
		expect(rows.map(([target]) => target.id)).not.toContain("a");
		expect(second[0].id).toBe("b");
		expect(second[1].body).toBe('timeline.auto.pursuit {"pursuit":"Courtesy"}\nMade a contact.');
		expect(domain[0].id).toBe("d1");
	});
});

describe("Myths", () => {
	it("goes on the Company's thread, the Realm's and those of the Knights given Glory", async () => {
		const scene = { id: "s1", name: "The Vale" };
		const a = knight("a");
		await events.timelineMythCompleted({ scene, completedId: "s1.3.2-7", name: "The Hollow Bell", knights: [a] });
		const [[targets, milestone]] = calls(record.recordOnTracks);
		expect(targets).toEqual(["company", scene, a]);
		expect(milestone).toMatchObject({ source: "myth", key: "myth:s1.3.2-7", place: "The Vale" });
	});

	it("comes off every thread when unresolved", async () => {
		await events.timelineMythUndone("s1.3.2-7");
		expect(calls(record.forgetEverywhere)).toEqual([["myth:s1.3.2-7"]]);
	});
});

describe("a session", () => {
	it("is dated by the Season played, and carries what the Referee chose to share", async () => {
		await events.timelineSession("1-winter", { recap: "We won.", plans: "Ride north", passed: "A day passes." });
		const [[target, milestone, options]] = calls(record.recordOnTrack);
		expect(target).toBe("company");
		expect(milestone.source).toBe("session");
		expect(milestone.body).toBe("We won.\nsessionEnd.card.plans: Ride north\nA day passes.");
		expect(options).toEqual({ when: "1-winter" });
	});
});

describe("Knights' lives", () => {
	it("dates a Scar by the Season it was taken, and says who dealt it", async () => {
		const a = knight("a");
		await events.timelineScar(a, { id: "i1", name: "Broken Arm", system: { season: "1-spring", foeName: "The Wolf" } }, "Lose 1 STR.");
		const [[target, milestone, options]] = calls(record.recordOnTrack);
		expect(target).toBe(a);
		expect(milestone).toMatchObject({ source: "scar", key: "scar:i1", title: "Broken Arm" });
		expect(milestone.body).toContain("Lose 1 STR.");
		expect(options).toEqual({ when: "1-spring" });
	});

	it("writes a fall on the Knight's thread and the Company's, each once", async () => {
		await events.timelineFallen(knight("a"));
		expect(calls(record.recordOnTrack).map(([target, { key }]) => [target === "company" ? "company" : target.id, key])).toEqual([["a", "death"], ["company", "death:a"]]);
	});

	it("writes who took up whose journey on both their threads", async () => {
		await events.timelineTookUp(knight("a"), knight("b"));
		expect(calls(record.recordOnTrack).map(([target, { source, key }]) => [target.id, source, key])).toEqual([["a", "succeeded", "succeeded"], ["b", "tookUp", "tookUp:a"]]);
	});
});

describe("Domains", () => {
	it("keys each Crisis Roll apart, however many fall in one Season", async () => {
		const domain = { id: "d1", type: "domain" };
		const now = vi.spyOn(Date, "now").mockReturnValueOnce(5).mockReturnValueOnce(6);
		await events.timelineCrisisRoll(domain, { result: "calamity", crises: ["Chaos", "Debt"] });
		await events.timelineCrisisRoll(domain, { result: "calm", crises: [] });
		now.mockRestore();
		const [[, first], [, second]] = calls(record.recordOnTrack);
		expect([first.key, second.key]).toEqual(["crisis:2-harvest:5", "crisis:2-harvest:6"]);
		expect(first.body).toContain("Chaos\nDebt");
	});

	it("writes a founding on the Realm's thread only when the players can see the Domain", async () => {
		const realm = { id: "s1", name: "The Vale" };
		await events.timelineFounded(knight("a"), { id: "d1", name: "Tal's Domain" }, realm);
		expect(calls(record.recordOnTrack).map(([target]) => target)).toContain(realm);
		vi.mocked(record.recordOnTrack).mockClear();
		await events.timelineFounded(knight("n"), { id: "d2", name: "Rival", secret: true }, realm);
		expect(calls(record.recordOnTrack).map(([target]) => target)).not.toContain(realm);
	});

	it("writes a Holding granted on the Realm's thread unless no player can see who was granted it, or by whom", async () => {
		const realm = { id: "s1", name: "The Vale" };
		const rival = { id: "d2", name: "Rival", secret: true };
		await events.timelineHoldingGranted(realm, { id: "h1" }, "Holt", rival, knight("a"));
		await events.timelineHoldingGranted(realm, { id: "h2" }, "Fen", rival, { ...knight("n"), secret: true });
		const [[first], [second]] = calls(record.recordOnTracks);
		expect(first[0]).toBe(realm);
		expect(second[0]).toBeNull();
	});

	it("writes a new ruler on the Domain's thread and, when a Knight, on theirs", async () => {
		const domain = { id: "d1", type: "domain" };
		const now = vi.spyOn(Date, "now").mockReturnValue(7);
		await events.timelineNewRuler(domain, "seized", { name: "Eve", knight: knight("e") }, "Eve seizes it");
		now.mockRestore();
		expect(calls(record.recordOnTrack).map(([, { source, key }]) => [source, key])).toEqual([["seized", "seized:2-harvest:7"], ["rules", "rules:d1:2-harvest:7"]]);
		vi.mocked(record.recordOnTrack).mockClear();
		await events.timelineNewRuler(domain, "passed", { name: "Somebody", knight: null }, "Somebody succeeds");
		expect(calls(record.recordOnTrack)).toHaveLength(1);
	});
});

describe("travels", () => {
	const scene = { id: "s1", name: "The Vale" };
	const hex = { col: 2, row: 3 };

	it("writes a first arrival only where there's a Holding, a Landmark or a Myth, and never names the Myth", async () => {
		view = { name: "", holding: null, landmark: null, myth: { number: 4 } };
		await events.timelineArrivals(scene, [hex]);
		const [[targets, [milestone]]] = calls(record.recordOnTracks);
		expect(targets).toEqual(["company", scene]);
		expect(milestone).toMatchObject({ source: "visit", key: "visit:s1:2,3" });
		expect(milestone.title).toContain("timeline.auto.mythHex");

		vi.mocked(record.recordOnTracks).mockClear();
		view = { name: "", holding: null, landmark: null, myth: null };
		await events.timelineArrivals(scene, [hex]);
		expect(calls(record.recordOnTracks)).toHaveLength(0);
	});

	it("keeps the latest party note on a hex, and takes it off when the note is cleared", async () => {
		view = { name: "The Old Mill", holding: null, landmark: null, myth: null };
		await events.timelinePartyNote(scene, hex, "Beware the miller.", { name: "Ann" });
		const [[, milestone]] = calls(record.recordOnTracks);
		expect(milestone).toMatchObject({ source: "note", key: "note:s1:2,3", place: "The Old Mill", body: "Beware the miller.", refresh: ["body", "title"] });
		vi.mocked(record.recordOnTracks).mockClear();
		await events.timelinePartyNote(scene, hex, "  ", { name: "Ann" });
		expect(calls(record.recordOnTracks)).toHaveLength(0);
		expect(calls(record.forgetEverywhere)).toEqual([["note:s1:2,3"]]);
	});
});
