import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import { withBookText } from "../../module/rules/book-text.js";

/** Whether the Squire was Knighted, and what the chooser was opened on. */
let knighted;
let chosen;
/** What a dialog answers with. */
let answer;

vi.mock("../../module/actions/squires.js", () => ({ knightSquire: vi.fn(async (squire) => { knighted = squire; return {}; }) }));
vi.mock("../../module/apps/ui.js", () => ({ chooseDialog: vi.fn(async () => answer) }));
vi.mock("../../module/apps/KnightChooser.js", () => ({ openKnightChooser: vi.fn((actor) => { chosen = actor; }) }));

const { announceFallenKnight, carryOnFrom, gloryOfTheCompany, whoRodeWith } = await import("../../module/actions/fallen.js");
const { openKnightChooser } = await import("../../module/apps/KnightChooser.js");

const root = join(import.meta.dirname, "../..");
const lang = withBookText(JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8")));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);
const format = (key, data) => String(lookup(key) ?? key).replace(/\{(\w+)\}/g, (_match, name) => data?.[name] ?? "");

/** Every card posted, as the context it was rendered with. */
let cards;
/** Actors made, and what each was made with. */
let created;

/**
 * One actor as the fallen-Knight actions read and write it.
 * @param {object} options
 */
function actor({ id, name, type = "npc", system = {}, flags = {}, ownership = {}, isOwner = true }) {
	const made = {
		id,
		uuid: `Actor.${id}`,
		name,
		type,
		system,
		ownership,
		isOwner,
		hasPlayerOwner: Object.entries(ownership).some(([user, level]) => user !== "default" && level >= 3),
		sheet: { render: vi.fn() },
		getFlag: (scope, key) => flags[`${scope}.${key}`],
		unsetFlag: vi.fn(async (scope, key) => { delete flags[`${scope}.${key}`]; }),
		update: vi.fn(async (changes) => Object.assign(made, changes))
	};
	return made;
}

const fallenKnight = (extra = {}) => actor({
	id: "k1",
	name: "Sir Ose",
	type: "knight",
	ownership: { default: 0, player: 3 },
	system: { isSquire: false, squire: "Actor.s1", steed: "Actor.h1" },
	...extra
});

beforeEach(() => {
	cards = [];
	created = [];
	knighted = null;
	chosen = null;
	answer = null;
	globalThis.game = {
		i18n: { localize: (key) => lookup(key) ?? key, format },
		actors: [],
		users: { get: (id) => (id === "gm" ? { isGM: true } : { isGM: false }) },
		settings: { get: () => "public" },
		user: { name: "Referee", isGM: true, can: () => true }
	};
	globalThis.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
	globalThis.foundry = {
		applications: { handlebars: { renderTemplate: vi.fn(async (path, context) => { cards.push({ path, context }); return "<section></section>"; }) } },
		utils: { deepClone: (value) => JSON.parse(JSON.stringify(value)), escapeHTML: (text) => text }
	};
	globalThis.Actor = {
		implementation: {
			getSpeaker: () => ({}),
			create: vi.fn(async (data) => {
				created.push(data);
				return actor({ id: `new${created.length}`, name: data.name, type: data.type, ownership: data.ownership ?? {} });
			})
		}
	};
	globalThis.ChatMessage = {
		implementation: { getSpeaker: ({ actor: spoken }) => ({ alias: spoken.name }), applyMode: () => {}, create: vi.fn(async (data) => data) }
	};
	globalThis.CONFIG = { sounds: { dice: "dice.wav" } };
	globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
});

afterEach(() => {
	for (const key of ["game", "ui", "foundry", "Actor", "ChatMessage", "CONFIG", "CONST"]) delete globalThis[key];
	vi.clearAllMocks();
});

const lastCard = () => cards.at(-1).context;

describe("whoRodeWith", () => {
	it("finds the Squire and the followers, and leaves the steed out", () => {
		const knight = fallenKnight();
		const squire = actor({ id: "s1", name: "Ned", type: "knight", system: { isSquire: true, serves: knight.uuid } });
		const steed = actor({ id: "h1", name: "Bayard", flags: { [`${SYSTEM_ID}.companionOf`]: "k1" } });
		const guide = actor({ id: "g1", name: "The Guide", flags: { [`${SYSTEM_ID}.companionOf`]: "k1" } });
		game.actors = [knight, squire, steed, guide];

		const rode = whoRodeWith(knight);
		expect(rode.squire).toBe(squire);
		expect(rode.followers).toEqual([guide]);
	});
});

describe("announceFallenKnight", () => {
	it("offers all three ways on where a Squire and a follower rode with them", async () => {
		const knight = fallenKnight();
		const squire = actor({ id: "s1", name: "Ned", type: "knight", system: { isSquire: true, serves: knight.uuid } });
		const guide = actor({ id: "g1", name: "The Guide", flags: { [`${SYSTEM_ID}.companionOf`]: "k1" } });
		game.actors = [knight, squire, guide];

		await announceFallenKnight(knight, "slain");
		expect(cards.at(-1).path).toMatch(/chat[/\\]fallen\.hbs$/);
		const card = lastCard();
		expect(card.paths.map((path) => path.key)).toEqual(["newKnight", "squire", "follower"]);
		// A single Squire or follower is named on their button.
		expect(card.paths[1].label).toBe(format("bastionland.fallen.takeUpNamed", { name: "Ned" }));
		expect(card.paths[2].label).toBe(format("bastionland.fallen.takeUpNamed", { name: "The Guide" }));
		expect(card.tagline).toBe(format("bastionland.fallen.tagline", { name: "Sir Ose" }));
	});

	it("offers the successor named on their sheet, after a new Knight", async () => {
		const knight = fallenKnight({ system: { isSquire: false, squire: "", steed: "", successor: "Actor.k2" } });
		const heir = actor({ id: "k2", name: "Sir Ban", type: "knight", system: { isSquire: false }, ownership: { default: 0, gm: 3 } });
		game.actors = [knight, heir];

		await announceFallenKnight(knight, "slain");
		const card = lastCard();
		expect(card.paths.map((path) => path.key)).toEqual(["newKnight", "successor"]);
		expect(card.paths[1].label).toBe(format("bastionland.fallen.takeUpSuccessor", { name: "Sir Ban" }));
	});

	it("names their Squire as their successor on the Squire's own button, rather than twice", async () => {
		const knight = fallenKnight({ system: { isSquire: false, squire: "Actor.s1", steed: "", successor: "Actor.s1" } });
		const squire = actor({ id: "s1", name: "Ned", type: "knight", system: { isSquire: true, serves: knight.uuid } });
		game.actors = [knight, squire];

		await announceFallenKnight(knight, "slain");
		const card = lastCard();
		expect(card.paths.map((path) => path.key)).toEqual(["newKnight", "squire"]);
		expect(card.paths[1].label).toBe(format("bastionland.fallen.takeUpSuccessor", { name: "Ned" }));
	});

	it("takes a successor who rode as a follower up by their own path only", async () => {
		const knight = fallenKnight({ system: { isSquire: false, squire: "", steed: "", successor: "Actor.k2" } });
		const heir = actor({ id: "k2", name: "Sir Ban", type: "knight", system: { isSquire: false, serves: knight.uuid } });
		game.actors = [knight, heir];

		await announceFallenKnight(knight, "slain");
		expect(lastCard().paths.map((path) => path.key)).toEqual(["newKnight", "successor"]);
	});

	it("leaves a successor another player plays to them", async () => {
		const knight = fallenKnight({ system: { isSquire: false, squire: "", steed: "", successor: "Actor.k2" } });
		const heir = actor({ id: "k2", name: "Sir Ban", type: "knight", system: { isSquire: false }, ownership: { default: 0, other: 3 } });
		game.actors = [knight, heir];

		await announceFallenKnight(knight, "slain");
		expect(lastCard().paths.map((path) => path.key)).toEqual(["newKnight"]);
	});

	it("offers only a new Knight to one who rode alone", async () => {
		const knight = fallenKnight({ system: { isSquire: false, squire: "", steed: "" } });
		game.actors = [knight];
		await announceFallenKnight(knight, "slain");
		expect(lastCard().paths.map((path) => path.key)).toEqual(["newKnight"]);
	});

	it("says nothing for a Squire's death, or an NPC Knight's", async () => {
		const squire = fallenKnight({ system: { isSquire: true, squire: "", steed: "" } });
		expect(await announceFallenKnight(squire, "slain")).toBeNull();
		const unplayed = fallenKnight({ ownership: { default: 0 } });
		expect(await announceFallenKnight(unplayed, "slain")).toBeNull();
		expect(cards).toEqual([]);
	});

	it("says nothing for a blow that left them standing", async () => {
		const knight = fallenKnight({ system: { isSquire: false, squire: "", steed: "" } });
		game.actors = [knight];
		expect(await announceFallenKnight(knight, "wounded")).toBeNull();
		expect(cards).toEqual([]);
	});
});

describe("carryOnFrom", () => {
	it("makes a new Knight carrying the fallen one's players, and opens the chooser on them", async () => {
		const knight = fallenKnight();
		game.actors = [knight];
		const made = await carryOnFrom("newKnight", knight);

		expect(created[0]).toMatchObject({ type: "knight", name: lookup("bastionland.fallen.newName"), ownership: { default: 0, player: 3 } });
		expect(chosen).toBe(made);
		// The folder is left to the Knight-filing hooks.
		expect(created[0].folder).toBeUndefined();
	});

	it("opens the chooser with the Glory of the Knights riding on", async () => {
		const knight = fallenKnight({ system: { isSquire: false, squire: "", steed: "", glory: 9 } });
		const rider = (id, glory, extra = {}) => actor({
			id,
			name: id,
			type: "knight",
			ownership: { default: 0, [`player-${id}`]: 3 },
			system: { isSquire: false, glory, virtues: { vig: { value: 8 } } },
			...extra
		});
		game.actors = [
			knight,
			rider("a", 4),
			rider("b", 6),
			rider("dead", 1, { system: { isSquire: false, glory: 1, slain: true, virtues: { vig: { value: 0 } } } }),
			// VIG 0 from Virtue Loss only Exhausts them, so they ride on.
			rider("spent", 2, { system: { isSquire: false, glory: 2, virtues: { vig: { value: 0 } } } }),
			rider("blank", 0, { flags: { [`${SYSTEM_ID}.unchosen`]: true } }),
			actor({ id: "npc", name: "Sir Nobody", type: "knight", system: { isSquire: false, glory: 0 } })
		];

		expect(gloryOfTheCompany(knight)).toEqual({ lowest: 2, highest: 6 });
		const made = await carryOnFrom("newKnight", knight);
		expect(openKnightChooser).toHaveBeenCalledWith(made, { fresh: true, companyGlory: { lowest: 2, highest: 6 }, replacement: true });
	});

	it("opens the chooser with no Glory where nobody rides on", async () => {
		const knight = fallenKnight();
		game.actors = [knight];
		const made = await carryOnFrom("newKnight", knight);
		expect(openKnightChooser).toHaveBeenCalledWith(made, { fresh: true, companyGlory: null, replacement: true });
	});

	it("hands over a successor who is a Knight, and says so", async () => {
		const knight = fallenKnight({ system: { isSquire: false, squire: "", steed: "", successor: "Actor.k2" } });
		const heir = actor({
			id: "k2",
			name: "Sir Ban",
			type: "knight",
			system: { isSquire: false },
			flags: { [`${SYSTEM_ID}.companionOf`]: "k1" }
		});
		game.actors = [knight, heir];

		expect(await carryOnFrom("successor", knight)).toBe(heir);
		expect(knighted).toBeNull();
		expect(heir.update).toHaveBeenCalledWith({ ownership: { player: 3 } });
		expect(heir.unsetFlag).toHaveBeenCalledWith(SYSTEM_ID, "companionOf");
		expect(heir.sheet.render).toHaveBeenCalled();
		expect(lastCard().text).toBe(format("bastionland.fallen.tookUp", { name: "Sir Ban", fallen: "Sir Ose" }));
	});

	it("Knights a successor who is still a Squire", async () => {
		const knight = fallenKnight({ system: { isSquire: false, squire: "", steed: "", successor: "Actor.s9" } });
		const page = actor({ id: "s9", name: "Pip", type: "knight", system: { isSquire: true, serves: "Actor.k7" } });
		game.actors = [knight, page];

		expect(await carryOnFrom("successor", knight)).toBe(page);
		expect(knighted).toBe(page);
	});

	it("tells a player the Referee hands over a successor they don't own", async () => {
		game.user.isGM = false;
		const knight = fallenKnight({ system: { isSquire: false, squire: "", steed: "", successor: "Actor.k2" } });
		const heir = actor({ id: "k2", name: "Sir Ban", type: "knight", system: { isSquire: false }, isOwner: false });
		game.actors = [knight, heir];

		expect(await carryOnFrom("successor", knight)).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith(format("bastionland.fallen.successorNotYours", { name: "Sir Ban" }));
		expect(heir.update).not.toHaveBeenCalled();
	});

	it("warns a player away from somebody else's Knight", async () => {
		game.user.isGM = false;
		const knight = fallenKnight({ isOwner: false });
		expect(await carryOnFrom("newKnight", knight)).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith(format("bastionland.fallen.notYours", { name: "Sir Ose" }));
	});

	it("Knights the Squire taken up, and hands them the fallen Knight's players", async () => {
		const knight = fallenKnight();
		const squire = actor({ id: "s1", name: "Ned", type: "knight", system: { isSquire: true, serves: knight.uuid } });
		game.actors = [knight, squire];

		expect(await carryOnFrom("squire", knight)).toBe(squire);
		expect(knighted).toBe(squire);
		expect(squire.update).toHaveBeenCalledWith({ ownership: { player: 3 } });
		expect(squire.sheet.render).toHaveBeenCalled();
	});

	it("takes up the one follower without asking, and lets them go as Property", async () => {
		const knight = fallenKnight();
		const guide = actor({ id: "g1", name: "The Guide", flags: { [`${SYSTEM_ID}.companionOf`]: "k1" } });
		game.actors = [knight, guide];

		expect(await carryOnFrom("follower", knight)).toBe(guide);
		expect(guide.unsetFlag).toHaveBeenCalledWith(SYSTEM_ID, "companionOf");
		expect(guide.update).toHaveBeenCalledWith({ ownership: { player: 3 } });
	});

	it("asks which follower where more than one rode with them", async () => {
		const knight = fallenKnight();
		const guide = actor({ id: "g1", name: "The Guide", flags: { [`${SYSTEM_ID}.companionOf`]: "k1" } });
		const archer = actor({ id: "a1", name: "The Archer", flags: { [`${SYSTEM_ID}.companionOf`]: "k1" } });
		game.actors = [knight, guide, archer];

		answer = "a1";
		expect(await carryOnFrom("follower", knight)).toBe(archer);
	});

	it("takes nobody up where that question is closed", async () => {
		const knight = fallenKnight();
		game.actors = [
			knight,
			actor({ id: "g1", name: "The Guide", flags: { [`${SYSTEM_ID}.companionOf`]: "k1" } }),
			actor({ id: "a1", name: "The Archer", flags: { [`${SYSTEM_ID}.companionOf`]: "k1" } })
		];

		answer = null;
		expect(await carryOnFrom("follower", knight)).toBeNull();
	});

	it("does nothing for a path that isn't one of the book's", async () => {
		expect(await carryOnFrom("ghost", fallenKnight())).toBeNull();
	});
});
