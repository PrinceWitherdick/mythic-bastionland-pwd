import { beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

/**
 * A Domain's rulers, heirs and Seasons (p17, p20–21): who may take it, how the
 * Knights' links follow a new ruler, what the Referee is told of a ruler who
 * dies or is deleted, the leverage only the Referee hears, and the rolls made
 * once a Season.
 */

/** What the windows answer, and what the active GM answers when asked. */
let formData;
let confirmed;
let answered;
/** The d6s the next rolls give, in order. */
let rolled;

vi.mock("../../module/apps/ui.js", () => ({
	chooseDialog: vi.fn(),
	confirmDialog: vi.fn(async () => confirmed),
	inputDialog: vi.fn(async () => formData)
}));
vi.mock("../../module/ask-gm.js", () => ({ askActiveGM: vi.fn(async () => answered) }));
vi.mock("../../module/compat.js", () => ({ queryAsker: (context) => context?.user ?? null }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => null }));
vi.mock("../../module/chat/cards.js", () => ({
	postCard: vi.fn(async (_actor, _template, context, options) => ({ context, options })),
	registerCardButtons: vi.fn(),
	t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key),
	warn: vi.fn()
}));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({ age: 1, year: 1, season: "spring", day: 1, phase: "morning" }) }));
vi.mock("../../module/actions/court.js", () => ({
	knightsBesidesRuler: (domain) => game.actors.filter((actor) => ["knight", "npcKnight"].includes(actor.type)
		&& !actor.system.slain && !actor.system.isSquire && actor.name !== domain.system.ruler),
	seatCircle: vi.fn(async () => true)
}));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollSpark: vi.fn() }));
vi.mock("../../module/actions/succession.js", () => ({
	namedHeirOf: (knight) => game.actors.find((actor) => actor.uuid === knight.system.successor) ?? null
}));
vi.mock("../../module/actions/knights.js", () => ({
	worldKnights: (keep = () => true) => game.actors.filter((actor) => ["knight", "npcKnight"].includes(actor.type) && keep(actor)),
	seenOrChosen: (chosen) => (knight) => Boolean(knight.visible) || Boolean(chosen(knight))
}));
vi.mock("../../module/actions/timeline-events.js", () => ({
	timelineCrisisResolved: vi.fn(),
	timelineCrisisRoll: vi.fn(),
	timelineDrama: vi.fn(),
	timelineNewRuler: vi.fn()
}));

const dominion = await import("../../module/actions/dominion.js");
const { postCard, warn } = await import("../../module/chat/cards.js");
const { confirmDialog, inputDialog } = await import("../../module/apps/ui.js");
const { askActiveGM } = await import("../../module/ask-gm.js");
const { seatCircle } = await import("../../module/actions/court.js");

/** Every Actor update made, in order. */
let updated;

/** @returns {object} An Actor that writes what it's given into its system, as Foundry does. */
function makeActor({ id, type, name, system = {}, isOwner = true, visible = true }) {
	const actor = {
		id,
		uuid: `Actor.${id}`,
		documentName: "Actor",
		type,
		name,
		isOwner,
		visible,
		system,
		testUserPermission: (user) => user?.owns?.includes(id) ?? false,
		update: vi.fn(async (changes) => {
			updated.push({ _id: id, ...changes });
			for (const [path, value] of Object.entries(changes)) {
				const keys = path.replace(/^system\./, "").split(".");
				const last = keys.pop();
				keys.reduce((node, key) => (node[key] ??= {}), actor.system)[last] = value;
			}
		})
	};
	return actor;
}

const knight = (id, name, system = {}, more = {}) => makeActor({ id, type: "knight", name, system: { domain: "", successor: "", slain: false, isSquire: false, ...system }, ...more });
const domain = (id, name, system = {}, more = {}) => makeActor({
	id,
	type: "domain",
	name,
	system: { ruler: "", successor: "", crises: [], council: { steward: "", circle: [] }, court: {}, ...system },
	...more
});

/** Put the Actors in the world, looked up by id or uuid as Foundry's collection and fromUuidSync do. */
function world(...actors) {
	game.actors = Object.assign(actors, { get: (id) => actors.find((actor) => actor.id === id) });
	globalThis.fromUuidSync = (uuid) => actors.find((actor) => actor.uuid === uuid) ?? null;
}

