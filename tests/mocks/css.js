// Reading the stylesheets in tests.

/**
 * The selectors a rule lists. The commas inside an `:is(…)` belong to the one
 * selector that holds it, so only the commas outside the brackets divide.
 * @param {string} selectors
 * @returns {string[]}
 */
export function split(selectors) {
	const each = [""];
	let depth = 0;
	for (const character of selectors) {
		if (character === "(") depth += 1;
		else if (character === ")") depth -= 1;
		if (character === "," && depth === 0) each.push("");
		else each[each.length - 1] += character;
	}
	return each;
}
