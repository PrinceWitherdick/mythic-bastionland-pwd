import { describe, expect, it } from "vitest";
import {
	UNDO_KEEP,
	changedPaths,
	childUuid,
	finishFields,
	joinParts,
	keepRecord,
	noteFields,
	planChanges,
	readPath,
	sameValue,
	undoPlan,
	undoable
} from "../../module/rules/time-undo.js";

/**
 * Taking back a time advance: what a write changes, noted the first time, finished
 * with what the advance left, and put back only where nothing has changed since.
 */

const knight = () => ({
	name: "Sir Ash",
	system: { virtues: { vig: { value: 9, max: 12 }, spi: { value: 4, max: 10 } }, glory: 1, court: {} },
	flags: { sys: { ledger: [{ id: "a" }] } }
});

describe("the places a write changes", () => {
	it("goes as deep as the document holds objects, and no deeper", () => {
		const paths = changedPaths({ system: { virtues: { vig: { value: 3 } }, glory: 2 } }, knight());
		expect(paths.sort()).toEqual(["system.glory", "system.virtues.vig.value"]);
	});

	it("reads dotted keys the same as nested ones", () => {
		expect(changedPaths({ "system.virtues.spi.value": 2, _id: "x" }, knight())).toEqual(["system.virtues.spi.value"]);
	});

	it("takes a key new to the document as one place, so taking it back deletes it whole", () => {
		const paths = changedPaths({ system: { court: { abc: { name: "Fool", role: "jester" } } } }, knight());
		expect(paths).toEqual(["system.court.abc"]);
		expect(changedPaths({ "system.entries.row1.title": "Found" }, { system: {} })).toEqual(["system.entries"]);
	});

	it("takes a deletion or a whole replacement as one place, v13's prefixes and v14's operators alike", () => {
		class Gone {}
		expect(changedPaths({ "system.court.-=abc": null }, knight())).toEqual(["system.court.abc"]);
		expect(changedPaths({ system: { "==virtues": { vig: { value: 1 } } } }, knight())).toEqual(["system.virtues"]);
		const foundry = globalThis.foundry;
		globalThis.foundry = { data: { operators: { ForcedDeletion: Gone } } };
		try {
			expect(changedPaths({ system: { virtues: new Gone() } }, knight())).toEqual(["system.virtues"]);
		} finally {
			globalThis.foundry = foundry;
		}
	});

	it("takes an array as one place", () => {
		expect(changedPaths({ system: { events: ["feast"] } }, { system: { events: [] } })).toEqual(["system.events"]);
	});
});

describe("noting what a place held", () => {
	it("keeps the first value each place held, not a later one", () => {
		const fields = {};
		const source = knight();
		noteFields(fields, ["system.virtues.vig.value"], source);
		source.system.virtues.vig.value = 3;
		noteFields(fields, ["system.virtues.vig.value"], source);
		expect(fields["system.virtues.vig.value"]).toEqual({ had: true, before: 9 });
	});

	it("notes a place the document didn't hold as had nothing", () => {
		expect(noteFields({}, ["system.court.abc"], knight())["system.court.abc"]).toEqual({ had: false, before: null });
	});

	it("leaves out the places it's told to, such as the Ledger", () => {
		const fields = noteFields({}, ["flags.sys.ledger", "system.glory"], knight(), (path) => path.startsWith("flags.sys.ledger"));
		expect(Object.keys(fields)).toEqual(["system.glory"]);
	});

	it("takes earlier inner notes into a larger one around them, as they were before the advance", () => {
		const fields = {};
		const source = knight();
		noteFields(fields, ["system.virtues.vig.value"], source);
		source.system.virtues.vig.value = 3;
		noteFields(fields, ["system.virtues"], source);
		expect(Object.keys(fields)).toEqual(["system.virtues"]);
		expect(fields["system.virtues"].before.vig.value).toBe(9);
		// A place inside one noted already is covered by it.
		noteFields(fields, ["system.virtues.spi.value"], source);
		expect(Object.keys(fields)).toEqual(["system.virtues"]);
	});

	it("drops a place the advance left as it found it", () => {
		const fields = noteFields({}, ["system.glory", "system.virtues.vig.value"], knight());
		const after = knight();
		after.system.virtues.vig.value = 4;
		const done = finishFields(fields, after);
		expect(done).toEqual({ "system.virtues.vig.value": { had: true, before: 9, has: true, after: 4 } });
	});
});

