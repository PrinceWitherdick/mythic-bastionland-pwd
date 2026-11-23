import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const attack = vi.fn(async () => "attacked");
const takeDamage = vi.fn(async () => "hurt");
const rollSave = vi.fn(async () => "saved");
const rollMoraleIfAccepted = vi.fn(async () => "held");
vi.mock("../../module/actions/attack.js", () => ({ attack: (...args) => attack(...args) }));
vi.mock("../../module/actions/damage.js", () => ({ takeDamage: (...args) => takeDamage(...args) }));
vi.mock("../../module/actions/saves.js", () => ({ rollSave: (...args) => rollSave(...args), rollMoraleIfAccepted: (...args) => rollMoraleIfAccepted(...args) }));
vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));

let shown = true;
vi.mock("../../module/client-settings.js", () => ({ read: () => shown }));

const { ringButtons } = await import("../../module/rules/combat-ring.js");
const { openRingOnClick, ringCombatantFor, ringContext, runRingButton } = await import("../../module/canvas/combat-ring.js");

const actor = { type: "npc", name: "Bandit", system: { virtues: { vig: { value: 7 }, cla: { value: 10 }, spi: { value: 5 } } } };

beforeEach(() => {
	vi.clearAllMocks();
	shown = true;
	globalThis.canvas = { scene: { id: "s1" } };
	globalThis.game = { activeTool: "select", combats: [{ combatants: [{ tokenId: "t1", sceneId: "s1" }] }] };
});

afterEach(() => {
	for (const key of ["canvas", "game"]) delete globalThis[key];
});

describe("ringContext", () => {
	it("names each button as its sheet does, counting through the left column and then the right", () => {
		const view = ringContext(ringButtons(actor), { name: "Bandit" });
		expect(view.fight.map(({ index, label }) => [index, label])).toEqual([[0, "sheet.attack"], [1, "sheet.takeDamage"], [2, "morale.title"]]);
		expect(view.saves.map(({ index, label, value }) => [index, label, value])).toEqual([[3, "virtues.vig.abbr", "7"], [4, "virtues.cla.abbr", "10"], [5, "virtues.spi.abbr", "5"]]);
		expect(view.saves[0].aria).toBe('combatRing.save {"virtue":"virtues.vig.label","value":7}');
		expect(view.ringLabel).toBe('combatRing.label {"name":"Bandit"}');
	});
});

describe("runRingButton", () => {
	it("calls what the sheet's own control calls", async () => {
		await runRingButton({ run: "attack" }, actor);
		await runRingButton({ run: "takeDamage" }, actor);
		await runRingButton({ run: "morale" }, actor);
		await runRingButton({ run: "save", virtue: "cla" }, actor);
		expect(attack).toHaveBeenCalledWith(actor);
		expect(takeDamage).toHaveBeenCalledWith(actor);
		expect(rollMoraleIfAccepted).toHaveBeenCalledWith(actor);
		expect(rollSave).toHaveBeenCalledWith(actor, "cla");
	});

	it("does nothing without a button or an actor", async () => {
		expect(await runRingButton(null, actor)).toBeNull();
		expect(await runRingButton({ run: "attack" }, null)).toBeNull();
		expect(attack).not.toHaveBeenCalled();
	});
});

describe("ringCombatantFor", () => {
	const token = (sceneId = "s1") => ({ document: { id: "t1", parent: { id: sceneId } } });

	it("finds a Token in a Combat on the Scene being looked at", () => {
		expect(ringCombatantFor(token())).toEqual({ tokenId: "t1", sceneId: "s1" });
	});

	it("finds nothing on a Scene not being looked at, or with the setting turned off", () => {
		expect(ringCombatantFor(token("s2"))).toBeNull();
		shown = false;
		expect(ringCombatantFor(token())).toBeNull();
	});
});

describe("openRingOnClick", () => {
	it("puts nothing up for a Token in no Combat, or one left unselected, without building the window", async () => {
		globalThis.foundry = undefined;
		// Building the window would read foundry.applications and throw, so getting through proves it wasn't built.
		await expect(openRingOnClick({ document: { id: "t9", parent: { id: "s1" } }, controlled: true, actor }, {})).resolves.toBeUndefined();
		await expect(openRingOnClick({ document: { id: "t1", parent: { id: "s1" } }, controlled: false, actor }, {})).resolves.toBeUndefined();
		await expect(openRingOnClick({ document: { id: "t1", parent: { id: "s1" } }, controlled: true, actor }, { shiftKey: true })).resolves.toBeUndefined();
		delete globalThis.foundry;
	});
});
