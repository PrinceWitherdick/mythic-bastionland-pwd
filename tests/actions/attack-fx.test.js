import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BLOW_STAGGER_MS, LAND_WITHOUT_ANIMATION_MS, MAX_BLOWS } from "../../module/rules/attack-fx.js";
import { SYSTEM_ID } from "../../module/system-id.js";
import {
	MAX_ANIMATED_TARGETS,
	hideAttackFxForReducedMotion,
	playBlowFx,
	playDamageFx,
	playDismountFx,
	registerAttackFx
} from "../../module/actions/attack-fx.js";

/** Everything a Sequence was asked to draw, and the sounds pushed to the table. */
let effects;
let sounds;
let played;
let settings;
let broken;

/**
 * One chainable effect. Every call made on it is written down under its own
 * name, whatever Sequencer's builder is asked for, so the test can read back
 * what the blow was drawn as without a Sequencer to ask.
 */
function fakeEffect() {
	const record = {};
	const effect = new Proxy({}, {
		get: (_target, name) => (...args) => {
			record[String(name)] = args;
			return effect;
		}
	});
	effects.push(record);
	return effect;
}

/** The file an effect was given, and who it was kept to. */
const fileOf = (effect) => effect.file?.[0] ?? null;
const usersOf = (effect) => effect.forUsers?.[0] ?? null;

class FakeSequence {
	constructor(options) {
		this.options = options;
		if (broken) throw new Error("no sequencer here");
	}

	effect() {
		return fakeEffect();
	}

	wait(ms) {
		this.waited = ms;
		return this;
	}

	thenDo(work) {
		work();
		return this;
	}

	async play() {
		played.push(this);
	}
}

/** Stock weapons, as the Attack hands them over. */
const sword = { name: "Longsword", damage: "d8" };
const bow = { name: "Longbow", damage: "d8", ranged: true };

/** A Token on the Scene this client is looking at. */
const token = (uuid, { hidden = false, width = 1, height = 1 } = {}) => ({
	uuid,
	documentName: "Token",
	hidden,
	width,
	height,
	parent: { id: "scene" }
});

const tokens = {};

/** Which modules this world has on, by id. */
function useModules(...ids) {
	const on = new Set(ids);
	game.modules = { get: (id) => ({ active: on.has(id) }) };
}

const EVERY_MODULE = ["sequencer", "JB2A_DnD5e", "soundfxlibrary"];

beforeEach(() => {
	effects = [];
	sounds = [];
	played = [];
	broken = false;
	settings = { attackFx: true, reduceMotion: false };
	for (const key of Object.keys(tokens)) delete tokens[key];

	vi.useFakeTimers();
	globalThis.Hooks = { on: vi.fn() };
	globalThis.game = {
		user: { id: "user-1", isGM: false },
		users: { filter: (test) => [{ id: "gm-1", isGM: true }, { id: "user-1", isGM: false }].filter(test) },
		settings: {
			register: vi.fn(),
			get: (scope, key) => {
				if (scope === "core") return settings.messageMode ?? "public";
				if (!(key in settings)) throw new Error(`no setting ${key}`);
				return settings[key];
			}
		}
	};
	useModules(...EVERY_MODULE);
	globalThis.canvas = { ready: true, scene: { id: "scene" } };
	globalThis.fromUuidSync = (uuid) => tokens[uuid] ?? null;
	globalThis.Sequence = FakeSequence;
	globalThis.Sequencer = { Database: { flattenedEntries: [] } };
	globalThis.foundry = {
		audio: {
			AudioHelper: {
				play: (data, push) => {
					sounds.push({ src: data.src, push });
					return Promise.resolve();
				}
			}
		}
	};
	globalThis.document = { documentElement: { classList: { toggle: vi.fn() }, style: { setProperty: vi.fn() } } };
});

afterEach(() => {
	vi.useRealTimers();
	for (const key of ["Hooks", "game", "canvas", "fromUuidSync", "Sequence", "Sequencer", "foundry", "document"]) delete globalThis[key];
	vi.restoreAllMocks();
});

/** Let the fire-and-forget work run, and every cue's wait pass. */
async function settle(ms = LAND_WITHOUT_ANIMATION_MS + 100) {
	await vi.advanceTimersByTimeAsync(ms);
}

/** The sounds played, by file name alone. */
const heard = () => sounds.map(({ src }) => src.split("/").at(-1).replace(/-\d+\.mp3$/, ""));

describe("registerAttackFx", () => {
	it("registers the world's switch, on by default, and the reduced-motion hook", () => {
		registerAttackFx();
		const [scope, key, config] = game.settings.register.mock.calls[0];
		expect([scope, key]).toEqual([SYSTEM_ID, "attackFx"]);
		expect([config.scope, config.default, config.config]).toEqual(["world", true, true]);
		expect(Hooks.on).toHaveBeenCalledWith("createSequencerEffect", hideAttackFxForReducedMotion);
	});
});

