import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seasonKey } from "../../module/rules/time.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// What the Damage card says and what the blow writes, case by case. The words are
// left as their keys with what's filled into them, so every line is seen whole.
vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn(async () => null) }));
vi.mock("../../module/chat/cards.js", async (importOriginal) => ({
	...(await importOriginal()),
	postCard: vi.fn(async () => ({ id: "message-1" }))
}));
vi.mock("../../module/chat/morale-card.js", () => ({ moralePrompt: (_who, trigger) => (trigger ? { text: `morale.${trigger}` } : null), promptGroupMorale: vi.fn(async () => {}) }));
vi.mock("../../module/chat/gambit-marks.js", () => ({ SCANNED_MESSAGES: 200, marksOn: () => [] }));
vi.mock("../../module/actions/attack-fx.js", () => ({ chatIsPublic: () => true, playDamageFx: vi.fn() }));
vi.mock("../../module/actions/fallen.js", () => ({ announceFallenKnight: vi.fn(async () => null) }));
vi.mock("../../module/actions/scars.js", () => ({ offerRevenge: vi.fn(async () => {}), rollScar: vi.fn(async () => {}) }));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({}), calendarLabel: () => "" }));
vi.mock("../../module/actions/items.js", () => ({ armourConditionText: () => "" }));
vi.mock("../../module/actions/actor-updates.js", () => import("../mocks/actor-updates.js"));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineMortalWound: vi.fn(async () => null), timelineWarded: vi.fn(async () => null) }));
vi.mock("../../module/actions/stances.js", async (importOriginal) => ({ ...(await importOriginal()), hornBlownFor: vi.fn(() => false) }));

const { inputDialog } = await import("../../module/apps/ui.js");
const { postCard } = await import("../../module/chat/cards.js");
const { hornBlownFor } = await import("../../module/actions/stances.js");
const { takeDamage } = await import("../../module/actions/damage.js");

/** A Doom Scar taken this Season. */
const DOOM = { type: "scar", system: { roll: 11, season: seasonKey({}) } };

function actor({ uuid = "Actor.boar", name = "Boar", type = "npc", vig = 12, spi = 10, guard = 3, armour = 0, items = [], virtues = true, ...system } = {}) {
	const it = {
		uuid,
		name,
		type,
		isOwner: true,
		items: Object.assign([...items], { contents: items }),
		getActiveTokens: () => [],
		system: {
			armour,
			armourNote: "",
			scale: "individual",
			structure: false,
			immunity: "",
			conditions: { exposed: false },
			guard: { value: guard, max: guard },
			virtues: virtues ? { vig: { value: vig, max: vig }, cla: { value: 10, max: 10 }, spi: { value: spi, max: spi } } : undefined,
			afflictions: [],
			...system
		}
	};
	it.update = vi.fn(async (changes) => {
		for (const [path, value] of Object.entries(changes)) {
			const keys = path.split(".").slice(1);
			const last = keys.pop();
			keys.reduce((node, key) => (node[key] ??= {}), it.system)[last] = value;
		}
	});
	return it;
}

/** The Damage card's context, as last posted. */
const lastCard = () => postCard.mock.calls.filter((call) => call[1] === "damage").at(-1)[2];

beforeEach(() => {
	inputDialog.mockReset();
	inputDialog.mockResolvedValue(null);
	globalThis.fromUuidSync = () => null;
	globalThis.game = {
		actors: { contents: [] },
		user: { isGM: true },
		i18n: { localize: (key) => key, format: (key, data) => `${key} ${JSON.stringify(data)}` }
	};
	globalThis.foundry = { utils: { randomID: () => "id-1" } };
	globalThis.canvas = { ready: false };
});

afterEach(() => {
	for (const key of ["fromUuidSync", "game", "foundry", "canvas"]) delete globalThis[key];
	vi.clearAllMocks();
});

const dealt = (damage, armour) => `bastionland.damage.dealt {"dealt":${damage},"armour":${armour}}`;
const line = (kind, from, to) => `bastionland.damage.${kind} {"from":${from},"to":${to}}`;
const HORN = "bastionland.damage.hornDoubled";