beforeEach(() => {
	vi.clearAllMocks();
	formData = null;
	confirmed = true;
	answered = true;
	rolled = [];
	updated = [];
	globalThis.game = { user: { isGM: true }, users: { activeGM: { isSelf: true } }, actors: [] };
	globalThis.CONFIG = { queries: {} };
	globalThis.Roll = class {
		async evaluate() {
			this.total = rolled.shift() ?? 4;
			return this;
		}
	};
	globalThis.Actor = {
		implementation: {
			updateDocuments: vi.fn(async (updates) => {
				for (const { _id, ...changes } of updates) {
					const actor = game.actors.get(_id);
					updated.push({ _id, ...changes });
					if (actor && "system.domain" in changes) actor.system.domain = changes["system.domain"];
				}
			})
		}
	};
	globalThis.foundry = {
		utils: {
			getProperty: (object, path) => path.split(".").reduce((node, key) => node?.[key], object),
			isEmpty: (value) => !Object.keys(value ?? {}).length
		}
	};
});

describe("who may take a Domain (p7, p21)", () => {
	it("offers no Squire or Slain Knight as the new ruler", async () => {
		world(knight("k1", "Tal"), knight("k2", "Moss", { slain: true }), knight("s1", "Pip", { isSquire: true }), domain("d1", "Ashford"));
		await dominion.seizeDomain(game.actors.get("d1"));
		expect(inputDialog.mock.calls[0][0].context.knights.map(({ name }) => name)).toEqual(["Tal"]);
	});

	it("says a named successor who is Slain leaves no living heir, and doesn't write them in", async () => {
		const moss = knight("k2", "Moss", { slain: true });
		const tal = knight("k1", "Tal", { domain: "Actor.d1", successor: moss.uuid });
		world(tal, moss, domain("d1", "Ashford", { ruler: "Tal" }));
		expect(dominion.domainSuccessor(game.actors.get("d1"))).toEqual({ name: "", fallen: "Moss" });
		expect(dominion.namedSuccessor(game.actors.get("d1"))).toBe("");
		await dominion.passOnDomain(game.actors.get("d1"));
		const { name, hint } = inputDialog.mock.calls[0][0].context;
		expect(name).toBe("");
		expect(hint).toContain("domain.passOn.heirFell");
	});

	it("reads a successor written on the Domain as fallen only when every Knight of that name is Slain", () => {
		world(knight("k2", "Moss", { slain: true }), domain("d1", "Ashford", { ruler: "Tal", successor: "Moss" }), domain("d2", "Bree", { successor: "Lord Quill" }));
		expect(dominion.domainSuccessor(game.actors.get("d1"))).toEqual({ name: "", fallen: "Moss" });
		expect(dominion.domainSuccessor(game.actors.get("d2"))).toEqual({ name: "Lord Quill", fallen: "" });
	});
});

