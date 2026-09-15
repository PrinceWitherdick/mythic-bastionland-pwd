/**
 * A seeded source of random numbers, so the same seed always rolls the same
 * Realm and a GM can share or rebuild one. Pure, so generation can be tested
 * without Foundry.
 */

/** Letters for seeds, without ones easily misread for each other. */
const SEED_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export const SEED_LENGTH = 6;

/**
 * @param {string} seed
 * @returns {number} A 32-bit hash of the seed.
 */
function hashSeed(seed) {
	let hash = 2166136261;
	for (const char of String(seed)) {
		hash ^= char.codePointAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

/**
 * @param {string|number} seed
 * @returns {Readonly<{
 *   float: () => number,
 *   die: (faces: number) => number,
 *   pick: <T>(list: T[]) => T|undefined,
 *   shuffle: <T>(list: T[]) => T[],
 *   weighted: <T>(list: T[], weightOf: (item: T) => number) => T|undefined
 * }>} `float` is in [0, 1). `weighted` never picks an item weighing 0 or less.
 */
export function createRandom(seed) {
	let state = hashSeed(seed) | 0;

	// Mulberry32: small, fast, and plenty for placing things on a map.
	const float = () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const below = (count) => Math.floor(float() * count);

	return Object.freeze({
		float,
		die: (faces) => below(faces) + 1,
		pick: (list) => (list.length ? list[below(list.length)] : undefined),
		shuffle(list) {
			const copy = [...list];
			for (let index = copy.length - 1; index > 0; index--) {
				const swap = below(index + 1);
				[copy[index], copy[swap]] = [copy[swap], copy[index]];
			}
			return copy;
		},
		weighted(list, weightOf) {
			const weights = list.map((item) => Math.max(0, Number(weightOf(item)) || 0));
			const total = weights.reduce((sum, weight) => sum + weight, 0);
			if (!(total > 0)) return undefined;
			let roll = float() * total;
			for (const [index, weight] of weights.entries()) {
				if (weight <= 0) continue;
				roll -= weight;
				if (roll < 0) return list[index];
			}
			return list[weights.findLastIndex((weight) => weight > 0)];
		}
	});
}

/**
 * A fresh seed to show the GM.
 * @param {() => number} [source] Numbers in [0, 1).
 * @returns {string}
 */
export function randomSeed(source = Math.random) {
	return Array.from({ length: SEED_LENGTH }, () => SEED_ALPHABET[Math.floor(source() * SEED_ALPHABET.length)]).join("");
}
