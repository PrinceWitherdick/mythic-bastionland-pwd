import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

/** What the confirm and choose dialogs answer with. */
let confirmed;
let chosen;

vi.mock("../../module/apps/ui.js", () => ({
	confirmDialog: vi.fn(async () => confirmed),
	chooseDialog: vi.fn(async () => chosen)
}));

const { MUSTERED_FLAG, ORIGIN_FLAG, dismissWarband, musterView, strainWarband, warbandsOf, wearWarbandDown } =
	await import("../../module/actions/warbands.js");

const root = join(import.meta.dirname, "../..");
const lang = JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8"));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);
const format = (key, data) => String(lookup(key) ?? key).replace(/\{(\w+)\}/g, (_match, name) => data?.[name] ?? "");

/** The d6 the next roll gives, and the cards posted. */
let rolled;
let cards;

/**
 * A Warband as the upkeep rules read and write it: SPI, and the states the
 * sheet derives from it.
 */
function fakeWarband({ id = "w1", name = "The Militia", spi = 7, vig = 10, mortalWound = false, flags = {}, isOwner = true } = {}) {
	const warband = {
		id,
		uuid: `Actor.${id}`,
		name,
		type: "npc",
		isOwner,
		system: {
			scale: "warband",
			virtues: { spi: { value: spi, max: spi }, vig: { value: vig, max: vig }, cla: { value: 10, max: 10 } },
			warband: { routed: mortalWound, broken: spi === 0, wipedOut: vig === 0 }
		},
		getFlag: (scope, key) => flags[`${scope}.${key}`],
		unsetFlag: vi.fn(async (scope, key) => { delete flags[`${scope}.${key}`]; }),
		sheet: { render: vi.fn() },
		update: vi.fn(async (changes) => {
			const value = changes["system.virtues.spi.value"];
			if (value !== undefined) {
				warband.system.virtues.spi.value = value;
				warband.system.warband.broken = value === 0;
			}
		})
	};
	return warband;
}

const fakeDomain = ({ muster = 2, name = "Bramblewatch" } = {}) => ({
	id: "d1",
	uuid: "Actor.d1",
	name,
	type: "domain",
	isOwner: true,
	ownership: { default: 0 },
	folder: null,
	system: { muster }
});

beforeEach(() => {
	confirmed = true;
	chosen = null;
	rolled = 3;
	cards = [];
	globalThis.Roll = class {
		constructor(formula) {
			this.formula = formula;
		}

		async evaluate() {
			this.total = rolled;
			return this;
		}
	};
	globalThis.game = {
		i18n: { localize: (key) => lookup(key) ?? key, format },
		actors: [],
		packs: { get: () => null },
		settings: { get: () => "public" },
		user: { name: "Referee", isGM: true, can: () => true }
	};
	globalThis.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
	globalThis.foundry = {
		applications: { handlebars: { renderTemplate: vi.fn(async (path, context) => { cards.push({ path, context }); return "<section></section>"; }) } },
		utils: { deepClone: (value) => JSON.parse(JSON.stringify(value)), escapeHTML: (text) => text }
	};
	globalThis.ChatMessage = {
		implementation: { getSpeaker: ({ actor }) => ({ alias: actor.name }), applyMode: () => {}, create: vi.fn(async (data) => data) }
	};
	globalThis.CONFIG = { sounds: { dice: "dice.wav" } };
});

afterEach(() => {
	for (const key of ["Roll", "game", "ui", "foundry", "ChatMessage", "CONFIG"]) delete globalThis[key];
	vi.clearAllMocks();
});

const lastCard = () => cards.at(-1).context;

