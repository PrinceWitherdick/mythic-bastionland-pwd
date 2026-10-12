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
vi.mock("../../module/actions/travels.js", () => ({ travelsSources: () => ({}), playersHexView: (_scene, hex) => view?.(hex) ?? null }));
vi.mock("../../module/rules/travels.js", () => ({ playerHexView: (sources, hex) => (sources.gm === false ? view?.(hex) ?? null : null) }));

const record = await import("../../module/actions/timeline-record.js");
const events = await import("../../module/actions/timeline-events.js");
const { KIND_GROUPS, TIMELINE_SOURCES, sourceGroup } = await import("../../module/rules/timeline.js");

const knight = (id, more = {}) => ({ id, name: `Sir ${id}`, type: "knight", ...more });
const domain = (more = {}) => ({ id: "d1", name: "Tal", type: "domain", ...more });
const calls = (fn) => vi.mocked(fn).mock.calls;
/** Each row written on one thread, as [target, milestone]. */
const rows = () => calls(record.recordOnTrack).map(([target, milestone]) => [target, milestone]);

beforeEach(() => {
	vi.mocked(record.recordOnTrack).mockClear();
	vi.mocked(record.recordOnTracks).mockClear();
	vi.mocked(record.forgetEverywhere).mockClear();
	view = null;
	let now = 1000;
	vi.spyOn(Date, "now").mockImplementation(() => now++);
});

describe("the new sources", () => {
	it("each sit in a Filter line of their own kind", () => {
		expect([...Object.values(KIND_GROUPS).flat()].sort()).toEqual([...TIMELINE_SOURCES].sort());
		expect(sourceGroup("aged")).toBe("time");
		expect(sourceGroup("omen")).toBe("myth");
		expect(sourceGroup("duel")).toBe("glory");
		expect(sourceGroup("ward")).toBe("wounds");
		expect(sourceGroup("heir")).toBe("lineage");
		expect(sourceGroup("warband")).toBe("dominion");
		expect(sourceGroup("found")).toBe("travels");
	});
});

describe("a duel", () => {
	const duel = (more = {}) => ({ kind: "joust", duelists: [{ uuid: "Actor.a", name: "The Red" }, { uuid: "Actor.b", name: "The Grey" }], ...more });
	const actors = [knight("a"), knight("b")];

	it("goes on each duelist's thread, won or lost, naming the other as the table saw them", async () => {
		await events.timelineDuel("m1", duel(), actors, "Actor.a", { "Actor.a": ["Glory 3 → 4"], "Actor.b": ["Glory 2 → 1"] });
		const [[a, won], [b, lost]] = rows();
		expect([a, b]).toEqual(actors);
		expect(won).toMatchObject({ source: "duel", key: "duel:m1", body: "Glory 3 → 4" });
		expect(won.title).toBe('timeline.auto.duelWon {"kind":"duel.kinds.joust.label","name":"The Grey"}');
		expect(lost.title).toBe('timeline.auto.duelLost {"kind":"duel.kinds.joust.label","name":"The Red"}');
	});

	it("says when nobody won", async () => {
		await events.timelineDuel("m1", duel(), actors, null);
		expect(rows().map(([, row]) => row.title.split(" ")[0])).toEqual(["timeline.auto.duelNone", "timeline.auto.duelNone"]);
	});

	it("writes nothing for a sparring bout", async () => {
		await events.timelineDuel("m1", duel({ sparring: true }), actors, "Actor.a");
		expect(rows()).toEqual([]);
	});
});

describe("wounds", () => {
	it("writes a Mortal Wound with what dealt it, each its own row", async () => {
		const a = knight("a");
		await events.timelineMortalWound(a, "Dealt by the Wolf");
		await events.timelineMortalWound(a);
		const [[, first], [, second]] = rows();
		expect(first).toMatchObject({ source: "mortal", title: "timeline.auto.mortal", body: "Dealt by the Wolf" });
		expect(first.key).not.toBe(second.key);
	});

	it("writes a ward on the warden's thread and the one they spared, under one key", async () => {
		const warden = knight("w");
		const victim = knight("v");
		await events.timelineWarded(warden, victim);
		const [[w, took], [v, spared]] = rows();
		expect([w, v]).toEqual([warden, victim]);
		expect(took.title).toBe('timeline.auto.warded {"name":"Sir v"}');
		expect(spared.title).toBe('timeline.auto.spared {"name":"Sir w"}');
		expect(took.key).toBe(spared.key);
	});

	it("leaves a warden Doom kills to their death row", async () => {
		await events.timelineWarded(knight("w"), knight("v"), { doomed: true });
		expect(rows().map(([target]) => target.id)).toEqual(["v"]);
	});

	it("tells a Humiliation avenged from a Scar settled", async () => {
		const a = knight("a");
		await events.timelineScarSettled(a, { id: "s1", name: "Humiliation", system: { roll: 12, foeName: "Black Hugh" } }, "GD max 9 → 12.");
		await events.timelineScarSettled(a, { id: "s2", name: "Gouge", system: { roll: 5, foeName: "" } }, "Settled.");
		const [[, revenge], [, settled]] = rows();
		expect(revenge).toMatchObject({ source: "revenge", key: "settled:s1", title: 'timeline.auto.revenge {"name":"Black Hugh"}', body: "Humiliation\nGD max 9 → 12." });
		expect(settled).toMatchObject({ source: "settled", key: "settled:s2", title: 'timeline.auto.settled {"scar":"Gouge"}', body: "Settled." });
	});
});

