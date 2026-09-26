import { read, reducesMotion } from "../client-settings.js";
import { currentMessageMode } from "../compat.js";
import {
	BLOW_STAGGER_MS,
	DISMOUNT_SOUND,
	FX_KINDS,
	LAND_WITHOUT_ANIMATION_MS,
	REACTION_SOUNDS,
	SOUND_FILES,
	attackBlows,
	blowSounds,
	damageReaction,
	fxFile,
	fxFilesFor,
	onTargetSize,
	swingSize
} from "../rules/attack-fx.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * Attacks drawn on the map and heard at the table: a sword swings, an arrow
 * flies, a beast's jaws close on whoever they closed on, and applying the
 * Damage bursts on whoever lost GD, bloodies whoever lost VIG, or clanks where
 * the Armour took the whole blow. What each blow IS lives in
 * module/rules/attack-fx.js; this is the half that talks to the canvas and the
 * speakers.
 *
 * Pictures come from Sequencer with JB2A's animations, and sounds from the
 * SoundFx Library module. None of the three ships with the system, and without
 * them that half simply doesn't happen.
 *
 * NOT FXMASTER, which the weather uses: FXMaster's own animations were dropped
 * in v8 with a note to use Sequencer instead. Sequencer broadcasts an effect to
 * everyone looking at the Scene by itself, with its random choices seeded, so
 * every client sees the same swing and there's no socket code here.
 *
 * THE SOUNDS DON'T GO THROUGH SEQUENCER. A Sequencer sound reaches only a
 * client viewing the Scene it was made on, and somebody running Foundry with
 * the canvas switched off — as a player reading the table through a screen
 * magnifier may — views no Scene at all. Foundry's own AudioHelper broadcast
 * has no such gate, so they hear every blow the others see. The timing still
 * follows the animation: the landing sound is a step in the same sequence, so
 * a long shot thunks later than a short one.
 *
 * NEVER IN THE WAY. Every entry point is synchronous, returns nothing and
 * swallows its own failure into a console warning. Each is called after steps
 * that can't be taken back — a posted Attack card, GD and VIG already written —
 * and a JB2A key renamed in some update must cost the table a flourish, never
 * a card.
 */

/** Whether the world draws and sounds its Attacks. */
const SETTING = "attackFx";

export const SEQUENCER_ID = "sequencer";
export const JB2A_IDS = Object.freeze(["JB2A_DnD5e", "jb2a_patreon"]);
export const SOUNDFX_ID = "soundfxlibrary";

/**
 * At most this many animations for one blow. A Blast can take in a crowd (p8),
 * and a dozen overlapping swings is noise as well as a dozen videos every
 * client decodes at once.
 */
export const MAX_ANIMATED_TARGETS = 6;

/** How long before a flight ends its landing sound starts, so the thunk meets the arrowhead. */
const LANDING_LEAD_MS = 250;

/** Loud enough to hear over the table, under the dice. Foundry's Interface slider scales it. */
const SOUND_VOLUME = 0.8;

/** The deliveries that travel, and so have a landing to wait for. */
const FLIGHTS = new Set(["throw", "projectile"]);

/** @param {string} id @returns {boolean} Whether that module is on in this world. */
export const moduleActive = (id) => game.modules?.get(id)?.active === true;

/** Register the world's Attack Effects setting, and the reduced-motion hook. Called during init. */
export function registerAttackFx() {
	game.settings.register(SYSTEM_ID, SETTING, {
		name: "bastionland.settings.attackFx.name",
		hint: "bastionland.settings.attackFx.hint",
		// A world setting rather than each person's, because the effects are broadcast:
		// one player's blow is drawn on every screen, so whether a table has them is the table's.
		scope: "world",
		config: true,
		type: Boolean,
		default: true
	});
	// Sequencer fires this on every client as it draws an effect, so each person's
	// own Reduce Motion setting decides whether they see the system's swings.
	// Registered whether or not Sequencer is installed: without it, it's never called.
	Hooks.on("createSequencerEffect", hideAttackFxForReducedMotion);
}

