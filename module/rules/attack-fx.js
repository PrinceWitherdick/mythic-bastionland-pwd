/**
 * What a blow looks and sounds like: the pure half of the attack effects
 * (module/actions/attack-fx.js is the half that talks to Sequencer and the
 * speakers). Nothing here reads a Foundry global, so every question it answers
 * — "what is a Poleaxe?", "does a Sling fly or swing?", "what does a Mortal
 * Wound look like?" — is a plain function a test can ask without a world.
 *
 * The system picks each animation itself, from the name of the weapon that was
 * wielded, the way module/rules/goods-icons.js picks each item's picture from
 * the same names. Nothing on Arms & Goods (p12) is configured by the table: the
 * weapons come out of the GM's own rulebook, so a menu they had to fill in
 * would leave every Attack unanimated until they did.
 *
 * JB2A KEYS ARE LISTS, IN PREFERENCE ORDER. The free module (JB2A_DnD5e) and
 * the Patreon one each hold keys the other lacks, so every kind names what it
 * would like best first and something the free module surely has last. The
 * caller takes the first key that world's database actually holds. Marked P
 * (Patreon only) and F (free only) where it matters.
 */
import { parseDice } from "./attack.js";

/** The SoundFx Library module's folder. Its folder names carry spaces, which the browser encodes. */
const SFX = "modules/soundfxlibrary/";

const span = (from, to) => Array.from({ length: to - from + 1 }, (_item, index) => from + index);
const numbered = (dir, stem, numbers) => Object.freeze(numbers.map((n) => `${SFX}${dir}/${stem}-${n}.mp3`));

/**
 * Every sound the system plays, one file spelled out at a time.
 *
 * NEVER A WILDCARD. A `*` path is resolved through the file browser, which a
 * player may not be allowed to open, so the sound they set off would fail on
 * their client alone. Shield Hit has no `-2` in the module and the gallop is
 * filed misspelled; the lists say so rather than naming a file that isn't there.
 */
export const SOUND_FILES = Object.freeze({
	meleeHit: numbered("Combat/Single/Melee Hit", "melee-hit", span(1, 13)),
	whoosh: numbered("Combat/Single/Melee Miss", "melee-miss", [1]),
	flyBy: numbered("Combat/Single/Arrow Fly-By", "arrow-fly-by", span(1, 3)),
	arrowImpact: numbered("Combat/Single/Arrow Impact", "arrow-impact", span(1, 5)),
	shieldHit: numbered("Combat/Single/Shield Hit", "shield-hit", [1, ...span(3, 12)]),
	throwHit: numbered("Combat/Single/Throw Hit", "throw-hit", [1]),
	battleCry: numbered("Combat/Single/Battle Cry", "battle-cry", span(1, 6)),
	impact: numbered("Misc/Single/Impact", "impact", span(1, 6)),
	growl: numbered("Creatures/Monsters/Growl", "growl", span(1, 6)),
	gallop: numbered("Creatures/Animals/Horse Gallop", "horse-galop", [1]),
	whinny: numbered("Creatures/Animals/Horse Whinny", "horse-whinny", span(1, 4))
});

const files = (byDelivery) => Object.freeze(Object.fromEntries(
	Object.entries(byDelivery).map(([delivery, keys]) => [delivery, Object.freeze(keys.map((key) => `jb2a.${key}`))])
));

/**
 * Each kind of blow, by the way it's delivered: `swing` (a melee arc from the
 * attacker towards whoever they struck), `throw` and `projectile` (stretched
 * from one to the other), `onTarget` (played on the one struck), and `landing`
 * (on the target as a flight arrives, for the stone a Trebuchet drops).
 */
