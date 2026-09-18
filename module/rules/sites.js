/**
 * Sites (p15): a place explored in more detail than a Hex, whether an ancient
 * tomb, a hostile castle or misty woods. The book maps one on a hexagon:
 * points on its corners and centre marked as features, dangers or treasure,
 * routes between neighbouring points that are open, closed or hidden, and an
 * entrance with an optional hidden one.
 *
 * A Site is plain data kept on its Journal entry. Each change here returns a
 * new Site and leaves the one it was given alone, so a window can keep the old
 * one for Undo. Pure, so all of it can be tested without Foundry.
 */

export const SITE_VERSION = 1;

/** Features give information or set the mood, dangers are navigated carefully, and treasure is a useful or valuable find. */
export const POINT_KINDS = Object.freeze(["feature", "danger", "treasure"]);

/** Open routes are straightforward, closed ones are blocked, and hidden ones have to be found. */
export const ROUTE_KINDS = Object.freeze(["open", "closed", "hidden"]);

/** A way in anyone can find, and one only found through exploration or local knowledge. */
export const ENTRANCE_KINDS = Object.freeze(["open", "hidden"]);

/** The book's four steps, in order. */
export const SITE_STEPS = Object.freeze(["points", "routes", "reachable", "entrances"]);

/** Where a step or a count stands: done, still to do, past what the rules ask for, or broken. */
export const STEP_STATES = Object.freeze(["done", "todo", "over", "problem"]);

/** What clicking the Referee's map does: draw the Site, or show players what they've found. */
export const SITE_MODES = Object.freeze(["draw", "reveal"]);

const HALF_WIDTH = Math.sqrt(3) / 2;

/**
 * The corners of a pointy-topped hexagon of radius 1, and its centre, with y
 * running down the page. Listed in reading order, top to bottom and then left
 * to right.
 */
export const SITE_POSITIONS = Object.freeze([
	Object.freeze({ key: "top", x: 0, y: -1 }),
	Object.freeze({ key: "upperLeft", x: -HALF_WIDTH, y: -0.5 }),
	Object.freeze({ key: "upperRight", x: HALF_WIDTH, y: -0.5 }),
	Object.freeze({ key: "centre", x: 0, y: 0 }),
	Object.freeze({ key: "lowerLeft", x: -HALF_WIDTH, y: 0.5 }),
	Object.freeze({ key: "lowerRight", x: HALF_WIDTH, y: 0.5 }),
	Object.freeze({ key: "bottom", x: 0, y: 1 })
]);

export const POSITION_KEYS = Object.freeze(SITE_POSITIONS.map(({ key }) => key));

/** The corners, clockwise from the top. */
const RING = Object.freeze(["top", "upperRight", "lowerRight", "bottom", "lowerLeft", "upperLeft"]);

/**
 * @typedef {object} SiteEdge
 * @property {string} key                 Both ends joined by a hyphen, such as "centre-top".
 * @property {readonly [string, string]} ends Positions.
 */

/**
 * Where routes can go, between neighbouring points: each corner to the next
 * around the hexagon, and each corner to the centre.
 * @type {readonly SiteEdge[]}
 */
export const SITE_EDGES = Object.freeze([
	...RING.map((key, index) => [key, RING[(index + 1) % RING.length]]),
	...RING.map((key) => ["centre", key])
].map((ends) => Object.freeze({ key: ends.join("-"), ends: Object.freeze(ends) })));

const EDGES = new Map(SITE_EDGES.map((edge) => [edge.key, edge]));

/** The most of each kind the rules can ask for: a point at every position, every route, and an entrance at every point. */
export const RULE_LIMITS = Object.freeze({ points: SITE_POSITIONS.length, routes: SITE_EDGES.length, entrances: SITE_POSITIONS.length });

/** The kinds counted in each group of the rules. */
export const RULE_KINDS = Object.freeze({ points: POINT_KINDS, routes: ROUTE_KINDS, entrances: ENTRANCE_KINDS });