/** @returns {boolean} Whether this world draws and sounds its Attacks. Defaults to yes. */
export const attackFxOn = () => read(SETTING, true) !== false;

/**
 * @returns {boolean} Whether this client can draw them: the world's setting,
 *   Sequencer, one of the JB2A modules, and a canvas to draw on.
 */
export function attackVisualsReady() {
	return attackFxOn()
		&& moduleActive(SEQUENCER_ID) && JB2A_IDS.some(moduleActive)
		&& typeof globalThis.Sequence === "function"
		&& Boolean(globalThis.Sequencer?.Database)
		&& canvas?.ready === true;
}

/** @returns {boolean} Whether this client can play them: the world's setting and the SoundFx Library. */
export function attackSoundsReady() {
	return attackFxOn()
		&& moduleActive(SOUNDFX_ID)
		&& typeof foundry.audio?.AudioHelper?.play === "function";
}

const knownKeys = new Set();
/** Keys looked for and not found, remembered only against the database they were looked for in. */
const missedKeys = new Set();
let missedIn = null;
let missedAtLength = -1;

/**
 * Does Sequencer's database hold this JB2A key, or a branch of it?
 *
 * Not `Sequencer.Database.entryExists`, which answers yes to anything the text
 * merely starts, and not `getEntry`, which puts an error notification on screen
 * for every miss. A key found is remembered for good; a key missed only while
 * the database is unchanged, since JB2A fills it on `sequencer.ready`, after
 * the first Scene is drawn, so an early no may not stay one. Without that,
 * every Patreon-only key a free world lacks is a full scan of thousands of
 * entries on every blow.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function jb2aHas(key) {
	if (knownKeys.has(key)) return true;
	const entries = globalThis.Sequencer?.Database?.flattenedEntries;
	if (!Array.isArray(entries)) return false;
	if (entries !== missedIn || entries.length !== missedAtLength) {
		missedKeys.clear();
		missedIn = entries;
		missedAtLength = entries.length;
	}
	if (missedKeys.has(key)) return false;
	const found = entries.some((entry) => entry === key || entry.startsWith(`${key}.`));
	(found ? knownKeys : missedKeys).add(key);
	return found;
}

/**
 * The Token for something on the Scene this client is looking at, or null.
 * @param {Actor|TokenDocument|string|null} ref An Actor, a Token, or either one's UUID.
 * @returns {TokenDocument|null} An Actor standing on the map twice has no one
 *   place a blow comes from, so only the one this user has selected counts.
 */
export function tokenOnScene(ref) {
	const scene = canvas?.scene;
	if (!ref || !scene) return null;
	const document = typeof ref === "string" ? fromUuidSync(ref) : ref;
	if (!document) return null;
	if (document.documentName === "Token") return document.parent?.id === scene.id ? document : null;
	if (document.token) return document.token.parent?.id === scene.id ? document.token : null;
	const here = (document.getActiveTokens?.(false, true) ?? []).filter((token) => token?.parent?.id === scene.id);
	if (here.length === 1) return here[0];
	return here.find((token) => token.object?.controlled) ?? null;
}

/** Sequencer wants the placeable where there is one; the document is its fallback. */
const placeable = (token) => token?.object ?? token;

const gmIds = () => (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id);

/**
 * Who may see and hear a blow, or null for everyone. A hidden Token keeps it
 * to the GMs: a foe they haven't revealed mustn't be given away by the arc of
 * its own swing, by an arrow flying out of empty ground, or by the sound of
 * either. A card the table wasn't shown keeps it to the GMs and whoever rolled.
 *
 * Whoever set the blow off is always in the audience, however it was narrowed.
 * They rolled the Attack and know what it gives away, and they can't be kept
 * from hearing it in any case: AudioHelper plays a sound on this client whether
 * or not this client is among the recipients it's pushed to. Leaving them out
 * would hide the swing from them and play them the sound anyway.
 * @param {(TokenDocument|null)[]} ends
 * @param {boolean} [whispered]
 * @returns {string[]|null}
 */
