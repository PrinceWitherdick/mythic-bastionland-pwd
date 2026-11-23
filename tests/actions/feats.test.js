import { beforeEach, describe, expect, it } from "vitest";
import { denyStanding, duelDenier } from "../../module/actions/feats.js";

/** Somebody who knows Deny, standing as the test says. */
const knight = (uuid, { fatigued = false, knows = true } = {}) => ({
	uuid,
	name: uuid,
	system: { virtues: { vig: {}, cla: {}, spi: {} }, fatigued, knowsFeat: () => knows }
});

/** A foe's blow at Ser Kay's Token. */
const attackAt = (extra = {}) => ({
	attacker: "Actor.foe",
	targets: [{ uuid: "Scene.s.Token.k" }],
	dice: [{ faces: 8, result: 6, deniedBy: null }],
	gambits: [],
	feats: [],
	appliedTo: [],
	...extra
});

const kay = knight("Actor.k");
const ally = knight("Actor.ally");

beforeEach(() => {
	const tokens = { "Scene.s.Token.k": { actor: kay } };
	globalThis.fromUuidSync = (uuid) => tokens[uuid] ?? null;
});

describe("duelDenier", () => {
	it("lets anybody Deny outside a duel, and only the duellist struck within one (p10)", () => {
		expect(duelDenier(attackAt(), ally)).toBe(true);
		expect(duelDenier(attackAt({ duel: "duel-1" }), kay)).toBe(true);
		expect(duelDenier(attackAt({ duel: "duel-1" }), ally)).toBe(false);
	});
});

describe("denyStanding", () => {
	it("lets somebody who knows the Feat Deny, wherever they stand when nobody asks", () => {
		expect(denyStanding(attackAt(), ally)).toBeNull();
	});

	it("refuses somebody the Feat or the Attack doesn't allow", () => {
		expect(denyStanding(attackAt(), knight("Actor.tired", { fatigued: true }))).toBe("attack.cantDeny");
		expect(denyStanding(attackAt(), knight("Actor.dunce", { knows: false }))).toBe("attack.cantDeny");
		expect(denyStanding(attackAt({ feats: [{ key: "deny", actor: "Actor.ally" }] }), ally)).toBe("attack.cantDeny");
	});

	it("refuses anybody but the duellist struck in a duel", () => {
		expect(denyStanding(attackAt({ duel: "duel-1" }), ally)).toBe("attack.cantDeny");
		expect(denyStanding(attackAt({ duel: "duel-1" }), kay)).toBeNull();
	});

	it("says who is out of reach, asking only of those otherwise let", () => {
		const asked = [];
		const inReach = (actor) => asked.push(actor.uuid) && actor === kay;
		expect(denyStanding(attackAt(), ally, { inReach })).toBe("attack.denyOutOfReach");
		expect(denyStanding(attackAt(), kay, { inReach })).toBeNull();
		expect(denyStanding(attackAt({ duel: "duel-1" }), ally, { inReach })).toBe("attack.cantDeny");
		expect(asked).toEqual(["Actor.ally", "Actor.k"]);
	});

	it("weighs only the duel when the Feat is left to the card", () => {
		const tired = knight("Actor.tired", { fatigued: true });
		expect(denyStanding(attackAt(), tired, { feat: false })).toBeNull();
		expect(denyStanding(attackAt({ duel: "duel-1" }), tired, { feat: false })).toBe("attack.cantDeny");
	});
});
