import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerLedgerHooks } from "../../module/actions/ledger.js";
import { SYSTEM_ID } from "../../module/system-id.js";

/** Foundry's own, which keeps arrays whole. */
function flattenObject(object) {
	const flat = {};
	for (const [key, value] of Object.entries(object)) {
		if (value && typeof value === "object" && !Array.isArray(value)) {
			for (const [inner, leaf] of Object.entries(flattenObject(value))) flat[`${key}.${inner}`] = leaf;
		} else flat[key] = value;
	}
	return flat;
}

const LEDGER_PATH = `flags.${SYSTEM_ID}.ledger`;

/** Every hook registered, by name, so a test can call them as Foundry would. */
let hooks;
const call = (name, ...args) => hooks[name].forEach((fn) => fn(...args));

/** Let the Ledger's queued writes land. */
const settle = async () => {
	for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

const knightActor = (id = "k1") => {
	const actor = {
		id,
		uuid: `Actor.${id}`,
		type: "knight",
		documentName: "Actor",
		name: "Tristan",
		system: { glory: 0, virtues: { vig: { value: 12, max: 12 } }, guard: { value: 3, max: 3 }, fatigued: false },
		ledger: [],
		getFlag: (scope, key) => (scope === SYSTEM_ID && key === "ledger" ? actor.ledger : undefined),
		update: vi.fn(async (data) => {
			if (LEDGER_PATH in data) actor.ledger = data[LEDGER_PATH];
			return actor;
		})
	};
	return actor;
};

const item = (parent, id, name, system = {}) => ({ id, _id: id, name, type: "armour", parent, system: { equipped: false, armour: 1, ...system } });

/** The lines the Ledger holds, oldest first. */
const lines = (actor) => actor.ledger.map((entry) => entry.action).reverse();

beforeEach(() => {
	hooks = {};
	globalThis.Hooks = { on: (name, fn) => (hooks[name] ??= []).push(fn) };
	globalThis.game = {
		user: { id: "u1" },
		users: { get: (id) => ({ id, name: id }) },
		i18n: {
			localize: (key) => (key === "TYPES.Item.armour" ? "Armour" : key.replace("bastionland.", "")),
			format: (key, data) => `${key.replace("bastionland.", "")} ${Object.values(data).join("|")}`
		}
	};
	let next = 0;
	globalThis.foundry = {
		utils: {
			flattenObject,
			randomID: () => `id${next++}`,
			hasProperty: (object, path) => Object.hasOwn(object, path) || path.split(".").reduce((node, part) => node?.[part], object) !== undefined
		},
		applications: { instances: new Map() }
	};
	globalThis.fromUuidSync = () => null;
	registerLedgerHooks();
});

afterEach(() => {
	for (const name of ["Hooks", "game", "foundry", "fromUuidSync"]) delete globalThis[name];
});

describe("Ledger hooks", () => {
	it("writes each document's own lines when one update changes several, as Foundry shares the options across them", async () => {
		const knight = knightActor();
		const helm = item(knight, "helm", "Helm");
		const cap = item(knight, "cap", "Cap", { equipped: true });
		const [helmChange, capChange] = [{ system: { equipped: true } }, { system: { equipped: false } }];
		const options = {};
		call("preUpdateItem", helm, helmChange, options);
		call("preUpdateItem", cap, capChange, options);
		call("updateItem", helm, helmChange, options, "u1");
		call("updateItem", cap, capChange, options, "u1");
		await settle();
		expect(lines(knight)).toEqual(["ledger.phrases.equipped Helm", "ledger.phrases.unequipped Cap"]);
	});

	it("doesn't give a document with nothing to say the lines of another in its batch", async () => {
		const knight = knightActor();
		const helm = item(knight, "helm", "Helm");
		const cap = item(knight, "cap", "Cap", { equipped: true });
		const options = {};
		call("preUpdateItem", helm, { system: { equipped: true } }, options);
		call("preUpdateItem", cap, { system: { equipped: true } }, options);
		call("updateItem", helm, {}, options, "u1");
		call("updateItem", cap, {}, options, "u1");
		await settle();
		expect(lines(knight)).toEqual(["ledger.phrases.equipped Helm"]);
	});

	it("keeps two Knights' lines apart when they're updated together", async () => {
		const [tristan, isolde] = [knightActor("k1"), knightActor("k2")];
		const options = {};
		call("preUpdateActor", tristan, { system: { fatigued: true } }, options);
		call("preUpdateActor", isolde, { system: { glory: 1 } }, options);
		call("updateActor", tristan, {}, options, "u1");
		call("updateActor", isolde, {}, options, "u1");
		await settle();
		expect(lines(tristan)).toEqual(["ledger.phrases.marked conditions.fatigued.label"]);
		expect(lines(isolde)).toEqual(["ledger.phrases.changed glory.label|0|1"]);
	});

	it("doesn't write a stale line again when the same options are passed to a later update with nothing to say", async () => {
		const knight = knightActor();
		const options = {};
		call("preUpdateActor", knight, { system: { fatigued: true } }, options);
		call("updateActor", knight, {}, options, "u1");
		knight.system.fatigued = true;
		call("preUpdateActor", knight, { system: { fatigued: true } }, options);
		call("updateActor", knight, {}, options, "u1");
		await settle();
		expect(lines(knight)).toEqual(["ledger.phrases.marked conditions.fatigued.label"]);
	});

	it("is written by the one who made the change, not by everyone who hears of it", async () => {
		const knight = knightActor();
		const options = {};
		call("preUpdateActor", knight, { system: { fatigued: true } }, options);
		call("updateActor", knight, {}, options, "someone-else");
		await settle();
		expect(knight.update).not.toHaveBeenCalled();
	});

	it("gathers things given together into one line, and skips the Ledger's own writes", async () => {
		const knight = knightActor();
		const options = {};
		call("createItem", item(knight, "a", "Helm"), options, "u1");
		call("createItem", item(knight, "b", "Cap"), options, "u1");
		await settle();
		expect(lines(knight)).toEqual(["ledger.phrases.added Armour|Helm, Cap"]);
		const writes = knight.update.mock.calls.length;
		call("preUpdateActor", knight, { [LEDGER_PATH]: [] }, { bastionlandLedger: true });
		call("updateActor", knight, { flags: {} }, { bastionlandLedger: true }, "u1");
		await settle();
		expect(knight.update).toHaveBeenCalledTimes(writes);
	});
});