function audienceFor(ends, whispered = false) {
	if (!whispered && !ends.some((token) => token?.hidden)) return null;
	return [...new Set([...gmIds(), game.user?.id].filter(Boolean))];
}

/** @returns {boolean} Whether this user's chat cards are posted for the whole table. */
export function chatIsPublic() {
	try {
		return currentMessageMode() === "public";
	} catch {
		return true;
	}
}

/**
 * The one part every effect shares: who may see it. The audience was worked out
 * once for the whole Attack, over every Token at either end of it, so there's
 * nothing left for an effect to reckon for itself.
 */
function frame(effect, audience) {
	if (audience) effect.forUsers(audience);
	return effect;
}

/** An effect drawn on whoever was struck: a bite, a trample, a burst of blood. */
function onTargetEffect(sequence, file, target, audience = null) {
	const effect = sequence.effect().file(file)
		.atLocation(placeable(target))
		.size(onTargetSize(target.width, target.height), { gridUnits: true })
		.fadeIn(250)
		.fadeOut(500);
	return frame(effect, audience);
}

/**
 * One blow from the attacker at one target, or null when this world's database
 * holds no file for it.
 */
function blowEffect(sequence, { kind, delivery, source, target, audience }) {
	const file = fxFile(fxFilesFor(kind, delivery), jb2aHas);
	if (!file) return null;
	if (delivery === "onTarget") return onTargetEffect(sequence, file, target, audience);
	const effect = sequence.effect().file(file).atLocation(placeable(source));
	if (delivery === "swing") {
		effect.rotateTowards(placeable(target))
			.anchor({ x: 0.4, y: 0.5 })
			.size(swingSize(source.width), { gridUnits: true });
	} else {
		effect.stretchTo(placeable(target));
	}
	effect.randomizeMirrorY();
	return frame(effect, audience);
}

/**
 * Play one of SOUND_FILES' sounds for the table, or for `audience` alone.
 *
 * `AudioHelper.play(data, true)` plays it here and pushes it to every other
 * client, canvas or none; `{recipients}` pushes it to those users alone,
 * leaving out this one, who has already played it. It always plays here, so an
 * `audience` must hold this user — audienceFor sees to that — or the sound
 * would reach the one person it was kept from. A file that fails to load
 * rejects the local play, which is a warning, not a stopped blow.
 *
 * @param {string} key A key of SOUND_FILES.
 * @param {string[]|null} [audience]
 */
function broadcastSound(key, audience = null) {
	const sounds = SOUND_FILES[key];
	if (!sounds?.length) return;
	const src = sounds[Math.floor(Math.random() * sounds.length)];
	const self = game.user?.id;
	const others = audience?.filter((id) => id !== self) ?? null;
	const push = others ? (others.length ? { recipients: others } : false) : true;
	Promise.resolve(foundry.audio.AudioHelper.play({ src, volume: SOUND_VOLUME, channel: "interface", autoplay: true, loop: false }, push))
		.catch(fxFailed);
}

const fxFailed = (error) => console.warn(`${SYSTEM_ID} | An attack effect didn't play`, error);

/** Run something without waiting on it, and without letting it throw into the caller. */
function fireAndForget(work) {
	try {
		Promise.resolve(work()).catch(fxFailed);
	} catch (error) {
		fxFailed(error);
	}
}

/** Play a list of cues, each after its own wait. */
const playCues = (cues, audience) =>
	cues.forEach(({ sound, at }) => setTimeout(() => broadcastSound(sound, audience), Number(at) || 0));

/** Every cue put back by the same wait, for a blow that falls later in the flurry. */
const later = (cues, by) => cues.map((cue) => ({ ...cue, at: (Number(cue.at) || 0) + by }));

/**
 * One weapon's blow: its animation on each target, and its own sounds, timed
 * to that animation where there's one to time them by.
 *
 * The delay is how far into the Attack this blow falls, so the second weapon
 * strikes a quarter of a second after the first. Where it's drawn, the wait is
 * the sequence's own and the cues that follow are already late by it; where it
 * isn't, each cue carries the delay itself.
 */
