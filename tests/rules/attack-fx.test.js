import { describe, expect, it } from "vitest";
import {
	FX_KINDS,
	MAX_BLOWS,
	REACTION_SOUNDS,
	SOUND_FILES,
	attackBlows,
	blowDelivery,
	blowKind,
	blowSounds,
	damageReaction,
	fxFile,
	fxFilesFor,
	kindInName,
	onTargetSize,
	swingSize
} from "../../module/rules/attack-fx.js";

/** Every JB2A key this world could ask for, as a world holding all of them would answer. */
const everyKey = Object.values(FX_KINDS).flatMap((kind) => Object.values(kind).flat());

describe("kindInName", () => {
	it("knows every weapon in Arms & Goods (p12) and the siege engines (p11)", () => {
		const weapons = {
			Dagger: "dagger", Club: "club", Staff: "staff", Sling: "sling", Hatchet: "handaxe", Spear: "spear",
			Shortbow: "bow", Shortsword: "shortsword", Pitchfork: "polearm", Pick: "hammer", Mace: "mace",
			Handaxe: "handaxe", Axe: "axe", "Logging Axe": "axe", Poleaxe: "polearm", Billhook: "polearm",
			Javelin: "javelin", Lance: "spear", Greataxe: "greataxe", Maul: "maul", Longbow: "bow",
			Longsword: "sword", Greatsword: "greatsword", Curvebow: "bow", Crossbow: "crossbow",
			"Battering Ram": "ram", "Stone Thrower": "boulder", "Bolt Launcher": "crossbow", Trebuchet: "boulder"
		};
		for (const [name, kind] of Object.entries(weapons)) expect([name, kindInName(name)]).toEqual([name, kind]);
	});

	it("knows a beast's own attacks, so the jaws are drawn as jaws", () => {
		const attacks = { Bite: "bite", Jaws: "bite", Fangs: "bite", Claws: "claw", Talons: "claw", Trample: "trample", Hooves: "trample", Horns: "fist", Fists: "fist" };
		for (const [name, kind] of Object.entries(attacks)) expect([name, kindInName(name)]).toEqual([name, kind]);
	});

	it("reads the longer name first, so a Shortsword is no Sword and a Poleaxe no Axe", () => {
		expect(kindInName("Shortsword")).toBe("shortsword");
		expect(kindInName("Greatsword")).toBe("greatsword");
		expect(kindInName("Poleaxe")).toBe("polearm");
		expect(kindInName("Crossbow")).toBe("crossbow");
		expect(kindInName("Handaxe")).toBe("handaxe");
	});

	it("swings a shield too, since a shield carries an Attack die of its own", () => {
		expect(kindInName("Shield")).toBe("shield");
	});

	it("says nothing of a name it doesn't know, and of no name at all", () => {
		expect(kindInName("Fell Wind")).toBeNull();
		expect(kindInName("  ")).toBeNull();
		expect(kindInName(undefined)).toBeNull();
	});
});

describe("blowKind", () => {
	it("takes the first name it recognises, and passes over one it doesn't", () => {
		expect(blowKind({ names: ["Longsword"] })).toBe("sword");
		expect(blowKind({ names: ["Fell Wind", "Longsword"] })).toBe("sword");
	});

	it("is a bare-handed blow when nothing was wielded at all", () => {
		expect(blowKind({ names: [] })).toBe("fist");
		expect(blowKind({})).toBe("fist");
	});

	it("is an arrow when an unknown weapon struck at a distance, a slash when it struck up close", () => {
		expect(blowKind({ names: ["Hand Cannon"], ranged: true })).toBe("bow");
		expect(blowKind({ names: ["Hand Cannon"] })).toBe("slash");
	});
});