describe("playBlowFx", () => {
	beforeEach(() => {
		tokens["Token.knight"] = token("Token.knight");
		tokens["Token.foe"] = token("Token.foe");
		globalThis.Sequencer.Database.flattenedEntries = ["jb2a.sword.melee.01.white", "jb2a.arrow.physical.white.01", "jb2a.bite.400px.red"];
	});

	it("swings the sword from the attacker at the foe, and connects", async () => {
		playBlowFx({ attacker: "Token.knight", weapons: [sword], targets: [{ uuid: "Token.foe" }] });
		await settle();

		expect(effects).toHaveLength(1);
		expect(fileOf(effects[0])).toBe("jb2a.sword.melee.01.white");
		expect(effects[0].rotateTowards).toBeDefined();
		expect(played).toHaveLength(1);
		expect(heard()).toEqual(["melee-hit"]);
	});

	it("looses an arrow, and lands it once the flight is over", async () => {
		playBlowFx({ attacker: "Token.knight", weapons: [bow], targets: [{ uuid: "Token.foe" }] });
		await settle();

		expect(fileOf(effects[0])).toBe("jb2a.arrow.physical.white.01");
		expect(effects[0].stretchTo).toBeDefined();
		expect(heard()).toEqual(["arrow-fly-by", "arrow-impact"]);
	});

	it("draws a beast's jaws on the one bitten, not a swing from its own square", async () => {
		playBlowFx({ attacker: "Token.knight", weapons: [{ name: "Bite", damage: "d8" }], targets: [{ uuid: "Token.foe" }] });
		await settle();

		expect(fileOf(effects[0])).toBe("jb2a.bite.400px.red");
		expect(effects[0].rotateTowards).toBeUndefined();
		expect(heard()).toEqual(["growl", "melee-hit"]);
	});

	it("strikes with each weapon in turn, the biggest die first, a moment apart", async () => {
		globalThis.Sequencer.Database.flattenedEntries.push("jb2a.handaxe.melee.standard.white", "jb2a.melee_attack.06.shield.01");
		playBlowFx({
			attacker: "Token.knight",
			weapons: [{ name: "Shield", damage: "d4" }, sword, { name: "Hatchet", damage: "d6" }],
			targets: [{ uuid: "Token.foe" }]
		});
		await settle();

		expect(effects.map(fileOf)).toEqual([
			"jb2a.sword.melee.01.white",
			"jb2a.handaxe.melee.standard.white",
			"jb2a.melee_attack.06.shield.01"
		]);
		// Each blow waits its own turn before it is drawn. The stub plays a sequence
		// at once, so the wait it was asked for is what says they land one after another.
		expect(played.map((sequence) => sequence.waited ?? 0)).toEqual([0, BLOW_STAGGER_MS, 2 * BLOW_STAGGER_MS]);
		expect(heard()).toEqual(["melee-hit", "melee-hit", "melee-hit"]);
	});

	it("opens the Attack once, so a charge gallops before the first blow alone", async () => {
		globalThis.Sequencer.Database.flattenedEntries.push("jb2a.handaxe.melee.standard.white");
		playBlowFx({
			attacker: "Token.knight",
			weapons: [sword, { name: "Hatchet", damage: "d6" }],
			mounted: true,
			targets: [{ uuid: "Token.foe" }]
		});
		await settle();

		expect(heard().filter((sound) => sound === "horse-galop")).toHaveLength(1);
		expect(heard().filter((sound) => sound === "melee-hit")).toHaveLength(2);
	});

	it("strikes one blow when the Attack is Impaired, however they are armed (p9)", async () => {
		playBlowFx({
			attacker: "Token.knight",
			weapons: [{ name: "Hatchet", damage: "d6" }, sword],
			impaired: true,
			targets: [{ uuid: "Token.foe" }]
		});
		await settle();

		expect(effects.map(fileOf)).toEqual(["jb2a.sword.melee.01.white"]);
	});

	it("draws no more than a handful of blows, whatever a stat block lists", async () => {
		const weapons = [];
		for (let index = 0; index < MAX_BLOWS + 3; index++) weapons.push({ name: "Longsword", damage: "d8" });
		playBlowFx({ attacker: "Token.knight", weapons, targets: [{ uuid: "Token.foe" }] });
		await settle();

		expect(effects).toHaveLength(MAX_BLOWS);
	});

	it("draws at most a handful of a Blast's targets, and is heard once", async () => {
		const targets = [];
		for (let index = 0; index < MAX_ANIMATED_TARGETS + 3; index++) {
			tokens[`Token.t${index}`] = token(`Token.t${index}`);
			targets.push({ uuid: `Token.t${index}` });
		}
		playBlowFx({ attacker: "Token.knight", weapons: [sword], targets });
		await settle();

		expect(effects).toHaveLength(MAX_ANIMATED_TARGETS);
		expect(heard()).toEqual(["melee-hit"]);
	});

	it("keeps a hidden foe's blow to the GMs and whoever struck, sound and picture alike", async () => {
		tokens["Token.foe"] = token("Token.foe", { hidden: true });
		playBlowFx({ attacker: "Token.knight", weapons: [sword], targets: [{ uuid: "Token.foe" }] });
		await settle();

		// Whoever swung is in the audience: the sound plays on this client whatever it
		// is pushed to, so leaving them out would hide the swing and play the blow anyway.
		expect(usersOf(effects[0])).toEqual(["gm-1", "user-1"]);
		expect(sounds[0].push).toEqual({ recipients: ["gm-1"] });
	});

	it("keeps a whispered Attack to the GMs and whoever rolled it", async () => {
		playBlowFx({ attacker: "Token.knight", weapons: [sword], targets: [{ uuid: "Token.foe" }], whispered: true });
		await settle();

		expect(usersOf(effects[0])).toEqual(["gm-1", "user-1"]);
		expect(sounds[0].push).toEqual({ recipients: ["gm-1"] });
	});

	it("is heard by the whole table when nobody is hiding", async () => {
		playBlowFx({ attacker: "Token.knight", weapons: [sword], targets: [{ uuid: "Token.foe" }] });
		await settle();

		expect(usersOf(effects[0])).toBeNull();
		expect(sounds[0].push).toBe(true);
	});

	it("is still heard when there's nothing to draw it on, the landing at about when it would arrive", async () => {
		playBlowFx({ attacker: "Actor.nobody", weapons: [bow], targets: [{ uuid: "Token.foe" }] });
		await vi.advanceTimersByTimeAsync(50);
		expect(heard()).toEqual(["arrow-fly-by"]);
		await settle();
		expect(heard()).toEqual(["arrow-fly-by", "arrow-impact"]);
		expect(effects).toHaveLength(0);
	});

	it("draws nothing without Sequencer and JB2A, and sounds nothing without the SoundFx Library", async () => {
		useModules("soundfxlibrary");
		playBlowFx({ attacker: "Token.knight", weapons: [sword], targets: [{ uuid: "Token.foe" }] });
		await settle();
		expect(effects).toHaveLength(0);
		expect(heard()).toEqual(["melee-hit"]);

		sounds = [];
		useModules("sequencer", "JB2A_DnD5e");
		playBlowFx({ attacker: "Token.knight", weapons: [sword], targets: [{ uuid: "Token.foe" }] });
		await settle();
		expect(effects).toHaveLength(1);
		expect(heard()).toEqual([]);
	});

	it("does nothing at all when the world has switched the effects off", async () => {
		settings.attackFx = false;
		playBlowFx({ attacker: "Token.knight", weapons: [sword], targets: [{ uuid: "Token.foe" }] });
		await settle();
		expect([effects.length, sounds.length]).toEqual([0, 0]);
	});

	it("swallows its own failure, since the card is already posted", async () => {
		broken = true;
		const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(() => playBlowFx({ attacker: "Token.knight", weapons: [sword], targets: [{ uuid: "Token.foe" }] })).not.toThrow();
		await settle();
		expect(warned).toHaveBeenCalled();
	});
});