describe("warbandsOf and musterView", () => {
	it("finds the Warbands a Holding has raised, and counts them against its muster", () => {
		const domain = fakeDomain();
		const mine = fakeWarband({ id: "w1", flags: { [`${SYSTEM_ID}.${MUSTERED_FLAG}`]: "d1", [`${SYSTEM_ID}.${ORIGIN_FLAG}`]: "mercenaries" } });
		const theirs = fakeWarband({ id: "w2", name: "Somebody else's", flags: { [`${SYSTEM_ID}.${MUSTERED_FLAG}`]: "d9" } });
		game.actors = [mine, theirs];

		expect(warbandsOf(domain)).toEqual([mine]);
		const view = musterView(domain);
		expect(view.state).toMatchObject({ mustered: 1, muster: 2, full: false });
		expect(view.lines[0]).toMatchObject({ id: "w1", name: "The Militia", origin: lookup("bastionland.warband.origins.mercenaries.label"), state: null });
	});

	it("says what has become of a Warband in the list", () => {
		const domain = fakeDomain();
		game.actors = [fakeWarband({ spi: 0, flags: { [`${SYSTEM_ID}.${MUSTERED_FLAG}`]: "d1" } })];
		expect(musterView(domain).lines[0].state).toBe(lookup("bastionland.npc.warband.broken.label"));
	});

	it("finds none at all without a Domain to match, rather than every unflagged NPC", () => {
		game.actors = [fakeWarband({ id: "w1" }), fakeWarband({ id: "w2", flags: { [`${SYSTEM_ID}.${MUSTERED_FLAG}`]: "d1" } })];
		expect(warbandsOf(null)).toEqual([]);
		expect(warbandsOf({})).toEqual([]);
	});

	it("is full once a Holding has raised all it can", () => {
		const domain = fakeDomain({ muster: 2 });
		game.actors = [
			fakeWarband({ id: "w1", flags: { [`${SYSTEM_ID}.${MUSTERED_FLAG}`]: "d1" } }),
			fakeWarband({ id: "w2", flags: { [`${SYSTEM_ID}.${MUSTERED_FLAG}`]: "d1" } })
		];
		expect(musterView(domain).state.full).toBe(true);
	});
});

describe("wearWarbandDown", () => {
	it("takes d6 SPI and says what wore them down", async () => {
		const warband = fakeWarband({ spi: 7 });
		rolled = 3;
		expect(await wearWarbandDown(warband, "poorlyFed")).toEqual({ loss: 3, spi: 4 });
		expect(warband.system.virtues.spi.value).toBe(4);
		const card = lastCard();
		expect(card.tagline).toBe(lookup("bastionland.warband.upkeep.strains.poorlyFed.label"));
		expect(card.hint).toBe(lookup("bastionland.warband.upkeep.notDamage"));
	});

	it("says they will not follow orders once the strain takes them to SPI 0", async () => {
		const warband = fakeWarband({ spi: 2 });
		rolled = 6;
		expect(await wearWarbandDown(warband, "pushedTooFar")).toEqual({ loss: 6, spi: 0 });
		expect(lastCard().hint).toBe(format("bastionland.warband.upkeep.broken", { name: "The Militia" }));
	});

	it("wears down nobody for a strain the book doesn't have, or an individual", async () => {
		const warband = fakeWarband();
		expect(await wearWarbandDown(warband, "bored")).toBeNull();
		const person = fakeWarband();
		person.system.scale = "individual";
		expect(await wearWarbandDown(person, "illRested")).toBeNull();
		expect(cards).toEqual([]);
	});
});

describe("strainWarband", () => {
	it("asks what wore them down, then takes the SPI", async () => {
		const warband = fakeWarband({ spi: 9 });
		chosen = "illRested";
		rolled = 4;
		expect(await strainWarband(warband)).toEqual({ loss: 4, spi: 5 });
	});

	it("takes nothing where the question is closed", async () => {
		const warband = fakeWarband({ spi: 9 });
		chosen = null;
		expect(await strainWarband(warband)).toBeNull();
		expect(warband.system.virtues.spi.value).toBe(9);
	});

	it("leaves an individual alone, since upkeep is a Warband's", async () => {
		const person = fakeWarband();
		person.system.scale = "individual";
		expect(await strainWarband(person)).toBeNull();
	});
});

describe("dismissWarband", () => {
	it("lets them go, and they are no longer the Holding's", async () => {
		const domain = fakeDomain();
		const warband = fakeWarband({ flags: { [`${SYSTEM_ID}.${MUSTERED_FLAG}`]: "d1" } });
		game.actors = [warband];

		expect(await dismissWarband(domain, "w1")).toBe(true);
		expect(warband.unsetFlag).toHaveBeenCalledWith(SYSTEM_ID, MUSTERED_FLAG);
		expect(lastCard().text).toBe(format("bastionland.warband.dismiss.went", { name: "The Militia", domain: "Bramblewatch" }));
	});

	it("keeps them where the question is refused", async () => {
		const domain = fakeDomain();
		const warband = fakeWarband({ flags: { [`${SYSTEM_ID}.${MUSTERED_FLAG}`]: "d1" } });
		game.actors = [warband];
		confirmed = false;

		expect(await dismissWarband(domain, "w1")).toBe(false);
		expect(warband.unsetFlag).not.toHaveBeenCalled();
	});

	it("lets nobody go who isn't the Holding's", async () => {
		game.actors = [fakeWarband({ flags: { [`${SYSTEM_ID}.${MUSTERED_FLAG}`]: "d9" } })];
		expect(await dismissWarband(fakeDomain(), "w1")).toBe(false);
	});
});
