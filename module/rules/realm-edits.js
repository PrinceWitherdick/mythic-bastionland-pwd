/**
 * The changes the GM's Realm tools make. Each takes a Realm and returns a new
 * one, which planRealmSync then writes to the Scene. A feature keeps its id
 * while it stays the same kind of thing, so its Tile is changed rather than
 * replaced. Pure, so it can be tested without Foundry.
 */
import { isDie } from "./book-art.js";
import { HOLDING_STYLES, LANDMARK_TYPES, MYTH_COUNT, OMEN_COUNT, TERRAIN, featureAt } from "./realm.js";
import { MAP_ROLES, normaliseRealmPicture } from "./realm-map.js";
import { hexDistance, hexIndex, hexLine, inRealm, parseEdgeKey, sameHex } from "./realm-geometry.js";

/** What a hex can hold, one at a time. */
export const FEATURE_KINDS = Object.freeze(["holding", "myth", "landmark"]);

/** The states a Barrier tool cycles an edge through. */
export const BARRIER_STATES = Object.freeze(["none", "hidden", "revealed"]);

/**
 * @param {import("./realm.js").Realm} realm
 * @returns {import("./realm.js").Realm} A copy nothing else shares.
 */
const copyRealm = (realm) => ({
	...realm,
	terrain: [...realm.terrain],
	rivers: realm.rivers.map((course) => course.map((hex) => ({ ...hex }))),
	holdings: realm.holdings.map((holding) => ({ ...holding, hex: { ...holding.hex } })),
	myths: realm.myths.map((myth) => ({ ...myth, hex: { ...myth.hex } })),
	landmarks: realm.landmarks.map((landmark) => ({ ...landmark, hex: { ...landmark.hex }, seer: landmark.seer && { ...landmark.seer } })),
	barriers: realm.barriers.map((barrier) => ({ ...barrier }))
});

/**
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}[]} hexes
 * @param {number} terrain 1-12.
 * @returns {import("./realm.js").Realm}
 */
export function paintTerrain(realm, g, hexes, terrain) {
	if (!isDie(terrain, TERRAIN.length)) return realm;
	const next = copyRealm(realm);
	for (const hex of hexes) {
		if (inRealm(g, hex)) next.terrain[hexIndex(g, hex)] = terrain;
	}
	return next;
}

/**
 * Follow the pointer one hex further along a river being drawn. Hexes the
 * pointer jumped over are filled in, and going back over the course takes
 * back what was drawn past that hex, so a course never crosses itself.
 * @param {object} g
 * @param {{col: number, row: number}[]} course The hexes drawn so far, in order.
 * @param {{col: number, row: number}|null} hex The hex under the pointer.
 * @returns {{col: number, row: number}[]} The course now.
 */
export function traceCourse(g, course, hex) {
	if (!inRealm(g, hex)) return course;
	if (!course.length) return [{ ...hex }];
	let next = course;
	for (const step of hexLine(g, course.at(-1), hex)) {
		const back = next.findIndex((drawn) => sameHex(drawn, step));
		next = back >= 0 ? next.slice(0, back + 1) : [...next, { ...step }];
	}
	return next;
}

/**
 * @param {{col: number, row: number}[][]} courses
 * @returns {(hex: {col: number, row: number}) => number[]} The courses that run through a hex, by their place in `courses`.
 */
const coursesThrough = (courses) => (hex) => courses.flatMap((course, index) => (course.some((wet) => sameHex(wet, hex)) ? [index] : []));

/**
 * @param {import("./realm.js").Realm} realm
 * @param {{col: number, row: number}[][]} courses
 * @returns {import("./realm.js").Realm} The Realm with these courses as its rivers. A course of one hex is dropped,
 *   since it draws no water.
 */
function withCourses(realm, courses) {
	return { ...copyRealm(realm), rivers: courses.filter((course) => course.length > 1).map((course) => course.map(({ col, row }) => ({ col, row }))) };
}

/**
 * The ends of a Realm's rivers that a drag carries on: those that don't join
 * another river.
 * @param {import("./realm.js").Realm} realm
 * @returns {{col: number, row: number}[]}
 */
export function riverEnds(realm) {
	const courses = realm.rivers;
	const through = coursesThrough(courses);
	return courses.flatMap((course, index) => [...new Set([course[0], course.at(-1)])]
		.filter((hex) => hex && through(hex).every((other) => other === index)));
}