describe("the Damage card, line by line", () => {
	it.each([
		["Evaded", { guard: 5, armour: 1 }, { damage: 3, auto: true }, {
			card: { outcomeKey: "evaded", dealt: dealt(2, 1), guardLine: line("guardLine", 5, 3), vigourLine: null, outcome: "bastionland.damage.outcomes.evaded", morale: null },
			update: { "system.guard.value": 3, "system.virtues.vig.value": 12 }
		}],
		["no Damage past Armour", { armour: 2 }, { damage: 2, auto: true }, {
			card: { outcomeKey: "none", dealt: dealt(0, 2), guardLine: null, vigourLine: null, outcome: "bastionland.damage.outcomes.none", morale: null },
			update: { "system.guard.value": 3, "system.virtues.vig.value": 12 }
		}],
		["a Scar", {}, { damage: 3, auto: true }, {
			card: { outcomeKey: "scar", dealt: dealt(3, 0), guardLine: line("guardLine", 3, 0), vigourLine: null, outcome: "bastionland.damage.outcomes.scar", morale: null },
			update: { "system.guard.value": 0, "system.virtues.vig.value": 12 }
		}],
		["a Wound, with Morale called for", {}, { damage: 5, auto: true, cause: "A bite" }, {
			card: { outcomeKey: "wounded", dealt: dealt(5, 0), guardLine: line("guardLine", 3, 0), vigourLine: line("vigourLine", 12, 10), outcome: "bastionland.damage.outcomes.wounded", morale: { text: "morale.wounded" }, cause: "A bite" },
			update: { "system.guard.value": 0, "system.virtues.vig.value": 10, "system.wounded": true }
		}],
		["a Mortal Wound", {}, { damage: 9, auto: true }, {
			card: { outcomeKey: "mortal", dealt: dealt(9, 0), guardLine: line("guardLine", 3, 0), vigourLine: line("vigourLine", 12, 6), outcome: "bastionland.damage.outcomes.mortal", morale: null },
			update: { "system.guard.value": 0, "system.virtues.vig.value": 6, "system.mortalWound": true, "system.wounded": true }
		}],
		["a Knight Slain", { type: "knight", name: "Ser Kay" }, { damage: 20, auto: true }, {
			card: { outcomeKey: "slain", dealt: dealt(20, 0), guardLine: line("guardLine", 3, 0), vigourLine: line("vigourLine", 12, 0), outcome: "bastionland.damage.outcomes.slain", morale: null },
			update: {
				"system.guard.value": 0,
				"system.virtues.vig.value": 0,
				"system.slain": true,
				"system.mortalWound": false,
				"system.fate": "bastionland.fallen.fateSlain",
				[`flags.${SYSTEM_ID}.deathFate`]: "bastionland.fallen.fateSlain",
				"system.wounded": true
			}
		}],
		["Slain by Doom", { items: [DOOM] }, { damage: 9, auto: true }, {
			card: { outcomeKey: "slain", dealt: dealt(9, 0), guardLine: line("guardLine", 3, 0), vigourLine: line("vigourLine", 12, 0), outcome: "bastionland.damage.doom", morale: null },
			update: { "system.guard.value": 0, "system.virtues.vig.value": 0, "system.slain": true, "system.mortalWound": false, "system.wounded": true }
		}],
		["non-lethal, Doom or not", { items: [DOOM] }, { damage: 9, auto: true, nonLethal: true }, {
			card: { outcomeKey: "mortal", dealt: dealt(9, 0), guardLine: line("guardLine", 3, 0), vigourLine: line("vigourLine", 12, 6), outcome: "bastionland.damage.nonLethalDown", morale: null },
			update: { "system.guard.value": 0, "system.virtues.vig.value": 6, "system.wounded": true }
		}],
		["a sparring bout's", {}, { damage: 9, auto: true, nonLethal: true, sparring: true }, {
			card: { outcomeKey: "mortal", dealt: dealt(9, 0), guardLine: line("guardLine", 3, 0), vigourLine: line("vigourLine", 12, 6), outcome: "bastionland.damage.sparringDown", morale: null },
			update: { "system.guard.value": 0, "system.virtues.vig.value": 6, "system.wounded": true }
		}],
		["a sparring bout's Wound, which calls for no Morale", {}, { damage: 5, auto: true, nonLethal: true, sparring: true }, {
			card: { outcomeKey: "wounded", dealt: dealt(5, 0), guardLine: line("guardLine", 3, 0), vigourLine: line("vigourLine", 12, 10), outcome: "bastionland.damage.outcomes.wounded", morale: null },
			update: { "system.guard.value": 0, "system.virtues.vig.value": 10, "system.wounded": true }
		}],
		["non-lethal at 1 VIG", { vig: 1, guard: 0 }, { damage: 4, auto: true, nonLethal: true }, {
			card: { outcomeKey: "spared", dealt: dealt(4, 0), guardLine: null, vigourLine: null, outcome: "bastionland.damage.outcomes.spared", morale: null },
			update: { "system.guard.value": 0, "system.virtues.vig.value": 1 }
		}],
		["one who fights on", { fightsOn: true }, { damage: 9, auto: true }, {
			card: { outcomeKey: "mortal", dealt: dealt(9, 0), guardLine: line("guardLine", 3, 0), vigourLine: line("vigourLine", 12, 6), outcome: 'bastionland.damage.fightsOn {"name":"Boar"}', morale: null },
			update: { "system.guard.value": 0, "system.virtues.vig.value": 6, "system.mortalWound": true, "system.wounded": true }
		}],
		["SPI, broken", {}, { damage: 9, auto: true, virtue: "spi" }, {
			card: { outcomeKey: "broken", dealt: dealt(9, 0), guardLine: line("guardLine", 3, 0), vigourLine: line("spiritLine", 10, 4), outcome: "bastionland.damage.outcomes.broken", morale: null },
			update: { "system.guard.value": 0, "system.virtues.spi.value": 4 }
		}],
		["SPI, hurt", {}, { damage: 5, auto: true, virtue: "spi" }, {
			card: { outcomeKey: "wounded", dealt: dealt(5, 0), guardLine: line("guardLine", 3, 0), vigourLine: line("spiritLine", 10, 8), outcome: "bastionland.damage.spiritHurt", morale: null },
			update: { "system.guard.value": 0, "system.virtues.spi.value": 8 }
		}],
		["SPI, Evaded", {}, { damage: 2, auto: true, virtue: "spi" }, {
			card: { outcomeKey: "evaded", dealt: dealt(2, 0), guardLine: line("guardLine", 3, 1), vigourLine: null, outcome: "bastionland.damage.outcomes.evaded", morale: null },
			update: { "system.guard.value": 1, "system.virtues.spi.value": 10 }
		}],
		["a horn's doubled Wound", { horn: true }, { damage: 5, auto: true }, {
			card: { outcomeKey: "wounded", dealt: `${dealt(5, 0)} ${HORN}`, guardLine: line("guardLine", 3, 0), vigourLine: line("vigourLine", 12, 8), outcome: "bastionland.damage.outcomes.wounded", morale: { text: "morale.wounded" } },
			update: { "system.guard.value": 0, "system.virtues.vig.value": 8, "system.wounded": true }
		}],
		["a horn, Evaded", { horn: true }, { damage: 2, auto: true }, {
			card: { outcomeKey: "evaded", dealt: dealt(2, 0), guardLine: line("guardLine", 3, 1), vigourLine: null, outcome: "bastionland.damage.outcomes.evaded", morale: null },
			update: { "system.guard.value": 1, "system.virtues.vig.value": 12 }
		}],
		["a horn, on SPI", { horn: true }, { damage: 5, auto: true, virtue: "spi" }, {
			card: { outcomeKey: "wounded", dealt: dealt(5, 0), guardLine: line("guardLine", 3, 0), vigourLine: line("spiritLine", 10, 8), outcome: "bastionland.damage.spiritHurt", morale: null },
			update: { "system.guard.value": 0, "system.virtues.spi.value": 8 }
		}],
		["a Warband's Mortal Wound", { scale: "warband" }, { damage: 9, auto: true }, {
			card: { outcomeKey: "mortal", dealt: dealt(9, 0), guardLine: line("guardLine", 3, 0), vigourLine: line("vigourLine", 12, 6), outcome: "bastionland.damage.warbandOutcomes.mortal", morale: null },
			update: { "system.guard.value": 0, "system.virtues.vig.value": 6, "system.mortalWound": true, "system.wounded": true }
		}],
		["a Warband unharmed", { scale: "warband" }, { damage: 9 }, {
			card: { outcomeKey: "unharmed", dealt: null, guardLine: null, vigourLine: null, outcome: "bastionland.damage.outcomes.unharmed", morale: null },
			update: { "system.guard.value": 3, "system.virtues.vig.value": 12 }
		}],
		["a structure destroyed", { virtues: false, structure: true, guard: 4 }, { damage: 6, auto: true }, {
			card: { outcomeKey: "destroyed", dealt: dealt(6, 0), guardLine: line("guardLine", 4, 0), vigourLine: null, outcome: "bastionland.damage.structureOutcomes.destroyed", morale: null },
			update: { "system.guard.value": 0 }
		}]
	])("%s", async (_name, { horn = false, ...made }, preset, expected) => {
		hornBlownFor.mockReturnValue(horn);
		inputDialog.mockResolvedValue({ damage: String(preset.damage), armour: "0" });
		const target = actor(made);
		await takeDamage(target, preset);
		expect(lastCard()).toEqual(expected.card);
		expect(target.update.mock.calls[0][0]).toEqual(expected.update);
	});

	describe("a Mortal Wound an ally takes in their place (p66)", () => {
		it.each([
			["their own Mortal Wound", []],
			["their death by Doom", [DOOM]]
		])("names the ally in place of %s", async (_name, items) => {
			const ward = actor({ uuid: "Actor.ward", name: "Ser Ward", type: "knight", items: [{ type: "ability", system: { deathWard: true } }] });
			game.actors.contents.push(ward);
			const kay = actor({ uuid: "Actor.kay", name: "Ser Kay", type: "knight", vig: 8, guard: 2, items });
			inputDialog.mockResolvedValueOnce({ damage: "9", armour: "0" }).mockResolvedValueOnce({ warden: ward.uuid });
			await takeDamage(kay, { damage: 9 });
			expect(lastCard()).toEqual({
				outcomeKey: "warded",
				dealt: dealt(9, 0),
				guardLine: line("guardLine", 2, 0),
				vigourLine: null,
				outcome: 'bastionland.damage.outcomes.warded {"name":"Ser Ward"}',
				morale: null
			});
			expect(kay.update.mock.calls[0][0]).toEqual({ "system.guard.value": 0, "system.virtues.vig.value": 8 });
		});
	});
});