async function runOneBlow({ kind, delivery, source, struck, audience, delay, visuals, sounds, opening: extras }) {
	const cues = sounds ? blowSounds(kind, delivery, extras) : [];
	const opening = cues.filter((cue) => cue.at !== "land");
	const landing = cues.filter((cue) => cue.at === "land");

	// A blow drawn on the one struck needs nobody's Token to come from, so a beast
	// whose own Token is on another Scene still closes its jaws where it bit.
	const sequence = visuals && struck.length && (source || delivery === "onTarget")
		? new globalThis.Sequence({ moduleName: SYSTEM_ID, softFail: true })
		: null;
	let drawn = 0;
	let lastFlight = null;
	if (sequence) {
		if (delay) sequence.wait(delay);
		// The sounds heard as the blow starts go first, so they start WITH the animation
		// rather than after it: an effect step doesn't hold the next one back, a wait would.
		if (opening.length) sequence.thenDo(() => playCues(opening, audience));
		for (const target of struck.slice(0, MAX_ANIMATED_TARGETS)) {
			const effect = blowEffect(sequence, { kind, delivery, source, target, audience });
			if (!effect) continue;
			drawn += 1;
			if (FLIGHTS.has(delivery)) lastFlight = effect;
		}
		if (lastFlight) {
			// Wait for the flight Sequencer actually chose — the longest shot is the slowest —
			// then the landing: its sound, and the burst where a stone came down.
			lastFlight.waitUntilFinished(-LANDING_LEAD_MS);
			if (landing.length) sequence.thenDo(() => playCues(landing, audience));
			const arrival = fxFile(FX_KINDS[kind]?.landing ?? [], jb2aHas);
			if (arrival) for (const target of struck.slice(0, MAX_ANIMATED_TARGETS)) onTargetEffect(sequence, arrival, target, audience);
		}
	}

	// Anything drawn for a blow that lands late is a flight, and only a flight has a
	// landing cue, so the sequence above has already timed every one of them.
	if (drawn > 0) {
		await sequence.play();
		return;
	}

	// Nothing to draw — no Sequencer, nobody's Token on this Scene, no file for this blow —
	// so the sounds on their own, the landing at about when an arrow would have arrived.
	playCues(later(opening, delay), audience);
	playCues(later(landing, LAND_WITHOUT_ANIMATION_MS + delay), audience);
}

/**
 * The whole Attack: one blow for each weapon that added dice to it, the weapon
 * rolling the biggest die first and each a moment after the last
 * (module/rules/attack-fx.js#attackBlows).
 *
 * The blows are started together rather than awaited one at a time, since each
 * holds its own place in the flurry. The Attack's own sounds — a charge's
 * gallop, a Warband's cry — belong to the first blow alone, not to every one.
 */
async function runBlow({ attacker, weapons, mounted, warband, impaired, targets, whispered }) {
	const visuals = attackVisualsReady();
	const sounds = attackSoundsReady();
	if (!visuals && !sounds) return;

	const blows = attackBlows(weapons, { impaired });
	const source = tokenOnScene(attacker);
	const struck = (targets ?? []).map((target) => tokenOnScene(target?.uuid ?? target)).filter(Boolean);
	// Worked out for the Attack as a whole, so a hidden foe's swing isn't heard by a
	// player it wasn't shown to either.
	const audience = audienceFor([source, ...struck], whispered);

	await Promise.all(blows.map(({ kind, delivery }, index) => runOneBlow({
		kind,
		delivery,
		source,
		struck,
		audience,
		delay: index * BLOW_STAGGER_MS,
		visuals,
		sounds,
		// The first blow opens the Attack; the rest are the flurry after it.
		opening: index === 0 ? { mounted, warband } : {}
	})));
}

