import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { realmGeometry } from "../../module/rules/realm-geometry.js";

const solo = { kept: false };
let journeyHexes = {};

vi.mock("../../module/actions/realm.js", () => ({
	isRealmScene: (scene) => Boolean(scene?.realm),
	expansionUnderWay: (scene) => scene?.expanding ?? null,
	sceneGeometry: () => realmGeometry({ cols: 3, rows: 3 })
}));
vi.mock("../../module/actions/solo.js", () => ({ secretsKeptOn: () => solo.kept }));
vi.mock("../../module/actions/journey.js", () => ({ getJourney: () => ({ hexes: journeyHexes }) }));

const {
	REALM_FOG_FLAG,
	foggedForMe,
	foggedForPlayers,
	forgetRealmFog,
	getRealmFog,
	hexFoggedForMe,
	liftAllRealmFog,
	liftRealmFog,
	liftRealmFogBy,
	realmFogLook,
	realmFogOn,
	setRealmFogOptions,
	toggleRealmFogAt,
	veilAllRealmFog
} = await import("../../module/actions/realm-fog.js");
const { SYSTEM_ID } = await import("../../module/system-id.js");

class ForcedDeletion {}
const ForcedReplacement = { create: (value) => ({ replaced: value }) };
const path = (...parts) => `flags.${SYSTEM_ID}.${REALM_FOG_FLAG}.${parts.join(".")}`;

const visited = (order) => ({ count: 1, first: { when: null, order }, last: { when: null, order }, arrivals: [{ when: null, order }] });

/** A Realm Scene keeping its fog in a flag, and writing it back as Foundry would. */
function realmScene(fog) {
	const scene = {
		id: "S",
		realm: true,
		fog,
		getFlag: (scope, flag) => (scope === SYSTEM_ID && flag === REALM_FOG_FLAG ? scene.fog : undefined),
		update: vi.fn(async (update) => {
			const next = structuredClone(scene.fog ?? {});
			next.hexes ??= {};
			for (const [key, value] of Object.entries(update)) {
				const [, hex] = key.split(".hexes.");
				if (hex) {
					if (value instanceof ForcedDeletion) delete next.hexes[hex];
					else next.hexes[hex] = value.replaced;
				} else next[key.split(".").at(-1)] = value;
			}
			scene.fog = next;
			forgetRealmFog(scene.id);
		})
	};
	return scene;
}

beforeEach(() => {
	solo.kept = false;
	journeyHexes = {};
	forgetRealmFog();
	globalThis.game = { user: { isGM: true } };
	globalThis.foundry = { data: { operators: { ForcedDeletion, ForcedReplacement } } };
});

afterEach(() => {
	delete globalThis.game;
	delete globalThis.foundry;
});

describe("getRealmFog and realmFogOn", () => {
	it("are off on a Realm that never had fog, and on any other Scene", () => {
		expect(realmFogOn(realmScene(undefined))).toBe(false);
		expect(getRealmFog({ realm: false, getFlag: () => ({ on: true }) }).on).toBe(false);
		expect(realmFogOn(realmScene({ on: true }))).toBe(true);
	});
});

describe("setRealmFogOptions", () => {
	it("writes what changes, beside the version, in one write", async () => {
		const scene = realmScene({ on: false, holdings: false });
		await expect(setRealmFogOptions(scene, { on: true, holdings: false })).resolves.toBe(true);
		expect(scene.update).toHaveBeenCalledTimes(1);
		expect(scene.update.mock.calls[0][0]).toEqual({ [path("on")]: true, [path("version")]: 1 });
		await expect(setRealmFogOptions(scene, { on: true })).resolves.toBe(false);
	});

	it("writes nothing for a player, or off a Realm", async () => {
		const scene = realmScene({});
		game.user.isGM = false;
		await expect(setRealmFogOptions(scene, { on: true })).resolves.toBe(false);
		game.user.isGM = true;
		const elsewhere = { ...realmScene({}), realm: false };
		await expect(setRealmFogOptions(elsewhere, { on: true })).resolves.toBe(false);
		expect(scene.update).not.toHaveBeenCalled();
		expect(elsewhere.update).not.toHaveBeenCalled();
	});
});

