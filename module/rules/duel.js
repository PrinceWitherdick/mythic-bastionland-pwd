/**
 * Duels & Jousts (Specifics of Combat, p10). Two combatants agree to fight, a
 * joust if they're mounted. It goes as any fight does, except both Attacks,
 * Gambits and all, are rolled and settled at once, and either may use Feats
 * first. Fought in public, Glory may be staked on it: the winner gains 1 and
 * the loser loses 1 (p6). Only a real fight to the death gives Scars (p9).
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
 *
 * @typedef {object} DuelState What a duel card remembers between clicks.
 * @property {string} kind         One of DUEL_KINDS.
 * @property {boolean} stake       Glory is staked on the outcome.
 * @property {boolean} bloodless   A bout that leaves no Scars.
 * @property {boolean} sparring    A practice bout, whose Damage is shaken off afterwards. Always bloodless.
 * @property {Duelist[]} duelists  Always two.
 * @property {number} exchanges    How many pairs of Attacks have been resolved.
 * @property {string|null} victor  The victor's UUID once over, or null.
 * @property {boolean} ended
 */

/**
 * @param {object} args
 * @param {string} [args.kind]
 * @param {boolean} [args.stake]
 * @param {boolean} [args.bloodless]
 * @param {boolean} [args.sparring]
 * @param {{uuid: string, name: string, token?: string|null, scores?: DuelistScores}[]} args.duelists
 *   `scores` are what they start on, kept for sparring.
 * @returns {DuelState|null} Null without two different duelists.
 */
export function createDuel({ kind = DUEL_KINDS[0], stake = false, bloodless = false, sparring = false, duelists }) {
	if (duelists?.length !== 2 || duelists[0].uuid === duelists[1].uuid) return null;
	return {
		kind: DUEL_KINDS.includes(kind) ? kind : DUEL_KINDS[0],
		stake: Boolean(stake),
		// A blow shaken off afterwards leaves no Scar either.
		bloodless: Boolean(bloodless) || Boolean(sparring),
		sparring: Boolean(sparring),
		duelists: duelists.map(({ uuid, name, token = null, scores = null }) => ({
			uuid,
			name,
			token,
			attack: null,
			start: sparring && scores ? startingScores(scores) : null
		})),
		exchanges: 0,
		victor: null,
		ended: false
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
 * @param {DuelState} duel
 * @param {string} uuid
 * @returns {boolean} Whether this duelist still has to roll their Attack this exchange.
 */
export const awaitsAttack = (duel, uuid) => !duel.ended && duel.duelists.some((duelist) => duelist.uuid === uuid && !duelist.attack);

/**
 * @param {DuelState} duel
 * @returns {boolean} Whether both Attacks are in, so they can be resolved together.
 */
export const readyToResolve = (duel) => !duel.ended && duel.duelists.every((duelist) => duelist.attack);

/**
 * Apply one change to a duel card, returning the new state, or null for a
 * change the duel doesn't allow.
 *
 * - `{type: "attack", actor, message}` records a duelist's Attack this exchange.
 * - `{type: "resolved"}` both Attacks were resolved, so the next exchange begins.
 * - `{type: "end", victor}` ends the duel, with the victor's UUID or null for none.
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
			return {
				...duel,
				duelists: duel.duelists.map((duelist) => (duelist.uuid === change.actor ? { ...duelist, attack: change.message } : duelist))
			};
		}
		case "resolved":
			if (!readyToResolve(duel)) return null;
			return { ...duel, duelists: duel.duelists.map((duelist) => ({ ...duelist, attack: null })), exchanges: duel.exchanges + 1 };
		case "end": {
			const victor = change.victor ?? null;
			if (victor !== null && !duel.duelists.some((duelist) => duelist.uuid === victor)) return null;
			return { ...duel, victor, ended: true };
		}
		default:
			return null;
	}
}

/**
 * The Glory that changes hands when a duel ends.
 * @param {DuelState} duel
 * @param {string|null} victor
 * @returns {{uuid: string, amount: number}[]} Nothing without a stake or a victor.
 */
export function stakeChanges(duel, victor) {
	const loser = victor ? opponentOf(duel, victor) : null;
	if (!duel.stake || !loser) return [];
	return [{ uuid: victor, amount: 1 }, { uuid: loser.uuid, amount: -1 }];
}

/**
 * @param {{type: string, isSquire?: boolean}[]} actors Both duelists.
 * @returns {boolean} Whether Glory can be staked: only Knights may, and a Squire isn't one yet.
 */
export const canStakeGlory = (actors) => actors.length === 2 && actors.every((actor) => actor.type === "knight" && !actor.isSquire);