describe("blowDelivery", () => {
	it("flies what flies, swings what swings, and plays a beast's own on the one bitten", () => {
		expect(blowDelivery("bow")).toBe("projectile");
		expect(blowDelivery("crossbow")).toBe("projectile");
		expect(blowDelivery("boulder")).toBe("projectile");
		expect(blowDelivery("javelin")).toBe("throw");
		expect(blowDelivery("sword")).toBe("swing");
		expect(blowDelivery("bite")).toBe("onTarget");
		expect(blowDelivery("trample")).toBe("onTarget");
	});

	it("throws a weapon that could be thrown only when the Attack was made at a distance (p10)", () => {
		expect(blowDelivery("spear")).toBe("swing");
		expect(blowDelivery("spear", { ranged: true })).toBe("throw");
		expect(blowDelivery("dagger", { ranged: true })).toBe("throw");
		// A Maul has nothing to throw, so a ranged Attack with one still swings.
		expect(blowDelivery("maul", { ranged: true })).toBe("swing");
	});
});

describe("attackBlows", () => {
	const kinds = (weapons, options) => attackBlows(weapons, options).map((blow) => blow.kind);

	it("strikes with the biggest Attack die first, down to the shield on the arm", () => {
		expect(kinds([
			{ name: "Shield", damage: "d4" },
			{ name: "Longsword", damage: "d8" },
			{ name: "Hatchet", damage: "d6" }
		])).toEqual(["sword", "handaxe", "shield"]);
	});

	it("puts the weapon rolling more dice first when the biggest die is the same", () => {
		expect(kinds([
			{ name: "Dagger", damage: "d6" },
			{ name: "Mace", damage: "d6+d6" }
		])).toEqual(["mace", "dagger"]);
	});

	it("keeps the order they were listed in between two alike", () => {
		expect(attackBlows([
			{ name: "Longsword", damage: "d8" },
			{ name: "Spear", damage: "d8" }
		]).map((blow) => blow.name)).toEqual(["Longsword", "Spear"]);
	});

	it("draws a weapon that strikes at a distance as one, whatever else was wielded", () => {
		expect(attackBlows([
			{ name: "Shortbow", damage: "d6", ranged: true },
			{ name: "Dagger", damage: "d6", ranged: false }
		])).toEqual([
			{ kind: "bow", delivery: "projectile", name: "Shortbow" },
			{ kind: "dagger", delivery: "swing", name: "Dagger" }
		]);
	});

	it("strikes one blow for an Impaired Attack, which rolls one d4 however it is armed (p9)", () => {
		expect(kinds([{ name: "Hatchet", damage: "d6" }, { name: "Longsword", damage: "d8" }], { impaired: true })).toEqual(["sword"]);
	});

	it("stops at a handful of blows, so a stat block's list is no flurry nobody can follow", () => {
		const weapons = Array.from({ length: MAX_BLOWS + 3 }, () => ({ name: "Longsword", damage: "d8" }));
		expect(attackBlows(weapons)).toHaveLength(MAX_BLOWS);
	});

	it("is one bare-handed blow when nothing was wielded at all", () => {
		expect(attackBlows([])).toEqual([{ kind: "fist", delivery: "swing", name: "" }]);
		expect(attackBlows()).toHaveLength(1);
	});
});

describe("fxFilesFor", () => {
	it("offers the kind's own keys first and the delivery's fallback last", () => {
		const swing = fxFilesFor("sword", "swing");
		expect(swing[0]).toBe("jb2a.sword.melee.01.white");
		expect(swing.at(-1)).toBe(FX_KINDS.slash.swing[0]);
		expect(fxFilesFor("bow", "projectile").at(-1)).toBe(FX_KINDS.bow.projectile[0]);
	});

	it("still offers the fallback for a kind that has nothing for this delivery", () => {
		expect(fxFilesFor("maul", "projectile")).toEqual([...FX_KINDS.bow.projectile]);
		expect(fxFilesFor("sword", "landing")).toEqual([]);
	});

	it("names every key under jb2a., which is how Sequencer's database spells them", () => {
		for (const key of everyKey) expect(key.startsWith("jb2a.")).toBe(true);
	});
});

describe("fxFile", () => {
	it("takes the best key this world actually holds", () => {
		const free = (key) => !key.includes("slingshot");
		expect(fxFile(fxFilesFor("sling", "projectile"), () => true)).toBe("jb2a.slingshot");
		expect(fxFile(fxFilesFor("sling", "projectile"), free)).toBe("jb2a.bullet.01.orange");
		expect(fxFile(fxFilesFor("sling", "projectile"), () => false)).toBeNull();
		expect(fxFile(undefined, () => true)).toBeNull();
	});
});