export const FX_KINDS = Object.freeze({
	sword: files({ swing: ["sword.melee.01.white"] }),
	greatsword: files({ swing: ["greatsword.melee.standard.white", "sword.melee.01.white"] }),
	shortsword: files({ swing: ["shortsword.melee.01.white"] }),
	dagger: files({ swing: ["dagger.melee.02.white"], throw: ["dagger.throw.01.white"] }),
	axe: files({ swing: ["melee_attack.02.battleaxe.01" /* F */, "greataxe.melee.standard.white"] }),
	greataxe: files({ swing: ["greataxe.melee.standard.white"] }),
	handaxe: files({ swing: ["handaxe.melee.standard.white"], throw: ["handaxe.throw.01" /* P */, "dagger.throw.01.white"] }),
	mace: files({ swing: ["mace.melee.01.white"] }),
	flail: files({ swing: ["melee_attack.01.flail.01" /* F */, "mace.melee.01.white"] }),
	club: files({ swing: ["club.melee.01.white"] }),
	maul: files({ swing: ["maul.melee.standard.white"] }),
	hammer: files({ swing: ["warhammer.melee.01.white", "hammer.melee.01.white"] }),
	// A Spear is thrust unless it's thrown, and a Lance is couched; both swing.
	spear: files({ swing: ["spear.melee.01.white"], throw: ["spear.throw.01" /* P */, "javelin.01.throw" /* P */, "arrow.physical.white.01"] }),
	polearm: files({ swing: ["halberd.melee.01.white", "glaive.melee.01.white"] }),
	staff: files({ swing: ["quarterstaff.melee.01.white"] }),
	scythe: files({ swing: ["melee_attack.05.scythe.01" /* F */, "glaive.melee.01.white"] }),
	sickle: files({ swing: ["melee_attack.01.sickle.01" /* F */, "dagger.melee.02.white"] }),
	javelin: files({ throw: ["javelin.01.throw" /* P */, "spear.throw.01" /* P */, "arrow.physical.white.01"] }),
	bow: files({ projectile: ["arrow.physical.white.01"] }),
	crossbow: files({ projectile: ["bolt.physical.orange"] }),
	sling: files({ projectile: ["slingshot" /* P */, "bullet.01.orange"] }),
	// Stone Throwers and Trebuchets (p11): the stone arrives, then bursts where it lands.
	boulder: files({ projectile: ["boulder.siege.01" /* P */, "boulder.toss.02.01.stone.brown"], landing: ["impact.010.orange"] }),
	bomb: files({ projectile: ["throwable.throw.bomb.01.black", "throwable.throw.flask.01.orange"], landing: ["explosion.01.orange"] }),
	// A Battering Ram is swung by a crew at what it's brought against, not at a hex away.
	ram: files({ onTarget: ["impact.009.orange"] }),
	bite: files({ onTarget: ["bite.400px.red"] }),
	claw: files({ onTarget: ["claws.400px.red"] }),
	trample: files({ onTarget: ["impact.010.orange"] }),
	fist: files({ swing: ["melee_generic.creature_attack.fist.001.red" /* F */, "unarmed_strike.physical.01.blue"] }),
	// A shield is worn as Armour and swung as a weapon, since it carries an Attack die of its own.
	shield: files({ swing: ["melee_attack.06.shield.01" /* F */, "melee_generic.slash.01.orange"] }),
	// Anything the names below don't recognise is still a blow.
	slash: files({ swing: ["melee_generic.slash.01.orange"] }),
	// What Damage looks like once it's applied (damageReaction).
	burst: files({ onTarget: ["impact.010.red" /* P */, "impact.010.orange"] }),
	blood: files({ onTarget: ["liquid.splash02.red", "impact.010.red" /* P */, "impact.010.orange"] }),
	wreck: files({ onTarget: ["explosion.01.orange", "impact.009.orange"] })
});

/**
 * What a delivery falls back to when a kind's own keys find nothing in this
 * world's database: a JB2A update that renames a key should cost a blow its
 * flourish, never its animation.
 */
const DELIVERY_FALLBACK = Object.freeze({
	swing: FX_KINDS.slash.swing,
	throw: FX_KINDS.bow.projectile,
	projectile: FX_KINDS.bow.projectile,
	onTarget: FX_KINDS.burst.onTarget,
	landing: []
});

