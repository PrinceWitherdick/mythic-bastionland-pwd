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
import { COUNCIL_SEATS, SEATS_TO_FILL, canHoldPost, isSameName } from "./dominion.js";
import { unworthyOf } from "./glory.js";
import { isCompanyKnight } from "./knight-types.js";
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
 * @property {string} knight    The id of the Knight they are, where they were seated as one; blank for
 *   somebody written in by hand, who is matched to a Knight by name.
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
		at: Number.isFinite(raw.at) ? raw.at : 0,
		knight: typeof raw.knight === "string" ? raw.knight : ""
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
	return normalizeCourtMember({ role, name: "", seat: "", leverage: "", note: "", at, knight: "" });
}

/**
 * Who this Season's drama falls to (p21): a Courtier, since the book says they
 * breed the problems, or anybody in the Court where none serve. Never one of
 * the Company's Knights, who are the players' to play, though a Courtier
 * Start seats them as Courtiers (p6).
 * @param {unknown} court As stored.
 * @param {{id: string, name: string, type?: string}[]} [knights] The world's Knights, to know the Company's among the Court.
 * @returns {(CourtMember & {id: string})[]} Empty for an empty Court, or one where nobody is named.
 */
export function dramaCandidates(court, knights = []) {
	const named = courtMembers(court).filter((member) => member.name && !isCompanyKnight(courtKnight(member, knights)));
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
 * @template {{name: string}} T
 * @param {T[]} knights
 * @param {string} name
 * @returns {T|null} The one Knight going by the name, or null where none does or several do.
 */
function soleNamed(knights, name) {
	const named = knights.filter((knight) => isSameName(knight.name, name));
	return named.length === 1 ? named[0] : null;
}

/**
 * The Knight somebody of the Court is: the one they were seated as, by id, so
 * a Knight renamed since is still known; or else the one Knight going by their name.
 * @template {{id: string, name: string}} T
 * @param {{name: string, knight?: string}} member
 * @param {T[]} knights
 * @returns {T|null}
 */
export function courtKnight(member, knights) {
	return (member.knight && knights.find((knight) => knight.id === member.knight)) || soleNamed(knights, member.name);
}

/**
 * @template {{id: string, name: string}} T
 * @param {string} entry One of the Circle's, an id or a name written in by hand.
 * @param {T[]} knights
 * @returns {T|null} The Knight it is.
 */
const circleEntryKnight = (entry, knights) => knights.find((each) => each.id === entry) ?? soleNamed(knights, entry);

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
		const knight = circleEntryKnight(entry, knights);
		if (!knight && looksLikeId(entry)) continue;
		const key = knight ? knight.id : `name:${entry}`;
		if (!seated.has(key)) seated.set(key, knight ? { id: knight.id, name: knight.name, legacy: false } : { id: "", name: entry, legacy: true });
	}
	return [...seated.values()];
}

/**
 * Who sits in a Council seat: the Retainer from the Court holding it, or the
 * Knights sitting in the Circle. Each says which Knight they are, if any: a
 * Knight of the Circle is their own, and a Retainer is the Knight their place
 * in the Court is (courtKnight), since Knights take Retainers' seats too.
 * @param {{council?: object, court?: unknown}|null|undefined} system The Domain's, as stored.
 * @param {string} seat One of COUNCIL_SEATS.
 * @param {{id: string, name: string}[]} knights The world's Knights.
 * @returns {{id: string, name: string, legacy: boolean, knight: string}[]} Empty where nobody does. `id` is
 *   the Knight's for the Circle, the place in the Court's for a Retainer; `knight` is blank for somebody who is no Knight.
 */