/** @returns {Readonly<SiteRules>} */
const freezeRules = (rules) => Object.freeze(Object.fromEntries(Object.entries(rules).map(([group, counts]) => [group, Object.freeze(counts)])));

/**
 * @typedef {object} SiteRules How many of each kind a Site should have.
 * @property {Record<string, number>} points    By POINT_KINDS.
 * @property {Record<string, number>} routes    By ROUTE_KINDS.
 * @property {Record<string, number>} entrances By ENTRANCE_KINDS. The hidden entrance is optional.
 */

/** The book's distribution: 3 features, 2 dangers and 1 treasure, 3 open, 2 closed and 1 hidden route, an entrance and a hidden entrance. */
export const BOOK_RULES = freezeRules({
	points: { feature: 3, danger: 2, treasure: 1 },
	routes: { open: 3, closed: 2, hidden: 1 },
	entrances: { open: 1, hidden: 1 }
});

/** Distributions to start from. The sealed burial complex is the book's example of breaking the rules. */
export const SITE_PRESETS = Object.freeze([
	Object.freeze({ key: "book", rules: BOOK_RULES }),
	Object.freeze({
		key: "burial",
		rules: freezeRules({
			points: { feature: 1, danger: 2, treasure: 3 },
			routes: { open: 1, closed: 3, hidden: 2 },
			entrances: { open: 1, hidden: 0 }
		})
	})
]);

/**
 * @typedef {object} SitePoint
 * @property {string|null} kind      One of POINT_KINDS, or null for a point not marked, which the book erases.
 * @property {number|null} number    From 1 up to the number of marked points. Null while unmarked.
 * @property {string} text           What's found there.
 * @property {string|null} entrance  One of ENTRANCE_KINDS when an entrance leads in here.
 * @property {string} entranceText   What that entrance is like.
 * @property {boolean} found         Players have found the point.
 * @property {boolean} entranceFound Players know of the entrance.
 */

/**
 * @typedef {object} SiteRoute
 * @property {string|null} kind One of ROUTE_KINDS, or null for no route.
 * @property {string} text      What's along the way, such as what blocks a closed route.
 * @property {boolean} found    Players have found a hidden route. Open and closed routes never need finding.
 */

/**
 * @typedef {object} Site
 * @property {number} version
 * @property {string} notes                   What the Site is.
 * @property {SiteRules} rules
 * @property {Record<string, SitePoint>} points By position.
 * @property {Record<string, SiteRoute>} routes By SITE_EDGES' keys.
 */

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} max
 * @returns {number} A whole number from 0 to max. A blank field counts as none, and anything else unreadable as the fallback.
 */
function countOf(value, fallback, max) {
	if (value === undefined || value === null || typeof value === "boolean") return fallback;
	const number = Number(value);
	if (!Number.isFinite(number)) return fallback;
	return Math.min(max, Math.max(0, Math.trunc(number)));
}

/**
 * Read rules, such as a form's, filling any count missing or unreadable from the fallback.
 * @param {object} [rules]
 * @param {SiteRules} [fallback]
 * @returns {SiteRules}
 */
export function normaliseRules(rules, fallback = BOOK_RULES) {
	return Object.fromEntries(Object.entries(RULE_KINDS).map(([group, kinds]) => [group, Object.fromEntries(kinds.map((kind) => {
		const otherwise = countOf(fallback?.[group]?.[kind], BOOK_RULES[group][kind], RULE_LIMITS[group]);
		return [kind, countOf(rules?.[group]?.[kind], otherwise, RULE_LIMITS[group])];
	}))]));
}

const textOf = (value) => (typeof value === "string" ? value : "");

/**
 * Read a Site as stored, whatever state it's in. Every position and edge is
 * present, a route runs only between two marked points, and the marked points
 * are numbered from 1 without gaps, keeping the order they had.
 * @param {unknown} data
 * @returns {Site} A new object, sharing nothing with the data.
 */
