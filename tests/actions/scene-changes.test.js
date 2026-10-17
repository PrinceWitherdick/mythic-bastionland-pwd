import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changedHexKeys, realmSceneChanges } from "../../module/actions/scene-changes.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const flags = (system) => ({ flags: { [SYSTEM_ID]: system } });

class ForcedDeletion {}
class ForcedReplacement {
	static create(value) {
		return Object.assign(new ForcedReplacement(), value);
	}
}

beforeEach(() => {
	globalThis.foundry = { data: { operators: { ForcedDeletion, ForcedReplacement } } };
});

afterEach(() => {
	delete globalThis.foundry;
});

describe("realmSceneChanges", () => {
	it("reads only per-hex flags as leaving the Realm as it was", () => {
		const { realm, hexFlags } = realmSceneChanges(flags({ journey: { version: 1, next: 4, hexes: { "2,3": {} } }, hexLore: { hexes: { "-=1,1": null } } }));
		expect(realm).toBe(false);
		expect([...hexFlags].sort()).toEqual(["hexLore", "journey"]);
	});

	it("reads a flag taken out whole by its own name", () => {
		expect(realmSceneChanges(flags({ "-=sighted": null })).hexFlags).toEqual(new Set(["sighted"]));
	});

	it("reads the Realm's own flags, and flags it doesn't know, as the Realm changing", () => {
		expect(realmSceneChanges(flags({ realm: { seed: 2 } })).realm).toBe(true);
		expect(realmSceneChanges(flags({ drawing: true, journey: { hexes: {} } }))).toMatchObject({ realm: true });
		expect(realmSceneChanges(flags({ somethingNew: 1 })).realm).toBe(true);
	});

	it("reads the system's flags deleted whole as the Realm changing", () => {
		expect(realmSceneChanges({ flags: { [`-=${SYSTEM_ID}`]: null } })).toMatchObject({ realm: true, system: true });
	});

	it("reads the system's flags deleted or replaced whole with v14's operators as the Realm changing", () => {
		expect(realmSceneChanges({ flags: { [SYSTEM_ID]: new ForcedDeletion() } })).toMatchObject({ realm: true, system: true });
		expect(realmSceneChanges({ flags: { [SYSTEM_ID]: ForcedReplacement.create({ journey: {} }) } })).toMatchObject({ realm: true, system: true });
		expect(realmSceneChanges({ flags: new ForcedDeletion() })).toMatchObject({ realm: true, system: true });
	});

	it("reads a per-hex flag deleted or replaced whole by its own name", () => {
		expect(realmSceneChanges(flags({ sighted: new ForcedDeletion() }))).toMatchObject({ realm: false, hexFlags: new Set(["sighted"]) });
		expect(realmSceneChanges(flags({ "==journey": {} }))).toMatchObject({ realm: false, hexFlags: new Set(["journey"]) });
	});

	it("reads each update once, however many hooks ask", () => {
		const changes = flags({ journey: { hexes: {} } });
		expect(realmSceneChanges(changes)).toBe(realmSceneChanges(changes));
	});

	it("says whether any of the system's flags were written", () => {
		expect(realmSceneChanges(flags({ journey: { hexes: {} } })).system).toBe(true);
		expect(realmSceneChanges({ name: "Elsewhere" }).system).toBe(false);
	});

	it("passes over the weather, the lighting and the thumbnail", () => {
		const { realm, system, hexFlags } = realmSceneChanges({ thumb: "x.webp", environment: { darknessLevel: 0.5 }, flags: { fxmaster: { effects: {} } } });
		expect(realm).toBe(false);
		expect(system).toBe(false);
		expect(hexFlags.size).toBe(0);
	});

	it("reads the grid, the size, the name or a field it doesn't know as the Realm changing", () => {
		for (const field of ["grid", "width", "name", "background", "somethingNew"]) {
			expect(realmSceneChanges({ [field]: {} }).realm).toBe(true);
		}
	});
});

describe("changedHexKeys", () => {
	it("names the hexes written or taken out, past the version and the Journey's next number", () => {
		expect(changedHexKeys(flags({ journey: { version: 1, next: 2, hexes: { "2,3": {}, "-=4,5": null } } }), "journey")).toEqual(["2,3", "4,5"]);
	});

	it("names the hexes of a flag kept by hex with no record around them", () => {
		expect(changedHexKeys(flags({ sighted: { "1,2": { note: "smoke" }, "-=3,4": null } }), "sighted")).toEqual(["1,2", "3,4"]);
	});

	it("names a hex record replaced whole, as v13 keeps the prefix and v14 the operator", () => {
		expect(changedHexKeys(flags({ hexLore: { hexes: { "==3,4": { notes: "x" } } } }), "hexLore")).toEqual(["3,4"]);
		expect(changedHexKeys(flags({ hexLore: { hexes: { "3,4": ForcedReplacement.create({ notes: "x" }), "5,6": new ForcedDeletion() } } }), "hexLore")).toEqual(["3,4", "5,6"]);
	});

	it("names none when the flag wasn't written", () => {
		expect(changedHexKeys(flags({ hexLore: { hexes: {} } }), "journey")).toEqual([]);
	});

	it("can't tell when the flag was written whole or taken out", () => {
		expect(changedHexKeys(flags({ "-=journey": null }), "journey")).toBeNull();
		expect(changedHexKeys(flags({ journey: { hexes: null } }), "journey")).toBeNull();
		expect(changedHexKeys(flags({ journey: { other: 1 } }), "journey")).toBeNull();
		expect(changedHexKeys(flags({ journey: new ForcedDeletion() }), "journey")).toBeNull();
		expect(changedHexKeys(flags({ journey: ForcedReplacement.create({ hexes: { "1,1": {} } }) }), "journey")).toBeNull();
		expect(changedHexKeys(flags({ "==journey": { hexes: { "1,1": {} } } }), "journey")).toBeNull();
		expect(changedHexKeys(flags({ journey: { hexes: new ForcedDeletion() } }), "journey")).toBeNull();
		expect(changedHexKeys({ flags: { [SYSTEM_ID]: new ForcedDeletion() } }, "journey")).toBeNull();
	});
});
