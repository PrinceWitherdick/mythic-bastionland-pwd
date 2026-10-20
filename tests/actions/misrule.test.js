import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/apps/ui.js", () => ({ chooseDialog: vi.fn(), inputDialog: vi.fn() }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => null }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => ({})), t: (key) => key }));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({ age: 1, year: 1, season: "spring", day: 1, phase: "morning" }) }));
vi.mock("../../module/actions/court.js", () => ({ knightsBesidesRuler: () => [] }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollSpark: vi.fn() }));
vi.mock("../../module/actions/succession.js", () => ({ heirOf: () => null }));
vi.mock("../../module/actions/knights.js", () => ({ worldKnights: () => [] }));
vi.mock("../../module/actions/timeline-events.js", () => ({
	timelineCrisisResolved: vi.fn(),
	timelineCrisisRoll: vi.fn(),
	timelineDrama: vi.fn(),
	timelineNewRuler: vi.fn()
}));

const { noticeRulerSlain, resolveCrisis, settleDomains } = await import("../../module/actions/dominion.js");
const { postCard } = await import("../../module/chat/cards.js");

const domain = (crises, misrule = false) => ({
	id: "d1",
	name: "Ashford",
	type: "domain",
	system: { crises, misrule, misruleDue: crises.length >= 3 && !misrule, seized: "" },
	update: vi.fn(async () => {})
});

beforeEach(() => vi.mocked(postCard).mockClear());

describe("misrule", () => {
	it("ends once resolving brings a Domain in misrule under three Crises (p20)", async () => {
		const ruled = domain(["chaos", "debt", "famine"], true);
		await resolveCrisis(ruled, 0);
		expect(ruled.update).toHaveBeenCalledWith({ "system.crises": ["debt", "famine"], "system.misrule": false });
		expect(vi.mocked(postCard).mock.calls[0][2].text).toContain("domain.misruleEnds");
	});

	it("doesn't end a misrule the Crises didn't bring", async () => {
		// Increased Collections can bring misrule at once (p21), with fewer than three Crises.
		const squeezed = domain(["chaos", "debt"], true);
		await resolveCrisis(squeezed, 0);
		expect(squeezed.update).toHaveBeenCalledWith({ "system.crises": ["debt"] });
	});

	it("says what misrule brings as the Season sends a Domain into it", async () => {
		const falling = domain(["chaos", "debt", "famine"]);
		globalThis.game = { actors: [falling] };
		globalThis.Actor = { implementation: { updateDocuments: vi.fn() } };
		const { entries: [entry], fell } = await settleDomains("1-spring");
		expect(entry.lines[0]).toBe("domain.fellIntoMisrule domain.misruleHint");
		expect(fell).toEqual([falling]);
		expect(Actor.implementation.updateDocuments).toHaveBeenCalledWith([{ _id: "d1", "system.misrule": true }]);
	});
});

describe("a ruling Knight's death", () => {
	const ashford = { uuid: "Actor.d1", documentName: "Actor", type: "domain", name: "Ashford", system: { ruler: "Sir Tal", successor: "Moss" } };
	const tal = { type: "knight", name: "Sir Tal", system: { domain: "Actor.d1" } };

	beforeEach(() => {
		globalThis.foundry = { utils: { getProperty: (object, path) => path.split(".").reduce((node, key) => node?.[key], object) } };
		globalThis.fromUuidSync = (uuid) => (uuid === ashford.uuid ? ashford : null);
		globalThis.game = { users: { activeGM: { isSelf: true } } };
	});

	it("tells the Referee the Domain passes on, with the button that passes it (p21)", async () => {
		await noticeRulerSlain(tal, { system: { slain: true } });
		const [domain, template, context, options] = vi.mocked(postCard).mock.calls[0];
		expect([domain, template, context.action.data, options.mode]).toEqual([ashford, "note", "pass-on", "gm"]);
	});

	it("says nothing of other changes, other browsers, or a Domain passed on already", async () => {
		await noticeRulerSlain(tal, { system: { glory: 3 } });
		await noticeRulerSlain({ ...tal, name: "Sir Bors" }, { system: { slain: true } });
		game.users.activeGM.isSelf = false;
		await noticeRulerSlain(tal, { system: { slain: true } });
		expect(postCard).not.toHaveBeenCalled();
	});
});