export function normaliseSite(data) {
	const points = Object.fromEntries(POSITION_KEYS.map((key) => {
		const point = data?.points?.[key];
		const kind = POINT_KINDS.includes(point?.kind) ? point.kind : null;
		const entrance = kind && ENTRANCE_KINDS.includes(point?.entrance) ? point.entrance : null;
		return [key, {
			kind,
			number: kind && Number.isInteger(point?.number) && point.number > 0 ? point.number : null,
			text: textOf(point?.text),
			entrance,
			entranceText: textOf(point?.entranceText),
			found: Boolean(kind) && point?.found === true,
			entranceFound: Boolean(entrance) && point?.entranceFound === true
		}];
	}));

	// Points without a number follow the numbered ones, in reading order.
	const rank = (key) => points[key].number ?? Number.MAX_SAFE_INTEGER;
	POSITION_KEYS.filter((key) => points[key].kind)
		.sort((a, b) => rank(a) - rank(b))
		.forEach((key, index) => { points[key].number = index + 1; });

	const routes = Object.fromEntries(SITE_EDGES.map(({ key, ends }) => {
		const route = data?.routes?.[key];
		const kind = ends.every((end) => points[end].kind) && ROUTE_KINDS.includes(route?.kind) ? route.kind : null;
		return [key, { kind, text: textOf(route?.text), found: kind === "hidden" && route?.found === true }];
	}));

	return { version: SITE_VERSION, notes: textOf(data?.notes), rules: normaliseRules(data?.rules), points, routes };
}

/**
 * @param {SiteRules} [rules]
 * @returns {Site} Seven unmarked points and no routes.
 */
export const emptySite = (rules = BOOK_RULES) => normaliseSite({ rules });

/**
 * @param {string} key
 * @returns {SiteEdge|null}
 */
export const siteEdge = (key) => EDGES.get(key) ?? null;

/* -------------------------------------------- */
/*  Reading a Site                              */
/* -------------------------------------------- */

/**
 * @param {Site} site
 * @returns {string[]} The marked points' positions, in reading order.
 */
export const markedPoints = (site) => POSITION_KEYS.filter((key) => site.points[key]?.kind);

/**
 * @param {Site} site
 * @returns {string[]} The marked points' positions, lowest number first.
 */
export const numberedPoints = (site) => markedPoints(site).sort((a, b) => site.points[a].number - site.points[b].number);

/**
 * @param {readonly string[]} kinds
 * @param {(string|null)[]} values
 * @returns {Record<string, number>}
 */
const tallyKinds = (kinds, values) => Object.fromEntries(kinds.map((kind) => [kind, values.filter((value) => value === kind).length]));

/** @param {Site} site @returns {Record<string, number>} How many points are each of POINT_KINDS. */
export const pointCounts = (site) => tallyKinds(POINT_KINDS, POSITION_KEYS.map((key) => site.points[key].kind));

/** @param {Site} site @returns {Record<string, number>} How many routes are each of ROUTE_KINDS. */
export const routeCounts = (site) => tallyKinds(ROUTE_KINDS, SITE_EDGES.map(({ key }) => site.routes[key].kind));

/** @param {Site} site @returns {Record<string, number>} How many entrances are each of ENTRANCE_KINDS. */
export const entranceCounts = (site) => tallyKinds(ENTRANCE_KINDS, POSITION_KEYS.map((key) => site.points[key].entrance));

/**
 * @param {Site} site
 * @returns {SiteEdge[]} Where a route could run: every neighbouring pair with both points marked.
 */
export const routeSlots = (site) => SITE_EDGES.filter(({ ends }) => ends.every((end) => site.points[end].kind));

/**
 * @param {Site} site
 * @param {string} key A position.
 * @returns {{key: string, other: string, to: number, kind: string, text: string, found: boolean}[]}
 *   The routes from that point, nearest number first.
 */
export function routesFrom(site, key) {
	return SITE_EDGES
		.filter(({ key: edge, ends }) => ends.includes(key) && site.routes[edge].kind)
		.map(({ key: edge, ends }) => {
			const other = ends[0] === key ? ends[1] : ends[0];
			return { key: edge, other, to: site.points[other].number, ...site.routes[edge] };
		})
		.sort((a, b) => a.to - b.to);
}