/** An advance that took 5 VIG off Sir Ash, gave him a jester and changed the weather and the calendar. */
const record = () => ({
	id: "r1",
	kind: "phase",
	at: 1,
	before: { phase: "afternoon" },
	after: { phase: "night" },
	docs: [{
		uuid: "Actor.ash",
		name: "Sir Ash",
		fields: {
			"system.virtues.vig.value": { had: true, before: 9, has: true, after: 4 },
			"system.court.abc": { had: false, before: null, has: true, after: { name: "Fool" } },
			"system.glory": { had: true, before: 1, has: true, after: 2 }
		}
	}],
	created: [{ uuid: "ChatMessage.c1", documentName: "ChatMessage", name: "" }, { uuid: "ChatMessage.gone", documentName: "ChatMessage", name: "" }],
	deleted: [{ parentUuid: "Actor.ash", documentName: "Item", name: "Sir Ash", data: { _id: "it1", name: "Torch" } }],
	settings: [
		{ key: "sys.calendar", had: true, before: "{\"phase\":\"afternoon\"}", has: true, after: "{\"phase\":\"night\"}" },
		{ key: "sys.weather", had: true, before: "\"clear\"", has: true, after: "\"rain\"" },
		{ key: "sys.deprived", had: false, before: null, has: true, after: "[\"ash\"]" },
		{ key: "sys.fog", had: true, before: "null", has: true, after: "{}" }
	]
});

/** The world as it stands when the Undo is asked for. */
function world({ source = { system: { virtues: { vig: { value: 4 } }, court: { abc: { name: "Fool" } }, glory: 2 } }, settings = {} } = {}) {
	const docs = { "Actor.ash": source, "ChatMessage.c1": {} };
	const stored = { "sys.calendar": "{\"phase\":\"night\"}", "sys.weather": "\"rain\"", "sys.deprived": "[\"ash\"]", "sys.fog": "{}", ...settings };
	return { sourceOf: (uuid) => docs[uuid] ?? null, settingOf: (key) => stored[key], lastKey: "sys.calendar" };
}

describe("what an Undo writes", () => {
	it("puts back every place still as the advance left it, deleting what it added", () => {
		const plan = undoPlan(record(), world());
		expect(plan.writes).toEqual([{ uuid: "Actor.ash", name: "Sir Ash", set: [["system.virtues.vig.value", 9], ["system.glory", 1]], unset: ["system.court.abc"] }]);
		expect(plan.kept).toEqual([]);
	});

	it("keeps a place changed since, and says so", () => {
		const plan = undoPlan(record(), world({ source: { system: { virtues: { vig: { value: 2 } }, court: { abc: { name: "Fool" } }, glory: 2 } } }));
		expect(plan.writes[0].set).toEqual([["system.glory", 1]]);
		expect(plan.kept).toEqual([{ uuid: "Actor.ash", name: "Sir Ash", paths: ["system.virtues.vig.value"] }]);
	});

	it("leaves alone a place already back as it was, without calling it kept", () => {
		const plan = undoPlan(record(), world({ source: { system: { virtues: { vig: { value: 9 } }, court: {}, glory: 1 } } }));
		expect(plan.writes).toEqual([]);
		expect(plan.kept).toEqual([]);
	});

	it("deletes only what the advance made that is still there, and makes again what it deleted", () => {
		const plan = undoPlan(record(), world());
		expect(plan.deletes).toEqual(["ChatMessage.c1"]);
		expect(plan.recreates.map(({ data }) => data.name)).toEqual(["Torch"]);
		expect(childUuid("Actor.ash", "Item", { _id: "it1" })).toBe("Actor.ash.Item.it1");
		expect(childUuid(null, "ChatMessage", { _id: "m" })).toBe("ChatMessage.m");
	});

	it("puts settings back with the calendar last, and keeps one changed since", () => {
		const plan = undoPlan(record(), world({ settings: { "sys.fog": "{\"when\":1}" } }));
		expect(plan.settings.map(({ key }) => key)).toEqual(["sys.weather", "sys.deprived", "sys.calendar"]);
		expect(plan.settings.find(({ key }) => key === "sys.deprived")).toEqual({ key: "sys.deprived", had: false, before: null });
		expect(plan.keptSettings).toEqual(["sys.fog"]);
	});

	it("skips a document that's gone since", () => {
		const plan = undoPlan(record(), { ...world(), sourceOf: () => null });
		expect(plan.writes).toEqual([]);
		expect(plan.deletes).toEqual([]);
	});

	it("knows when only the calendar is left to turn back", () => {
		const bare = { ...record(), docs: [], created: [], deleted: [], settings: [record().settings[0]] };
		expect(planChanges(undoPlan(bare, world()))).toBe(true);
		const none = { ...bare, settings: [] };
		expect(planChanges(undoPlan(none, world()))).toBe(false);
	});
});

