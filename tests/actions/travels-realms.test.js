import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
vi.mock("../../module/client-settings.js", () => ({ reducesMotion: () => true }));
vi.mock("../../module/canvas/shown-hex.js", () => ({ ringShownHex: vi.fn() }));
vi.mock("../../module/actions/calendar.js", () => ({ calendarLabel: () => "", seasonLabel: () => "" }));
vi.mock("../../module/actions/company.js", () => ({ companyTokenHex: () => null, findCompanyToken: (scene) => (scene.company ? {} : null) }));
vi.mock("../../module/actions/hex-names.js", () => ({ getHexNames: () => ({}) }));
vi.mock("../../module/actions/hex-shared.js", () => ({ getHexShared: () => ({ hexes: {} }), partyNoteBy: () => "" }));
// Which Realms the players may know of is journey.js's to test: here, as it has it, from what each Scene says.
vi.mock("../../module/actions/journey.js", () => ({
	getJourney: (scene) => ({ hexes: scene.travelled ? { "1,1": {} } : {} }),
	realmKnownToPlayers: (scene, glimpsed = (realm) => Boolean(realm.testUserPermission?.(game.user, "LIMITED"))) => !scene.drawing && (Boolean(scene.active) || glimpsed(scene) || Boolean(scene.travelled)),
	visitsLabel: () => ""
}));
vi.mock("../../module/actions/realm.js", () => ({ isRealmScene: (scene) => Boolean(scene?.realm) }));
vi.mock("../../module/actions/sighted.js", () => ({ getSighted: () => ({}) }));
vi.mock("../../module/actions/solo.js", () => ({ keptFromMe: () => false, realmKnown: (realm) => realm }));

const { travelsHexDetail, travelsRealmChoice } = await import("../../module/actions/travels.js");

/** A Realm's Scene, which the player may glimpse only if it says so. */
const realm = (id, extra = {}) => ({ id, name: `Realm ${id}`, realm: true, testUserPermission: vi.fn(() => Boolean(extra.glimpsed)), ...extra });

let scenes;
beforeEach(() => {
	scenes = [
		realm("unseen", { company: true }),
		realm("drawn", { active: true, drawing: true }),
		realm("glimpsed", { glimpsed: true }),
		realm("travelled", { travelled: true }),
		{ id: "town", name: "Town", realm: false }
	];
	globalThis.game = { user: { isGM: false }, scenes: { contents: scenes, get: (id) => scenes.find((scene) => scene.id === id) } };
	globalThis.canvas = { scene: null };
});

afterEach(() => {
	delete globalThis.game;
	delete globalThis.canvas;
});

const listed = (choice) => choice.scenes.map((scene) => scene.id);

describe("travelsRealmChoice, the Realms Places offers", () => {
	it("offers a GM every Realm", () => {
		game.user.isGM = true;
		expect(listed(travelsRealmChoice())).toEqual(["unseen", "drawn", "glimpsed", "travelled"]);
	});

	it("offers a player only the Realms they may know of, asking Foundry whether they may glimpse each", () => {
		expect(listed(travelsRealmChoice())).toEqual(["glimpsed", "travelled"]);
		expect(scenes[2].testUserPermission).toHaveBeenCalledWith(game.user, "LIMITED");
	});

	it("never opens on a Realm the player can't know of, even where the Company stands or one asked for", () => {
		// The Company's Token stands on the unseen Realm, which would be picked before one merely travelled.
		expect(travelsRealmChoice().scene?.id).toBe("travelled");
		expect(travelsRealmChoice("unseen").scene?.id).toBe("travelled");
		expect(travelsRealmChoice("glimpsed").scene?.id).toBe("glimpsed");
	});

	it("offers a player the Realm on show, unless the Referee is still drawing it", () => {
		scenes[0].active = true;
		expect(listed(travelsRealmChoice())).toEqual(["unseen", "glimpsed", "travelled"]);
		expect(travelsRealmChoice().scene?.id).toBe("unseen");
	});
});

describe("travelsHexDetail", () => {
	it("tells a player nothing of a hex on a Realm kept from them, as a window drawn before it was hidden asks", () => {
		expect(travelsHexDetail("unseen", "1,1")).toBeNull();
		expect(travelsHexDetail("drawn", "1,1")).toBeNull();
	});
});