/**
 * @param {string[]} keys
 * @returns {{root: (key: string) => string, join: (a: string, b: string) => boolean}}
 *   `join` says whether the two were apart until then.
 */
function unionFind(keys) {
	const parent = new Map(keys.map((key) => [key, key]));
	const root = (key) => {
		let current = key;
		while (parent.get(current) !== current) current = parent.get(current);
		return current;
	};
	return {
		root,
		join(a, b) {
			const [x, y] = [root(a), root(b)];
			if (x === y) return false;
			parent.set(x, y);
			return true;
		}
	};
}

/**
 * @param {string[]} keys Positions.
 * @returns {boolean} Whether routes between neighbours among them could join them all.
 */
function joinable(keys) {
	const union = unionFind(keys);
	let pieces = keys.length;
	for (const { ends } of SITE_EDGES) {
		if (ends.every((end) => keys.includes(end)) && union.join(...ends)) pieces--;
	}
	return pieces <= 1;
}

/**
 * The marked points that routes of any kind don't reach from the rest of the
 * Site: from the entrance's point if there is one, otherwise from the largest
 * group of joined points, and among equals the one holding the lowest number.
 * @param {Site} site
 * @returns {number[]} Their numbers, lowest first.
 */
export function unreachablePoints(site) {
	const numbered = numberedPoints(site);
	if (numbered.length < 2) return [];
	const union = unionFind(numbered);
	for (const { key, ends } of SITE_EDGES) {
		if (site.routes[key].kind) union.join(...ends);
	}

	const sizes = new Map();
	for (const key of numbered) sizes.set(union.root(key), (sizes.get(union.root(key)) ?? 0) + 1);
	const entrance = numbered.find((key) => site.points[key].entrance === "open");
	// Numbered is lowest first, so the first of the largest groups found holds the lowest number.
	const main = entrance ? union.root(entrance) : union.root(numbered.reduce((best, key) => (sizes.get(union.root(key)) > sizes.get(union.root(best)) ? key : best)));
	return numbered.filter((key) => union.root(key) !== main).map((key) => site.points[key].number);
}

/**
 * @typedef {object} SiteTally
 * @property {string} kind
 * @property {number} count
 * @property {number} target   What the rules ask for.
 * @property {string} state    One of STEP_STATES.
 * @property {boolean} optional Fewer than the target still counts as done.
 */

/**
 * @typedef {object} SiteStep
 * @property {string} key          One of SITE_STEPS.
 * @property {string} state        One of STEP_STATES.
 * @property {SiteTally[]} tallies Empty for the reachable step.
 * @property {number[]} unreachable Points the routes don't reach, for the reachable step.
 */

/**
 * @param {readonly string[]} kinds
 * @param {Record<string, number>} counts
 * @param {Record<string, number>} targets
 * @param {string[]} [optional] Kinds the rules allow rather than ask for.
 * @returns {SiteTally[]}
 */
function tallies(kinds, counts, targets, optional = []) {
	return kinds.map((kind) => {
		const [count, target] = [counts[kind], targets[kind]];
		const enough = optional.includes(kind) ? count <= target : count === target;
		return { kind, count, target, state: count > target ? "over" : enough ? "done" : "todo", optional: optional.includes(kind) };
	});
}

/** @param {SiteTally[]} items */
const overall = (items) => (items.some(({ state }) => state === "over") ? "over" : items.every(({ state }) => state === "done") ? "done" : "todo");

/**
 * How far the Site has come through the book's steps.
 * @param {Site} site
 * @returns {SiteStep[]} In the order of SITE_STEPS.
 */