describe("the list of advances", () => {
	it(`keeps the last ${UNDO_KEEP}, newest last`, () => {
		let records = [];
		for (let i = 1; i <= UNDO_KEEP + 2; i++) records = keepRecord(records, { id: `r${i}` });
		expect(records.map(({ id }) => id)).toEqual(["r3", "r4", "r5", "r6", "r7"]);
	});

	it("offers the newest, only while time stands where it left it", () => {
		const records = [{ id: "a", after: { phase: "morning" } }, { id: "b", after: { phase: "night" } }];
		const same = (a, b) => sameValue(a, b);
		expect(undoable(records, { phase: "night" }, same)?.id).toBe("b");
		expect(undoable(records, { phase: "morning" }, same)).toBeNull();
		expect(undoable([], { phase: "night" }, same)).toBeNull();
	});
});

describe("joining two clients' notes of one advance", () => {
	it("keeps the earlier value of a place both wrote, and the record's end, read last", () => {
		const mine = { ...record(), docs: [{ uuid: "Actor.ash", name: "Sir Ash", fields: { "system.glory": { had: true, before: 1, has: true, after: 2 } } }], created: [], deleted: [], settings: [] };
		const theirs = {
			docs: [
				{ uuid: "Actor.ash", name: "Sir Ash", fields: { "system.glory": { had: true, before: 2, has: true, after: 3 }, "system.age": { had: true, before: "young", has: true, after: "mature" } } },
				{ uuid: "Item.torch", name: "Torch", fields: { "system.quantity.value": { had: true, before: 0, has: true, after: 3 } } }
			],
			created: [{ uuid: "ChatMessage.x", documentName: "ChatMessage", name: "" }],
			deleted: [],
			settings: [{ key: "sys.weather", had: true, before: "\"clear\"", has: true, after: "\"rain\"" }]
		};
		const joined = joinParts(mine, theirs);
		expect(joined.docs.find(({ uuid }) => uuid === "Actor.ash").fields).toEqual({
			"system.glory": { had: true, before: 1, has: true, after: 2 },
			"system.age": { had: true, before: "young", has: true, after: "mature" }
		});
		expect(joined.docs.map(({ uuid }) => uuid)).toEqual(["Actor.ash", "Item.torch"]);
		expect(joined.created.map(({ uuid }) => uuid)).toEqual(["ChatMessage.x"]);
		expect(joined.settings.map(({ key }) => key)).toEqual(["sys.weather"]);
		expect(joinParts(mine, null)).toBe(mine);
	});

	const bare = (docs, settings = []) => ({ ...record(), docs, created: [], deleted: [], settings });

	it("keeps the value noted first, whichever client noted it", () => {
		const mine = bare([{ uuid: "Actor.ash", name: "Sir Ash", fields: { "system.glory": { had: true, before: 2, has: true, after: 3, at: 20 } } }],
			[{ key: "sys.weather", had: true, before: "\"rain\"", has: true, after: "\"snow\"", at: 20 }]);
		const theirs = {
			docs: [{ uuid: "Actor.ash", name: "Sir Ash", fields: { "system.glory": { had: true, before: 1, has: true, after: 3, at: 10 } } }],
			settings: [{ key: "sys.weather", had: true, before: "\"clear\"", has: true, after: "\"snow\"", at: 10 }]
		};
		const joined = joinParts(mine, theirs);
		expect(joined.docs[0].fields["system.glory"]).toMatchObject({ before: 1, after: 3 });
		expect(joined.settings[0]).toMatchObject({ before: "\"clear\"", after: "\"snow\"" });
	});

	it("folds a place noted inside another into it, as it was before the advance", () => {
		// The active GM noted the vig value first; the Referee later wrote all the Virtues whole.
		const mine = bare([{ uuid: "Actor.ash", name: "Sir Ash", fields: { "system.virtues": { had: true, before: { vig: { value: 4 } }, has: true, after: { vig: { value: 1 } }, at: 20 } } }]);
		const theirs = { docs: [{ uuid: "Actor.ash", name: "Sir Ash", fields: { "system.virtues.vig.value": { had: true, before: 9, has: true, after: 4, at: 10 } } }] };
		const { fields } = joinParts(mine, theirs).docs[0];
		expect(Object.keys(fields)).toEqual(["system.virtues"]);
		expect(fields["system.virtues"]).toMatchObject({ before: { vig: { value: 9 } }, after: { vig: { value: 1 } }, at: 10 });
		// Noted first, the larger place covers one noted inside it later.
		const later = { docs: [{ uuid: "Actor.ash", name: "Sir Ash", fields: { "system.virtues.vig.value": { had: true, before: 1, has: true, after: 1, at: 30 } } }] };
		expect(Object.keys(joinParts(mine, later).docs[0].fields)).toEqual(["system.virtues"]);
		expect(joinParts(mine, later).docs[0].fields["system.virtues"].before).toEqual({ vig: { value: 4 } });
	});

	it("puts the deletions of both in the order they were made", () => {
		const mine = { ...bare([]), deleted: [{ parentUuid: null, documentName: "Actor", data: { _id: "b" }, at: 20 }] };
		const theirs = { docs: [], deleted: [{ parentUuid: "Actor.b", documentName: "Item", data: { _id: "a" }, at: 10 }] };
		expect(joinParts(mine, theirs).deleted.map(({ data }) => data._id)).toEqual(["a", "b"]);
	});
});

