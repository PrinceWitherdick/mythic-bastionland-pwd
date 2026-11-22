/**
 * Bringing the Company onto a Scene for a fight: who still has to be put on
 * it, and where each stands. Pure, so it can be tested without Foundry.
 */

/**
 * Those of the Company with no Token on the Scene yet. The Slain stay where they fell.
 * @param {{id: string, slain?: boolean}[]} company
 * @param {Iterable<string|null|undefined>} onScene The Actor id of each Token already on the Scene.
 * @returns {{id: string}[]}
 */
export function absentFrom(company, onScene) {
	const here = new Set(onScene);
	return company.filter((member) => !member.slain && !here.has(member.id));
}

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
 * The Tokens to add to a Combat: those given that aren't in it already.
 * @param {{id: string}[]} tokens
 * @param {Iterable<string|null|undefined>} fighting The Token id of each combatant.
 * @returns {{id: string}[]}
 */
export function notYetFighting(tokens, fighting) {
	const inIt = new Set(fighting);
	return tokens.filter((token) => !inIt.has(token.id));
}
