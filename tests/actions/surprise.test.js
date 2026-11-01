import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn(async () => null) }));
vi.mock("../../module/chat/cards.js", async (importOriginal) => ({
	...(await importOriginal()),
	postCard: vi.fn(async () => ({ id: "message-1" }))
}));
vi.mock("../../module/actions/saves.js", () => ({
	evaluateSave: vi.fn(async () => ({ passed: false, roll: {} })),
	saveContext: () => ({})
}));

const { inputDialog } = await import("../../module/apps/ui.js");
const { rollSurprise } = await import("../../module/actions/surprise.js");

/** A Combat whose Combatants keep the flags written to them. */
function fight({ started, round, turnOf }) {
	const combatants = ["Moss", "Bandit"].map((name) => {
		const flags = {};
		return {
			id: name,
			name,
			actor: { uuid: `Actor.${name}`, system: { virtues: {} } },
			flags,
			getFlag: (scope, key) => flags[scope]?.[key]
		};
	});
	return {
		started,
		round,
		combatants,
		get combatant() {
			return combatants.find(({ name }) => name === turnOf) ?? null;
		},
		nextTurn: vi.fn(async () => {}),
		updateEmbeddedDocuments: vi.fn(async (_type, updates) => {
			for (const update of updates) {
				const combatant = combatants.find(({ id }) => id === update._id);
				for (const [key, value] of Object.entries(update)) {
					if (!key.startsWith("flags.")) continue;
					const [, scope, flag] = key.split(".");
					(combatant.flags[scope] ??= {})[flag] = value;
				}
			}
		})
	};
}

beforeEach(() => {
	globalThis.game = {
		user: { isGM: true },
		users: { activeGM: { isSelf: true } },
		i18n: { localize: (key) => key, format: (key) => key }
	};
	globalThis.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
});

afterEach(() => {
	for (const key of ["game", "ui"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("Surprise rolled once the fight is under way (p8)", () => {
	it("skips a surprised Combatant whose first turn it already is", async () => {
		const combat = fight({ started: true, round: 1, turnOf: "Bandit" });
		inputDialog.mockResolvedValue({ "unready-1": true });
		await rollSurprise(combat);
		expect(combat.combatants[1].flags[SYSTEM_ID].surprised).toBe(true);
		expect(combat.nextTurn).toHaveBeenCalledTimes(1);
	});

	it("leaves the turn alone when it's somebody else's, or past the first round", async () => {
		for (const setup of [{ started: true, round: 1, turnOf: "Moss" }, { started: true, round: 2, turnOf: "Bandit" }, { started: false, round: 0, turnOf: "Bandit" }]) {
			const combat = fight(setup);
			inputDialog.mockResolvedValue({ "unready-1": true });
			await rollSurprise(combat);
			expect(combat.nextTurn).not.toHaveBeenCalled();
		}
	});
});