/**
 * Lay a river the GM drew. Drawing only ever adds water. A course that starts
 * at a river's loose end carries that river on, back from its source or on
 * from its mouth. One that starts partway along a river branches off it
 * there, and one that starts anywhere else is a new river. New water that
 * reaches another river joins it there and stops, and stops short of the
 * river it came from rather than cross it.
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}[]} course Neighbouring hexes, in the order they were drawn.
 * @returns {import("./realm.js").Realm} Unchanged when no new water was drawn.
 */
export function layRiver(realm, g, course) {
	const drawn = course.filter((hex) => inRealm(g, hex));
	if (drawn.length < 2) return realm;
	const courses = realm.rivers;
	const through = coursesThrough(courses);
	const [start, ...steps] = drawn;
	const onEnd = riverEnds(realm).some((end) => sameHex(end, start))
		? courses.findIndex((wet) => sameHex(wet[0], start) || sameHex(wet.at(-1), start))
		: -1;

	// The rivers the new water comes from, which it stops short of rather than cross or run along.
	const own = onEnd >= 0 ? [onEnd] : through(start);
	const added = [];
	for (const hex of steps) {
		const wet = through(hex);
		if (!wet.length) {
			added.push(hex);
			continue;
		}
		if (!wet.some((index) => own.includes(index))) added.push(hex);
		break;
	}
	if (!added.length) return realm;

	if (onEnd < 0) return withCourses(realm, [...courses, [start, ...added]]);
	const carried = courses[onEnd];
	const fromSource = carried.length > 1 && sameHex(carried[0], start);
	return withCourses(realm, courses.with(onEnd, fromSource ? [...added.reverse(), ...carried] : [...carried, ...added]));
}

/**
 * Take a hex off a river, with everything from it to the nearer end. Where
 * rivers meet, the one that loses least is cut.
 * @param {import("./realm.js").Realm} realm
 * @param {{col: number, row: number}} hex
 * @returns {import("./realm.js").Realm} Unchanged when no river runs through the hex.
 */
export function trimRiver(realm, hex) {
	const courses = realm.rivers;
	let best = null;
	courses.forEach((course, index) => {
		const at = course.findIndex((wet) => sameHex(wet, hex));
		if (at < 0) return;
		const fromStart = at < course.length - 1 - at;
		const lost = fromStart ? at + 1 : course.length - at;
		if (!best || lost < best.lost) best = { index, lost, kept: fromStart ? course.slice(at + 1) : course.slice(0, at) };
	});
	return best ? withCourses(realm, courses.with(best.index, best.kept)) : realm;
}

/**
 * @param {import("./realm.js").Realm} realm
 * @returns {import("./realm.js").Realm} The Realm with no rivers.
 */
export function clearRiver(realm) {
	if (!realm.rivers.length) return realm;
	return withCourses(realm, []);
}

/**
 * @param {import("./realm.js").Realm} realm
 * @returns {number[]} Myth numbers no Myth has yet.
 */
export function unusedMythNumbers(realm) {
	const used = new Set(realm.myths.map((myth) => myth.number));
	return Array.from({ length: MYTH_COUNT }, (_, index) => index + 1).filter((number) => !used.has(number));
}

/**
 * Put a Holding, Myth or Landmark in a hex, replacing whatever was there, or
 * clear the hex. A Myth takes its number with it: a Myth already carrying that
 * number elsewhere moves here. A new Seat of Power unseats the old one.
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @param {object|null} feature `{kind: "holding", style, name, seat}`, `{kind: "myth", number, d6, d12, omen, revealed}`,
 *   `{kind: "landmark", type, name, seer, revealed}`, or null to clear the hex.
 * @returns {import("./realm.js").Realm}
 */
