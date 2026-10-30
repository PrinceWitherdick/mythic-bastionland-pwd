import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** What the window answers, and what it was asked. */
let answer;
let asked;

vi.mock("../../module/apps/ui.js", () => ({
	inputDialog: vi.fn(async (options) => {
		asked = options;
		return answer;
	})
}));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => null), t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));

/** Each Knight's steed and followers, by the Knight's id. */
let riding = {};
vi.mock("../../module/actions/fallen.js", () => ({ announceFallenKnight: vi.fn(), companionsOf: (actor) => riding[actor.id] ?? [] }));

const { chooseCompany } = await import("../../module/actions/time.js");

const knight = (id, name, age = "young") => ({ id, uuid: `Actor.${id}`, name, type: "knight", hasPlayerOwner: true, isOwner: true, system: { virtues: {}, age } });

beforeEach(() => {
	answer = null;
	asked = null;
	globalThis.game = { user: { isGM: true }, actors: [knight("tal", "Tal"), knight("moss", "Moss", "old")] };
	globalThis.canvas = { tokens: { controlled: [] } };
});

afterEach(() => {
	delete globalThis.game;
	delete globalThis.canvas;
});

describe("chooseCompany", () => {
	it("offers what Service and Courtesy can make beside the pursuit, and keeps only what fits the pursuit picked (p17)", async () => {
		answer = {
			"include-0": true, "pursuit-0": "courtesy", "making-0": "court",
			"include-1": true, "pursuit-1": "service", "making-1": "favour"
		};
		const company = await chooseCompany({ title: "", icon: "", intro: "", ok: "", pursuits: ["service", "courtesy", "pilgrimage"] });
		expect(asked.context.makings.map(({ value }) => value)).toEqual(["dwelling", "other", "court", "contact", "favour"]);
		expect(asked.render).toBeTypeOf("function");
		expect(company.map(({ actor, pursuit, making }) => [actor.name, pursuit, making])).toEqual([["Tal", "courtesy", "court"], ["Moss", "service", null]]);
	});

	it("as an Age turns, ticks to grow older only those with a stage of life ahead", async () => {
		answer = { "include-0": true, "older-0": true, "include-1": true };
		const company = await chooseCompany({ title: "", icon: "", intro: "", ok: "", aging: true });
		expect(asked.context.members.map(({ older }) => older)).toEqual(['time.aging.grows {"age":"age.mature"}', null]);
		expect(company.map(({ older }) => older)).toEqual([true, false]);
	});

	it("lists only those given when the world's Knights and the selected Tokens aren't wanted", async () => {
		const boar = { uuid: "Actor.boar", name: "Boar", type: "npc", isOwner: true, system: { virtues: {} } };
		canvas.tokens.controlled = [{ actor: game.actors[0] }];
		answer = {};
		await chooseCompany({ title: "", icon: "", intro: "", ok: "", others: [boar], onlyGiven: true });
		expect(asked.context.members.map(({ name }) => name)).toEqual(["Boar"]);
		expect(asked.render).toBeUndefined();
	});

	it("leaves out NPCs and NPC Knights, even with their Tokens selected, but keeps a Knight no player holds yet", async () => {
		const boar = { uuid: "Actor.boar", name: "Boar", type: "npc", isOwner: true, system: { virtues: {} } };
		const brand = { ...knight("brand", "Sir Brand"), type: "npcKnight", hasPlayerOwner: false };
		const spare = { ...knight("spare", "Spare"), hasPlayerOwner: false };
		game.actors.push(brand, spare);
		canvas.tokens.controlled = [{ actor: boar }, { actor: brand }];
		answer = {};
		await chooseCompany({ title: "", icon: "", intro: "", ok: "" });
		expect(asked.context.members.map(({ name, included }) => [name, included])).toEqual([["Tal", true], ["Moss", true], ["Spare", false]]);
	});

	it("still lists whoever is named as present, and NPCs given to the Referee to tick", async () => {
		const carrier = { uuid: "Actor.carrier", name: "Carrier", type: "npc", isOwner: true, system: { virtues: {} } };
		const brand = { ...knight("brand", "Sir Brand"), type: "npcKnight", hasPlayerOwner: false };
		answer = {};
		await chooseCompany({ title: "", icon: "", intro: "", ok: "", present: [carrier], others: [brand] });
		expect(asked.context.members.map(({ name, included }) => [name, included])).toEqual([["Carrier", true], ["Sir Brand", false], ["Tal", true], ["Moss", true]]);
	});
});

describe("chooseCompany, Squires and companions", () => {
	afterEach(() => {
		riding = {};
	});

	it("offers a Squire no Succession or Legacy as the Age turns (p7, p17)", async () => {
		game.actors = [knight("tal", "Tal"), { ...knight("ned", "Ned"), system: { virtues: {}, age: "young", isSquire: true } }];
		answer = { "include-0": true, "pursuit-0": "legacy", "include-1": true, "pursuit-1": "legacy" };
		const company = await chooseCompany({ title: "", icon: "", intro: "", ok: "", pursuits: ["duty", "succession", "legacy"] });
		expect(asked.context.members.map(({ pursuits }) => pursuits.map(({ key }) => key))).toEqual([["duty", "succession", "legacy"], ["duty"]]);
		// A pursuit the Squire wasn't offered isn't taken, however the form came back.
		expect(company.map(({ pursuit }) => pursuit)).toEqual(["legacy", null]);
	});

	it("lists each Knight's steed and followers after the Knights, ticked as their Knight is", async () => {
		const steed = { uuid: "Actor.bayard", name: "Bayard", type: "npc", isOwner: true, system: { virtues: {} } };
		const guide = { uuid: "Actor.guide", name: "The Guide", type: "npc", isOwner: true, system: { virtues: {} } };
		riding = { tal: [steed, guide] };
		answer = {};
		await chooseCompany({ title: "", icon: "", intro: "", ok: "", companions: true });
		expect(asked.context.members.map(({ name, included }) => [name, included])).toEqual([["Tal", true], ["Moss", true], ["Bayard", true], ["The Guide", true]]);
	});

	it("lists no companions unless asked", async () => {
		riding = { tal: [{ uuid: "Actor.bayard", name: "Bayard", type: "npc", isOwner: true, system: { virtues: {} } }] };
		answer = {};
		await chooseCompany({ title: "", icon: "", intro: "", ok: "" });
		expect(asked.context.members.map(({ name }) => name)).toEqual(["Tal", "Moss"]);
	});
});
