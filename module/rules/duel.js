/**
 * Duels & Jousts (Specifics of Combat, p10). Two combatants mutually agree to
 * a duel, or a joust if mounted. They fight as normal, but their Attacks are
 * rolled and resolved simultaneously, including the effects of Gambits, and
 * both can use Feats before the Attacks are resolved. In a public duel or
 * joust, Knights may stake Glory: the victor gains 1, the loser loses 1 (p6).
 * Scars only come from real, deadly combat, not training or bloodless duels (p9).
 * Pure, so a duel card's state can be tested without Foundry.
 */

export const DUEL_KINDS = Object.freeze(["duel", "joust"]);

/**
 * @typedef {object} Duelist
 * @property {string} uuid        Actor UUID.
 * @property {string} name
 * @property {string|null} token  Token document UUID, which the other's Attack targets.
 * @property {string|null} attack Chat message id of their Attack this exchange.
 *
 * @typedef {object} DuelState What a duel card remembers between clicks.
 * @property {string} kind         One of DUEL_KINDS.
 * @property {boolean} stake       Glory is staked on the outcome.
 * @property {boolean} bloodless   A bout that leaves no Scars.
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
 * @param {{uuid: string, name: string, token?: string|null}[]} args.duelists
 * @returns {DuelState|null} Null without two different duelists.
 */
export function createDuel({ kind = DUEL_KINDS[0], stake = false, bloodless = false, duelists }) {
	if (duelists?.length !== 2 || duelists[0].uuid === duelists[1].uuid) return null;
	return {
		kind: DUEL_KINDS.includes(kind) ? kind : DUEL_KINDS[0],
		stake: Boolean(stake),
		bloodless: Boolean(bloodless),
		duelists: duelists.map(({ uuid, name, token = null }) => ({ uuid, name, token, attack: null })),
		exchanges: 0,
		victor: null,
		ended: false
	};
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
