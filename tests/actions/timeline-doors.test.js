import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The doors that write the new automatic Timeline rows: one action each, so
 * every button that does the thing writes it the same way.
 */

let calendar = { age: 1, year: 1, season: "spring", day: 1, phase: "morning" };
let realm;
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => calendar }));
vi.mock("../../module/actions/realm.js", () => ({
	editRealm: vi.fn(async (_scene, edit) => {
		const next = edit(realm, {});
		if (next === realm) return false;
		realm = next;
		return true;
	}),
	sceneGeometry: () => ({})
}));
vi.mock("../../module/actions/wilderness.js", () => ({ findCompany: () => ({ hex: { col: 2, row: 2 } }) }));
vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn() }));
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
vi.mock("../../module/actions/knights.js", () => ({ worldKnights: () => [] }));
vi.mock("../../module/actions/property.js", () => ({ makeCompanions: vi.fn(), markCompanions: vi.fn() }));
vi.mock("../../module/actions/timeline-events.js", () => ({
	timelineDesignBegun: vi.fn(),
	timelineDesignForgotten: vi.fn(),
	timelineHeirNamed: vi.fn(),
	timelineJoined: vi.fn(),
	timelineOmens: vi.fn()
}));

const timeline = await import("../../module/actions/timeline-events.js");
const { beginDesign, strikeOffDesign } = await import("../../module/actions/grand-designs.js");
const { followOmenSteps, markMythOmen } = await import("../../module/actions/omens.js");
const { nameSuccessor } = await import("../../module/actions/succession.js");
const { knightJoined } = await import("../../module/actions/new-knight.js");
const { UNCHOSEN_FLAG } = await import("../../module/rules/unchosen-knight.js");

beforeEach(() => {
	vi.clearAllMocks();
	calendar = { age: 1, year: 1, season: "spring", day: 1, phase: "morning" };
	globalThis.foundry = { utils: { randomID: () => "g1" } };
});

describe("Grand Designs", () => {
	const domain = () => {
		const actor = { system: { designs: {} }, update: vi.fn(async (changes) => {
			for (const [key, value] of Object.entries(changes)) {
				const id = key.split(".").at(-1);
				if (key.includes("-=")) delete actor.system.designs[id.slice(2)];
				else actor.system.designs[id] = value;
			}
		}) };
		return actor;
	};

	it("writes a work begun on the Timeline", async () => {
		const actor = domain();
		expect(await beginDesign(actor, "building")).toBe("g1");
		expect(timeline.timelineDesignBegun).toHaveBeenCalledWith(actor, "g1", expect.objectContaining({ scale: "building" }));
		expect(await beginDesign(actor, "palace")).toBeNull();
		expect(timeline.timelineDesignBegun).toHaveBeenCalledTimes(1);
	});

	it("takes the row back only for a work struck off unfinished in the Season it was begun", async () => {
		const actor = domain();
		await beginDesign(actor, "building");
		await strikeOffDesign(actor, "g1");
		expect(timeline.timelineDesignForgotten).toHaveBeenCalledWith("g1");

		vi.clearAllMocks();
		await beginDesign(actor, "building");
		calendar = { ...calendar, season: "harvest" };
		await strikeOffDesign(actor, "g1");
		expect(timeline.timelineDesignForgotten).not.toHaveBeenCalled();
	});
});

describe("an Omen marked by hand", () => {
	const scene = { id: "s1" };

	beforeEach(() => {
		realm = { terrain: [], rivers: [], holdings: [], landmarks: [], barriers: [], myths: [{ number: 3, d6: 2, d12: 7, omen: 1, hex: { col: 9, row: 9 } }] };
	});

	it("writes the Omens met, where the Company stands", async () => {
		expect(await markMythOmen(scene, 3, 3)).toBe(true);
		expect(timeline.timelineOmens).toHaveBeenCalledWith(scene, expect.objectContaining({ number: 3 }), { from: 1, to: 3, hex: { col: 2, row: 2 } });
	});

	it("steps from the count as it stands, and writes nothing that changes nothing", async () => {
		await markMythOmen(scene, 3, (myth) => myth.omen - 1);
		expect(timeline.timelineOmens).toHaveBeenCalledWith(scene, expect.anything(), expect.objectContaining({ from: 1, to: 0 }));
		vi.clearAllMocks();
		expect(await markMythOmen(scene, 3, 0)).toBe(false);
		expect(await markMythOmen(scene, 9, 2)).toBe(false);
		expect(timeline.timelineOmens).not.toHaveBeenCalled();
	});

	it("follows Undo and Redo, for the same Myth only", async () => {
		const myth = realm.myths[0];
		const marked = { ...realm, myths: [{ ...myth, omen: 2 }] };
		await followOmenSteps(scene, marked, realm);
		expect(timeline.timelineOmens).toHaveBeenCalledWith(scene, myth, { from: 2, to: 1 });
		vi.clearAllMocks();
		await followOmenSteps(scene, realm, realm);
		await followOmenSteps(scene, marked, { ...realm, myths: [{ ...myth, d12: 8 }] });
		expect(timeline.timelineOmens).not.toHaveBeenCalled();
	});
});

describe("a successor named", () => {
	const knight = () => ({ system: { successor: "" }, update: vi.fn(async function (changes) {
		this.system.successor = changes["system.successor"];
	}) });

	it("is written once, and not where the Age's row already says it", async () => {
		const actor = knight();
		const heir = { uuid: "Actor.h" };
		await nameSuccessor(actor, heir);
		await nameSuccessor(actor, heir);
		expect(timeline.timelineHeirNamed).toHaveBeenCalledTimes(1);
		const other = knight();
		await nameSuccessor(other, heir, { record: false });
		expect(other.system.successor).toBe("Actor.h");
		expect(timeline.timelineHeirNamed).toHaveBeenCalledTimes(1);
	});
});

describe("a Knight joining", () => {
	const knight = (more = {}) => ({ type: "knight", hasPlayerOwner: true, system: { isSquire: false }, getFlag: () => false, ...more });

	it("is written for a chosen Knight a player holds", async () => {
		const actor = knight();
		await knightJoined(actor);
		expect(timeline.timelineJoined).toHaveBeenCalledWith(actor);
	});

	it("waits for a Knight still to be chosen, and leaves NPC Knights and Squires out", async () => {
		await knightJoined(knight({ getFlag: (_scope, key) => key === UNCHOSEN_FLAG }));
		await knightJoined(knight({ hasPlayerOwner: false }));
		await knightJoined(knight({ system: { isSquire: true } }));
		await knightJoined(null);
		expect(timeline.timelineJoined).not.toHaveBeenCalled();
	});
});
