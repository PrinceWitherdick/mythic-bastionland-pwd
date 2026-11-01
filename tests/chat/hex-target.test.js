import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/actions/hex-names.js", () => ({ hexLabel: (hex) => `Column ${hex.col}, Row ${hex.row}` }));
vi.mock("../../module/actions/travels.js", () => {
	const showHexOnMap = vi.fn(async () => {});
	// As travels.js has it: the Realm is brought up first when another Scene is on show.
	const viewAndShowHex = async (scene, hex) => {
		if (!scene || !hex) return false;
		if (canvas.scene?.id !== scene.id) await scene.view();
		if (canvas.scene?.id !== scene.id) return false;
		await showHexOnMap(scene, hex);
		return true;
	};
	return { showHexOnMap, viewAndShowHex };
});
vi.mock("../../module/canvas/shown-hex.js", () => ({ ringHoveredHex: vi.fn() }));

const { showHexOnMap } = await import("../../module/actions/travels.js");
const { ringHoveredHex } = await import("../../module/canvas/shown-hex.js");
const { hexTarget, registerHexTargets } = await import("../../module/chat/hex-target.js");

/** What renderChatMessageHTML calls, one per registration. */
let renders;
let warn;
let realm;
let other;

/** A rendered message holding one chip, and its listeners. */
function renderedChip(dataset) {
	const chip = { dataset, disabled: false };
	const listeners = {};
	const html = {
		querySelector: () => chip,
		addEventListener: (type, fn) => {
			(listeners[type] ??= []).push(fn);
		}
	};
	for (const render of renders) render({}, html);
	const fire = async (type) => {
		for (const fn of listeners[type] ?? []) await fn({ target: { closest: () => chip }, preventDefault: () => {} });
	};
	return { chip, fire };
}

beforeEach(() => {
	renders = [];
	realm = { id: "realm", view: vi.fn(async () => { canvas.scene = realm; }), testUserPermission: vi.fn(() => false) };
	other = { id: "other", view: vi.fn() };
	globalThis.Hooks = { on: (name, fn) => { if (name === "renderChatMessageHTML") renders.push(fn); } };
	warn = vi.fn();
	globalThis.ui = { notifications: { warn } };
	globalThis.game = { user: { isGM: true }, scenes: { get: (id) => ({ realm, other })[id] ?? null }, i18n: { localize: (key) => key } };
	globalThis.canvas = { scene: other };
	registerHexTargets();
});

afterEach(() => {
	for (const key of ["Hooks", "game", "canvas", "ui"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("hexTarget", () => {
	it("gives a card the hex's key, its Realm and its label", () => {
		expect(hexTarget({ col: 5, row: 7 }, realm)).toEqual({ key: "5,7", scene: "realm", label: "Column 5, Row 7" });
	});
});

describe("registerHexTargets", () => {
	it("brings up the card's Realm and shows the hex on a click", async () => {
		const { fire } = renderedChip({ hexTarget: "5,7", hexScene: "realm" });
		await fire("click");
		expect(realm.view).toHaveBeenCalled();
		expect(showHexOnMap).toHaveBeenCalledWith(realm, { col: 5, row: 7 });
	});

	it("shows the hex without switching when its Realm is already on the map", async () => {
		canvas.scene = realm;
		const { fire } = renderedChip({ hexTarget: "2,3", hexScene: "realm" });
		await fire("click");
		expect(realm.view).not.toHaveBeenCalled();
		expect(showHexOnMap).toHaveBeenCalledWith(realm, { col: 2, row: 3 });
	});

	it("keeps a player from a Realm the Referee hasn't shown them, saying so", async () => {
		game.user.isGM = false;
		const { fire } = renderedChip({ hexTarget: "5,7", hexScene: "realm" });
		await fire("click");
		expect(realm.testUserPermission).toHaveBeenCalledWith(game.user, "LIMITED");
		expect(realm.view).not.toHaveBeenCalled();
		expect(showHexOnMap).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledWith("bastionland.hexTarget.notShown");
	});

	it("takes a player to a Realm they may glimpse, or show them the hex on the one they're on", async () => {
		game.user.isGM = false;
		realm.testUserPermission.mockReturnValue(true);
		await renderedChip({ hexTarget: "5,7", hexScene: "realm" }).fire("click");
		expect(realm.view).toHaveBeenCalled();
		realm.testUserPermission.mockReturnValue(false);
		await renderedChip({ hexTarget: "2,3", hexScene: "realm" }).fire("click");
		expect(showHexOnMap).toHaveBeenLastCalledWith(realm, { col: 2, row: 3 });
		expect(warn).not.toHaveBeenCalled();
	});

	it("does nothing for a Realm this user can't see", async () => {
		const { fire } = renderedChip({ hexTarget: "2,3", hexScene: "gone" });
		await fire("click");
		expect(showHexOnMap).not.toHaveBeenCalled();
	});

	it("rings the hex while pointed at, only on the Realm on the map", async () => {
		const { chip, fire } = renderedChip({ hexTarget: "4,4", hexScene: "realm" });
		await fire("pointerover");
		expect(ringHoveredHex).not.toHaveBeenCalled();
		canvas.scene = realm;
		await fire("pointerover");
		expect(ringHoveredHex).toHaveBeenCalledWith(realm, { col: 4, row: 4 }, chip);
	});
});