describe("a new ruler (p20–21)", () => {
	it("moves the Knights' links, and takes the new ruler out of the Circle", async () => {
		const tal = knight("k1", "Tal", { domain: "Actor.d1" });
		const moss = knight("k2", "Moss");
		const ashford = domain("d1", "Ashford", { ruler: "Tal", council: { steward: "", circle: ["k2", "k3"] } });
		world(tal, moss, ashford);
		formData = { knight: moss.uuid, name: "" };
		await dominion.passOnDomain(ashford);
		expect(ashford.update).toHaveBeenCalledWith({ "system.ruler": "Moss", "system.council.circle": ["k3"], "system.successor": "" });
		expect(Actor.implementation.updateDocuments).toHaveBeenCalledWith([{ _id: "k1", "system.domain": "" }, { _id: "k2", "system.domain": "Actor.d1" }]);
	});

	it("asks the active GM to move the links of Knights a player doesn't own, as joinCompany does", async () => {
		game.user = { isGM: false };
		const tal = knight("k1", "Tal", { domain: "Actor.d1" }, { isOwner: false });
		const moss = knight("k2", "Moss");
		const ashford = domain("d1", "Ashford", { ruler: "Tal" });
		world(tal, moss, ashford);
		formData = { knight: moss.uuid, name: "" };
		await dominion.seizeDomain(ashford);
		expect(askActiveGM).toHaveBeenCalledWith(`${SYSTEM_ID}.domainRuler`, { domainId: "d1", knightId: "k2" }, expect.any(String));
		expect(Actor.implementation.updateDocuments).not.toHaveBeenCalled();
	});

	it("moves only this player's own Knights, and says so, with no Referee to ask", async () => {
		game.user = { isGM: false };
		game.users.activeGM = null;
		const tal = knight("k1", "Tal", { domain: "Actor.d1" }, { isOwner: false });
		const moss = knight("k2", "Moss");
		const ashford = domain("d1", "Ashford", { ruler: "Tal" });
		world(tal, moss, ashford);
		formData = { knight: moss.uuid, name: "" };
		await dominion.seizeDomain(ashford);
		expect(Actor.implementation.updateDocuments).toHaveBeenCalledWith([{ _id: "k2", "system.domain": "Actor.d1" }]);
		expect(warn).toHaveBeenCalledWith("domain.rulerLinksNeedReferee", { name: "Ashford" });
	});

	it("answers a player's ask only for a Domain they own, and only for the ruler it names", async () => {
		const tal = knight("k1", "Tal", { domain: "Actor.d1" });
		const moss = knight("k2", "Moss");
		const ashford = domain("d1", "Ashford", { ruler: "Moss" });
		world(tal, moss, ashford);
		expect(await dominion.onRulerQuery({ domainId: "d1", knightId: "k2" }, { user: { owns: [] } })).toBe(false);
		expect(await dominion.onRulerQuery({ domainId: "d1", knightId: "k1" }, { user: { owns: ["d1"] } })).toBe(false);
		expect(await dominion.onRulerQuery({ domainId: "d1", knightId: "k2" }, { user: { owns: ["d1"] } })).toBe(true);
		expect([tal.system.domain, moss.system.domain]).toEqual(["", "Actor.d1"]);
	});

	it("warns when the new ruler already rules another Domain, whose link their sheet gives up", async () => {
		const moss = knight("k2", "Moss", { domain: "Actor.d2" });
		const bree = domain("d2", "Bree", { ruler: "Moss" });
		const ashford = domain("d1", "Ashford", { ruler: "Tal" });
		world(moss, bree, ashford);
		formData = { knight: moss.uuid, name: "" };
		await dominion.seizeDomain(ashford);
		expect(warn).toHaveBeenCalledWith("domain.rulesAnother", { name: "Moss", other: "Bree", domain: "Ashford" });
	});
});

describe("a ruler who dies or leaves the world (p21)", () => {
	it("tells the Referee of every Domain a Slain Knight ruled, not just the one their sheet links", async () => {
		const tal = knight("k1", "Tal", { domain: "Actor.d1", slain: true });
		world(tal, domain("d1", "Ashford", { ruler: "Tal" }), domain("d2", "Bree", { ruler: "Tal" }), domain("d3", "Cole", { ruler: "Moss" }));
		const cards = await dominion.noticeRulerSlain(tal, { system: { slain: true } });
		expect(cards.map(({ options }) => options.flags[SYSTEM_ID].passOn)).toEqual(["Actor.d1", "Actor.d2"]);
	});

	it("leaves out a Domain another Knight of the same name rules", async () => {
		const tal = knight("k1", "Tal", { domain: "Actor.d1", slain: true });
		const other = knight("k9", "Tal", { domain: "Actor.d2" });
		world(tal, other, domain("d1", "Ashford", { ruler: "Tal" }), domain("d2", "Bree", { ruler: "Tal" }));
		const cards = await dominion.noticeRulerSlain(tal, { system: { slain: true } });
		expect(cards).toHaveLength(1);
	});

	it("says there's no living heir when the successor is Slain too", async () => {
		const moss = knight("k2", "Moss", { slain: true });
		const tal = knight("k1", "Tal", { domain: "Actor.d1", successor: moss.uuid, slain: true });
		world(tal, moss, domain("d1", "Ashford", { ruler: "Tal" }));
		const [card] = await dominion.noticeRulerSlain(tal, { system: { slain: true } });
		expect(card.context.text).toContain("domain.rulerSlainBare");
		expect(card.context.text).toContain("domain.noLivingHeir");
	});

	it("tells of a ruler deleted from the world, but not one told of already as Slain", async () => {
		const tal = knight("k1", "Tal", { domain: "Actor.d1" });
		world(domain("d1", "Ashford", { ruler: "Tal" }));
		const [card] = await dominion.noticeRulerDeleted(tal);
		expect(card.context.text).toContain("domain.rulerGone");
		expect(await dominion.noticeRulerDeleted(knight("k2", "Tal", { domain: "Actor.d1", slain: true }))).toEqual([]);
		game.users.activeGM.isSelf = false;
		expect(await dominion.noticeRulerDeleted(tal)).toEqual([]);
	});
});