describe("liftRealmFog and the rest", () => {
	it("writes only the hexes that change", async () => {
		journeyHexes = { "1,1": visited(1) };
		const scene = realmScene({ on: true, hexes: { "2,2": { lifted: { by: "hand", at: 1 } } } });
		await liftRealmFog(scene, [{ col: 1, row: 1 }, { col: 2, row: 2 }, { col: 3, row: 3 }], "vantage");
		const [[update]] = scene.update.mock.calls;
		expect(Object.keys(update).sort()).toEqual([path("hexes", "3,3"), path("version")]);
		expect(scene.fog.hexes["3,3"].lifted.by).toBe("vantage");
	});

	it("lifts several groups, each for its own reason, in one write", async () => {
		const scene = realmScene({ on: true });
		await liftRealmFogBy(scene, [{ hexes: [{ col: 1, row: 1 }], by: "vantage" }, { hexes: [{ col: 2, row: 2 }], by: "marked" }]);
		expect(scene.update).toHaveBeenCalledOnce();
		expect(scene.fog.hexes["1,1"].lifted.by).toBe("vantage");
		expect(scene.fog.hexes["2,2"].lifted.by).toBe("marked");
	});

	it("writes nothing while the Realm's fog is off", async () => {
		const scene = realmScene({ on: false });
		await expect(liftRealmFog(scene, [{ col: 1, row: 1 }], "told")).resolves.toBe(false);
		await expect(toggleRealmFogAt(scene, { col: 1, row: 1 })).resolves.toBe(false);
		expect(scene.update).not.toHaveBeenCalled();
	});

	it("writes nothing while the Realm's map is being expanded, as the hexes under the brush are moving", async () => {
		const warned = vi.fn();
		globalThis.ui = { notifications: { warn: warned } };
		game.i18n = { localize: (key) => key };
		const scene = realmScene({ on: true });
		scene.expanding = { version: 1 };
		await expect(toggleRealmFogAt(scene, { col: 1, row: 1 })).resolves.toBe(false);
		await expect(liftRealmFog(scene, [{ col: 2, row: 2 }], "hand")).resolves.toBe(false);
		expect(scene.update).not.toHaveBeenCalled();
		expect(warned).toHaveBeenCalledWith("bastionland.realm.hexesExpanding");
		delete globalThis.ui;
	});

	it("writes nothing for a player", async () => {
		game.user.isGM = false;
		const scene = realmScene({ on: true });
		await expect(liftRealmFog(scene, [{ col: 1, row: 1 }], "hand")).resolves.toBe(false);
		await expect(toggleRealmFogAt(scene, { col: 1, row: 1 })).resolves.toBe(false);
		expect(scene.update).not.toHaveBeenCalled();
	});

	it("toggles one hex, and lifts or brings back the whole Realm", async () => {
		const scene = realmScene({ on: true });
		await toggleRealmFogAt(scene, { col: 2, row: 1 });
		expect(foggedForPlayers(scene).has("2,1")).toBe(false);
		await toggleRealmFogAt(scene, { col: 2, row: 1 });
		expect(foggedForPlayers(scene).has("2,1")).toBe(true);
		await liftAllRealmFog(scene);
		expect(foggedForPlayers(scene).size).toBe(0);
		journeyHexes = { "1,1": visited(4) };
		await veilAllRealmFog(scene);
		expect(foggedForPlayers(scene).size).toBe(9);
		expect(scene.fog.hexes).toEqual({ "1,1": { veiled: { after: 4 } } });
	});
});

describe("foggedForMe", () => {
	it("is empty for a Referee not playing alone, who sees a veil", () => {
		const scene = realmScene({ on: true });
		expect(realmFogLook(scene)).toBe("veil");
		expect(foggedForMe(scene).size).toBe(0);
		expect(foggedForPlayers(scene).size).toBe(9);
	});

	it("is every hex not reached for a player, and for a Referee playing alone", () => {
		journeyHexes = { "1,1": visited(1) };
		const scene = realmScene({ on: true });
		game.user.isGM = false;
		expect(realmFogLook(scene)).toBe("full");
		expect(foggedForMe(scene).size).toBe(8);
		expect(hexFoggedForMe(scene, { col: 1, row: 1 })).toBe(false);
		expect(hexFoggedForMe(scene, { col: 2, row: 1 })).toBe(true);
		game.user.isGM = true;
		solo.kept = true;
		expect(foggedForMe(scene).size).toBe(8);
	});

	it("is empty while the fog is off", () => {
		game.user.isGM = false;
		expect(foggedForMe(realmScene({ on: false })).size).toBe(0);
		expect(realmFogLook(realmScene({ on: false }))).toBe("none");
	});
});