export function placeFeature(realm, g, hex, feature) {
	if (!inRealm(g, hex)) return realm;
	const here = featureAt(realm, hex);
	const next = copyRealm(realm);
	const elsewhere = (item) => !sameHex(item.hex, hex);
	next.holdings = next.holdings.filter(elsewhere);
	next.myths = next.myths.filter(elsewhere);
	next.landmarks = next.landmarks.filter(elsewhere);
	if (!feature) return next;

	switch (feature.kind) {
		case "holding":
			if (feature.seat) next.holdings.forEach((holding) => { holding.seat = false; });
			next.holdings.push({
				id: here.holding?.id ?? null,
				hex: { ...hex },
				style: HOLDING_STYLES.includes(feature.style) ? feature.style : here.holding?.style ?? HOLDING_STYLES[0],
				seat: Boolean(feature.seat),
				name: String(feature.name ?? here.holding?.name ?? "")
			});
			break;

		case "myth": {
			const number = isDie(feature.number, MYTH_COUNT) ? feature.number : here.myth?.number ?? unusedMythNumbers(next)[0];
			if (!number) return realm;
			const moving = next.myths.find((myth) => myth.number === number);
			next.myths = next.myths.filter((myth) => myth.number !== number);
			const base = here.myth ?? moving ?? null;
			next.myths.push({
				id: base?.id ?? null,
				hex: { ...hex },
				number,
				d6: isDie(feature.d6, 6) ? feature.d6 : base?.d6 ?? 1,
				d12: isDie(feature.d12, 12) ? feature.d12 : base?.d12 ?? 1,
				omen: Math.min(OMEN_COUNT, Math.max(0, Number.isInteger(feature.omen) ? feature.omen : base?.omen ?? 0)),
				revealed: feature.revealed ?? base?.revealed ?? false
			});
			next.myths.sort((a, b) => a.number - b.number);
			break;
		}

		case "landmark": {
			const type = LANDMARK_TYPES.includes(feature.type) ? feature.type : here.landmark?.type ?? LANDMARK_TYPES[0];
			// The Hex panel sends a Seer roll one die at a time, so half a roll is kept, with the other die as it was or 1.
			const before = here.landmark?.seer ?? null;
			const rolled = { d6: isDie(feature.seer?.d6, 6), d12: isDie(feature.seer?.d12, 12) };
			const seer = type !== "sanctum" ? null
				: rolled.d6 || rolled.d12 ? { d6: rolled.d6 ? feature.seer.d6 : before?.d6 ?? 1, d12: rolled.d12 ? feature.seer.d12 : before?.d12 ?? 1 }
					: before;
			next.landmarks.push({
				id: here.landmark?.id ?? null,
				hex: { ...hex },
				type,
				name: String(feature.name ?? here.landmark?.name ?? ""),
				seer,
				revealed: feature.revealed ?? here.landmark?.revealed ?? false
			});
			break;
		}

		default:
			return realm;
	}
	return next;
}

/**
 * Whether a hex already holds what a brush would lay: a Holding of the same
 * style, already crowned if the brush grants the crown, or a Landmark of the
 * same type. Clicking with that brush takes it away rather than laying it
 * again, the way clicking a Barrier takes the Barrier away.
 * @param {import("./realm.js").Realm} realm
 * @param {{col: number, row: number}} hex
 * @param {object|null} feature As placeFeature takes it.
 * @returns {boolean}
 */
export function featureStands(realm, hex, feature) {
	const here = featureAt(realm, hex);
	if (feature?.kind === "holding") {
		return Boolean(here.holding) && here.holding.style === feature.style && (!feature.seat || Boolean(here.holding.seat));
	}
	if (feature?.kind === "landmark") return Boolean(here.landmark) && here.landmark.type === feature.type;
	return false;
}

/**
 * Change part of the Holding, Myth or Landmark in a hex and keep the rest of
 * it. The Hex panel writes each field this way as it changes, so two changes
 * made close together can't undo each other.
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @param {object} changes Some of the feature's properties, such as `{name}`, `{seat}` or `{seer: {d6}}`.
 * @returns {import("./realm.js").Realm} Unchanged when the hex holds nothing.
 */
export function editFeature(realm, g, hex, changes) {
	const here = featureAt(realm, hex);
	const kind = FEATURE_KINDS.find((candidate) => here[candidate]);
	if (!kind) return realm;
	const { id: _id, hex: _hex, ...current } = here[kind];
	const merged = { ...current, ...changes, kind };
	if (changes.seer) merged.seer = { ...current.seer, ...changes.seer };
	return placeFeature(realm, g, hex, merged);
}

/**
 * @param {import("./realm.js").Realm} realm
 * @param {string} edge An edge key.
 * @returns {"none"|"hidden"|"revealed"}
 */
export function barrierState(realm, edge) {
	const barrier = realm.barriers.find((candidate) => candidate.edge === edge);
	if (!barrier) return "none";
	return barrier.revealed ? "revealed" : "hidden";
}

/**
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {string} edge An edge key between two hexes of the Realm.
 * @param {"none"|"hidden"|"revealed"} state
 * @returns {import("./realm.js").Realm}
 */