describe("Drama in Court's leverage (p21)", () => {
	const court = { c1: { role: "courtier", name: "Wren", leverage: "Letters", note: "Wants a seat", at: 1 } };

	it("posts the courtier without their leverage, and whispers that to the Referee", async () => {
		rolled = [4, 1];
		const ashford = domain("d1", "Ashford", { court });
		world(ashford);
		await dominion.dramaInCourt(ashford);
		const [report, whisper] = [postCard.mock.calls.find(([, template]) => template === "report"), postCard.mock.calls.find(([, template]) => template === "note")];
		expect(report[2].entries[0].lines).toEqual(["Wants a seat"]);
		expect(JSON.stringify(report[2])).not.toContain("Letters");
		expect(whisper[2].text).toContain("Letters");
		expect(whisper[3].mode).toBe("gm");
	});

	it("has a player ask the active GM to whisper it, rather than whisper it themselves", async () => {
		rolled = [4, 1];
		game.user = { isGM: false };
		const ashford = domain("d1", "Ashford", { court });
		world(ashford);
		await dominion.dramaInCourt(ashford);
		expect(askActiveGM).toHaveBeenCalledWith(`${SYSTEM_ID}.courtLeverage`, { domainId: "d1", memberId: "c1" }, expect.any(String));
		expect(postCard.mock.calls.some(([, template]) => template === "note")).toBe(false);
	});

	it("whispers for a player only of a Domain they own", async () => {
		const ashford = domain("d1", "Ashford", { court });
		world(ashford);
		expect(await dominion.onLeverageQuery({ domainId: "d1", memberId: "c1" }, { user: { owns: [] } })).toBe(false);
		expect(await dominion.onLeverageQuery({ domainId: "d1", memberId: "c1" }, { user: { owns: ["d1"] } })).toBe(true);
	});
});

describe("Increased Collections (p20–21)", () => {
	it("asks who of the Circle rides away in a misrule it brings, and says how that misrule ends", async () => {
		rolled = [1];
		const ashford = domain("d1", "Ashford", { council: { steward: "r1", circle: ["k2"] } });
		await dominion.increasedCollections(ashford);
		expect(seatCircle).toHaveBeenCalledWith(ashford, { intro: expect.stringContaining("domain.misruleLeave") });
		expect(postCard.mock.calls[0][2].hint).toContain("domain.collectionsMisruleEnds");
	});

	it("says when no Steward sits on the Council", async () => {
		rolled = [5];
		await dominion.increasedCollections(domain("d1", "Ashford"));
		expect(postCard.mock.calls[0][2].hint).toContain("domain.collectionsNoSteward");
	});

	it("offers to resolve Debt with the coffers filled, and resolves it when that's taken", async () => {
		rolled = [5];
		const ashford = domain("d1", "Ashford", { crises: ["chaos", "debt"], council: { steward: "r1", circle: [] } });
		await dominion.increasedCollections(ashford);
		expect(confirmDialog).toHaveBeenCalledTimes(1);
		expect(ashford.system.crises).toEqual(["chaos"]);
	});

	it("offers nothing for Debt in a misrule, or without Debt", async () => {
		rolled = [1];
		await dominion.increasedCollections(domain("d1", "Ashford", { crises: ["debt"] }));
		rolled = [5];
		await dominion.increasedCollections(domain("d2", "Bree", { crises: ["chaos"] }));
		expect(confirmDialog).not.toHaveBeenCalled();
	});
});

describe("once a Season (p20–21)", () => {
	it("confirms a second Crisis Roll this Season, and rolls nothing when refused", async () => {
		confirmed = false;
		const { seasonKey } = await import("../../module/rules/time.js");
		const ashford = domain("d1", "Ashford", { crisisRolled: seasonKey({ age: 1, year: 1, season: "spring", day: 1, phase: "morning" }) });
		expect(await dominion.crisisRollOnce(ashford)).toBeNull();
		expect(confirmDialog).toHaveBeenCalledTimes(1);
		expect(ashford.update).not.toHaveBeenCalled();
	});

	it("rolls the first without asking", async () => {
		const ashford = domain("d1", "Ashford");
		await dominion.crisisRollOnce(ashford);
		expect(confirmDialog).not.toHaveBeenCalled();
		expect(ashford.update).toHaveBeenCalled();
	});

	it("confirms a second Drama in Court this Season", async () => {
		confirmed = false;
		const { seasonKey } = await import("../../module/rules/time.js");
		const ashford = domain("d1", "Ashford", { dramaRolled: seasonKey({ age: 1, year: 1, season: "spring", day: 1, phase: "morning" }) });
		expect(await dominion.dramaOnce(ashford)).toBeNull();
		expect(confirmDialog).toHaveBeenCalledTimes(1);
	});
});
