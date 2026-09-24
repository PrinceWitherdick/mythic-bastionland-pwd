import { afterEach, describe, expect, it } from "vitest";
import { recallAttack, rememberAttack, rememberedChoice, wieldedWith } from "../../module/actions/attack-memory.js";
import { SYSTEM_ID } from "../../module/system-id.js";

/** A world whose client settings live in a plain object. */
function installWorld(stored = {}) {
	const settings = { [`${SYSTEM_ID}.attackChoices`]: stored };
	globalThis.game = {
		world: { id: "mythic" },
		settings: {
			get: (scope, key) => settings[`${scope}.${key}`],
			set: (scope, key, value) => {
				settings[`${scope}.${key}`] = value;
				return Promise.resolve(value);
			}
		}
	};
	return settings;
}

afterEach(() => {
	delete globalThis.game;
});

describe("rememberedChoice", () => {
	it("keeps the weapons, specialist dice and situation, and nothing declared for one blow", () => {
		expect(rememberedChoice({
			source: { sword: true, shield: false },
			specialist: { sword: true },
			engaged: true,
			mounted: false,
			bonus: "d8",
			smite: "d12",
			impaired: true,
			moved: true,
			duel: true,
			leader: "Actor.abc"
		})).toEqual({
			source: { sword: true, shield: false },
			specialist: { sword: true },
			engaged: true,
			confined: false,
			mounted: false,
			charge: false,
			againstIndividuals: false
		});
	});
});

describe("wieldedWith", () => {
	const remembered = rememberedChoice({ source: { sword: true, shield: false } });

	it("ticks what was last rolled with rather than the hardest-hitting set", () => {
		expect(wieldedWith(remembered, ["sword", "shield"], [1])).toEqual([0]);
	});

	it("falls back for a weapon taken up since", () => {
		expect(wieldedWith(remembered, ["sword", "shield", "lance"], [2])).toEqual([0, 2]);
	});

	it("ticks the hardest-hitting set for an actor with nothing remembered", () => {
		expect(wieldedWith(null, ["sword", "shield"], [0, 1])).toEqual([0, 1]);
	});
});

describe("rememberAttack", () => {
	it("keeps each actor's choices apart, under the world they were rolled in", async () => {
		const settings = installWorld();
		await rememberAttack({ uuid: "Actor.one" }, { source: { sword: true }, mounted: true });
		await rememberAttack({ uuid: "Actor.two" }, { source: { bow: true } });

		expect(recallAttack({ uuid: "Actor.one" })).toMatchObject({ source: { sword: true }, mounted: true });
		expect(recallAttack({ uuid: "Actor.two" })).toMatchObject({ source: { bow: true }, mounted: false });
		expect(Object.keys(settings[`${SYSTEM_ID}.attackChoices`])).toEqual(["mythic"]);
	});

	it("forgets the actor rolled for longest ago once fifty are held", async () => {
		installWorld();
		for (let index = 0; index < 52; index += 1) await rememberAttack({ uuid: `Actor.${index}` }, {});
		// The first one is rolled for again, so it's the second that goes.
		await rememberAttack({ uuid: "Actor.0" }, {});

		expect(recallAttack({ uuid: "Actor.0" })).not.toBeNull();
		expect(recallAttack({ uuid: "Actor.1" })).toBeNull();
		expect(recallAttack({ uuid: "Actor.51" })).not.toBeNull();
	});

	it("leaves another world's choices alone", async () => {
		const settings = installWorld({ other: { "Actor.one": rememberedChoice({ engaged: true }) } });
		await rememberAttack({ uuid: "Actor.one" }, {});

		expect(settings[`${SYSTEM_ID}.attackChoices`].other["Actor.one"].engaged).toBe(true);
		expect(recallAttack({ uuid: "Actor.one" }).engaged).toBe(false);
	});
});

describe("recallAttack", () => {
	it("has nothing for an actor not attacked with, or before the setting is registered", () => {
		installWorld();
		expect(recallAttack({ uuid: "Actor.one" })).toBeNull();
		expect(recallAttack(null)).toBeNull();

		globalThis.game.settings.get = () => {
			throw new Error("not registered");
		};
		expect(recallAttack({ uuid: "Actor.one" })).toBeNull();
	});
});
