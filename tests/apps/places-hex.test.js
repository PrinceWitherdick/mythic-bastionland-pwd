import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/actions/realm.js", () => ({ isRealmScene: (scene) => Boolean(scene?.realm) }));

const { PLACES_ID, placesChosenHex } = await import("../../module/apps/places-hex.js");

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const realm = { id: "realm", realm: true };
let instances;

/** Places as TravelsPlaces#chosen reads it: the Scene by id and the hex chosen, if both. */
const places = (rendered, realmId, hex) => ({
	rendered,
	chosen: () => {
		const scene = game.scenes.get(realmId);
		return scene && hex ? { scene, hex } : null;
	}
});

beforeEach(() => {
	instances = new Map();
	globalThis.foundry = { applications: { instances } };
	globalThis.game = { user: { isGM: true }, scenes: new Map([["realm", realm], ["plain", { id: "plain" }]]) };
});

describe("the hex chosen in Places", () => {
	it("is the hex and Realm Places has open, for a GM", () => {
		instances.set(PLACES_ID, places(true, "realm", { col: 3, row: 4 }));
		expect(placesChosenHex()).toEqual({ scene: realm, hex: { col: 3, row: 4 } });
	});

	it("is none with Places closed, no hex chosen, a scene that isn't a Realm, or for a player", () => {
		expect(placesChosenHex()).toBeNull();
		instances.set(PLACES_ID, places(false, "realm", { col: 3, row: 4 }));
		expect(placesChosenHex()).toBeNull();
		instances.set(PLACES_ID, places(true, "realm", null));
		expect(placesChosenHex()).toBeNull();
		instances.set(PLACES_ID, places(true, "plain", { col: 3, row: 4 }));
		expect(placesChosenHex()).toBeNull();
		instances.set(PLACES_ID, places(true, "realm", { col: 3, row: 4 }));
		game.user.isGM = false;
		expect(placesChosenHex()).toBeNull();
	});
});

describe("Flip the Book and the hex chosen in Places", () => {
	const flip = read("module/apps/BookFlip.js");
	const places = read("module/apps/TravelsPlaces.js");

	it("saves to the hex chosen in Places, and asks for one on the map only with none chosen", () => {
		expect(flip).toContain("const hex = chosen?.hex ?? await pickHexAside(this, scene, {");
		expect(flip).toContain('return target ? t("bookFlip.pickHere", { hex: hexLabel(target.hex, target.scene) }) : t("bookFlip.saveToHex");');
		expect(flip).toContain("saveLabel: this.savesTo");
		expect(read("templates/apps/book-flip.hbs")).toContain("{{saveLabel}}</button>");
	});

	it("says again where it saves as Places moves or closes", () => {
		expect(places).toMatch(/function chosenHexMoved\(\) \{\s*refreshSparkKeep\(\);\s*refreshBookFlip\(\);\s*\}/);
		expect(places).not.toMatch(/^\t\trefreshSparkKeep\(\);/m);
	});

	it("draws Flip the Book again only when the hex it saves to has changed", () => {
		expect(flip).toContain("if (window_?.rendered && !window_.busy && window_.savesTo !== saveLabel()) window_.render();");
	});
});
