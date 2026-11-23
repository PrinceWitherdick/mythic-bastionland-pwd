/**
 * Bringing the Company onto a Scene for a fight: who still has to be put on
 * it, and where each stands. Pure, so it can be tested without Foundry.
 */

/**
 * Where a row of Tokens stands: side by side, edge to edge, centred on a point.
 * A Token two grid spaces wide takes two spaces of the row, so a large Myth
 * creature doesn't stand on its neighbours.
 * @param {{x: number, y: number}} centre
 * @param {number[]} widths Each Token's width, in grid spaces, left to right.
 * @param {number} step A grid space.
 * @returns {{x: number, y: number}[]} Each Token's centre, left to right.
 */
export function musterRow(centre, widths, step) {
	const spans = widths.map((width) => (width > 0 ? width : 1) * step);
	let edge = centre.x - spans.reduce((sum, span) => sum + span, 0) / 2;
	return spans.map((span) => {
		const x = edge + span / 2;
		edge += span;
		return { x: Math.round(x), y: Math.round(centre.y) };
	});
}

/**
 * Those to add, to a Scene or a Combat: those given that aren't in it already.
 * @template {{id: string}} T
 * @param {T[]} given Actors to stand on a Scene, or Tokens to join a Combat.
 * @param {Iterable<string|null|undefined>} there The id of each already in it: each Token's Actor, or each combatant's Token.
 * @returns {T[]}
 */
export function absentFrom(given, there) {
	const inIt = new Set(there);
	return given.filter((item) => !inIt.has(item.id));
}
