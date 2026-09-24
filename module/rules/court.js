/**
 * The Court (p20): those who serve a Domain outside its Council. Retainers are
 * Vassals taken on by individual Council members, Courtiers are commoners with
 * lesser responsibilities or ceremonial honours who usually hold higher
 * ambitions, Petitioners come from outside the Court for aid, counsel or
 * justice, and Seers visit from their Sanctums or send acolytes in their stead.
 *
 * Courtly Conflict (p21) says Courtiers breed problems, "especially when they
 * hold leverage over their ruler, whether family influence, dark secrets, or
 * military might", so every member may have leverage written against them and
 * Drama in Court falls to the Courtiers first. Kept by an id in an object, as
 * the Season log is, so the sheet can write one member's line at a time. Pure,
 * so it can be tested without Foundry.
 */
import { COUNCIL_SEATS } from "./dominion.js";
import { trimmedText } from "./text.js";

/** Who serves outside the Council, in the order the book lists them. */
export const COURT_ROLES = Object.freeze(["retainer", "courtier", "petitioner", "seer"]);

/** Only a Retainer is taken on by a Council member, so only they name a seat. */
export const SERVES_A_SEAT = "retainer";

/** Drama in Court falls to the Courtiers, who the book says breed the problems. */
export const DRAMA_ROLE = "courtier";

/**
 * @typedef {object} CourtMember
 * @property {string} role      One of COURT_ROLES.
 * @property {string} name      Written as the GM likes, and may be left blank while they think.
 * @property {string} seat      The Council seat a Retainer serves, one of COUNCIL_SEATS or blank.
 * @property {string} leverage  What hold they have over the ruler, if any (p21).
 * @property {string} note      Anything else about them.
 * @property {number} at        When they joined the Court, to keep the list in the order it was written.
 */

/**
 * @param {unknown} raw As stored.
 * @returns {CourtMember|null} Null for anything that isn't a member of the Court.
 */
export function normalizeCourtMember(raw) {
	if (!raw || typeof raw !== "object" || !COURT_ROLES.includes(raw.role)) return null;
	const seat = raw.role === SERVES_A_SEAT && COUNCIL_SEATS.includes(raw.seat) ? raw.seat : "";
	return {
		role: raw.role,
		name: trimmedText(raw.name),
		seat,
		leverage: trimmedText(raw.leverage),
		note: trimmedText(raw.note),
		at: Number.isFinite(raw.at) ? raw.at : 0
	};
}

/**
 * The whole Court from whatever is stored, however old or bad.
 * @param {unknown} raw
 * @returns {Record<string, CourtMember>} By id.
 */
export function normalizeCourt(raw) {
	if (!raw || typeof raw !== "object") return {};
	const court = {};
	for (const [id, value] of Object.entries(raw)) {
		const member = normalizeCourtMember(value);
		if (member) court[id] = member;
	}
	return court;
}

/**
 * The Court as a list: by role in the order the book gives them, and within a
 * role in the order they were written, so a row doesn't move as it's typed into.
 * @param {unknown} court As stored.
 * @returns {(CourtMember & {id: string})[]}
 */
export function courtMembers(court) {
	return Object.entries(normalizeCourt(court))
		.map(([id, member]) => ({ id, ...member }))
		.sort((a, b) => COURT_ROLES.indexOf(a.role) - COURT_ROLES.indexOf(b.role) || a.at - b.at || a.id.localeCompare(b.id));
}

/**
 * The Court grouped for the sheet: every role, in book order, even one nobody fills.
 * @param {unknown} court As stored.
 * @returns {{role: string, members: (CourtMember & {id: string})[]}[]}
 */
export function courtByRole(court) {
	const members = courtMembers(court);
	return COURT_ROLES.map((role) => ({ role, members: members.filter((member) => member.role === role) }));
}

/**
 * @param {unknown} court As stored.
 * @returns {number} How many serve in the Court.
 */
export const courtSize = (court) => Object.keys(normalizeCourt(court)).length;

/**
 * Somebody new to the Court, ready to store.
 * @param {string} role One of COURT_ROLES.
 * @param {number} at   When they joined, usually Date.now().
 * @returns {CourtMember|null} Null for a role that isn't the Court's.
 */
export function newCourtMember(role, at) {
	return normalizeCourtMember({ role, name: "", seat: "", leverage: "", note: "", at });
}

/**
 * Who this Season's drama falls to (p21): a Courtier, since the book says they
 * breed the problems, or anybody in the Court where none serve.
 * @param {unknown} court As stored.
 * @returns {(CourtMember & {id: string})[]} Empty for an empty Court, or one where nobody is named.
 */
export function dramaCandidates(court) {
	const named = courtMembers(court).filter((member) => member.name);
	const courtiers = named.filter((member) => member.role === DRAMA_ROLE);
	return courtiers.length ? courtiers : named;
}