describe("playDamageFx", () => {
	/** A Knight with one Token standing on this Scene. */
	let knight;

	beforeEach(() => {
		const standing = token("Token.knight");
		knight = { getActiveTokens: () => [standing] };
		globalThis.Sequencer.Database.flattenedEntries = ["jb2a.liquid.splash02.red", "jb2a.impact.010.orange"];
	});

	it("bleeds on whoever lost VIG", async () => {
		playDamageFx(knight, "wounded");
		await settle();
		expect(fileOf(effects[0])).toBe("jb2a.liquid.splash02.red");
		expect(heard()).toEqual(["impact"]);
	});

	it("bursts on whoever lost GD alone", async () => {
		playDamageFx(knight, "evaded");
		await settle();
		expect(fileOf(effects[0])).toBe("jb2a.impact.010.orange");
	});

	it("clanks where the Armour took the whole blow, and draws nothing", async () => {
		playDamageFx(knight, "none");
		await settle();
		expect(effects).toHaveLength(0);
		expect(heard()).toEqual(["shield-hit"]);
	});

	it("says nothing of an Attack that couldn't harm them", async () => {
		playDamageFx(knight, "unharmed");
		await settle();
		expect([effects.length, sounds.length]).toEqual([0, 0]);
	});
});

describe("playDismountFx", () => {
	it("is heard wherever the Gambit was declared, with no Token to draw on", async () => {
		playDismountFx();
		await settle();
		expect(heard()).toEqual(["horse-whinny"]);
		expect(effects).toHaveLength(0);
	});
});

describe("hideAttackFxForReducedMotion", () => {
	it("hides this system's effects from somebody who asked for less movement", () => {
		settings.reduceMotion = true;
		const effect = { data: { moduleName: SYSTEM_ID } };
		hideAttackFxForReducedMotion(effect);
		expect(effect.data.opacity).toBe(0);
	});

	it("leaves them be otherwise, and leaves other modules' alone either way", () => {
		const mine = { data: { moduleName: SYSTEM_ID } };
		hideAttackFxForReducedMotion(mine);
		expect(mine.data.opacity).toBeUndefined();

		settings.reduceMotion = true;
		const theirs = { data: { moduleName: "some-module" } };
		hideAttackFxForReducedMotion(theirs);
		expect(theirs.data.opacity).toBeUndefined();
		expect(() => hideAttackFxForReducedMotion(undefined)).not.toThrow();
	});
});
