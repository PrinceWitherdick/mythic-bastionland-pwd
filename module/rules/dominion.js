/**
 * Dominion (p20) and Authority (p21): ruling a Holding as a Domain, with a
 * Council, Crises that last until resolved, misrule when too many pile up,
 * and a change of ruler by succession or by conquest.
 * The Crisis Roll, Increased Collections and Drama in Court read 1 as the
 * worst, 2-3 as middling and 4-6 as the best, like the Referee's other tables.
 * Wording lives in the language file under `bastionland.domain`. Pure, so it
 * can be tested without Foundry.
 */
import { sameHex } from "./realm-geometry.js";
import { d6Band } from "./referee-rolls.js";
import { seasonKey } from "./time.js";

/** Seats on a Domain's Council. */
export const COUNCIL_SEATS = Object.freeze(["steward", "marshal", "sheriff", "envoy", "circle"]);

/**
 * The seats a Domain runs badly without (p20). The
 * Circle is an honour a ruler may offer visiting Knights, so it may stand empty.
 */
export const SEATS_TO_FILL = Object.freeze(COUNCIL_SEATS.filter((seat) => seat !== "circle"));

/**
 * The seats a Domain's Council has nobody in, which the Referee warns invite
 * trouble (p204).
 * @param {Record<string, string>|null|undefined} council As stored, by seat.
 * @returns {string[]} Of SEATS_TO_FILL, in the book's order.
 */
export const emptySeats = (council) => SEATS_TO_FILL.filter((seat) => !String(council?.[seat] ?? "").trim());

/** The Crises, in the order a d6 rolls them. */
export const CRISES = Object.freeze(["chaos", "debt", "famine", "misery", "panic", "doubt"]);

export const CRISIS_RESULTS = Object.freeze(["calamity", "dilemma", "prosperity"]);
export const COLLECTION_RESULTS = Object.freeze(["misrule", "crisis", "willing"]);
export const DRAMA_RESULTS = Object.freeze(["personal", "association", "uninvolved"]);

/** A Season ending with this many unresolved Crises sends the Domain into misrule. */
const MISRULE_CRISES = 3;

/** Warbands a Seat of Power musters, and any other Holding. */
const MUSTER =Object.freeze({ seat: 3, holding: 2 });

/** @param {number} d6 */
export const crisisResult = (d6) => CRISIS_RESULTS[d6Band(d6)];

/** @param {number} d6 */
export const collectionsResult = (d6) => COLLECTION_RESULTS[d6Band(d6)];

/** @param {number} d6 */
export const dramaResult = (d6) => DRAMA_RESULTS[d6Band(d6)];

/**
 * @param {string} result One of CRISIS_RESULTS.
 * @returns {number} Crises drawn: a Calamity brings 2, a Dilemma offers 2 to choose between.
 */
export const crisesDrawn = (result) => (result === "prosperity" ? 0 : 2);

/**
 * The Crisis a d6 names. One the Domain already faces, or that was just drawn,
 * passes to the next down the list, so a roll brings a new Crisis while any are left.
 * @param {number} d6
 * @param {string[]} [taken]
 * @returns {string|null} Null when every Crisis is taken.
 */
export function crisisFor(d6, taken = []) {
	for (let step = 0; step < CRISES.length; step++) {
		const key = CRISES[(d6 - 1 + step) % CRISES.length];
		if (!taken.includes(key)) return key;
	}
	return null;
}

/**
 * @param {string[]} crises Those a Domain faces.
 * @returns {boolean} Whether ending the Season now sends it into misrule.
 */
export const isMisruleDue = (crises) => crises.length >= MISRULE_CRISES;

/**
 * @param {boolean} seat Whether the Holding is the Seat of Power.
 * @returns {number} Warbands it can muster.
 */
export const musterFor = (seat) => (seat ? MUSTER.seat : MUSTER.holding);

/**
 * A Holding taken by force and not contested is in turmoil for a while before
 * it settles under its new ruler (Conquest, p21). Here that lasts until the
 * Season it was seized in is over.
 * @param {string} seized The Season it was seized in, from seasonKey, or blank.
 * @param {string} now    This Season, from seasonKey.
 * @returns {boolean}
 */
