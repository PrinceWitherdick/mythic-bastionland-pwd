import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerSteedNames } from "../../module/actions/steeds.js";
import { BREED_FLAG } from "../../module/rules/steeds.js";
import { SYSTEM_ID } from "../../module/system-id.js";

/** A steed as far as the rename looks at one: what the book called it, and the line under its name. */
function fakeSteed(name, { breed, epithet = "" } = {}) {
	return {
		name,
		system: { epithet },
		getFlag: (scope, key) => (scope === SYSTEM_ID && key === BREED_FLAG ? breed : undefined)
	};
}

let hooks;
beforeEach(() => {
	hooks = {};
	globalThis.Hooks = { on: (name, fn) => (hooks[name] = fn) };
	globalThis.foundry = {
		utils: {
			hasProperty: (object, key) => key.split(".").reduce((node, part) => node?.[part], object) !== undefined,
			setProperty: (object, key, value) => {
				const parts = key.split(".");
				const last = parts.pop();
				parts.reduce((node, part) => (node[part] ??= {}), object)[last] = value;
			}
		}
	};
	registerSteedNames();
});

afterEach(() => {
	for (const name of ["Hooks", "foundry"]) delete globalThis[name];
});

describe("a steed given a name of its own", () => {
	it("keeps what the book called it under the new name", () => {
		const changes = { name: "Bucephalus" };
		hooks.preUpdateActor(fakeSteed("Charger", { breed: "Charger" }), changes);
		expect(changes).toEqual({ name: "Bucephalus", system: { epithet: "Charger" } });
	});

	it("says nothing under a name that says what it is already", () => {
		const changes = { name: "Bardolf's charger" };
		hooks.preUpdateActor(fakeSteed("Charger", { breed: "Charger" }), changes);
		expect(changes).toEqual({ name: "Bardolf's charger" });
	});

	it("leaves a line of its own alone, and one being written in the same breath", () => {
		const kept = { name: "Bucephalus" };
		hooks.preUpdateActor(fakeSteed("Charger", { breed: "Charger", epithet: "Bought in Deep Country" }), kept);
		expect(kept).toEqual({ name: "Bucephalus" });

		const written = { name: "Bucephalus", system: { epithet: "A gift" } };
		hooks.preUpdateActor(fakeSteed("Charger", { breed: "Charger" }), written);
		expect(written.system.epithet).toBe("A gift");
	});

	it("leaves alone an NPC the book never named, and one renamed with no name in the change", () => {
		const nameless = { name: "Bandit chief" };
		hooks.preUpdateActor(fakeSteed("Bandit", {}), nameless);
		expect(nameless).toEqual({ name: "Bandit chief" });

		const damage = { system: { virtues: { vig: { value: 3 } } } };
		hooks.preUpdateActor(fakeSteed("Charger", { breed: "Charger" }), damage);
		expect(damage).toEqual({ system: { virtues: { vig: { value: 3 } } } });
	});

	it("leaves alone an actor with no line under its name", () => {
		const changes = { name: "Bucephalus" };
		const domain = { name: "Charger", system: {}, getFlag: () => "Charger" };
		hooks.preUpdateActor(domain, changes);
		expect(changes).toEqual({ name: "Bucephalus" });
	});
});