export function setBarrier(realm, g, edge, state) {
	const hexes = parseEdgeKey(g, edge);
	if (!hexes || !hexes.every((hex) => inRealm(g, hex)) || !BARRIER_STATES.includes(state)) return realm;
	const next = copyRealm(realm);
	const index = next.barriers.findIndex((barrier) => barrier.edge === edge);
	if (state === "none") {
		if (index >= 0) next.barriers.splice(index, 1);
	} else if (index >= 0) {
		next.barriers[index].revealed = state === "revealed";
	} else {
		next.barriers.push({ id: null, edge, revealed: state === "revealed" });
	}
	return next;
}

/**
 * Show or hide a hex's Myth or Landmark.
 * @param {import("./realm.js").Realm} realm
 * @param {{col: number, row: number}} hex
 * @param {boolean} revealed
 * @returns {import("./realm.js").Realm}
 */
export function setRevealed(realm, hex, revealed) {
	const next = copyRealm(realm);
	for (const item of [...next.myths, ...next.landmarks]) {
		if (sameHex(item.hex, hex)) item.revealed = Boolean(revealed);
	}
	return next;
}

/**
 * @param {import("./realm.js").Realm} realm
 * @param {number} number The Myth's number.
 * @param {number} omen How many of its Omens have been seen, 0-6.
 * @returns {import("./realm.js").Realm}
 */
export function setOmen(realm, number, omen) {
	const next = copyRealm(realm);
	const myth = next.myths.find((candidate) => candidate.number === number);
	if (myth) myth.omen = Math.min(OMEN_COUNT, Math.max(0, Math.trunc(Number(omen) || 0)));
	return next;
}

/**
 * @param {import("./realm.js").Realm} realm
 * @param {object|null} picture The Realm's pictures as they should be, or null to draw the Realm in the system's own ink again.
 * @returns {import("./realm.js").Realm}
 */
function withPicture(realm, picture) {
	const next = copyRealm(realm);
	if (picture) next.picture = picture;
	else delete next.picture;
	return next;
}

/**
 * Give a Realm one of its pictures, or take it away.
 * @param {import("./realm.js").Realm} realm
 * @param {string} role One of MAP_ROLES.
 * @param {{src: string}|null} picture Null to take that one away.
 * @returns {import("./realm.js").Realm}
 */
export function setMapPicture(realm, role, picture) {
	if (!MAP_ROLES.includes(role)) return realm;
	const src = typeof picture?.src === "string" ? picture.src.trim() : "";
	// A picture changed is a picture to line up again, so only what the caller gives is kept.
	const map = src ? { ...picture, src } : null;
	return withPicture(realm, normaliseRealmPicture({ ...realm.picture, [role]: map }));
}

/**
 * Say where one of a Realm's pictures lies, once it has been lined up.
 * @param {import("./realm.js").Realm} realm
 * @param {string} role One of MAP_ROLES.
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @returns {import("./realm.js").Realm}
 */
export function placeMapPicture(realm, role, rect) {
	const map = MAP_ROLES.includes(role) ? realm.picture?.[role] : null;
	if (!map || !rect) return realm;
	return withPicture(realm, normaliseRealmPicture({ ...realm.picture, [role]: { ...map, ...rect } }));
}

/**
 * A Realm about to have its hexes laid out another way (REALM_LAYOUTS). Each
 * hex keeps what it holds, since a hex is still the same column and row; but
 * which hexes meet changes, so a river is kept a stretch at a time where its
 * hexes still meet, and a Barrier only where its two hexes still share an edge.
 * @param {import("./realm.js").Realm} realm
 * @param {object} g The new layout's geometry.
 * @returns {import("./realm.js").Realm} The Realm itself when all of it still holds together.
 */
export function relayRealm(realm, g) {
	const rivers = realm.rivers.flatMap((course) => {
		const stretches = [[]];
		for (const hex of course) {
			const stretch = stretches.at(-1);
			if (stretch.length && hexDistance(g, stretch.at(-1), hex) !== 1) stretches.push([hex]);
			else stretch.push(hex);
		}
		// A lone hex broken off a river is no river; one the GM had only begun is left as it was.
		return stretches.length > 1 ? stretches.filter((stretch) => stretch.length > 1) : stretches;
	});
	const barriers = realm.barriers.filter((barrier) => parseEdgeKey(g, barrier.edge));
	const unchanged = barriers.length === realm.barriers.length
		&& rivers.length === realm.rivers.length
		&& rivers.every((course, index) => course.length === realm.rivers[index].length);
	if (unchanged) return realm;
	return {
		...copyRealm(realm),
		rivers: rivers.map((course) => course.map(({ col, row }) => ({ col, row }))),
		barriers: barriers.map((barrier) => ({ ...barrier }))
	};
}