export function siteSteps(site) {
	const points = tallies(POINT_KINDS, pointCounts(site), site.rules.points);
	const routes = tallies(ROUTE_KINDS, routeCounts(site), site.rules.routes);
	const entrances = tallies(ENTRANCE_KINDS, entranceCounts(site), site.rules.entrances, ["hidden"]);
	const routesState = overall(routes);
	const unreachable = unreachablePoints(site);
	// Points are unreachable while the routes are still being drawn, and that's only a problem once they're drawn.
	let reachable = "done";
	if (!markedPoints(site).length) reachable = "todo";
	else if (unreachable.length) reachable = routesState === "todo" ? "todo" : "problem";
	return [
		{ key: "points", state: overall(points), tallies: points, unreachable: [] },
		{ key: "routes", state: routesState, tallies: routes, unreachable: [] },
		{ key: "reachable", state: reachable, tallies: [], unreachable },
		{ key: "entrances", state: overall(entrances), tallies: entrances, unreachable: [] }
	];
}

/**
 * What players who can see the Site are shown: the points they've found, the
 * open and closed routes leading from those, the hidden routes they've found,
 * and the entrances they know of. A point not yet found that one of those
 * leads to is glimpsed, drawn without saying what's there.
 * @param {Site} site
 * @returns {{points: {key: string, kind: string, number: number}[], glimpsed: string[],
 *   routes: {key: string, kind: string}[], entrances: {key: string, kind: string}[]}} In reading and SITE_EDGES order.
 */
export function playerView(site) {
	const found = (key) => Boolean(site.points[key].kind && site.points[key].found);
	const routes = SITE_EDGES
		.filter(({ key, ends }) => {
			const { kind, found: routeFound } = site.routes[key];
			if (!kind) return false;
			return kind === "hidden" ? routeFound : ends.some(found);
		})
		.map(({ key }) => ({ key, kind: site.routes[key].kind }));
	const entrances = markedPoints(site)
		.filter((key) => {
			const { entrance, entranceFound } = site.points[key];
			return entrance && (entranceFound || (entrance === "open" && found(key)));
		})
		.map((key) => ({ key, kind: site.points[key].entrance }));
	const leadsTo = new Set([...routes.flatMap(({ key }) => EDGES.get(key).ends), ...entrances.map(({ key }) => key)]);

	return {
		points: markedPoints(site).filter(found).map((key) => ({ key, kind: site.points[key].kind, number: site.points[key].number })),
		glimpsed: markedPoints(site).filter((key) => !found(key) && leadsTo.has(key)),
		routes,
		entrances
	};
}

/**
 * @param {Site} site
 * @returns {boolean} Whether nothing has been drawn or written on the Site. Its rules don't count.
 */
export function isBlankSite(site) {
	const written = (text) => Boolean(text.trim());
	return !written(site.notes)
		&& POSITION_KEYS.every((key) => {
			const { kind, text, entranceText } = site.points[key];
			return !kind && !written(text) && !written(entranceText);
		})
		&& SITE_EDGES.every(({ key }) => !site.routes[key].kind && !written(site.routes[key].text));
}

/**
 * The values that differ between two Sites, by their dotted path below the
 * Site, so a write touches only what changed and leaves anyone else's edits
 * to other parts alone.
 *
 * Both Sites must already be normalised, as one read with `readSite` or
 * returned by any of the drawing functions below is.
 *
 * @param {Site} before
 * @param {Site} after
 * @returns {Record<string, unknown>} Such as `{"points.top.kind": "danger"}`.
 */
export function siteChanges(before, after) {
	const changes = {};
	const walk = (was, now, path) => {
		for (const [key, value] of Object.entries(now)) {
			const at = path ? `${path}.${key}` : key;
			if (value !== null && typeof value === "object") walk(was?.[key], value, at);
			else if (was?.[key] !== value) changes[at] = value;
		}
	};
	walk(before, after, "");
	return changes;
}

/* -------------------------------------------- */
/*  Drawing a Site                              */
/* -------------------------------------------- */