describe("Glory awarded", () => {
	it("goes on each Knight's thread, and the Company's naming only those the players can see", async () => {
		const a = knight("a");
		const hidden = knight("h", { secret: true });
		await events.timelineGloryAwarded("battle", [{ actor: a, lines: ["Glory 1 → 2"] }, { actor: hidden, lines: ["Glory 0 → 1"] }]);
		const written = rows();
		expect(written.map(([target]) => target.id ?? target)).toEqual(["a", "h", "company"]);
		expect(written[0][1]).toMatchObject({ source: "award", title: "glory.awards.battle.label", body: "Glory 1 → 2" });
		expect(written[2][1].body).toBe("Sir a");
		expect(new Set(written.map(([, row]) => row.key)).size).toBe(1);
	});

	it("leaves the Company out when none of them can be seen", async () => {
		await events.timelineGloryAwarded("tournament", [{ actor: knight("h", { secret: true }), lines: [] }]);
		expect(rows().map(([target]) => target.id ?? target)).toEqual(["h"]);
	});

	it("leaves a Myth's Glory to the Myth's own row", async () => {
		await events.timelineGloryAwarded("myth", [{ actor: knight("a"), lines: [] }]);
		expect(rows()).toEqual([]);
	});
});

describe("the Company", () => {
	it("writes a Knight joining on their thread and the Company's, which takes their new name", async () => {
		await events.timelineJoined(knight("a"));
		const [[, own], [company, joined]] = rows();
		expect(own).toMatchObject({ source: "joined", key: "joined" });
		expect(company).toBe("company");
		expect(joined).toMatchObject({ key: "joined:a", refresh: ["title"] });
	});

	it("keeps a Knight the players can't see off the Company's thread", async () => {
		await events.timelineJoined(knight("a", { secret: true }));
		expect(rows().map(([target]) => target.id)).toEqual(["a"]);
	});

	it("writes a Squire taken on both threads", async () => {
		await events.timelineSquireTaken(knight("a"), knight("s"));
		const [[, took], [, serves]] = rows();
		expect(took).toMatchObject({ source: "squire", key: "squire:s", title: "timeline.auto.tookSquire" });
		expect(serves).toMatchObject({ source: "squire", key: "serves:a", title: 'timeline.auto.becameSquire {"name":"Sir a"}' });
	});

	it("writes growing older once for each Age, with the Virtues it changed", async () => {
		await events.timelineAged(knight("a"), "old", ["VIG: 12 → 9"]);
		expect(rows()[0][1]).toMatchObject({ source: "aged", key: "aged:old", title: 'timeline.auto.aged {"age":"age.old"}', body: "VIG: 12 → 9" });
	});

	it("writes each successor named as its own row, so naming the first again is written too", async () => {
		await events.timelineHeirNamed(knight("a"), knight("b"));
		expect(rows()[0][1]).toMatchObject({ source: "heir" });
		expect(rows()[0][1].key).toMatch(/^heir:b:2-harvest:/);
	});
});

