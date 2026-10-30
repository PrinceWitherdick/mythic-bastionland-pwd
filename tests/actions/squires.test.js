import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Taking, claiming, letting go and Knighting a Squire (p7), with the dialogs,
 * chat and Timeline stood in for.
 */

/** What the yes-or-no question answers, and the Knights the Company has. */
let confirmed;
let knights;

vi.mock("../../module/apps/ui.js", () => ({ confirmDialog: vi.fn(async () => confirmed) }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => ({})), t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));
vi.mock("../../module/actions/knights.js", () => ({
	COMPANY_KNIGHT_FLAG: "companyKnight",
	companyKnights: () => knights,
	inCompany: () => true,
	worldKnights: (keep = () => true) => game.actors.filter((actor) => actor.type === "knight" && keep(actor))
}));
vi.mock("../../module/actions/solo.js", () => ({ SOLO_CHANGED_HOOK: "soloChanged", isSolo: () => false }));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineKnighted: vi.fn(async () => null), timelineSquireTaken: vi.fn(async () => null) }));
vi.mock("../../module/apps/KnightChooser.js", () => ({ openKnightChooser: vi.fn() }));

const { claimSquire, knightSquire, releaseSquire, servingSquire, takeSquire } = await import("../../module/actions/squires.js");
const { confirmDialog } = await import("../../module/apps/ui.js");
const { timelineSquireTaken } = await import("../../module/actions/timeline-events.js");

/**
 * One actor as the Squire actions read and write it.
 * @param {object} options
 */
function actor({ id, name, type = "knight", system = {}, ownership = {}, isOwner = true }) {
	const made = {
		id,
		uuid: `Actor.${id}`,
		documentName: "Actor",
		name,
		type,
		system: { isSquire: false, squire: "", serves: "", steed: "", slain: false, ...system },
		ownership,
		isOwner,
		folder: null,
		sheet: { render: vi.fn() },
		testUserPermission: (user) => (ownership[user.id] ?? 0) >= 3,
		getFlag: () => undefined,
		update: vi.fn(async (changes) => {
			for (const [key, value] of Object.entries(changes)) {
				if (key.startsWith("system.")) made.system[key.slice(7)] = value;
				else made[key] = value;
			}
			return made;
		})
	};
	return made;
}

const knight = (id = "k1", extra = {}) => actor({ id, name: `Sir ${id}`, ownership: { default: 0, alys: 3 }, ...extra });
const squire = (id = "s1", system = {}, extra = {}) => actor({ id, name: `Squire ${id}`, system: { isSquire: true, ...system }, ...extra });

beforeEach(() => {
	confirmed = true;
	knights = [];
	globalThis.game = {
		actors: [],
		users: [{ id: "alys", isGM: false }, { id: "ben", isGM: false }, { id: "gm", isGM: true }],
		user: { isGM: true, can: () => true },
		i18n: { lang: "en" }
	};
	globalThis.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
	globalThis.fromUuidSync = (uuid) => game.actors.find((one) => one.uuid === uuid) ?? null;
	globalThis.foundry = { utils: { deepClone: (value) => JSON.parse(JSON.stringify(value)) } };
	let rolled = 0;
	globalThis.Roll = class {
		constructor(formula) {
			this.formula = formula;
		}

		async evaluate() {
			this.total = this.formula === "2d6" ? 7 : 3 + (rolled++ % 2);
			return this;
		}
	};
	globalThis.Actor = {
		implementation: {
			DEFAULT_ICON: "mystery-man.svg",
			create: vi.fn(async (data) => {
				const made = actor({ id: `new${game.actors.length}`, name: data.name, type: data.type, system: data.system, ownership: data.ownership ?? {} });
				game.actors.push(made);
				return made;
			})
		}
	};
});

