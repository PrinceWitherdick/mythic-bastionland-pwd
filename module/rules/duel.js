import { isKnight } from "./knight-types.js";
import { downBy } from "./virtues.js";

/**
 * Duels & Jousts (Specifics of Combat, p10). Two combatants agree to fight, a
 * joust if they're mounted. It goes as any fight does, except both Attacks,
 * Gambits and all, are rolled and settled at once, and either may use Feats
 * first. Fought in public, a Knight may stake Glory on it with a willing
 * opponent: the winner gains 1 and the loser loses 1 (p6), though only a
 * Knight has Glory to move. Only a real fight to the death gives Scars (p9).
 * Sparring goes further: its Damage doesn't last (p188), so
 * it leaves nobody dying, and each duelist's GD and VIG are put back as it ends.
 * Pure, so a duel card's state can be tested without Foundry.
 */

export const DUEL_KINDS = Object.freeze(["duel", "joust"]);

/**
 * @typedef {object} DuelistScores What sparring puts back.
 * @property {number} guard
 * @property {number|null} vigour Null for somebody with no VIG.
 * @property {boolean} wounded
 *
 * @typedef {object} Duelist
 * @property {string} uuid        Actor UUID.
 * @property {string} name
 * @property {string|null} token  Token document UUID, which the other's Attack targets.
 * @property {string|null} attack Chat message id of their Attack this exchange.
 * @property {DuelistScores|null} start Their scores as a sparring bout began, or null for any other duel.
 * @property {boolean} [knight]   Whether a stake moves their Glory: a Knight's, not a Squire's or anybody
 *   else's. Missing on a card from before anybody else could stake, when only Knights could.
 * @property {boolean} [down]     Knocked down in a sparring bout, and so out of it till it ends (p188).
 *
 * @typedef {object} DuelState What a duel card remembers between clicks.
 * @property {string} kind         One of DUEL_KINDS.
 * @property {boolean} stake       Glory is staked on the outcome.
 * @property {"refused"|"unanswered"|null} [stakeAnswer] Why a stake the challenger offered isn't on it:
 *   the other side wouldn't agree, or nobody answered for them.
 * @property {boolean} bloodless   A bout that leaves no Scars.
 * @property {boolean} sparring    A practice bout, whose Damage is shaken off afterwards. Always bloodless.
 * @property {Duelist[]} duelists  Always two.
 * @property {number} exchanges    How many pairs of Attacks have been resolved.
 * @property {string|null} victor  The victor's UUID once over, or null.
 * @property {boolean} ended
 * @property {{name: string, reason: "gone"|"slain"}|null} [closed] Who ended it by leaving the fight
 *   for good, where the Referee's client closed it rather than a button.
 */

/** Why a duel can be closed with nobody pressing its buttons. */
const CLOSE_REASONS = Object.freeze(["gone", "slain"]);

/** Why a challenger's stake isn't on a duel. */
const STAKE_ANSWERS = Object.freeze(["refused", "unanswered"]);

/** Every duelist. */
const always = () => true;

/**
 * @param {DuelState} duel
 * @param {(duelist: Duelist) => boolean} test
 * @param {Partial<Duelist>} patch
 * @returns {DuelState} The duel, with the patch on each duelist the test picks.
 */
const patchDuelists = (duel, test, patch) => ({ ...duel, duelists: duel.duelists.map((duelist) => (test(duelist) ? { ...duelist, ...patch } : duelist)) });

/**
 * A duel as it stands: an Attack card since deleted is no Attack, so its
 * duelist rolls again, even before anybody has written that on the card.
 * @param {DuelState|null} duel
 * @param {(messageId: string) => boolean} has Whether an Attack card is still there.
 * @returns {DuelState|null} The duel, the same one where every Attack card is still there.
 */
export function duelAsItStands(duel, has) {
	const gone = (duelist) => Boolean(duelist.attack) && !has(duelist.attack);
	return duel?.duelists?.some(gone) ? patchDuelists(duel, gone, { attack: null }) : duel;
}

/**
 * @param {object} args
 * @param {string} [args.kind]
 * @param {boolean} [args.stake]
 * @param {boolean} [args.bloodless]
 * @param {boolean} [args.sparring] Sparring stakes nothing, whatever `stake` says.
 * @param {string|null} [args.stakeAnswer] One of STAKE_ANSWERS, where a stake offered was turned down.
 * @param {{uuid: string, name: string, token?: string|null, scores?: DuelistScores, knight?: boolean}[]} args.duelists
 *   `scores` are what they start on, kept for sparring. `knight` says whether a stake moves their Glory.
 * @returns {DuelState|null} Null without two different duelists.
 */
