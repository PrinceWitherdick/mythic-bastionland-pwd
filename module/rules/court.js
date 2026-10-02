/**
 * The Court (p20): everyone serving a Domain but not on its Council. Retainers
 * work for one Council member, Courtiers hold small offices or honours and want
 * more, Petitioners come in from outside asking for help or judgement, and
 * Seers call now and then, or send someone in their place.
 *
 * Courtly Conflict (p21) makes Courtiers trouble, the worst of it coming from
 * those with some hold over the ruler, so every member may have leverage
 * written against them and
 * Drama in Court falls to the Courtiers first. Kept by an id in an object, as
 * the Season log is, so the sheet can write one member's line at a time. Pure,
 * so it can be tested without Foundry.
 */
import { COUNCIL_SEATS, SEATS_TO_FILL, isSameName } from "./dominion.js";
import { trimmedText } from "./text.js";

/** Who serves outside the Council, in the order the book lists them. */
export const COURT_ROLES = Object.freeze(["retainer", "courtier", "petitioner", "seer"]);

/** Only a Retainer is taken on by a Council member, so only they name a seat. */
export const SERVES_A_SEAT = "retainer";

/**
 * The seats a ruler grants to somebody of their own household, picked from the
 * Court's Retainers. The Circle is left out: it's for visiting Knights (p20).
 */
export const RETAINER_SEATS = SEATS_TO_FILL;

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

/**
 * Who holds one of the Retainers' seats. A seat holds the id of a member of
 * the Court; a Domain from before seats were filled from the Court may still
 * hold a name written in by hand, which is given back as it is.
 * @param {Record<string, unknown>|null|undefined} council As stored, by seat.
 * @param {unknown} court As stored.
 * @param {string} seat One of RETAINER_SEATS.
 * @returns {{id: string, name: string, legacy: boolean}|null} Null for a seat nobody holds.
 */
export function seatHolder(council, court, seat) {
	const value = String(council?.[seat] ?? "").trim();
	if (!value) return null;
	const member = normalizeCourt(court)[value];
	return member ? { id: value, name: member.name, legacy: false } : { id: "", name: value, legacy: true };
}

/**
 * @param {Record<string, unknown>|null|undefined} council As stored, by seat.
 * @param {string} id A member of the Court.
 * @returns {string} The seat they hold, one of RETAINER_SEATS, or blank.
 */
export const seatOf = (council, id) => (id && RETAINER_SEATS.find((seat) => council?.[seat] === id)) || "";

/**
 * The Retainers a seat may be granted to: every named Retainer not already
 * holding another seat, with whoever holds this one marked.
 * @param {Record<string, unknown>|null|undefined} council As stored, by seat.
 * @param {unknown} court As stored.
 * @param {string} seat One of RETAINER_SEATS.
 * @returns {{id: string, name: string, selected: boolean}[]} In the Court's order.
 */
export function retainerChoices(council, court, seat) {
	return courtMembers(court)
		.filter((member) => member.role === SERVES_A_SEAT && member.name)
		.filter((member) => [seat, ""].includes(seatOf(council, member.id)))
		.map((member) => ({ id: member.id, name: member.name, selected: council?.[seat] === member.id }));
}

/**
 * The Circle as a list. It holds the ids of the Knights sitting in it; a
 * Domain from before then held their names, run together with commas.
 * @param {unknown} circle As stored.
 * @returns {string[]}
 */
export function circleEntries(circle) {
	const entries = Array.isArray(circle) ? circle : String(circle ?? "").split(",");
	return entries.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

/**
 * @param {string} entry From the Circle.
 * @returns {boolean} Whether it is shaped like a document's id rather than a name.
 */
const looksLikeId = (entry) => /^[a-zA-Z0-9]{16}$/.test(entry);

/**
 * The Knights sitting in the Circle, each found by id or else by a name only
 * one Knight goes by. A name no Knight answers to is kept as it was written;
 * the id of a Knight who is gone is left out.
 * @param {unknown} circle As stored.
 * @param {{id: string, name: string}[]} knights The world's Knights.
 * @returns {{id: string, name: string, legacy: boolean}[]} Without anybody twice.
 */
export function circleKnights(circle, knights) {
	const seated = new Map();
	for (const entry of circleEntries(circle)) {
		const named = knights.filter((knight) => isSameName(knight.name, entry));
		const knight = knights.find((each) => each.id === entry) ?? (named.length === 1 ? named[0] : null);
		if (!knight && looksLikeId(entry)) continue;
		const key = knight ? knight.id : `name:${entry}`;
		if (!seated.has(key)) seated.set(key, knight ? { id: knight.id, name: knight.name, legacy: false } : { id: "", name: entry, legacy: true });
	}
	return [...seated.values()];
}

/**
 * Who sits in a Council seat: the Retainer from the Court holding it, or the
 * Knights sitting in the Circle.
 * @param {{council?: object, court?: unknown}|null|undefined} system The Domain's, as stored.
 * @param {string} seat One of COUNCIL_SEATS.
 * @param {{id: string, name: string}[]} knights The world's Knights.
 * @returns {{id: string, name: string, legacy: boolean}[]} Empty where nobody does.
 */
export function seatHolders(system, seat, knights) {
	if (!RETAINER_SEATS.includes(seat)) return circleKnights(system?.council?.circle, knights);
	const holder = seatHolder(system?.council, system?.court, seat);
	return holder ? [holder] : [];
}

/**
 * What an older Domain needs to have its Council filled from the Court: each
 * name written into a Retainer's seat becomes a Retainer (or finds the one
 * already going by it), and each name in the Circle becomes its Knight's id.
 * @param {{council?: object, court?: unknown}} system As stored.
 * @param {{id: string, name: string}[]} knights The world's Knights.
 * @param {() => string} makeId Gives a new id.
 * @param {number} now When they joined the Court, usually Date.now().
 * @returns {Record<string, unknown>} The update to make, empty where there's nothing to do.
 */
export function councilSeatPlan(system, knights, makeId, now) {
	const council = system?.council ?? {};
	const court = normalizeCourt(system?.court);
	const updates = {};
	const seated = new Set(RETAINER_SEATS.map((seat) => council[seat]).filter((id) => court[id]));

	RETAINER_SEATS.forEach((seat, index) => {
		const holder = seatHolder(council, court, seat);
		if (!holder?.legacy) return;
		const found = Object.entries(court).find(([id, member]) => member.role === SERVES_A_SEAT && !seated.has(id) && isSameName(member.name, holder.name));
		const id = found?.[0] ?? makeId();
		if (!found) updates[`system.court.${id}`] = { ...newCourtMember(SERVES_A_SEAT, now + index), name: holder.name };
		seated.add(id);
		updates[`system.council.${seat}`] = id;
	});

	const before = circleEntries(council.circle);
	const after = circleKnights(before, knights).map((knight) => (knight.legacy ? knight.name : knight.id));
	const changed = after.length !== before.length || after.some((entry, index) => entry !== before[index]);
	if (changed || !Array.isArray(council.circle)) updates["system.council.circle"] = after;
	return updates;
}