/**
 * Mark a point as one of POINT_KINDS, or erase it. A newly marked point takes
 * the next number. Erasing a point also erases its routes and entrance and
 * what's written about them, and closes the gap in the numbers.
 * @param {Site} site
 * @param {string} key      A position.
 * @param {string|null} kind
 * @returns {Site}
 */
export function markPoint(site, key, kind) {
	const next = normaliseSite(site);
	const point = next.points[key];
	if (!point) return next;

	if (!kind) {
		if (!point.kind) return next;
		for (const other of Object.values(next.points)) {
			if (other.number > point.number) other.number -= 1;
		}
		next.points[key] = { kind: null, number: null, text: "", entrance: null, entranceText: "", found: false, entranceFound: false };
		for (const { key: edge, ends } of SITE_EDGES) {
			if (ends.includes(key)) next.routes[edge] = { kind: null, text: "", found: false };
		}
		return normaliseSite(next);
	}

	if (!POINT_KINDS.includes(kind)) return next;
	if (!point.kind) point.number = markedPoints(next).length + 1;
	point.kind = kind;
	return normaliseSite(next);
}

/**
 * Give a marked point another number, swapping with the point that had it.
 * @param {Site} site
 * @param {string} key
 * @param {number} number
 * @returns {Site}
 */
export function numberPoint(site, key, number) {
	const next = normaliseSite(site);
	const point = next.points[key];
	const other = Object.values(next.points).find((each) => each.kind && each.number === number);
	if (!point?.kind || !other || other === point) return next;
	[other.number, point.number] = [point.number, number];
	return normaliseSite(next);
}

/**
 * Place an entrance of one of ENTRANCE_KINDS at a marked point, or take it away.
 * @param {Site} site
 * @param {string} key
 * @param {string|null} kind
 * @returns {Site}
 */
export function setEntrance(site, key, kind) {
	const next = normaliseSite(site);
	const point = next.points[key];
	if (!point?.kind || (kind && !ENTRANCE_KINDS.includes(kind))) return next;
	if (kind) point.entrance = kind;
	else Object.assign(point, { entrance: null, entranceText: "", entranceFound: false });
	return normaliseSite(next);
}

/**
 * Draw a route of one of ROUTE_KINDS between two marked neighbours, or take it
 * away with what's written about it.
 * @param {Site} site
 * @param {string} key One of SITE_EDGES' keys.
 * @param {string|null} kind
 * @returns {Site}
 */
export function setRoute(site, key, kind) {
	const next = normaliseSite(site);
	const edge = EDGES.get(key);
	if (!edge || !edge.ends.every((end) => next.points[end].kind) || (kind && !ROUTE_KINDS.includes(kind))) return next;
	if (kind) next.routes[key].kind = kind;
	else next.routes[key] = { kind: null, text: "", found: false };
	return normaliseSite(next);
}

/**
 * @param {Site} site
 * @param {SiteRules|object} rules
 * @returns {Site} With the rules changed and everything drawn kept.
 */
export function setRules(site, rules) {
	const next = normaliseSite(site);
	next.rules = normaliseRules(rules, next.rules);
	return next;
}

/**
 * Erase every point, route and entrance, keeping the rules and the notes.
 * @param {Site} site
 * @returns {Site}
 */
export function clearSite(site) {
	const { rules, notes } = normaliseSite(site);
	return normaliseSite({ rules, notes });
}

/**
 * Take what the Site's form holds: the notes, the rules, and what's written
 * about each point, entrance and route. Fields the form didn't send are left
 * as they were.
 * @param {Site} site
 * @param {object} data Expanded form data, such as `{points: {top: {text: "A cove"}}}`.
 * @returns {Site}
 */
export function applySiteForm(site, data) {
	const next = normaliseSite(site);
	if (typeof data?.notes === "string") next.notes = data.notes;
	if (data?.rules) next.rules = normaliseRules(data.rules, next.rules);
	for (const key of POSITION_KEYS) {
		for (const field of ["text", "entranceText"]) {
			const value = data?.points?.[key]?.[field];
			if (typeof value === "string") next.points[key][field] = value;
		}
	}
	for (const { key } of SITE_EDGES) {
		const value = data?.routes?.[key]?.text;
		if (typeof value === "string") next.routes[key].text = value;
	}
	return normaliseSite(next);
}