/**
 * An Attack was rolled: draw each weapon's blow from whoever struck at whoever
 * they struck, one after another in quick succession, and play what they sound
 * like.
 *
 * @param {object} [args]
 * @param {Actor|TokenDocument|string|null} [args.attacker] Whoever struck.
 * @param {{name?: string, damage?: string, ranged?: boolean}[]} [args.weapons]
 *   Everything that added dice to the Attack: each weapon, each shield with an
 *   Attack die, the steed's trample. The order they're drawn in is the damage's,
 *   not the order they're passed in.
 * @param {boolean} [args.mounted]  Made from the saddle, or as a mounted charge (p10).
 * @param {boolean} [args.warband]  A Warband's Attack (p11).
 * @param {boolean} [args.impaired] An Impaired Attack, which strikes one blow (p9).
 * @param {{uuid: string}[]} [args.targets] The Tokens the Attack card recorded.
 * @param {boolean} [args.whispered] The card wasn't posted for the whole table.
 */
export function playBlowFx({ attacker = null, weapons = [], mounted = false, warband = false, impaired = false, targets = [], whispered = false } = {}) {
	fireAndForget(() => runBlow({ attacker, weapons, mounted, warband, impaired, targets, whispered }));
}

async function runReaction({ actor, outcome, whispered }) {
	const reaction = damageReaction(outcome);
	if (!reaction) return;
	const visuals = attackVisualsReady();
	const sounds = attackSoundsReady();
	if (!visuals && !sounds) return;

	const token = tokenOnScene(actor);
	const audience = audienceFor([token], whispered);
	if (sounds) broadcastSound(REACTION_SOUNDS[reaction], audience);

	// A clank is heard and not seen: a burst over somebody the blow never
	// reached would say the opposite of what the card says.
	if (!visuals || !token || reaction === "clank") return;
	const file = fxFile(fxFilesFor(reaction, "onTarget"), jb2aHas);
	if (!file) return;
	const sequence = new globalThis.Sequence({ moduleName: SYSTEM_ID, softFail: true });
	onTargetEffect(sequence, file, token, audience);
	await sequence.play();
}

/**
 * Damage was applied: a burst on whoever lost GD, blood on whoever lost VIG,
 * a clank where the Armour took all of it (module/rules/attack-fx.js#damageReaction).
 *
 * @param {Actor} actor Whoever took it.
 * @param {string} outcome The DamageOutcome resolveDamage gave.
 * @param {object} [args]
 * @param {boolean} [args.whispered] The Damage card wasn't posted for the whole table.
 */
export function playDamageFx(actor, outcome, { whispered = false } = {}) {
	fireAndForget(() => runReaction({ actor, outcome, whispered }));
}

/**
 * A Dismount Gambit was declared (p10): the horse goes over, heard wherever it
 * was declared from, since the Gambit has no Token of its own to draw on.
 *
 * Heard as it's declared rather than after the foe's VIG Save, because that is
 * when it counts: a Gambit nobody has Saved against yet holds
 * (module/rules/attack.js#gambitIgnored), and a Save that passes takes it back.
 * @param {object} [args]
 * @param {boolean} [args.whispered]
 */
export function playDismountFx({ whispered = false } = {}) {
	fireAndForget(() => {
		if (!attackSoundsReady()) return;
		broadcastSound(DISMOUNT_SOUND, audienceFor([], whispered));
	});
}

/**
 * Keep the system's animations off the screen of anyone who has asked for less
 * movement, on the Settings page or in their browser, and leave their sounds be.
 *
 * `createSequencerEffect` is the hook that fires on EVERY client, on the effect
 * about to be drawn there; the one that could cancel it fires only on the
 * client that started it, which is the wrong person to ask. Opacity rather than
 * ending the effect, so it still runs its full length and nothing timed by it
 * — the landing sound — moves.
 *
 * @param {object} effect
 */
export function hideAttackFxForReducedMotion(effect) {
	if (effect?.data?.moduleName !== SYSTEM_ID || !reducesMotion()) return;
	effect.data.opacity = 0;
}
