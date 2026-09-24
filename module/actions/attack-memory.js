import { SYSTEM_ID } from "../system-id.js";

// The Attack dialog opens on the choices this person last rolled with for that
// actor, so a Knight fighting engaged with their shield set aside doesn't have
// to say so again every turn. Only what the table chooses is kept: what's read
// off the world instead — whether they moved, whether they're Impaired, the
// duel they're in — is worked out afresh each time, and a declaration made for
// one blow alone, bonus dice or Smite, is never carried into the next. Charging
// a spearwall is one of those: it refuses the Attack outright (p10), so it is
// never rolled with, and it belongs to the turn it was declared on.

/**
 * Client setting holding the choices. A client setting is one record per
 * browser, shared by every world it opens, so each world keeps its own entry:
 * `{ [worldId]: { [actorUuid]: AttackChoice } }`.
 */
const CHOICES_SETTING = "attackChoices";

/** Only this many actors are remembered per world; the one rolled for longest ago goes first. */
const REMEMBERED_ACTORS = 50;

/** The situation boxes remembered from one Attack to the next. */
export const REMEMBERED_TICKS = Object.freeze(["engaged", "confined", "mounted", "charge", "againstIndividuals"]);

/**
 * @typedef {object} AttackChoice
 * @property {Record<string, boolean>} source Which items were wielded, by item id.
 * @property {Record<string, boolean>} specialist Which specialist dice were claimed, by item id.
 * @property {boolean} engaged
 * @property {boolean} confined
 * @property {boolean} mounted
 * @property {boolean} charge
 * @property {boolean} againstIndividuals
 */

/** Register the setting the choices are kept in. Called during init. */
export function registerAttackMemory() {
	game.settings.register(SYSTEM_ID, CHOICES_SETTING, {
		scope: "client",
		config: false,
		type: Object,
		default: {}
	});
}

/** @param {Record<string, unknown>|undefined} record */
const booleans = (record) => Object.fromEntries(Object.entries(record ?? {}).map(([key, value]) => [key, Boolean(value)]));

/**
 * What of a dialog's answer is worth keeping.
 * @param {object} choice The dialog's expanded form data.
 * @returns {AttackChoice}
 */
export function rememberedChoice(choice = {}) {
	return {
		...Object.fromEntries(REMEMBERED_TICKS.map((key) => [key, Boolean(choice[key])])),
		source: booleans(choice.source),
		specialist: booleans(choice.specialist)
	};
}

/**
 * The situation boxes as the dialog opens them, read off the one list of what
 * is kept rather than named again a line at a time. `charge` comes out as
 * `chargeChecked`, since the dialog's own `charge` is the line naming the steed
 * and what it tramples with.
 * @param {AttackChoice|null} remembered
 * @returns {Record<string, boolean>} The ticks, ready to spread into the context.
 */
export function rememberedTicks(remembered) {
	const { charge, ...ticks } = Object.fromEntries(REMEMBERED_TICKS.map((key) => [key, Boolean(remembered?.[key])]));
	return {
		...ticks,
		chargeChecked: charge,
		// A Warband's Attack is on individuals unless they last said otherwise.
		againstIndividuals: remembered ? Boolean(remembered.againstIndividuals) : true
	};
}

/**
 * Which of the items offered open ticked: the ones last rolled with, and the
 * hardest-hitting of anything taken up since.
 * @param {AttackChoice|null} remembered
 * @param {string[]} ids The items offered, in the order they're listed.
 * @param {number[]} fallback The indexes ticked for an actor with nothing remembered.
 * @returns {number[]} Indexes into ids.
 */
export function wieldedWith(remembered, ids, fallback) {
	const source = remembered?.source ?? {};
	return ids.flatMap((id, index) => ((id in source ? source[id] : fallback.includes(index)) ? [index] : []));
}

/** @returns {Record<string, Record<string, AttackChoice>>} Every world's choices, or none while the setting can't be read. */
function savedWorlds() {
	try {
		return game.settings.get(SYSTEM_ID, CHOICES_SETTING) ?? {};
	} catch {
		return {};
	}
}

/**
 * What this person last rolled an Attack with for an actor.
 * @param {Actor} actor
 * @returns {AttackChoice|null} Null for an actor they haven't attacked with.
 */
export function recallAttack(actor) {
	if (!actor?.uuid) return null;
	return savedWorlds()[game.world.id]?.[actor.uuid] ?? null;
}

/**
 * Keep what an actor's Attack was rolled with, for their next one to open on.
 * @param {Actor} actor
 * @param {object} choice The dialog's expanded form data.
 */
export async function rememberAttack(actor, choice) {
	if (!actor?.uuid) return;
	const worlds = savedWorlds();
	const world = { ...worlds[game.world.id] };
	// Written afresh at the end, so the cap drops whoever was rolled for longest ago.
	delete world[actor.uuid];
	world[actor.uuid] = rememberedChoice(choice);
	for (const uuid of Object.keys(world).slice(0, -REMEMBERED_ACTORS)) delete world[uuid];
	await game.settings.set(SYSTEM_ID, CHOICES_SETTING, { ...worlds, [game.world.id]: world });
}
