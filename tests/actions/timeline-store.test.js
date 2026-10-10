import { beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
vi.mock("../../module/actions/realm.js", () => ({ isRealmScene: (scene) => Boolean(scene?.realm) }));

const store = await import("../../module/actions/timeline-store.js");
const { addEntry, removeEntry } = await import("../../module/rules/timeline.js");

/** A page that keeps what it's written, the way the server merges an update. */
function fakePage(journal, data) {
	const page = {
		id: data._id ?? `p${journal.pages.length}`,
		type: data.type,
		name: data.name,
		sort: data.sort ?? 0,
		ownership: { ...data.ownership },
		parent: journal,
		get isOwner() {
			return journal.isOwner && page.ownership.default !== 0;
		},
		testUserPermission: (user) => user.isGM || page.ownership.default !== 0,
		system: foundryClone(data.system),
		flags: data.flags,
		getFlag: (scope, key) => page.flags?.[scope]?.[key],
		updates: [],
		async update(update) {
			page.updates.push(update);
			for (const [path, value] of Object.entries(update)) {
				const parts = path.split(".");
				const last = parts.pop();
				let at = page;
				for (const part of parts) at = at[part] ??= {};
				if (last.startsWith("-=")) delete at[last.slice(2)];
				else at[last] = foundryClone(value);
			}
		}
	};
	return page;
}

const foundryClone = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

function fakeJournal({ owner = true } = {}) {
	const journal = {
		pages: [],
		isOwner: owner,
		flags: { [SYSTEM_ID]: { timelineJournal: true } },
		getFlag: (scope, key) => journal.flags[scope]?.[key],
		createEmbeddedDocuments: vi.fn(async (_type, rows) => rows.map((row) => {
			const page = fakePage(journal, row);
			journal.pages.push(page);
			return page;
		})),
		updateEmbeddedDocuments: vi.fn(async (_type, rows) => {
			for (const { _id, ...row } of rows) {
				const page = journal.pages.find((each) => each.id === _id);
				if ("name" in row) page.name = row.name;
				if ("ownership.default" in row) page.ownership.default = row["ownership.default"];
			}
		})
	};
	return journal;
}

let journal;
const SEEN = { default: 0, p1: 3 };
const actor = (id, type, extra = {}) => ({ id, type, name: `Name ${id}`, ownership: SEEN, ...extra });

beforeEach(() => {
	journal = fakeJournal();
	const actors = [actor("k1", "knight", { hasPlayerOwner: true }), actor("k2", "knight", { hasPlayerOwner: false, ownership: { default: 0 } }), actor("d1", "domain"), actor("d2", "domain", { ownership: { default: 0, gm: 3 } })];
	const users = { p1: { isGM: false }, gm: { isGM: true } };
	globalThis.game = {
		user: { isGM: true, id: "u1" },
		users: { activeGM: { isSelf: true }, get: (id) => users[id] },
		journal: { find: (test) => [journal].find(test) },
		actors: { contents: actors, get: (id) => actors.find((a) => a.id === id) },
		scenes: { contents: [{ id: "s1", documentName: "Scene", name: "Realm", realm: true }, { id: "s2", documentName: "Scene", name: "Not one" }], get: (id) => ({ s1: { name: "Realm" } })[id] }
	};
	globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { INHERIT: -1, NONE: 0, OBSERVER: 2, OWNER: 3 } };
	globalThis.foundry = { utils: { getDocumentClass: () => ({ create: vi.fn() }), hasProperty: () => false } };
});