describe("places an Undo keeps as they stand", () => {
	const ledger = ["flags.sys.ledger"];

	it("puts back a flags object the advance made, keeping the Ledger's lines inside it", () => {
		const made = { ...record(), docs: [{ uuid: "Actor.ash", name: "Sir Ash", fields: { "flags.sys": { had: false, before: null, has: true, after: { seen: true, ledger: [1] } } } }] };
		const plan = undoPlan(made, { ...world({ source: { flags: { sys: { seen: true, ledger: [1, 2] } } } }), keptPlaces: () => ledger });
		expect(plan.writes).toEqual([{ uuid: "Actor.ash", name: "Sir Ash", set: [["flags.sys", { ledger: [1, 2] }]], unset: [] }]);
	});

	it("puts back what the object held before, with the Ledger as it is now", () => {
		const made = { ...record(), docs: [{ uuid: "Actor.ash", name: "Sir Ash", fields: { "flags.sys": { had: true, before: { mark: 1, ledger: [1] }, has: true, after: { mark: 2, ledger: [1, 2] } } } }] };
		const plan = undoPlan(made, { ...world({ source: { flags: { sys: { mark: 2, ledger: [1, 2, 3] } } } }), keptPlaces: () => ledger });
		expect(plan.writes[0].set).toEqual([["flags.sys", { mark: 1, ledger: [1, 2, 3] }]]);
	});

	it("takes it away whole when nothing is kept inside it", () => {
		const made = { ...record(), docs: [{ uuid: "Actor.ash", name: "Sir Ash", fields: { "flags.sys": { had: false, before: null, has: true, after: { seen: true } } } }] };
		const plan = undoPlan(made, { ...world({ source: { flags: { sys: { seen: true } } } }), keptPlaces: () => ledger });
		expect(plan.writes[0].unset).toEqual(["flags.sys"]);
	});

	it("leaves alone a place kept, and doesn't call it kept", () => {
		const found = { ...record(), docs: [{ uuid: "Scene.r.Tile.m", name: "Realm", fields: { hidden: { had: true, before: true, has: true, after: false } } }] };
		const plan = undoPlan(found, { ...world(), sourceOf: () => ({ hidden: false }), keptPlaces: () => ["hidden"] });
		expect(plan.writes).toEqual([]);
		expect(plan.kept).toEqual([]);
	});
});

