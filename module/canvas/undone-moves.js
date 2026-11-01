/**
 * Which move an Undo takes back. Foundry's Undo (Ctrl+Z) puts a Token back
 * where its last move set off from, as a new move of its own with a new id, and
 * outside a started combat Foundry keeps no history of moves to compare
 * against. So the Token layer's Undo history names the move each entry takes
 * back, by Token id, in an update option that rides along with the Undo.
 */

/** The update option naming, by Token id, the id of the move an Undo takes back. */
export const UNDOES_MOVE = "bastionlandUndoesMove";

/**
 * @param {TokenDocument} token
 * @param {object} [operation] The update that moved it, from the `moveToken` hook.
 * @returns {string|null} The id of the move this Undo takes back, where it's known.
 */
export function undoneMove(token, operation) {
	const id = operation?.[UNDOES_MOVE]?.[token?.id];
	return typeof id === "string" && id ? id : null;
}

/**
 * Have the Token layer's Undo history name the move each entry takes back.
 * Called during init, before the canvas is made.
 */
export function nameUndoneMoves() {
	const tokens = globalThis.CONFIG?.Canvas?.layers?.tokens;
	if (!tokens?.layerClass) return;
	tokens.layerClass = class extends tokens.layerClass {
		/** @inheritDoc */
		storeHistory(type, data, options) {
			const before = this.history.at(-1);
			super.storeHistory(type, data, options);
			const entry = this.history.at(-1);
			if (type !== "update" || entry === before || !options?._movement) return;
			const moves = Object.fromEntries(entry.data.map(({ _id }) => [_id, options._movement[_id]?.id]).filter(([, id]) => id));
			if (Object.keys(moves).length) entry.options[UNDOES_MOVE] = moves;
		}
	};
}