/**
 * Words in a weapon's name, and the kind of blow each makes, the first match
 * winning. The order is module/rules/goods-icons.js's: polearms before the
 * blades and axes on their heads, weapons before a beast's own, so a Fang
 * blade is a blade. Siege engines first, since a Stone Thrower throws no stone
 * of its own and a Battering Ram is no ram.
 */
const WEAPON_KINDS = Object.freeze([
	[/trebuchet|stone thrower|catapult|mangonel|onager/i, "boulder"],
	[/bolt launcher|ballista/i, "crossbow"],
	[/battering ram|siege tower/i, "ram"],
	[/halberd|pole-?axe|billhook|polearm|guisarme|glaive|bardiche|partisan|voulge|pitchfork|trident/i, "polearm"],
	[/crossbow/i, "crossbow"],
	[/\bbows?\b|longbow|shortbow|curvebow|recurve|\barrows?\b/i, "bow"],
	[/sling\b/i, "sling"],
	[/javelin|darts?\b|throwing spear/i, "javelin"],
	[/\blances?\b|spear|\bpikes?\b/i, "spear"],
	[/scythe/i, "scythe"],
	[/sickle/i, "sickle"],
	[/flail|morning ?star/i, "flail"],
	[/mace/i, "mace"],
	[/maul/i, "maul"],
	[/hammer|\bpicks?\b|pickaxe|mattock/i, "hammer"],
	[/hatchet|hand ?axe|throwing axe|rider.s axe/i, "handaxe"],
	[/great ?axe|battle ?axe/i, "greataxe"],
	[/axe/i, "axe"],
	[/dagger|knife|dirk|stiletto/i, "dagger"],
	[/great ?sword|great ?blade|two-handed|cleaving ?blade|claymore/i, "greatsword"],
	[/short ?sword/i, "shortsword"],
	[/sword|blade|sabre|saber|falchion|scimitar|cutlass|rapier/i, "sword"],
	[/club|cudgel|bludgeon/i, "club"],
	[/staff|stick|cane\b/i, "staff"],
	[/explosive|bomb|grenade|fire ?pot/i, "bomb"],
	// A beast's own attacks, and a Knight's bare hands.
	[/\bbites?\b|jaws|\bfangs?\b|teeth|\bmaw\b/i, "bite"],
	[/claws?\b|talons?/i, "claw"],
	[/trample|hoof|hooves|stomp/i, "trample"],
	[/unarmed|fists?\b|punch|\bkicks?\b|gore\b|horns?\b|antlers?|tusks?|slam/i, "fist"],
	[/shield|buckler|targes?\b/i, "shield"]
]);

const PROJECTILE_KINDS = new Set(["bow", "crossbow", "sling", "boulder", "bomb"]);
const THROWN_KINDS = new Set(["javelin"]);
const ON_TARGET_KINDS = new Set(["ram", "bite", "claw", "trample", "burst", "blood", "wreck"]);

/**
 * @param {string} name A weapon's name, as the book prints it.
 * @returns {string|null} The kind of blow it makes, or null for a name none of
 *   the words above appear in.
 */
export function kindInName(name) {
	const said = String(name ?? "");
	if (!said.trim()) return null;
	return WEAPON_KINDS.find(([pattern]) => pattern.test(said))?.[1] ?? null;
}

/**
 * What kind of blow an Attack is, from the weapons it was rolled with.
 *
 * The names are offered hardest first, so a Knight who swings a sword with a
 * shield on their arm swings a sword. An Attack with nothing recognisable in
 * its names is a bare-handed blow when it was rolled with nothing at all
 * (Impaired, p9), an arrow when it was rolled at a distance, and a plain slash
 * otherwise.
 *
 * @param {object} [args]
 * @param {string[]} [args.names] Each weapon or shield, in the order they count.
 * @param {boolean} [args.ranged] The Attack was made at a distance (p10).
 * @returns {string} A key of FX_KINDS.
 */