describe("sizes", () => {
	it("draws a swing five squares wide, and wider for a larger attacker", () => {
		expect(swingSize(1)).toBe(5);
		expect(swingSize(2)).toBe(10);
		expect(swingSize(0)).toBe(5);
		expect(swingSize(undefined)).toBe(5);
	});

	it("draws a bite half again the larger side of whoever was bitten", () => {
		expect(onTargetSize(1, 1)).toBe(1.5);
		expect(onTargetSize(1, 3)).toBe(4.5);
		expect(onTargetSize(0, 0)).toBe(1.5);
	});
});

describe("blowSounds", () => {
	it("names files the SoundFx Library holds, never a wildcard", () => {
		for (const [key, files] of Object.entries(SOUND_FILES)) {
			expect([key, files.length > 0]).toEqual([key, true]);
			for (const file of files) {
				expect(file.startsWith("modules/soundfxlibrary/")).toBe(true);
				expect(file).not.toContain("*");
			}
		}
	});

	it("looses an arrow, then lands it as it arrives", () => {
		expect(blowSounds("bow", "projectile")).toEqual([
			{ sound: "flyBy", at: 0 },
			{ sound: "arrowImpact", at: "land" }
		]);
	});

	it("whooshes a stone away and thuds it down", () => {
		expect(blowSounds("boulder", "projectile")).toEqual([
			{ sound: "whoosh", at: 0 },
			{ sound: "throwHit", at: "land" }
		]);
	});

	it("growls before a beast's jaws close, and connects after a swing", () => {
		expect(blowSounds("bite", "onTarget")).toEqual([
			{ sound: "growl", at: 0 },
			{ sound: "meleeHit", at: 350 }
		]);
		expect(blowSounds("sword", "swing")).toEqual([{ sound: "meleeHit", at: 550 }]);
	});

	it("opens with the gallop of a charge and the cry of a Warband, before the blow itself", () => {
		expect(blowSounds("spear", "swing", { mounted: true })).toEqual([
			{ sound: "gallop", at: 0 },
			{ sound: "meleeHit", at: 550 }
		]);
		expect(blowSounds("sword", "swing", { warband: true, mounted: true })).toEqual([
			{ sound: "battleCry", at: 0 },
			{ sound: "gallop", at: 0 },
			{ sound: "meleeHit", at: 550 }
		]);
	});

	it("gives every cue a sound the system holds", () => {
		const deliveries = ["swing", "throw", "projectile", "onTarget"];
		for (const kind of Object.keys(FX_KINDS)) {
			for (const delivery of deliveries) {
				for (const { sound } of blowSounds(kind, delivery, { mounted: true, warband: true })) {
					expect([kind, delivery, sound in SOUND_FILES]).toEqual([kind, delivery, true]);
				}
			}
		}
	});
});

describe("damageReaction", () => {
	it("bursts on GD lost, bleeds on VIG lost, clanks where the Armour held (p8)", () => {
		expect(damageReaction("evaded")).toBe("burst");
		expect(damageReaction("scar")).toBe("burst");
		expect(damageReaction("wounded")).toBe("blood");
		expect(damageReaction("mortal")).toBe("blood");
		expect(damageReaction("slain")).toBe("blood");
		expect(damageReaction("none")).toBe("clank");
	});

	it("wrecks a structure at 0GD (p11), which bleeds nothing", () => {
		expect(damageReaction("destroyed")).toBe("wreck");
	});

	it("does nothing for an Attack that couldn't harm them at all", () => {
		expect(damageReaction("unharmed")).toBeNull();
		expect(damageReaction("")).toBeNull();
		expect(damageReaction(undefined)).toBeNull();
	});

	it("gives every reaction a sound, and everything seen a picture", () => {
		for (const [reaction, sound] of Object.entries(REACTION_SOUNDS)) {
			expect([reaction, sound in SOUND_FILES]).toEqual([reaction, true]);
		}
		for (const reaction of ["burst", "blood", "wreck"]) {
			expect([reaction, fxFilesFor(reaction, "onTarget").length > 0]).toEqual([reaction, true]);
		}
	});
});
