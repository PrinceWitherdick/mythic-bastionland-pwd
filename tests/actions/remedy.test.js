import { beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

vi.mock("../../module/apps/ui.js", () => ({ confirmDialog: vi.fn() }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => ({})), t: (key) => key }));
vi.mock("../../module/actions/actor-updates.js", () => import("../mocks/actor-updates.js"));
vi.mock("../../module/actions/ledger.js", () => ({ causedBy: () => ({}) }));
vi.mock("../../module/actions/saves.js", () => ({ acceptAfterTelling: vi.fn() }));
vi.mock("../../module/actions/time.js", () => ({ advancePhase: vi.fn(async () => null), chooseCompany: vi.fn(async () => company) }));
vi.mock("../../module/actions/ask-referee.js", () => ({ askReferee: vi.fn(async () => null) }));
// Like the real one, with no GM there is nobody to answer.
vi.mock("../../module/ask-gm.js", () => ({ askActiveGM: vi.fn(async () => (globalThis.game?.users?.activeGM ? answered : false)) }));
vi.mock("../../module/compat.js", () => ({ queryAsker: (context) => context?.user ?? null }));
vi.mock("../../module/actions/knights.js", () => ({ inCompany: (actor) => Boolean(actor.riding), worldKnights: (keep) => world.filter((actor) => actor.type === "knight" && keep(actor)) }));
vi.mock("../../module/actions/fallen.js", () => ({ companionsOf: (knight) => knight.companions ?? [], worldCompanions: () => [] }));

const { onRemedyQuery, useRemedy, warnDyingAfterCombat } = await import("../../module/actions/recovery.js");
const { askActiveGM } = await import("../../module/ask-gm.js");
const { postCard } = await import("../../module/chat/cards.js");
const { advancePhase, chooseCompany } = await import("../../module/actions/time.js");
const { askReferee } = await import("../../module/actions/ask-referee.js");

/** Who the Referee ticks as present, what the active GM answers, and the world’s actors. */
let company;
let answered;
let world;

const knight = (name, more = {}) => ({ name, uuid: `Actor.${name}`, type: "knight", isOwner: true, system: { virtues: { vig: { value: 2, max: 12 } } }, update: vi.fn(async () => {}), ...more });
const sustenance = () => ({ name: "Sustenance", system: { remedy: "vig", quantity: { value: 1, max: 0 } }, delete: vi.fn(async () => {}), update: vi.fn() });

beforeEach(() => {
	vi.clearAllMocks();
	company = null;
	answered = false;
	world = [];
	globalThis.game = { user: { isGM: true }, users: { activeGM: { isSelf: true } } };
	globalThis.ui = { notifications: { warn: vi.fn() } };
	globalThis.fromUuidSync = (uuid) => world.find((actor) => actor.uuid === uuid) ?? world.flatMap((actor) => actor.items ?? []).find((item) => item.uuid === uuid) ?? null;
});

describe("useRemedy", () => {
	it("restores the Virtue of all present, then offers the Phase it takes (p9)", async () => {
		const alys = knight("Alys");
		company = [{ actor: alys }];
		const item = sustenance();
		await useRemedy(alys, item);
		expect(alys.update).toHaveBeenCalledWith({ "system.virtues.vig.value": 12 }, {});
		expect(item.delete).toHaveBeenCalled();
		expect(advancePhase).toHaveBeenCalledTimes(1);
		expect(askReferee).not.toHaveBeenCalled();
	});

	it("offers the Knights' steeds and followers too, as all present benefit (p9)", async () => {
		const alys = knight("Alys");
		company = [{ actor: alys }];
		await useRemedy(alys, sustenance());
		expect(chooseCompany).toHaveBeenCalledWith(expect.objectContaining({ present: [alys], companions: true }));
	});

	it("has a player ask the Referee to move the Phase on", async () => {
		game.user.isGM = false;
		const alys = knight("Alys");
		company = [{ actor: alys }];
		await useRemedy(alys, sustenance());
		expect(advancePhase).not.toHaveBeenCalled();
		expect(askReferee).toHaveBeenCalledWith("roll", "phase", "remedy.passPhase");
	});

	it("offers a player the whole Company, and has the active GM restore those they don’t own", async () => {
		game.user.isGM = false;
		game.users.activeGM = { isSelf: false };
		const alys = knight("Alys");
		const bram = knight("Bram", { isOwner: false });
		company = [{ actor: alys }, { actor: bram }];
		answered = ["Actor.Bram"];
		const item = { ...sustenance(), uuid: "Actor.Alys.Item.s" };
		const entries = await useRemedy(alys, item);
		expect(chooseCompany).toHaveBeenCalledWith(expect.objectContaining({ wholeCompany: true }));
		expect(alys.update).toHaveBeenCalledWith({ "system.virtues.vig.value": 12 }, {});
		expect(bram.update).not.toHaveBeenCalled();
		expect(askActiveGM).toHaveBeenCalledWith(`${SYSTEM_ID}.remedy`, { itemUuid: item.uuid, virtue: "vig", actorUuids: ["Actor.Bram"] }, expect.any(String));
		expect(entries.map(({ name }) => name)).toEqual(["Alys", "Bram"]);
		expect(ui.notifications.warn).not.toHaveBeenCalled();
		// The Referee spent it as they answered, so it isn't spent twice.
		expect(item.delete).not.toHaveBeenCalled();
	});

	it("restores only what a player owns with no Referee to ask, and says who was left", async () => {
		game.user.isGM = false;
		game.users.activeGM = null;
		const alys = knight("Alys");
		const bram = knight("Bram", { isOwner: false });
		company = [{ actor: alys }, { actor: bram }];
		const item = sustenance();
		const entries = await useRemedy(alys, item);
		expect(entries.map(({ name }) => name)).toEqual(["Alys"]);
		expect(ui.notifications.warn).toHaveBeenCalledWith("remedy.othersNeedReferee");
		expect(item.delete).toHaveBeenCalled();
	});

	it("spends no Phase when nobody used it", async () => {
		company = [];
		await useRemedy(knight("Alys"), sustenance());
		expect(advancePhase).not.toHaveBeenCalled();
	});
});