export function blowKind({ names = [], ranged = false } = {}) {
	for (const name of names) {
		const found = kindInName(name);
		if (found) return found;
	}
	if (ranged) return "bow";
	return names.some((name) => String(name ?? "").trim()) ? "slash" : "fist";
}

/**
 * How a blow of this kind travels: "swing", "throw", "projectile" or "onTarget".
 *
 * A weapon that could be thrown or thrust is thrust unless the Attack was made
 * at a distance, which is the one thing the Attack itself records (an Attack
 * with a ranged weapon is a ranged Attack, p10).
 *
 * @param {string} kind
 * @param {object} [args]
 * @param {boolean} [args.ranged]
 * @returns {string}
 */
export function blowDelivery(kind, { ranged = false } = {}) {
	if (PROJECTILE_KINDS.has(kind)) return "projectile";
	if (THROWN_KINDS.has(kind)) return "throw";
	if (ON_TARGET_KINDS.has(kind)) return "onTarget";
	if (ranged && FX_KINDS[kind]?.throw) return "throw";
	return "swing";
}

/**
 * At most this many blows are drawn for one Attack. Two hands hold two things
 * (p12), and a mounted charge adds the steed's hooves; a stat block that lists
 * more than a handful of attacks is a flurry nobody can follow.
 */
export const MAX_BLOWS = 4;

/** How long after one blow the next one starts, so they land in quick succession. */
export const BLOW_STAGGER_MS = 250;

/** The biggest die a weapon rolls, and everything it rolls together. */
const biggestDie = (dice) => (dice.length ? Math.max(...dice) : 0);
const everyDie = (dice) => dice.reduce((sum, faces) => sum + faces, 0);

/**
 * Every blow one Attack strikes, in the order they're drawn: the weapon with
 * the biggest Attack die first, then the next, down to the shield on the arm
 * and the steed's hooves. Between two weapons rolling the same largest die the
 * one that rolls more dice goes first, and between two alike, the one the
 * Attack listed first.
 *
 * An Impaired Attack rolls a single d4 however it's armed (p9), so it strikes
 * one blow: the hardest thing they hold, once.
 *
 * @param {{name?: string, damage?: string, ranged?: boolean}[]} weapons
 *   Everything that added dice: each weapon, each shield, the steed's trample.
 * @param {object} [options]
 * @param {boolean} [options.impaired]
 * @returns {{kind: string, delivery: string, name: string}[]} Never empty: an
 *   Attack made with nothing at all is one bare-handed blow.
 */
export function attackBlows(weapons = [], { impaired = false } = {}) {
	const ordered = weapons
		.map((weapon, index) => ({ weapon, index, dice: parseDice(weapon?.damage) }))
		.sort((a, b) => biggestDie(b.dice) - biggestDie(a.dice) || everyDie(b.dice) - everyDie(a.dice) || a.index - b.index)
		.slice(0, impaired ? 1 : MAX_BLOWS);
	if (!ordered.length) return [{ kind: "fist", delivery: "swing", name: "" }];
	return ordered.map(({ weapon }) => {
		const ranged = Boolean(weapon?.ranged);
		const kind = blowKind({ names: [weapon?.name], ranged });
		return { kind, delivery: blowDelivery(kind, { ranged }), name: String(weapon?.name ?? "") };
	});
}

/**
 * The JB2A keys worth trying for a kind and delivery, the delivery's own
 * fallback last.
 * @param {string} kind
 * @param {string} delivery
 * @returns {string[]}
 */
export function fxFilesFor(kind, delivery) {
	return [...(FX_KINDS[kind]?.[delivery] ?? []), ...(DELIVERY_FALLBACK[delivery] ?? [])];
}

/**
 * @param {string[]} keys
 * @param {(key: string) => boolean} has Whether this world's database holds a key.
 * @returns {string|null} The first key it holds, or null.
 */
export function fxFile(keys, has) {
	return (keys ?? []).find((key) => has(key)) ?? null;
}