describe("threads", () => {
	it("names the thread of the Company, a Knight, a Domain and a Realm", () => {
		expect(store.trackFor("company")).toMatchObject({ trackId: "company", kind: "company" });
		expect(store.trackFor(actor("k1", "knight"))).toMatchObject({ trackId: "k1", kind: "knight" });
		expect(store.trackFor({ id: "s1", documentName: "Scene", realm: true })).toMatchObject({ trackId: "realm:s1", kind: "realm" });
		expect(store.trackFor({ id: "s2", documentName: "Scene" })).toBeNull();
		expect(store.trackFor(actor("n1", "npc"))).toBeNull();
	});

	it("gives a page to the Company, played Knights, Domains and Realms, but not NPC Knights", async () => {
		expect(await store.syncTrackPages()).toBe(5);
		expect(journal.pages.map((page) => store.pageTrackId(page))).toEqual(["company", "k1", "d1", "d2", "realm:s1"]);
		expect(await store.syncTrackPages()).toBe(0);
	});

	it("keeps the thread of a Knight or Domain no player can see from the players", async () => {
		expect(store.trackFor(game.actors.get("k1")).secret).toBe(false);
		expect(store.trackFor(game.actors.get("k2")).secret).toBe(true);
		expect(store.trackFor(actor("k9", "knight", { ownership: { default: 2 } })).secret).toBe(false);
		await store.syncTrackPages();
		await store.ensureTrackPage(store.trackFor(game.actors.get("k2")));
		const defaults = Object.fromEntries(journal.pages.map((page) => [store.pageTrackId(page), page.ownership.default]));
		expect(defaults).toEqual({ company: -1, k1: -1, d1: -1, d2: 0, "realm:s1": -1, k2: 0 });

		game.user.isGM = false;
		expect(store.allTracks().map((t) => t.trackId)).toEqual(["company", "k1", "d1", "realm:s1"]);
		expect(await store.mutateTrack({ trackId: "d2" }, (entries) => addEntry(entries, { title: "x" }))).toBeNull();
	});

	it("shows a thread to the players, or hides it, as its actor comes to be seen or not", async () => {
		await store.syncTrackPages();
		const d2 = journal.pages.find((page) => store.pageTrackId(page) === "d2");
		game.actors.get("d2").ownership = SEEN;
		await store.syncTrackPages();
		expect(d2.ownership.default).toBe(0);
		await store.syncTrackPages({ seen: ["d2"] });
		expect(d2.ownership.default).toBe(-1);
	});

	it("keeps a page's name in step with its thread's", async () => {
		await store.syncTrackPages();
		game.actors.get("k1").name = "Sir Renamed";
		await store.syncTrackPages();
		expect(journal.pages[1].name).toBe("Sir Renamed");
	});

	it("leaves syncing, and making the Timeline, to the active Referee", async () => {
		game.users.activeGM.isSelf = false;
		expect(await store.syncTrackPages()).toBe(0);
		expect(journal.pages).toHaveLength(0);
		const create = vi.fn();
		foundry.utils.getDocumentClass = () => ({ create });
		game.journal.find = () => undefined;
		expect(await store.ensureTimelineJournal()).toBeNull();
		expect(create).not.toHaveBeenCalled();
	});

	it("lets a player make a thread's page in a Timeline they own, but not the Timeline itself", async () => {
		game.user.isGM = false;
		expect(await store.ensureTrackPage({ trackId: "k2", kind: "knight", name: "NPC" })).not.toBeNull();
		journal = fakeJournal({ owner: false });
		expect(await store.ensureTrackPage({ trackId: "k3", kind: "knight" })).toBeNull();
	});
});

describe("writing", () => {
	const track = { trackId: "k1", kind: "knight", name: "Sir" };

	it("writes only what moved: whole rows added, fields changed, rows deleted", async () => {
		await store.mutateTrack(track, (entries) => addEntry(entries, { id: "a", title: "One", season: "1-spring" }), { create: true });
		const page = store.findTrackPage("k1");
		expect(Object.keys(page.updates[0])).toEqual(["system.entries.a"]);

		await store.mutateTrack(track, (entries) => ({ entries: entries.map((e) => ({ ...e, title: "Two" })), changed: true }));
		expect(page.updates[1]).toEqual({ "system.entries.a.title": "Two" });

		await store.mutateTrack(track, (entries) => removeEntry(entries, "a"));
		expect(Object.keys(page.updates[2])).toEqual(["system.entries.-=a"]);
		expect(page.system.entries).toEqual({});
	});

	it("writes nothing when nothing moved, or there's no page and none to be made", async () => {
		expect(await store.mutateTrack(track, (entries) => ({ entries, added: null }), { create: true })).toBeNull();
		expect(await store.mutateTrack({ trackId: "zz" }, (entries) => addEntry(entries, { title: "x" }))).toBeNull();
	});

	it("takes each write in turn, so a burst on one thread keeps every row", async () => {
		await Promise.all([1, 2, 3].map((n) => store.mutateTrack(track, (entries) => addEntry(entries, { id: `e${n}`, season: "1-spring" }), { create: true })));
		expect(Object.keys(store.findTrackPage("k1").system.entries).sort()).toEqual(["e1", "e2", "e3"]);
	});

	it("takes a milestone out of every thread", async () => {
		const mark = (id) => (entries) => addEntry(entries, { id, key: "myth:x", season: "1-spring" });
		await store.mutateTrack(track, mark("a"), { create: true });
		await store.mutateTrack({ trackId: "company", kind: "company" }, mark("b"), { create: true });
		await store.removeKeyEverywhere("myth:x");
		expect(store.allTracks().every((t) => !Object.keys(t.entries).length)).toBe(true);
	});

	it("lists every Season on the Timeline", async () => {
		await store.mutateTrack(track, (entries) => addEntry(entries, { id: "a", season: "2-winter" }), { create: true });
		await store.mutateTrack({ trackId: "company", kind: "company" }, (entries) => addEntry(entries, { id: "b", season: "" }), { create: true });
		expect([...store.allSeasons()]).toEqual(["2-winter"]);
		expect(store.allTracks().map((t) => t.trackId)).toEqual(["company", "k1"]);
	});
});