/* -------------------------------------------- */
/*  Revealing a Site                            */
/* -------------------------------------------- */

/**
 * @param {Site} site
 * @param {string} key
 * @param {boolean} found
 * @returns {Site} With players having found, or not, the marked point there.
 */
export function revealPoint(site, key, found) {
	const next = normaliseSite(site);
	if (next.points[key]?.kind) next.points[key].found = Boolean(found);
	return next;
}

/**
 * @param {Site} site
 * @param {string} key A position with an entrance.
 * @param {boolean} found
 * @returns {Site}
 */
export function revealEntrance(site, key, found) {
	const next = normaliseSite(site);
	if (next.points[key]?.entrance) next.points[key].entranceFound = Boolean(found);
	return next;
}

/**
 * @param {Site} site
 * @param {string} key One of SITE_EDGES' keys, for a hidden route. Other routes are seen from either end.
 * @param {boolean} found
 * @returns {Site}
 */
export function revealRoute(site, key, found) {
	const next = normaliseSite(site);
	if (next.routes[key]?.kind === "hidden") next.routes[key].found = Boolean(found);
	return next;
}

/**
 * @param {Site} site
 * @param {boolean} found
 * @returns {Site} With players having found everything, or nothing.
 */
export function revealEverything(site, found) {
	const next = normaliseSite(site);
	for (const point of Object.values(next.points)) {
		if (point.kind) point.found = Boolean(found);
		if (point.entrance) point.entranceFound = Boolean(found);
	}
	for (const route of Object.values(next.routes)) {
		if (route.kind === "hidden") route.found = Boolean(found);
	}
	return next;
}

/* -------------------------------------------- */
/*  Rolling a Site                              */
/* -------------------------------------------- */

/**
 * @template T
 * @param {T[]} list
 * @param {number} size
 * @returns {T[][]} Every way to choose that many from the list, each in the list's order.
 */
function subsets(list, size) {
	if (size === 0) return [[]];
	if (size > list.length) return [];
	const [first, ...rest] = list;
	return [...subsets(rest, size - 1).map((subset) => [first, ...subset]), ...subsets(rest, size)];
}

/**
 * @param {Record<string, number>} targets
 * @param {Record<string, number>} counts
 * @param {readonly string[]} kinds
 * @returns {string[]} Each kind repeated as many times as the rules still ask for it.
 */
const stillWanted = (targets, counts, kinds) => kinds.flatMap((kind) => Array(Math.max(0, targets[kind] - counts[kind])).fill(kind));

/**
 * Step 1: mark the points the rules still ask for at unmarked positions, where
 * routes could join them to the rest, and number them after the points
 * already marked. The positions left over are the erased ones.
 * @param {Site} site
 * @param {ReturnType<import("./random.js").createRandom>} random
 * @returns {Site}
 */
export function rollPoints(site, random) {
	const next = normaliseSite(site);
	const wanted = stillWanted(next.rules.points, pointCounts(next), POINT_KINDS);
	const free = POSITION_KEYS.filter((key) => !next.points[key].kind);
	const take = Math.min(wanted.length, free.length);
	if (!take) return next;

	const marked = markedPoints(next);
	const layouts = subsets(free, take);
	const joined = layouts.filter((chosen) => joinable([...marked, ...chosen]));
	const chosen = random.pick(joined.length ? joined : layouts);
	const kinds = random.shuffle(wanted).slice(0, take);
	chosen.forEach((key, index) => Object.assign(next.points[key], { kind: kinds[index], number: marked.length + index + 1 }));
	return normaliseSite(next);
}

/**
 * Step 2 and 3: draw the routes the rules still ask for between marked
 * neighbours, first joining any points the routes don't yet reach. Routes
 * already drawn stay. When the rules ask for too few routes to reach every
 * point, the extra ones needed are open, the least surprising kind.
 * @param {Site} site
 * @param {ReturnType<import("./random.js").createRandom>} random
 * @returns {Site}
 */