describe("what the advance made and deleted", () => {
	const made = (data) => ({ ...record(), docs: [], settings: [], created: [
		{ uuid: "ChatMessage.c1", documentName: "ChatMessage", name: "" },
		{ uuid: "Actor.ash.Item.rope", documentName: "Item", name: "Sir Ash", data }
	] });
	// Foundry's own stamps change with every write, so are no change of the Referee's.
	const now = (rope) => ({ ...world(), keptPlaces: () => ["_stats"], sourceOf: (uuid) => ({ "ChatMessage.c1": { content: "pressed" }, "Actor.ash.Item.rope": rope })[uuid] ?? null });

	it("deletes what is as the advance left it, and every card", () => {
		const plan = undoPlan(made({ name: "Rope", _stats: { modifiedTime: 1 } }), now({ name: "Rope", _stats: { modifiedTime: 2 } }));
		expect(plan.deletes).toEqual(["ChatMessage.c1", "Actor.ash.Item.rope"]);
	});

	it("keeps what was changed since, and says so", () => {
		const plan = undoPlan(made({ name: "Rope" }), now({ name: "Long Rope" }));
		expect(plan.deletes).toEqual(["ChatMessage.c1"]);
		expect(plan.kept).toEqual([{ uuid: "Actor.ash.Item.rope", name: "Sir Ash", paths: [] }]);
	});

	it("makes the newest deletion again first, so a parent comes back before what was deleted from it", () => {
		const gone = { ...record(), deleted: [
			{ parentUuid: "Actor.ash", documentName: "Item", name: "Sir Ash", data: { _id: "torch" } },
			{ parentUuid: null, documentName: "Actor", name: "Sir Ash", data: { _id: "ash" } }
		] };
		const plan = undoPlan(gone, { ...world(), sourceOf: () => null });
		expect(plan.recreates.map(({ data }) => data._id)).toEqual(["ash", "torch"]);
	});
});

describe("the active Scene", () => {
	const moved = { ...record(), docs: [], created: [], deleted: [], settings: [], scenes: { before: "Scene.home", after: "Scene.away", beforeName: "Home", afterName: "Away" } };

	it("goes back to the one active before", () => {
		const plan = undoPlan(moved, { ...world(), activeScene: () => "Scene.away" });
		expect(plan.activate).toEqual({ uuid: "Scene.home", from: "Scene.away", name: "Home" });
		expect(planChanges(plan)).toBe(true);
	});

	it("is kept when another Scene was made active since", () => {
		const plan = undoPlan(moved, { ...world(), activeScene: () => "Scene.third" });
		expect(plan.activate).toBeNull();
		expect(plan.kept).toEqual([{ uuid: "Scene.away", name: "Away", paths: ["active"] }]);
	});

	it("is none again when none was active before", () => {
		const plan = undoPlan({ ...moved, scenes: { ...moved.scenes, before: null, beforeName: "" } }, { ...world(), activeScene: () => "Scene.away" });
		expect(plan.activate).toEqual({ uuid: null, from: "Scene.away", name: "Away" });
	});
});

describe("reading and comparing", () => {
	it("tells a missing place from one holding nothing", () => {
		expect(readPath({ a: { b: null } }, "a.b")).toEqual({ has: true, value: null });
		expect(readPath({ a: {} }, "a.b")).toEqual({ has: false, value: undefined });
		expect(readPath({ a: 3 }, "a.b")).toEqual({ has: false, value: undefined });
	});

	it("compares values whatever order their keys are in", () => {
		expect(sameValue({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
		expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
		expect(sameValue([1], { 0: 1 })).toBe(false);
	});
});