describe("Omens", () => {
	const scene = { id: "s1", name: "The Vale" };
	const myth = { number: 3, d6: 2, d12: 7, hex: { col: 9, row: 9 } };

	it("writes one row for each Omen met, where the Company stood, never the Myth's own hex", async () => {
		const seen = [];
		view = (hex) => {
			seen.push(hex);
			return { name: "Mill Ford" };
		};
		await events.timelineOmens(scene, myth, { from: 1, to: 3, hex: { col: 1, row: 2 } });
		expect(seen).toEqual([{ col: 1, row: 2 }]);
		const [[targets, met]] = calls(record.recordOnTracks);
		expect(targets).toEqual(["company", scene]);
		expect(met.map(({ key }) => key)).toEqual(["omen:s1.3.2-7:2", "omen:s1.3.2-7:3"]);
		expect(met[0]).toMatchObject({ source: "omen", title: 'timeline.auto.omen {"number":3}', place: "Mill Ford" });
		// Neither the Myth's name nor what its Omen said.
		expect(met[0]).not.toHaveProperty("body");
	});

	it("reads as news when heard of at Court, and falls back on the Realm's name", async () => {
		await events.timelineOmens(scene, myth, { from: 0, to: 1, hex: null, news: true });
		const [[, [met]]] = calls(record.recordOnTracks);
		expect(met).toMatchObject({ title: 'timeline.auto.omenNews {"number":3}', place: "The Vale" });
	});

	it("takes back the rows of Omens unmarked", async () => {
		await events.timelineOmens(scene, myth, { from: 3, to: 1 });
		expect(calls(record.forgetEverywhere)).toEqual([["omen:s1.3.2-7:2"], ["omen:s1.3.2-7:3"]]);
		expect(calls(record.recordOnTracks)).toEqual([]);
	});

	it("writes a Landmark found in its arrival's place, only once the players can see it", async () => {
		const hex = { col: 4, row: 4 };
		await events.timelineLandmarkFound(scene, hex);
		expect(calls(record.recordOnTracks)).toEqual([]);
		view = () => ({ name: "", landmark: { type: "monument", name: "The Grey Stones" } });
		await events.timelineLandmarkFound(scene, hex);
		const [[targets, found]] = calls(record.recordOnTracks);
		expect(targets).toEqual(["company", scene]);
		expect(found).toMatchObject({ source: "found", key: "visit:s1:4,4", title: 'timeline.auto.found {"place":"The Grey Stones"}' });
	});
});

describe("Domains", () => {
	it("writes a Crisis resolved and Drama in Court, each its own row", async () => {
		const d = domain();
		await events.timelineCrisisResolved(d, "famine", "Famine");
		await events.timelineDrama(d, { said: "Scandal", who: "Wren, Courtier", leverage: "Holds a letter" });
		const [[, resolved], [, drama]] = rows();
		expect(resolved).toMatchObject({ source: "resolved", title: 'timeline.auto.crisisResolved {"crisis":"Famine"}' });
		expect(resolved.key).toMatch(/^resolved:famine:2-harvest:/);
		expect(drama).toMatchObject({ source: "drama", title: "domain.drama", body: "Scandal\nWren, Courtier\nHolds a letter" });
	});

	it("writes a Council task settled under its own id, with the Crisis it brought", async () => {
		await events.timelineTaskSettled(domain(), "t1", { what: "Mend the bridge", by: "Steward: Wren", outcome: "Failure", crisis: "Famine" });
		expect(rows()[0][1]).toMatchObject({ source: "task", key: "task:t1", title: "Mend the bridge", body: 'Steward: Wren\nFailure\ntimeline.auto.taskCrisis {"crisis":"Famine"}' });
	});

	it("writes a Grand Design begun, and forgets it when struck off by mistake", async () => {
		await events.timelineDesignBegun(domain(), "g1", { scale: "building" });
		expect(rows()[0][1]).toMatchObject({ source: "design", key: "design:g1", body: "domain.designs.scales.building.label" });
		await events.timelineDesignForgotten("g1");
		expect(calls(record.forgetEverywhere)).toEqual([["design:g1"]]);
	});

	it("writes the Court's comings and goings, and Warbands mustered and dismissed", async () => {
		const d = domain();
		await events.timelineCourtJoined(d, "c1", { name: "Wren", role: "courtier" });
		await events.timelineCourtLeft(d, "c1", { name: "Wren", role: "courtier" });
		await events.timelineMustered(d, { id: "w1", name: "The Levy" }, "Vassals");
		await events.timelineDismissed(d, { id: "w1", name: "The Levy" });
		expect(rows().map(([, row]) => [row.source, row.key])).toEqual([["court", "court:c1"], ["court", "courtLeft:c1"], ["warband", "warband:w1"], ["warband", "warbandGone:w1"]]);
	});

	it("writes the Circle on the Domain's thread and each Knight's, but never names a hidden Domain on a seen Knight's", async () => {
		const seen = knight("a");
		await events.timelineCircle(domain(), { joined: [{ id: "a", name: "Sir a", actor: seen }], left: [{ id: "b", name: "Sir b", actor: null }] });
		expect(rows().map(([target, row]) => [target.id, row.title.split(" ")[0]])).toEqual([
			["d1", "timeline.auto.circleJoined"],
			["a", "timeline.auto.circleJoinedOf"],
			["d1", "timeline.auto.circleLeft"]
		]);
		vi.mocked(record.recordOnTrack).mockClear();
		await events.timelineCircle(domain({ secret: true }), { joined: [{ id: "a", name: "Sir a", actor: seen }] });
		expect(rows().map(([target]) => target.id)).toEqual(["d1"]);
	});
});