export function createDuel({ kind = DUEL_KINDS[0], stake = false, bloodless = false, sparring = false, stakeAnswer = null, duelists }) {
	if (duelists?.length !== 2 || duelists[0].uuid === duelists[1].uuid) return null;
	return {
		kind: DUEL_KINDS.includes(kind) ? kind : DUEL_KINDS[0],
		// A practice bout is no contest of Glory.
		stake: Boolean(stake) && !sparring,
		stakeAnswer: STAKE_ANSWERS.includes(stakeAnswer) ? stakeAnswer : null,
		// A blow shaken off afterwards leaves no Scar either.
		bloodless: Boolean(bloodless) || Boolean(sparring),
		sparring: Boolean(sparring),
		duelists: duelists.map(({ uuid, name, token = null, scores = null, knight = true }) => ({
			uuid,
			name,
			token,
			knight: Boolean(knight),
			attack: null,
			start: sparring && scores ? startingScores(scores) : null,
			down: false
		})),
		exchanges: 0,
		victor: null,
		ended: false,
		closed: null
	};
}

/**
 * @param {{guard?: number, vigour?: number|null, wounded?: boolean}} scores
 * @returns {DuelistScores}
 */
function startingScores({ guard = 0, vigour = null, wounded = false }) {
	return { guard: Number(guard) || 0, vigour: Number.isFinite(vigour) ? vigour : null, wounded: Boolean(wounded) };
}

/**
 * Whether a sparring bout is still open to be shaken off: once time has
 * passed, or the Combat either duelist was in has ended, the bout is over
 * whether or not anybody won it (p188).
 * @param {DuelState|null} duel
 * @param {Set<string>|null} [among] Actor UUIDs, one of whom must be a duelist. Null for any bout.
 * @returns {boolean}
 */
export const sparringOpen = (duel, among = null) =>
	Boolean(duel?.sparring && !duel.ended && (!among || duel.duelists.some(({ uuid }) => among.has(uuid))));

/**
 * What sparring puts back as the duel ends (p188): GD and VIG lost since it
 * began, and Wounded if they weren't. Anything they've gained meanwhile, such
 * as GD back from a breather, is theirs to keep.
 * @param {DuelState} duel
 * @param {Record<string, DuelistScores>} now Each duelist's scores now, by UUID.
 * @returns {{uuid: string, from: DuelistScores, to: DuelistScores}[]} Those with anything
 *   to put back. None unless sparring.
 */
export function shakenOff(duel, now) {
	if (!duel?.sparring) return [];
	return duel.duelists.flatMap(({ uuid, start }) => {
		const from = now[uuid];
		if (!start || !from) return [];
		const to = {
			guard: Math.max(from.guard, start.guard),
			vigour: from.vigour === null || start.vigour === null ? from.vigour : Math.max(from.vigour, start.vigour),
			wounded: from.wounded && start.wounded
		};
		const changed = to.guard !== from.guard || to.vigour !== from.vigour || to.wounded !== from.wounded;
		return changed ? [{ uuid, from, to }] : [];
	});
}

/**
 * @param {DuelState} duel
 * @param {string} uuid
 * @returns {Duelist|null} The other duelist, or null when `uuid` isn't in the duel.
 */
export function opponentOf(duel, uuid) {
	const index = duel.duelists.findIndex((duelist) => duelist.uuid === uuid);
	return index < 0 ? null : duel.duelists[1 - index];
}

/**
 * @param {DuelState} duel As it stands (duelAsItStands).
 * @param {string} uuid
 * @returns {boolean} Whether this duelist still has to roll their Attack this exchange.
 */
export const awaitsAttack = (duel, uuid) => !duel.ended && duel.duelists.some((duelist) => duelist.uuid === uuid && !duelist.attack);

/**
 * @param {DuelState} duel As it stands (duelAsItStands).
 * @returns {boolean} Whether both Attacks are in, so they can be resolved together.
 */
export const readyToResolve = (duel) => !duel.ended && duel.duelists.every((duelist) => duelist.attack);

/**
 * Whether a duelist was knocked down in a sparring bout still going on, and so
 * can't fight on in it: the bout's Damage leaves nobody dying (p188), but down is down.
 * @param {DuelState|null} duel
 * @param {string} uuid
 * @returns {boolean}
 */
export const duelistDown = (duel, uuid) =>
	Boolean(duel?.sparring && !duel.ended && duel.duelists.some((duelist) => duelist.uuid === uuid && duelist.down));

/**
 * Whether a duelist rides in a joust, as both do (p10), whatever their own
 * mark says before they've rolled. A rider thrown in an earlier exchange
 * fights on afoot, as their mark then says.
 * @param {DuelState|null|undefined} duel
 * @param {boolean|undefined} mounted Their own Mounted mark, if they have one.
 * @returns {boolean} False for anything but a joust.
 */
export const ridesInJoust = (duel, mounted) => duel?.kind === "joust" && !duel.ended && !(duel.exchanges > 0 && mounted === false);

