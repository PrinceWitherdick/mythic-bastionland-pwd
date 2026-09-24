import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDuel } from "../../module/rules/duel.js";

vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn(async () => null) }));
vi.mock("../../module/chat/cards.js", async (importOriginal) => ({
	...(await importOriginal()),
	postCard: vi.fn(async () => ({ id: "message-1" }))
}));

const { inputDialog } = await import("../../module/apps/ui.js");
const { challengeToDuel, duelCardContext } = await import("../../module/actions/duel.js");

const duelists = [{ uuid: "Actor.ada", name: "Ada", token: "Token.a" }, { uuid: "Actor.bram", name: "Bram", token: "Token.b" }];

beforeEach(() => {
	globalThis.ui = { notifications: { warn: () => {} } };
	globalThis.game = {
		user: { targets: new Set() },
		i18n: { localize: (key) => key, format: (key) => key }
	};
});

afterEach(() => {
	for (const key of ["ui", "game"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("the duel card", () => {
	it("says what Resolve is waiting for until both Attacks are in", () => {
		const duel = createDuel({ duelists });
		expect(duelCardContext(duel).resolveHint).toBe("bastionland.duel.notReady");
		const ready = { ...duel, duelists: duel.duelists.map((duelist) => ({ ...duelist, attack: "message-x" })) };
		expect(duelCardContext(ready).resolveHint).toBeNull();
	});
});

describe("the duel dialog", () => {
	/** A Knight and the Token they've targeted, the Knight mounted or not. */
	const setUp = ({ steed }) => {
		const actor = {
			uuid: "Actor.ada",
			name: "Ada",
			type: "knight",
			system: { steed, isSquire: false },
			getActiveTokens: () => []
		};
		const opponent = { uuid: "Actor.bram", type: "knight", system: { isSquire: false } };
		game.user.targets = new Set([{ actor: opponent, document: { uuid: "Token.b", name: "Bram" } }]);
		return actor;
	};

	it("opens on a duel, even for a Knight with a steed", async () => {
		await challengeToDuel(setUp({ steed: "Actor.horse" }));
		const [{ context }] = inputDialog.mock.calls[0];
		expect(context.kinds.map(({ key, selected }) => [key, selected])).toEqual([["duel", true], ["joust", false]]);
	});
});