export const isInTurmoil = (seized, now) => Boolean(seized) && seized === now;

/**
 * Whether a Domain has made this Season's Crisis Roll (p20).
 * @param {{system: {crisisRolled?: string}}} domain
 * @param {import("./time.js").Calendar} calendar Now.
 * @returns {boolean}
 */
export const crisisRolledThisSeason = (domain, calendar) => domain?.system?.crisisRolled === seasonKey(calendar);

/**
 * Whether a Domain has rolled this Season's Drama in Court: "every Season
 * brings some drama" (p21).
 * @param {{system: {dramaRolled?: string}}} domain
 * @param {import("./time.js").Calendar} calendar Now.
 * @returns {boolean}
 */
export const dramaRolledThisSeason = (domain, calendar) => domain?.system?.dramaRolled === seasonKey(calendar);

/**
 * @param {string} text
 * @returns {string} A name, compared without case or surrounding space.
 */
const nameKey = (text) => String(text ?? "").trim().toLocaleLowerCase();

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean} Whether both are the same name, ignoring case and surrounding space. Blanks never match.
 */
export const isSameName = (a, b) => Boolean(nameKey(a)) && nameKey(a) === nameKey(b);

/**
 * @template {{system: {ruler: string}}} T
 * @param {T[]} domains
 * @param {string} name A Knight's name.
 * @returns {T|null} The first Domain whose ruler is written as that name.
 */
export function domainRuledBy(domains, name) {
	const key = nameKey(name);
	return key ? domains.find((domain) => nameKey(domain.system.ruler) === key) ?? null : null;
}

/* -------------------------------------------- */
/*  A long absence                              */
/* -------------------------------------------- */

/**
 * @param {string} sceneId
 * @param {string} holdingId The Holding's Tile id.
 * @returns {string} How a Domain names the Holding it rules: the Tile's uuid.
 */
export const holdingRef = (sceneId, holdingId) => `Scene.${sceneId}.Tile.${holdingId}`;

/**
 * @param {string} ref From holdingRef.
 * @returns {{sceneId: string, holdingId: string}|null} Null for anything else.
 */
export function parseHoldingRef(ref) {
	const match = /^Scene\.([^.]+)\.Tile\.([^.]+)$/.exec(String(ref ?? ""));
	return match ? { sceneId: match[1], holdingId: match[2] } : null;
}

/**
 * @typedef {object} RealmHoldings
 * @property {string} sceneId
 * @property {{id: string|null, hex: {col: number, row: number}, name: string, style: string, seat: boolean}[]} holdings
 */

/**
 * The Holding a Domain rules: the one it was given, or else the one Holding
 * that bears its name.
 * @param {RealmHoldings[]} realms Every Realm's Holdings.
 * @param {{name: string, system: {holding?: string}}} domain
 * @returns {{sceneId: string, holding: object}|null}
 */
export function findDomainHolding(realms, domain) {
	const ref = parseHoldingRef(domain.system.holding);
	if (ref) {
		const holding = realms.find((realm) => realm.sceneId === ref.sceneId)?.holdings.find((each) => each.id === ref.holdingId);
		return holding ? { sceneId: ref.sceneId, holding } : null;
	}
	const named = realms.flatMap((realm) => realm.holdings.filter((holding) => holding.id && isSameName(holding.name, domain.name)).map((holding) => ({ sceneId: realm.sceneId, holding })));
	// Two Holdings of one name can't tell which is meant.
	return named.length === 1 ? named[0] : null;
}

/**
 * Whether time passing leaves a Domain's ruler away long enough that
 * "returning from a long absence" brings the Crisis Roll (p20): Weeks or a
 * Season passed while the Company was somewhere other than the Holding.
 * @param {{col: number, row: number}} home The Holding's hex.
 * @param {{col: number, row: number}|null} company Where the Company stands on that Realm, null when it isn't there.
 * @returns {boolean}
 */
export const awayFromHome = (home, company) => !sameHex(home, company);

/**
 * @param {{col: number, row: number}} home The Holding's hex.
 * @param {{col: number, row: number}[]} entered The hexes a move came into.
 * @returns {boolean} Whether the move brought the Company home.
 */
export const cameHome = (home, entered) => entered.some((hex) => sameHex(hex, home));