/**
 * Whether somebody counts as mounted for a blow: marked so, or a duelist
 * riding in this joust (ridesInJoust).
 * @param {{uuid: string, system?: {mounted?: boolean, conditions?: {mounted?: boolean}}}} actor
 * @param {DuelState|null|undefined} duel
 * @param {string|null} [token] The UUID of the Token targeted, which an unlinked duelist is known by too.
 * @returns {boolean}
 */
export function mountedNow(actor, duel, token = null) {
	if (actor.system?.conditions?.mounted) return true;
	const duelist = duel?.duelists?.some((each) => each.uuid === actor.uuid || (token !== null && each.token === token));
	return Boolean(duelist) && ridesInJoust(duel, actor.system?.mounted);
}

/**
 * Apply one change to a duel card, returning the new state, or null for a
 * change the duel doesn't allow.
 *
 * - `{type: "attack", actor, message}` records a duelist's Attack this exchange.
 * - `{type: "resolved"}` both Attacks were resolved, so the next exchange begins.
 * - `{type: "end", victor, closed}` ends the duel, with the victor's UUID or null for none. `closed`,
 *   `{name, reason}` with one of CLOSE_REASONS, says a duelist left the fight for good, with no victor.
 * - `{type: "forget", message}` an Attack card was deleted, so its duelist rolls again. Made on the
 *   duel as written, which still holds the card, where every other change is made on it as it stands.
 * - `{type: "down", actor}` a sparring duelist was knocked down, and is out of the bout.
 *
 * @param {DuelState} duel
 * @param {object} change
 * @returns {DuelState|null}
 */
export function changeDuel(duel, change) {
	if (!duel || duel.ended) return null;
	switch (change?.type) {
		case "attack": {
			if (!awaitsAttack(duel, change.actor) || typeof change.message !== "string" || !change.message) return null;
			return patchDuelists(duel, (duelist) => duelist.uuid === change.actor, { attack: change.message });
		}
		case "resolved":
			if (!readyToResolve(duel)) return null;
			return { ...patchDuelists(duel, always, { attack: null }), exchanges: duel.exchanges + 1 };
		case "end": {
			const victor = change.victor ?? null;
			if (victor !== null && !duel.duelists.some((duelist) => duelist.uuid === victor)) return null;
			if (!change.closed) return { ...duel, victor, ended: true };
			const { name, reason } = change.closed;
			if (victor !== null || typeof name !== "string" || !CLOSE_REASONS.includes(reason)) return null;
			return { ...duel, victor, ended: true, closed: { name, reason } };
		}
		case "forget": {
			if (!change.message || !duel.duelists.some((duelist) => duelist.attack === change.message)) return null;
			return patchDuelists(duel, (duelist) => duelist.attack === change.message, { attack: null });
		}
		case "down": {
			if (!duel.sparring || !duel.duelists.some((duelist) => duelist.uuid === change.actor && !duelist.down)) return null;
			return patchDuelists(duel, (duelist) => duelist.uuid === change.actor, { down: true });
		}
		default:
			return null;
	}
}

/**
 * The Glory that changes hands when a duel ends: only a Knight's moves, so a
 * Knight who beats somebody else gains 1, and one beaten by them loses 1.
 * @param {DuelState} duel
 * @param {string|null} victor
 * @returns {{uuid: string, amount: number}[]} Nothing without a stake or a victor, nor for sparring.
 */
export function stakeChanges(duel, victor) {
	const winner = duel.duelists.find((duelist) => duelist.uuid === victor);
	const loser = winner ? opponentOf(duel, victor) : null;
	if (!duel.stake || duel.sparring || !loser) return [];
	return [[winner, 1], [loser, -1]].filter(([duelist]) => duelist.knight !== false).map(([duelist, amount]) => ({ uuid: duelist.uuid, amount }));
}

/**
 * @param {{type: string, isSquire?: boolean}} actor
 * @returns {boolean} Whether they have Glory a stake can move: a Knight's, the Referee's own
 *   included, and not a Squire's, who isn't one yet.
 */
export const stakesGlory = (actor) => isKnight(actor) && !actor.isSquire;

/**
 * @param {{type: string, isSquire?: boolean}[]} actors Both duelists.
 * @returns {boolean} Whether Glory can be staked: by a Knight, against anybody willing (p6).
 */
export const canStakeGlory = (actors) => actors.length === 2 && actors.some(stakesGlory);

/**
 * Why somebody can't be one of a duel's two combatants (p10): a Warband is two
 * dozen fighting as one, and a ship or structure is no combatant at all.
 * Neither could be harmed by a duellist's blows (p11). Nor can the Slain, or
 * the Mortally Wounded, down and dying until patched up (p8).
 * @param {{type: string, system?: object}|null|undefined} actor
 * @returns {"warband"|"structure"|"slain"|"mortalWound"|null}
 */
export function duelRefusal(actor) {
	if (!actor) return null;
	if (actor.system?.scale === "warband") return "warband";
	if (actor.type === "structure" || actor.system?.structure) return "structure";
	return downBy(actor.system);
}