describe("onRemedyQuery", () => {
	/** A Remedy carried by a Knight, as Foundry looks one up. */
	const carried = (carrier, system = { remedy: "vig" }) => {
		const item = { documentName: "Item", uuid: `${carrier.uuid}.Item.r`, parent: carrier, system, testUserPermission: () => false, delete: vi.fn(async () => {}), update: vi.fn(async () => {}) };
		carrier.items = [item];
		return item;
	};
	const owner = (...ids) => (user) => ids.includes(user.id);

	it("restores the Company and its companions for a player carrying a Remedy of that Virtue", async () => {
		const pony = knight("Pony", { type: "npc" });
		const alys = knight("Alys", { riding: true, testUserPermission: owner("p1") });
		const bram = knight("Bram", { riding: true, companions: [pony] });
		const stranger = knight("Stranger");
		world = [alys, bram, pony, stranger];
		const item = carried(alys);
		const uuids = [bram.uuid, pony.uuid, stranger.uuid];
		expect(await onRemedyQuery({ itemUuid: item.uuid, virtue: "vig", actorUuids: uuids }, { user: { id: "p1" } })).toEqual([bram.uuid, pony.uuid]);
		expect(bram.update).toHaveBeenCalledWith({ "system.virtues.vig.value": 12 }, {});
		expect(stranger.update).not.toHaveBeenCalled();
		// Spent as it's shared, so asking again finds nothing to share.
		expect(item.delete).toHaveBeenCalled();
	});

	it("refuses a Remedy with none left", async () => {
		const alys = knight("Alys", { riding: true, testUserPermission: owner("p1") });
		const bram = knight("Bram", { riding: true });
		world = [alys, bram];
		const item = carried(alys, { remedy: "vig", quantity: { value: 0, max: 3 } });
		expect(await onRemedyQuery({ itemUuid: item.uuid, virtue: "vig", actorUuids: [bram.uuid] }, { user: { id: "p1" } })).toBe(false);
		expect(bram.update).not.toHaveBeenCalled();
	});

	it("refuses a Remedy the asker doesn’t carry, or of another Virtue", async () => {
		const alys = knight("Alys", { riding: true, testUserPermission: owner("p1") });
		const bram = knight("Bram", { riding: true });
		world = [alys, bram];
		const item = carried(alys);
		expect(await onRemedyQuery({ itemUuid: item.uuid, virtue: "vig", actorUuids: [bram.uuid] }, { user: { id: "p2" } })).toBe(false);
		expect(await onRemedyQuery({ itemUuid: item.uuid, virtue: "spi", actorUuids: [bram.uuid] }, { user: { id: "p1" } })).toBe(false);
		game.user.isGM = false;
		expect(await onRemedyQuery({ itemUuid: item.uuid, virtue: "vig", actorUuids: [bram.uuid] }, { user: { id: "p1" } })).toBe(false);
		expect(bram.update).not.toHaveBeenCalled();
	});
});

describe("warnDyingAfterCombat", () => {
	const actor = (name, system) => ({ name, system });
	const fight = (...actors) => ({ started: true, combatants: actors.map((each) => ({ actor: each })) });

	it("names to the Referee alone everybody the fight left dying (p8)", async () => {
		game.users = { activeGM: { isSelf: true } };
		const hal = actor("Hal", { mortalWound: true });
		const named = await warnDyingAfterCombat(fight(hal, hal, actor("Bandit", { mortalWound: false }), actor("Raiders", { mortalWound: true, scale: "warband" }), actor("Corpse", { slain: true, mortalWound: true })));
		expect(named).toEqual([hal]);
		expect(postCard).toHaveBeenCalledWith(null, "note", expect.objectContaining({ text: "recovery.dyingAfterCombat" }), { mode: "gm" });
	});

	it("says nothing when nobody is dying, on another client, or for a fight never begun", async () => {
		game.users = { activeGM: { isSelf: true } };
		expect(await warnDyingAfterCombat(fight(actor("Bandit", {})))).toEqual([]);
		expect(await warnDyingAfterCombat({ ...fight(actor("Hal", { mortalWound: true })), started: false })).toEqual([]);
		game.users = { activeGM: { isSelf: false } };
		expect(await warnDyingAfterCombat(fight(actor("Hal", { mortalWound: true })))).toEqual([]);
		expect(postCard).not.toHaveBeenCalled();
	});
});