export function rollRoutes(site, random) {
	const next = normaliseSite(site);
	const marked = markedPoints(next);
	if (marked.length < 2) return next;

	const slots = routeSlots(next);
	const union = unionFind(marked);
	for (const { key, ends } of slots) {
		if (next.routes[key].kind) union.join(...ends);
	}
	const empty = random.shuffle(slots.filter(({ key }) => !next.routes[key].kind));
	const wanted = random.shuffle(stillWanted(next.rules.routes, routeCounts(next), ROUTE_KINDS));

	const added = empty.filter(({ ends }) => union.join(...ends));
	for (const edge of empty) {
		if (added.length >= wanted.length) break;
		if (!added.includes(edge)) added.push(edge);
	}
	const kinds = random.shuffle([...wanted.slice(0, added.length), ...Array(Math.max(0, added.length - wanted.length)).fill("open")]);
	added.forEach(({ key }, index) => { next.routes[key].kind = kinds[index]; });
	return normaliseSite(next);
}

/**
 * Step 4: place the entrances the rules still ask for, each at a marked point
 * with no entrance yet.
 * @param {Site} site
 * @param {ReturnType<import("./random.js").createRandom>} random
 * @returns {Site}
 */
export function rollEntrances(site, random) {
	const next = normaliseSite(site);
	for (const kind of ENTRANCE_KINDS) {
		for (let missing = next.rules.entrances[kind] - entranceCounts(next)[kind]; missing > 0; missing--) {
			const key = random.pick(markedPoints(next).filter((each) => !next.points[each].entrance));
			if (!key) break;
			next.points[key].entrance = kind;
		}
	}
	return normaliseSite(next);
}

/**
 * Follow the book's steps for whatever isn't done, keeping everything already drawn.
 * @param {Site} site
 * @param {ReturnType<import("./random.js").createRandom>} random
 * @returns {Site}
 */
export const rollSite = (site, random) => rollEntrances(rollRoutes(rollPoints(site, random), random), random);

/** The roll for each step that has one. Every point being reachable comes with the routes. */
export const STEP_ROLLS = Object.freeze({ points: rollPoints, routes: rollRoutes, entrances: rollEntrances });

/**
 * Whether each step's roll would draw anything, answered without rolling: the
 * sheet asks on every draw, and offers a roll that would do nothing disabled
 * rather than hidden, so the steps stay in line. Each one mirrors the
 * condition its roll above stops on, so they're changed together.
 */

/** @param {Site} site @returns {boolean} */
const canRollPoints = (site) => stillWanted(site.rules.points, pointCounts(site), POINT_KINDS).length > 0
	&& POSITION_KEYS.some((key) => !site.points[key].kind);

/** @param {Site} site @returns {boolean} */
function canRollRoutes(site) {
	const marked = markedPoints(site);
	if (marked.length < 2) return false;
	const slots = routeSlots(site);
	const empty = slots.filter(({ key }) => !site.routes[key].kind);
	if (!empty.length) return false;
	if (stillWanted(site.rules.routes, routeCounts(site), ROUTE_KINDS).length) return true;
	// With the rules met, a roll still draws whatever joins points the routes don't yet reach.
	const union = unionFind(marked);
	for (const { key, ends } of slots) {
		if (site.routes[key].kind) union.join(...ends);
	}
	return empty.some(({ ends }) => union.root(ends[0]) !== union.root(ends[1]));
}

/** @param {Site} site @returns {boolean} */
const canRollEntrances = (site) => stillWanted(site.rules.entrances, entranceCounts(site), ENTRANCE_KINDS).length > 0
	&& markedPoints(site).some((key) => !site.points[key].entrance);

/** Whether each step's roll has anything left to do. */
export const STEP_CAN_ROLL = Object.freeze({ points: canRollPoints, routes: canRollRoutes, entrances: canRollEntrances });