afterEach(() => {
	for (const key of ["game", "ui", "fromUuidSync", "foundry", "Roll", "Actor"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("takeSquire", () => {
	it("opens the sheet of a Squire who still serves them, rather than rolling another", async () => {
		const sir = knight("k1", { system: { squire: "Actor.s1" } });
		const ned = squire("s1", { serves: sir.uuid });
		game.actors = [sir, ned];
		expect(await takeSquire(sir)).toBe(ned);
		expect(ned.sheet.render).toHaveBeenCalled();
		expect(Actor.implementation.create).not.toHaveBeenCalled();
	});

	it("rolls a new Squire and pony where the one named is Slain, Knighted since or serving another", async () => {
		for (const system of [{ isSquire: true, slain: true }, { isSquire: false }, { isSquire: true, serves: "Actor.k9" }]) {
			const sir = knight("k1", { system: { squire: "Actor.old" } });
			const old = actor({ id: "old", name: "Old", system });
			game.actors = [sir, old];
			const made = await takeSquire(sir);
			expect(made).not.toBe(old);
			expect(made.system).toMatchObject({ isSquire: true, serves: sir.uuid });
			expect(sir.system.squire).toBe(made.uuid);
		}
	});

	it("tells a player a large Company takes no Squire, and asks the Referee", async () => {
		const sir = knight();
		game.actors = [sir];
		knights = ["a", "b", "c"].map((id) => knight(id, { ownership: { [id]: 3 } }));
		game.users = ["a", "b", "c"].map((id) => ({ id, isGM: false }));

		game.user.isGM = false;
		expect(await takeSquire(sir)).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith('squire.largeCompanyPlayer {"count":3}');

		game.user.isGM = true;
		confirmed = false;
		expect(await takeSquire(sir)).toBeNull();
		expect(confirmDialog).toHaveBeenCalledTimes(1);
		expect(Actor.implementation.create).not.toHaveBeenCalled();
	});
});

describe("knightSquire", () => {
	it("refuses the Slain, as raising their VIG would bring them back", async () => {
		const ned = squire("s1", { slain: true });
		expect(await knightSquire(ned)).toBeNull();
		expect(confirmDialog).not.toHaveBeenCalled();
		expect(ned.update).not.toHaveBeenCalled();
		expect(ui.notifications.warn).toHaveBeenCalledWith('squire.slainKnighting {"name":"Squire s1"}');
	});

	it("says why they're asked before the question, when told", async () => {
		const ned = squire("s1", { virtues: { vig: { value: 7, max: 7 }, cla: { value: 7, max: 7 }, spi: { value: 7, max: 7 } } });
		confirmed = false;
		await knightSquire(ned, { note: "Legacy" });
		expect(confirmDialog.mock.calls[0][0].message).toEqual(["Legacy", 'squire.knightConfirm {"name":"Squire s1"}']);
	});

	it("lets their Knight go of them where this user may, and leaves a Knight they can't write to be read past", async () => {
		const virtues = { vig: { value: 7, max: 7 }, cla: { value: 7, max: 7 }, spi: { value: 7, max: 7 } };
		const sir = knight("k1", { system: { squire: "Actor.s1" }, isOwner: false });
		const ned = squire("s1", { serves: sir.uuid, virtues });
		game.actors = [sir, ned];
		expect(await knightSquire(ned)).not.toBeNull();
		expect(ned.system).toMatchObject({ isSquire: false, serves: "" });
		expect(sir.update).not.toHaveBeenCalled();
		// The old Knight's sheet still names them, but they're no Squire of theirs now.
		expect(servingSquire(sir)).toBeNull();
	});
});

describe("claimSquire, as a Squire dropped on a Knight's sheet does", () => {
	it("takes a Squire serving nobody, and writes both sides and both threads", async () => {
		const sir = knight();
		const ned = squire();
		game.actors = [sir, ned];
		expect(await claimSquire(sir, ned)).toBe(ned);
		expect(sir.system.squire).toBe(ned.uuid);
		expect(ned.system.serves).toBe(sir.uuid);
		expect(timelineSquireTaken).toHaveBeenCalledWith(sir, ned);
		expect(confirmDialog).not.toHaveBeenCalled();
	});

	it("moves a Squire from another Knight, who lets them go, and lets go the one this Knight had", async () => {
		const sir = knight("k1", { system: { squire: "Actor.s0" } });
		const before = squire("s0", { serves: "Actor.k1" });
		const other = knight("k2", { system: { squire: "Actor.s1" } });
		const ned = squire("s1", { serves: "Actor.k2" });
		game.actors = [sir, before, other, ned];

		expect(await claimSquire(sir, ned)).toBe(ned);
		expect(confirmDialog.mock.calls[0][0].message).toHaveLength(2);
		expect(sir.system.squire).toBe(ned.uuid);
		expect(ned.system.serves).toBe(sir.uuid);
		expect(other.system.squire).toBe("");
		expect(before.system.serves).toBe("");
	});

	it("changes nothing when asked and told no", async () => {
		const sir = knight();
		const other = knight("k2", { system: { squire: "Actor.s1" } });
		const ned = squire("s1", { serves: "Actor.k2" });
		game.actors = [sir, other, ned];
		confirmed = false;
		expect(await claimSquire(sir, ned)).toBeNull();
		expect(sir.update).not.toHaveBeenCalled();
		expect(other.update).not.toHaveBeenCalled();
	});

	it("won't let a player take a Squire from a Knight they don't own", async () => {
		game.user.isGM = false;
		const sir = knight();
		const other = knight("k2", { system: { squire: "Actor.s1" }, isOwner: false });
		const ned = squire("s1", { serves: "Actor.k2" });
		game.actors = [sir, other, ned];
		expect(await claimSquire(sir, ned)).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith('squire.servesAnother {"name":"Squire s1","knight":"Sir k2"}');
		expect(sir.update).not.toHaveBeenCalled();
	});

	it("holds a Knight who had no Squire to the Company's size, as taking one does", async () => {
		game.user.isGM = false;
		knights = ["a", "b", "c"].map((id) => knight(id, { ownership: { [id]: 3 } }));
		game.users = ["a", "b", "c"].map((id) => ({ id, isGM: false }));
		const sir = knight();
		const ned = squire();
		game.actors = [sir, ned];
		expect(await claimSquire(sir, ned)).toBeNull();
		expect(sir.update).not.toHaveBeenCalled();
	});

	it("refuses the Slain, and an NPC Knight", async () => {
		const sir = knight();
		expect(await claimSquire(sir, squire("s1", { slain: true }))).toBeNull();
		const rival = knight("k3", { type: "npcKnight" });
		rival.type = "npcKnight";
		expect(await claimSquire(rival, squire())).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledTimes(2);
	});

	it("gives the Squire the Knight's players when the Referee does it", async () => {
		const sir = knight();
		const ned = squire("s1", {}, { ownership: { default: 0 } });
		game.actors = [sir, ned];
		await claimSquire(sir, ned);
		expect(ned.update).toHaveBeenCalledWith({ "system.serves": sir.uuid, ownership: { default: 0, alys: 3 } });
	});

	it("hands nothing on when a player does it", async () => {
		game.user.isGM = false;
		const sir = knight();
		const ned = squire("s1", {}, { ownership: { default: 0 } });
		game.actors = [sir, ned];
		await claimSquire(sir, ned);
		expect(ned.update).toHaveBeenCalledWith({ "system.serves": sir.uuid });
	});
});

describe("releaseSquire", () => {
	it("parts them from the Knight's sheet, both sides", async () => {
		const sir = knight("k1", { system: { squire: "Actor.s1" } });
		const ned = squire("s1", { serves: sir.uuid });
		game.actors = [sir, ned];
		await releaseSquire(sir);
		expect(sir.system.squire).toBe("");
		expect(ned.system.serves).toBe("");
	});

	it("parts them from the Squire's sheet, both sides", async () => {
		const sir = knight("k1", { system: { squire: "Actor.s1" } });
		const ned = squire("s1", { serves: sir.uuid });
		game.actors = [sir, ned];
		await releaseSquire(ned);
		expect(ned.system.serves).toBe("");
		expect(sir.system.squire).toBe("");
	});

	it("leaves the other side to whoever may write it", async () => {
		const sir = knight("k1", { system: { squire: "Actor.s1" } });
		const ned = squire("s1", { serves: sir.uuid }, { isOwner: false });
		game.actors = [sir, ned];
		await releaseSquire(sir);
		expect(sir.system.squire).toBe("");
		expect(ned.update).not.toHaveBeenCalled();
	});
});