export function seatHolders(system, seat, knights) {
	if (!RETAINER_SEATS.includes(seat)) return circleKnights(system?.council?.circle, knights).map((held) => ({ ...held, knight: held.id }));
	const court = normalizeCourt(system?.court);
	const holder = seatHolder(system?.council, court, seat);
	if (!holder) return [];
	const knight = holder.legacy ? null : courtKnight(court[holder.id], knights);
	return [{ ...holder, knight: knight?.id ?? "" }];
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

/** The Court's roles that are posts a Knight holds, as a Courtier's office is; a Petitioner only asks. */
const COURT_POSTS = Object.freeze(["retainer", "courtier"]);

/**
 * The world's Knights holding a post of this Domain that their Rank isn't
 * worthy of yet (Worthiness, p6): its ruler, those on its Council, and those in
 * its Court. Each Knight is named once, for the highest post they hold. A
 * Squire isn't knighted yet, so has no Rank to weigh, and the slain face no one.
 * Each says whether the Referee has ticked their worthiness proven, which the
 * Domain keeps (system.proven), so the opposition is behind them.
 * @param {{uuid?: string, system: {ruler?: string, seat?: boolean, council?: object, court?: unknown, proven?: string[]}}} domain
 * @param {{id: string, name: string, system: {glory?: number, domain?: string, isSquire?: boolean, slain?: boolean}}[]} knights The world's Knights.
 * @returns {{id: string, name: string, post: string, rank: string, proven: boolean}[]} `post` is one of POST_RANKS' keys,
 *   `rank` the Rank it asks for.
 */
export function unworthyPosts(domain, knights) {
	// domainPosts gives the ruler first, then the Council, then the Court, so a Knight's first weighed post is their highest.
	const highest = new Map();
	for (const held of domainPosts(domain, knights)) {
		if (held.worth && canHoldPost(held.knight) && !highest.has(held.knight.id)) highest.set(held.knight.id, held);
	}
	return [...highest.values()].flatMap(({ knight, worth, rank, proven }) => (rank ? [{ id: knight.id, name: knight.name, post: worth, rank, proven }] : []));
}

/**
 * @param {unknown} proven As a Domain stores it.
 * @returns {string[]} The ids of the Knights whose worthiness of their post there is proven (p6).
 */
export const provenKnights = (proven) => (Array.isArray(proven) ? [...new Set(proven.filter((id) => typeof id === "string" && id))] : []);

/**
 * @param {unknown} proven As a Domain stores it.
 * @param {string} id A Knight's id.
 * @param {boolean} isProven Whether their worthiness is proven now.
 * @returns {string[]} The list with them in it, or out of it.
 */
export function withProven(proven, id, isProven) {
	const without = provenKnights(proven).filter((each) => each !== id);
	return isProven && id ? [...without, id] : without;
}

/* -------------------------------------------- */
/*  A Knight's own posts                        */
/* -------------------------------------------- */

/**
 * @typedef {object} KnightPost
 * @property {string} post      "ruler", one of COUNCIL_SEATS, or "court" for a place in the Court with no seat.
 * @property {string} role      For a place in the Court, one of COURT_ROLES; blank otherwise.
 * @property {string} serves    The seat a Retainer serves without holding one, if any.
 * @property {string} member    Their id in the Court, where the post is a place in it.
 * @property {string} worth     How Worthiness weighs it (p6): one of glory.js's post keys, seat, holding, council
 *   or court, or blank for a place a Knight needs no Rank for, as a Petitioner's.
 * @property {string|null} rank The Rank the post asks for, where the Knight's Glory falls short of it (p6).
 * @property {boolean} proven   Whether the Referee has ticked their worthiness of it proven.
 */

/**
 * Whether a post's holder is this Knight, found as domainPosts finds them, so
 * taking or leaving a seat finds the same places the Knight's posts list.
 * @param {{id: string, name: string}} knight
 * @param {{id: string, name: string}[]} knights The world's Knights.
 * @returns {(id: string, name: string) => boolean}
 */
function holderIsKnight(knight, knights) {
	const holderOf = postHolderFinder(knights, knight);
	return (id, name) => holderOf(id, name)?.id === knight.id;
}

/**
 * The places in a Domain's Court that are this Knight, found by the id they
 * were seated as or else by a name only they, of the Knights able to hold a
 * post, go by. Each place is first held up to this Knight alone, so a name is
 * weighed against every Knight only where it is theirs.
 * @param {unknown} court As stored.
 * @param {{id: string, name: string}} knight
 * @param {{id: string, name: string}[]} knights The world's Knights.
 * @returns {(CourtMember & {id: string})[]}
 */
export function courtPlacesOf(court, knight, knights) {
	const isKnight = holderIsKnight(knight, knights);
	return courtMembers(court).filter((member) => isKnight(member.knight, member.name));
}

/**
 * @param {unknown} circle As stored.
 * @param {{id: string, name: string}} knight
 * @param {{id: string, name: string}[]} knights The world's Knights.
 * @returns {boolean} Whether the Knight sits in the Circle, as domainPosts finds them there.
 */
function sitsInCircle(circle, knight, knights) {
	const isKnight = holderIsKnight(knight, knights);
	return circleEntries(circle).some((entry) => isKnight(entry, entry));
}

/**
 * @param {unknown} circle As stored.
 * @param {{id: string, name: string}} knight
 * @param {{id: string, name: string}[]} knights The world's Knights.
 * @returns {string[]} The Circle with the Knight gone from it.
 */
function circleWithout(circle, knight, knights) {
	const isKnight = holderIsKnight(knight, knights);
	return circleEntries(circle).filter((entry) => !isKnight(entry, entry));
}

/**
 * The Knight ruling a Domain, as its posts are weighed: the one linked to it,
 * or else the first Knight able to hold a post (canHoldPost) bearing its
 * ruler's name, as dominion.js's rulingKnightOf finds them, so a Squire or the
 * Slain sharing the name doesn't take it.
 * @template {{id: string, name: string, system?: {domain?: string}}} T
 * @param {{uuid?: string, system?: {ruler?: string}}} domain
 * @param {T[]} knights The world's Knights.
 * @returns {T|null}
 */
export function domainRulerOf(domain, knights) {
	const linked = domain.uuid ? knights.find((knight) => knight.system?.domain === domain.uuid) : null;
	return linked ?? knights.find((knight) => canHoldPost(knight) && isSameName(knight.name, domain.system?.ruler)) ?? null;
}

/**
 * Finds the Knight a post's holder is: by the id they were seated as, among
 * every Knight, so the Slain and the renamed are still known; or else by a
 * name only one Knight able to hold a post goes by, so a Squire or the Slain
 * sharing it makes it nobody else's.
 * @param {{id: string, name: string}[]} knights The world's Knights.
 * @param {{id: string, name: string}|null} only One Knight to look for alone, which spares
 *   weighing every name against every Knight.
 * @returns {(id: string, name: string) => object|null}
 */
function postHolderFinder(knights, only) {
	let named;
	const find = (id, name) => (id && knights.find((knight) => knight.id === id)) || soleNamed(named ??= knights.filter(canHoldPost), name);
	return only ? (id, name) => (id === only.id || isSameName(name, only.name) ? find(id, name) : null) : find;
}

/**
 * @typedef {KnightPost & {knight: {id: string, name: string, system?: object}}} DomainPost
 */

/**
 * Every post of a Domain held by one of the world's Knights (p20): ruling it,
 * a seat on its Council, or a place in its Court, each weighed for Worthiness
 * (p6). The Knight ruling it is domainRulerOf's; the Knight in a seat or a
 * place in the Court is found by the id they were seated as, or else by a name
 * only one Knight able to hold a post goes by. A seat still holding a name
 * written in before the Court is left to the world setup that seats it from
 * the Court (councilSeatPlan).
 * @param {{uuid?: string, system: {ruler?: string, seat?: boolean, council?: object, court?: unknown, proven?: string[]}}} domain
 * @param {{id: string, name: string, system?: object}[]} knights The world's Knights.
 * @param {{id: string, name: string}|null} [only] Only this Knight's posts.
 * @returns {DomainPost[]} Ruler first, then the Council in the book's order, then the Court.
 */
export function domainPosts(domain, knights, only = null) {
	const { system } = domain;
	const council = system.council ?? {};
	const holderOf = postHolderFinder(knights, only);
	const proven = new Set(provenKnights(system.proven));
	const posts = [];
	const hold = (knight, post, worth, more = {}) => {
		if (!knight || (only && knight.id !== only.id)) return;
		const rank = worth ? unworthyOf(knight.system?.glory, worth) : null;
		posts.push({ knight, post, role: "", serves: "", member: "", worth, rank, proven: proven.has(knight.id), ...more });
	};
	hold(domainRulerOf(domain, knights), "ruler", system.seat ? "seat" : "holding");
	const places = courtMembers(system.court).map((member) => ({ member, knight: holderOf(member.knight, member.name) }));
	for (const seat of COUNCIL_SEATS) {
		if (seat !== "circle") {
			const held = places.find(({ member }) => council[seat] === member.id);
			if (held) hold(held.knight, seat, "council", { role: held.member.role, member: held.member.id });
			continue;
		}
		const sitting = new Set();
		for (const entry of circleEntries(council.circle)) {
			const knight = holderOf(entry, entry);
			if (!knight || sitting.has(knight.id)) continue;
			sitting.add(knight.id);
			hold(knight, "circle", "council");
		}
	}
	for (const { member, knight } of places) {
		if (!seatOf(council, member.id)) hold(knight, "court", COURT_POSTS.includes(member.role) ? "court" : "", { role: member.role, serves: member.seat, member: member.id });
	}
	return posts;
}

/**
 * Everything a Knight holds in one Domain (p20): ruling it, a seat on its
 * Council, or a place in its Court. Each says whether their Rank is worthy of
 * it yet (Worthiness, p6), as the Domain's own sheet weighs it.
 * @param {{uuid?: string, system: {ruler?: string, seat?: boolean, council?: object, court?: unknown, proven?: string[]}}} domain
 * @param {{id: string, name: string, system?: {glory?: number}}} knight
 * @param {{id: string, name: string, system?: object}[]} knights The world's Knights.
 * @returns {KnightPost[]} Ruler first, then the Council in the book's order, then the Court.
 */
export const knightPosts = (domain, knight, knights) => domainPosts(domain, knights, knight).map(({ knight: _held, ...post }) => post);

/**
 * What gives a Knight one seat on a Domain's Council. A seat granted to a
 * Retainer goes to the Knight's place in the Court, which becomes a Retainer's
 * if it wasn't, or to a new one made for them. They hold one seat at a time,
 * so leave any other, the Circle among them. Whoever held the seat before
 * stays in the Court, as when it's changed on the Domain's sheet.
 * @param {{council?: object, court?: unknown}} system The Domain's, as stored.
 * @param {{id: string, name: string}} knight
 * @param {string} seat One of COUNCIL_SEATS.
 * @param {{id: string, name: string}[]} knights The world's Knights.
 * @param {() => string} makeId Gives a new id.
 * @param {number} now When they join the Court, if they must, usually Date.now().
 * @returns {{updates: Record<string, unknown>, joined: {id: string, member: CourtMember}|null, unseated: string, circle: "joined"|"left"|""}}
 *   `joined` is a place made for them in the Court, `unseated` the name of whoever gave the seat up.
 */
export function seatPlan(system, knight, seat, knights, makeId, now) {
	const council = system?.council ?? {};
	const court = normalizeCourt(system?.court);
	const places = courtPlacesOf(court, knight, knights);
	const inCircle = sitsInCircle(council.circle, knight, knights);
	const plan = { updates: {}, joined: null, unseated: "", circle: "" };
	if (!COUNCIL_SEATS.includes(seat)) return plan;
	const { updates } = plan;

	for (const member of places) {
		const held = seatOf(council, member.id);
		if (held && held !== seat) updates[`system.council.${held}`] = "";
	}

	if (seat === "circle") {
		if (!inCircle) {
			updates["system.council.circle"] = [...circleEntries(council.circle), knight.id];
			plan.circle = "joined";
		}
		return plan;
	}

	if (inCircle) {
		updates["system.council.circle"] = circleWithout(council.circle, knight, knights);
		plan.circle = "left";
	}
	// The place already holding the seat, else one already a Retainer's, else any they have.
	const place = places.find((member) => council[seat] === member.id)
		?? places.find((member) => member.role === SERVES_A_SEAT)
		?? places[0];
	let id;
	if (place) {
		id = place.id;
		// Seated as this Knight from now on, so a rename doesn't lose them.
		if (place.role !== SERVES_A_SEAT || place.knight !== knight.id) {
			updates[`system.court.${id}`] = { ...court[id], role: SERVES_A_SEAT, seat: place.role === SERVES_A_SEAT ? place.seat : "", knight: knight.id };
		}
	} else {
		id = makeId();
		const member = { ...newCourtMember(SERVES_A_SEAT, now), name: knight.name, knight: knight.id };
		updates[`system.court.${id}`] = member;
		plan.joined = { id, member };
	}
	if (council[seat] !== id) {
		updates[`system.council.${seat}`] = id;
		const before = seatHolder(council, court, seat);
		plan.unseated = before?.name ?? "";
	}
	return plan;
}

/**
 * What takes a Knight off a Domain's Council: whatever seat they hold is left
 * empty, and they leave the Circle, or only the one seat named. A place in the
 * Court stays theirs.
 * @param {{council?: object, court?: unknown}} system The Domain's, as stored.
 * @param {{id: string, name: string}} knight
 * @param {{id: string, name: string}[]} knights The world's Knights.
 * @param {string|null} [only] One of COUNCIL_SEATS, or "circle", to leave that alone.
 * @returns {{updates: Record<string, unknown>, seats: string[], circle: boolean}} `seats` are the ones left, the Circle among them.
 */
export function leavePlan(system, knight, knights, only = null) {
	const council = system?.council ?? {};
	const plan = { updates: {}, seats: [], circle: false };
	for (const member of courtPlacesOf(system?.court, knight, knights)) {
		const held = seatOf(council, member.id);
		if (!held || (only && held !== only)) continue;
		plan.updates[`system.council.${held}`] = "";
		plan.seats.push(held);
	}
	if ((!only || only === "circle") && sitsInCircle(council.circle, knight, knights)) {
		plan.updates["system.council.circle"] = circleWithout(council.circle, knight, knights);
		plan.seats.push("circle");
		plan.circle = true;
	}
	return plan;
}