/**
 * A melee swing's size in grid units: five squares for each square of the
 * attacker's width. The files are 800x600 with the arc in the middle, so a
 * smaller number draws a swing that never reaches the foe standing beside you.
 * @param {number} width A Token's width.
 * @returns {number}
 */
export function swingSize(width) {
	return 5 * Math.max(1, Number(width) || 1);
}

/**
 * A bite, a trample or a burst drawn on a Token: half again its larger side,
 * in grid units.
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
export function onTargetSize(width, height) {
	return 1.5 * Math.max(1, Number(width) || 1, Number(height) || 1);
}

/**
 * When a flight lands, for a client with no animation to time the sound by
 * (with one, the sound is a step in the same sequence). Roughly JB2A's
 * mid-range arrow.
 */
export const LAND_WITHOUT_ANIMATION_MS = 1600;

/**
 * The sounds of one blow, however many it strikes: a volley is heard once.
 *
 * Each cue is `{sound, at}`: `sound` a key of SOUND_FILES, `at` milliseconds
 * after the blow begins, or "land" for the moment a flight arrives.
 *
 * @param {string} kind
 * @param {string} delivery What blowDelivery answered.
 * @param {object} [args]
 * @param {boolean} [args.mounted] Made from the saddle, or as a mounted charge (p10).
 * @param {boolean} [args.warband] A Warband's Attack, which is a crowd of them (p11).
 * @returns {{sound: string, at: number|"land"}[]}
 */
export function blowSounds(kind, delivery, { mounted = false, warband = false } = {}) {
	const opening = [];
	if (warband) opening.push({ sound: "battleCry", at: 0 });
	if (mounted) opening.push({ sound: "gallop", at: 0 });

	if (delivery === "projectile") {
		const loosed = kind === "bow" || kind === "crossbow" ? "flyBy" : "whoosh";
		const lands = kind === "bomb" ? "impact" : kind === "bow" || kind === "crossbow" ? "arrowImpact" : "throwHit";
		return [...opening, { sound: loosed, at: 0 }, { sound: lands, at: "land" }];
	}
	if (delivery === "throw") return [...opening, { sound: "whoosh", at: 0 }, { sound: "throwHit", at: "land" }];
	if (kind === "bite" || kind === "claw") return [...opening, { sound: "growl", at: 0 }, { sound: "meleeHit", at: 350 }];
	if (delivery === "onTarget") return [...opening, { sound: "impact", at: 200 }];
	// A JB2A swing connects a little over half a second in.
	return [...opening, { sound: "meleeHit", at: 550 }];
}

/**
 * What a Token does on the map once an Attack's Damage is applied to it
 * (module/rules/damage.js#resolveDamage tells the outcome):
 *
 * - `clank`, heard and not seen: the Armour took the whole blow, and a burst
 *   over somebody who lost nothing would say the opposite.
 * - `burst`: GD went down, and GD alone — Evaded, or a Scar.
 * - `blood`: VIG went down, so they are Wounded, Mortally Wounded or Slain.
 * - `wreck`: a ship or a structure at 0GD (p11), which bleeds nothing.
 * - null: the Attack couldn't harm them at all, so nothing happened to draw.
 *
 * @param {string} outcome A DamageOutcome.
 * @returns {"clank"|"burst"|"blood"|"wreck"|null}
 */
export const damageReaction = (outcome) => DAMAGE_REACTIONS[outcome] ?? null;

/** Which reaction each damage outcome draws, as the lines above read them. */
const DAMAGE_REACTIONS = Object.freeze({
	none: "clank",
	evaded: "burst",
	scar: "burst",
	wounded: "blood",
	mortal: "blood",
	slain: "blood",
	destroyed: "wreck"
});

/** The sound each reaction makes. */
export const REACTION_SOUNDS = Object.freeze({
	clank: "shieldHit",
	burst: "impact",
	blood: "impact",
	wreck: "impact"
});

/**
 * A Dismount Gambit (p10) is heard, wherever it was declared from: the horse
 * goes over, whether or not anyone's Token is on a map to draw it on.
 */
export const DISMOUNT_SOUND = "whinny";
