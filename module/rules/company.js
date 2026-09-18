/**
 * Where the Company stands on a Realm. The Seers who knighted the players
 * deemed that they travel as a Company (p7) — "While some of you may rest,
 * roam, or die, your collective journey will be as one" — so one Token on the
 * map stands for all of them, and where it begins follows the Start the
 * players chose for the Company (p6). Pure, so it can be tested without
 * Foundry.
 */
import { STARTS } from "./creation.js";
import { allHexes } from "./realm-geometry.js";
import { SYSTEM_PATH } from "../system-id.js";

/** The pennant the Company carries when the GM hasn't chosen a picture of their own. */
export const COMPANY_IMAGE = `${SYSTEM_PATH}/assets/company/pennant.svg`;

/** The Starts, in the book's order. Where the Company begins follows from which one they took. */
export const COMPANY_STARTS = Object.freeze(STARTS.map((start) => start.key));

/** Why the Company stands where it does, for the line that says so. */
export const COMPANY_PLACES = Object.freeze(["edge", "seat", "holding", "middle"]);

/**
 * The hexes around the rim of a Realm, which is where a Wanderer arrives from
 * outside it.
 * @param {object} g
 * @returns {{col: number, row: number}[]}
 */
export function edgeHexes(g) {
	return allHexes(g).filter(({ col, row }) => col === 1 || col === g.cols || row === 1 || row === g.rows);
}

/**
 * The middle of the map, for a Realm with nothing to stand on.
 * @param {object} g
 * @returns {{col: number, row: number}}
 */
export const middleHex = (g) => ({ col: Math.ceil(g.cols / 2), row: Math.ceil(g.rows / 2) });

/**
 * Where the Company begins, by the Start the players chose (p6).
 *
 * A **Wanderer** arrives in the Realm, so they come in over the edge. A
 * **Courtier** has a place in Court at the Seat of Power. A **Ruler** holds a
 * Holding of their own, and the Seat is under a wicked influence, so they
 * begin anywhere but there.
 *
 * Each falls back on the next best thing rather than on nothing: a Realm whose
 * Seat has been taken off the map still has Holdings, and one with no Holdings
 * at all still has a middle.
 *
 * @param {object} realm
 * @param {object} g
 * @param {string} start One of COMPANY_STARTS.
 * @param {ReturnType<import("./random.js").createRandom>} random
 * @returns {{hex: {col: number, row: number}, place: string}} `place` is one of COMPANY_PLACES.
 */
export function companyStart(realm, g, start, random) {
	const holdings = realm?.holdings ?? [];
	const seat = holdings.find((holding) => holding.seat) ?? null;

	if (start === "wanderer") {
		const rim = edgeHexes(g);
		const hex = random.pick(rim);
		if (hex) return { hex, place: "edge" };
	}

	if (start === "ruler") {
		const own = random.pick(holdings.filter((holding) => !holding.seat));
		if (own) return { hex: own.hex, place: "holding" };
	}

	if (seat) return { hex: seat.hex, place: "seat" };

	const any = random.pick(holdings);
	if (any) return { hex: any.hex, place: "holding" };

	return { hex: middleHex(g), place: "middle" };
}
