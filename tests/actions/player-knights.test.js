import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { grantPlayerActorCreate, registerPlayerKnightDialog, rolesWith } from "../../module/actions/player-knights.js";

const ROLES = { NONE: 0, PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 };
let permissions;
let original;

beforeEach(() => {
	permissions = {};
	original = vi.fn(async () => "made");
	globalThis.CONST = { USER_ROLES: ROLES, USER_PERMISSIONS: { ACTOR_CREATE: { defaultRole: ROLES.ASSISTANT } } };
	globalThis.Array.fromRange = (n) => [...Array(n).keys()];
	globalThis.foundry = { utils: { deepClone: (value) => structuredClone(value) } };
	globalThis.Actor = class Actor {
		static createDialog = original;
	};
	globalThis.game = {
		user: { isGM: false },
		settings: {
			get: (namespace, key) => (namespace === "core" && key === "permissions" ? permissions : undefined),
			set: vi.fn(async (_namespace, _key, value) => { permissions = value; })
		}
	};
});

afterEach(() => {
	for (const key of ["CONST", "foundry", "Actor", "game"]) delete globalThis[key];
	delete globalThis.Array.fromRange;
});

describe("rolesWith", () => {
	it("reads an unset permission as core's default, from its default role up", () => {
		expect(rolesWith({}, "ACTOR_CREATE")).toEqual([ROLES.ASSISTANT, ROLES.GAMEMASTER]);
	});

	it("reads a set permission as it stands", () => {
		expect(rolesWith({ ACTOR_CREATE: [ROLES.GAMEMASTER] }, "ACTOR_CREATE")).toEqual([ROLES.GAMEMASTER]);
	});
});

describe("grantPlayerActorCreate", () => {
	it("adds Players and Trusted Players to core's default", async () => {
		await grantPlayerActorCreate();
		expect(permissions.ACTOR_CREATE).toEqual([1, 2, 3, 4]);
	});

	it("keeps the roles a GM already chose, and the other permissions", async () => {
		permissions = { ACTOR_CREATE: [ROLES.GAMEMASTER], FILES_BROWSE: [2, 3, 4] };
		await grantPlayerActorCreate();
		expect(permissions).toEqual({ ACTOR_CREATE: [1, 2, 4], FILES_BROWSE: [2, 3, 4] });
	});

	it("leaves a world whose players have it alone", async () => {
		permissions = { ACTOR_CREATE: [1, 2, 3, 4] };
		await grantPlayerActorCreate();
		expect(game.settings.set).not.toHaveBeenCalled();
	});
});

describe("registerPlayerKnightDialog", () => {
	it("offers a player a Knight only", async () => {
		registerPlayerKnightDialog();
		await Actor.createDialog({ folder: null }, {}, { position: { width: 320 } });
		expect(original).toHaveBeenCalledWith({ folder: null }, {}, { position: { width: 320 }, types: ["knight"] });
	});

	it("offers a GM every type", async () => {
		game.user.isGM = true;
		registerPlayerKnightDialog();
		await Actor.createDialog({}, {}, {});
		expect(original).toHaveBeenCalledWith({}, {}, {});
	});

	it("keeps the types a caller asked for", async () => {
		registerPlayerKnightDialog();
		await Actor.createDialog({}, {}, { types: ["npc"] });
		expect(original).toHaveBeenCalledWith({}, {}, { types: ["npc"] });
	});
});
