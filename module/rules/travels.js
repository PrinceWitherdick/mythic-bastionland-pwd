/**
 * The players' own record of the Realm: each hex the Company has been to, as
 * the Company knows it. Built from what any player could already see on the
 * map — the terrain, a Holding not hidden by hand, a Myth or Landmark once
 * found — plus the visits, the marks of things seen from afar, what the
 * Referee told them and their own note. The GM's hex lore never comes in
 * here, so nothing the Referee keeps to themselves can ride out. Pure, so it
 * can be tested without Foundry.
 */
import { visitedNewestFirst, visitsAt } from "./journey.js";
import { sharedAt } from "./hex-shared.js";
import { barriersAround, edgeSide, hexSummary, holdingName } from "./realm.js";
import { hexKey, parseHexKey, sameHex } from "./realm-geometry.js";
import { compareCalendars, normalizeCalendar, PHASES, seasonKey } from "./time.js";

/**
 * @typedef {object} TravelsSources
 * @property {object} realm     The Realm, as the viewer may know it.
 * @property {object} g         Its geometry.
 * @property {object} journey   Where the Company has been.
 * @property {object} shared    What was told, and the Company's notes.
 * @property {{hex: {col: number, row: number}, note: string}[]} marks
 *   The marks of what was seen from afar that still stand for something hidden.
 * @property {(hex: {col: number, row: number}) => object} handHidden What the GM hid by hand in a hex.
 * @property {{col: number, row: number}|null} [companyHex] Where the Company stands.
 */

/** @returns {{hex: object, note: string}|null} */
const markAt = (marks, hex) => (marks ?? []).find((mark) => sameHex(mark.hex, hex)) ?? null;

/**
 * Whether the players may open a hex: one the Company has been to, one the
 * Referee told them of, one they've written about, or one where something
 * was seen from afar.
 * @param {Pick<TravelsSources, "journey"|"shared"|"marks">} sources
 * @param {{col: number, row: number}} hex
 * @returns {boolean}
 */
export function openableHex({ journey, shared, marks }, hex) {
	return Boolean(visitsAt(journey, hex) || sharedAt(shared, hex) || markAt(marks, hex));
}

/**
 * @typedef {object} PlayerHexView
 * @property {{col: number, row: number}} hex
 * @property {string} key
 * @property {{count: number, first: {when: object|null}, last: {when: object|null, order: number}}|null} visits
 * @property {string|null} terrain
 * @property {{style: string, name: string, seat: boolean}|null} holding
 * @property {{type: string, name: string}|null} landmark
 * @property {{number: number}|null} myth
 * @property {{note: string}|null} sighted
 * @property {string[]} barriers The ways out of it a revealed Barrier closes, clockwise.
 * @property {{direction: string, byName: string, when: object|null}[]} met
 *   The hidden Barriers the Company found by running into them from here, the latest first.
 * @property {{id: string, note: string, when: object|null}[]} told Newest first.
 * @property {{text: string, byName: string, when: object|null, at: number}|null} party
 * @property {boolean} here     Whether the Company stands there now.
 * @property {boolean} openable
 */

/**
 * One hex as the players know it.
 * @param {TravelsSources} sources
 * @param {{col: number, row: number}} hex
 * @returns {PlayerHexView}
 */
export function playerHexView(sources, hex) {
	const { realm, g, journey, shared, marks, handHidden, companyHex = null } = sources;
	const seen = hexSummary(realm, g, hex, { showHidden: false, hiddenByHand: handHidden?.(hex) ?? {} });
	const visits = visitsAt(journey, hex);
	const record = sharedAt(shared, hex);
	const mark = markAt(marks, hex);
	return {
		hex: { col: hex.col, row: hex.row },
		key: hexKey(hex),
		visits: visits ? { count: visits.count, first: { when: visits.first.when }, last: { when: visits.last.when, order: visits.last.order } } : null,
		terrain: seen.terrain,
		holding: seen.holding ? { style: seen.holding.style, name: seen.holding.name, seat: seen.holding.seat } : null,
		landmark: seen.landmark ? { type: seen.landmark.type, name: seen.landmark.name } : null,
		myth: seen.myth ? { number: seen.myth.number } : null,
		sighted: mark ? { note: mark.note } : null,
		barriers: barriersAround(realm, g, hex).map((barrier) => barrier.direction),
		met: [...(record?.met ?? [])].reverse()
			.map(({ edge, byName, when }) => ({ direction: edgeSide(g, hex, edge), byName, when }))
			.filter((met) => met.direction),
		// Kept oldest first; the players read the latest telling first.
		told: [...(record?.told ?? [])].reverse().map(({ id, note, when }) => ({ id, note, when })),
		party: record?.party ? { text: record.party.text, byName: record.party.byName, when: record.party.when, at: record.party.at } : null,
		here: sameHex(companyHex, hex),
		openable: Boolean(visits || record || mark)
	};
}

/**
 * @param {TravelsSources} sources
 * @returns {(hex: {col: number, row: number}) => PlayerHexView} Each hex as the players know it, worked out once however often it's asked for.
 */
export function hexViews(sources) {
	const views = new Map();
	return (hex) => {
		const key = hexKey(hex);
		if (!views.has(key)) views.set(key, playerHexView(sources, hex));
		return views.get(key);
	};
}

/** @returns {number} Column, then row. */
const byPlace = (a, b) => a.col - b.col || a.row - b.row;

/** The pages the players' record can show, the one shown first when nothing was chosen. */
export const TRAVELS_VIEWS = Object.freeze(["places", "chart", "journey"]);

/** The tags the players can narrow their places to, in the order the filters show them. */
export const TRAVELS_FILTERS = Object.freeze(["holding", "landmark", "myth", "told", "noted", "heardOf"]);

/**
 * What a hex holds, as the players know it, for filtering and grouping.
 * @param {PlayerHexView} view
 * @returns {string[]} Some of holding, landmark, myth, told, noted, barrier, sighted, heardOf and here.
 */
export function viewTags(view) {
	return [
		view.holding && "holding",
		view.landmark && "landmark",
		view.myth && "myth",
		view.told.length > 0 && "told",
		view.party && "noted",
		(view.barriers.length > 0 || view.met.length > 0) && "barrier",
		view.sighted && "sighted",
		!view.visits && "heardOf",
		view.here && "here"
	].filter(Boolean);
}

/** The tags that make a hex more than its terrain. */
const NOTEWORTHY = new Set(["holding", "landmark", "myth", "told", "noted", "barrier", "sighted"]);

/**
 * @param {PlayerHexView} view
 * @returns {boolean} Whether the Company found, was told or wrote anything of the hex beyond its terrain.
 */
export const ofNote = (view) => viewTags(view).some((tag) => NOTEWORTHY.has(tag));

/** The orders the places can be listed in, the first the default. */
export const TRAVELS_SORTS = Object.freeze(["last", "name", "most"]);

/** @returns {number} The order the Company last came into the hex, or nothing for one never reached. */
const lastOrder = (view) => view.visits?.last.order ?? -Infinity;

/**
 * Put the places in an order.
 * @param {PlayerHexView[]} views
 * @param {string} by One of TRAVELS_SORTS: the last reached first, by name, or the most visited first.
 * @param {(view: PlayerHexView) => string} [title] The name a hex goes by, for sorting by name.
 * @returns {PlayerHexView[]} A new list; one that can't be told apart keeps its place.
 */
export function sortViews(views, by, title = (view) => view.key) {
	const list = [...views];
	if (by === "name") {
		const names = new Map(list.map((view) => [view, title(view)]));
		return list.sort((a, b) => names.get(a).localeCompare(names.get(b), undefined, { numeric: true, sensitivity: "base" }));
	}
	if (by === "most") return list.sort((a, b) => (b.visits?.count ?? 0) - (a.visits?.count ?? 0) || lastOrder(b) - lastOrder(a));
	return list;
}

/**
 * Every hex the players hold anything about.
 * @param {TravelsSources} sources
 * @param {ReturnType<typeof hexViews>} [viewOf]
 * @returns {{visited: PlayerHexView[], ofNote: PlayerHexView[], wilderness: PlayerHexView[], heardOf: PlayerHexView[], count: number, total: number}}
 *   Visited hexes are the last reached first, and split between those with
 *   something to them and the plain wilderness; the ones never reached but
 *   told of, written about or seen from afar follow by column, then row.
 */
export function travelsList(sources, viewOf = hexViews(sources)) {
	const visited = visitedMarkHexes(sources.journey);
	const keys = new Set(visited.map(hexKey));
	const heard = [
		...Object.keys(sources.shared?.hexes ?? {}).map(parseHexKey),
		...(sources.marks ?? []).map(({ hex }) => hex)
	].filter((hex) => hex && !keys.has(hexKey(hex)));
	const heardOf = [...new Map(heard.map((hex) => [hexKey(hex), hex])).values()].sort(byPlace);
	const g = sources.g;
	const visitedViews = visited.map((hex) => viewOf(hex));
	const [noted, wilderness] = [[], []];
	for (const view of visitedViews) (ofNote(view) ? noted : wilderness).push(view);
	return {
		visited: visitedViews,
		ofNote: noted,
		wilderness,
		heardOf: heardOf.map((hex) => viewOf(hex)),
		count: visited.length,
		total: g ? g.cols * g.rows : 0
	};
}

/**
 * The Holdings the players can see on the map, as the hexes they stand in.
 * Every Holding is known from the start, so the chart draws one before the
 * Company ever goes there; one the GM hid by hand stays hidden.
 * @param {TravelsSources} sources
 * @param {Set<string>} [known] The keys of hexes already on the chart, left out.
 * @param {ReturnType<typeof hexViews>} [viewOf]
 * @returns {PlayerHexView[]}
 */
export function holdingsKnown(sources, known = new Set(), viewOf = hexViews(sources)) {
	const hexes = new Map((sources.realm?.holdings ?? [])
		.filter((holding) => holding.hex && !known.has(hexKey(holding.hex)))
		.map((holding) => [hexKey(holding.hex), holding.hex]));
	return [...hexes.values()].sort(byPlace).map((hex) => viewOf(hex)).filter((view) => view.holding);
}

/**
 * @param {object|null} when
 * @returns {string|null} The Season a moment fell in, the same for every day of it, or null for no moment.
 */
const seasonOf = (when) => (when ? seasonKey(when) : null);

/** @returns {string|null} The day a moment fell on. */
const dayOf = (when) => (when ? `${seasonKey(when)}|${normalizeCalendar(when).day}` : null);

/** @returns {number} Where a moment falls within its day. */
const phaseIndex = (when) => Math.max(0, PHASES.indexOf(when?.phase));

/**
 * @typedef {object} JourneyEntry
 * @property {"arrived"|"told"|"met"|"noted"} kind
 * @property {PlayerHexView} view   The hex, as the players know it.
 * @property {object|null} when
 * @property {boolean} [first]      For an arrival, whether it was the first time there.
 * @property {string} [note]        For a telling, what was told.
 * @property {string} [direction]   For a Barrier met, which way it closed.
 * @property {string} [byName]      For a Barrier met or a note written, who.
 */

/**
 * @typedef {object} JourneySeason
 * @property {object|null} when The first moment of it, to name it by; null for the undated.
 * @property {{entries: JourneyEntry[]}[]} days The latest day first, each in the order it went.
 */

/**
 * How many years on each Season of a journey log is from the log's first of
 * the same Season and Age. The year is never shown, so without it two Springs
 * of one Age would read alike.
 * @param {JourneySeason[]} log
 * @returns {number[]} One for each Season, 0 for the first of its name or one undated.
 */
export function seasonYearsOn(log) {
	const name = ({ age, season }) => `${age}-${season}`;
	const first = new Map();
	const dated = log.map(({ when }) => (when ? normalizeCalendar(when) : null));
	for (const when of dated) if (when) first.set(name(when), Math.min(first.get(name(when)) ?? Infinity, when.year));
	return dated.map((when) => (when ? when.year - first.get(name(when)) : 0));
}

/**
 * The Company's journey on a Realm, as a log: each time it came into a hex,
 * each telling, each hidden Barrier run into and the Company's latest notes,
 * gathered by Season and by day. Only the players' own record goes in, and
 * each hex as they know it.
 * @param {TravelsSources} sources
 * @param {ReturnType<typeof hexViews>} [viewOf]
 * @returns {JourneySeason[]} The latest Season first, then whatever was kept with no date.
 */
export function journeyLog(sources, viewOf = hexViews(sources)) {
	/** @type {(JourneyEntry & {rank: number})[]} */
	const entries = [];
	for (const [key, visits] of Object.entries(sources.journey?.hexes ?? {})) {
		const hex = parseHexKey(key);
		if (!hex) continue;
		visits.arrivals.forEach((arrival, index) => entries.push({
			kind: "arrived", view: viewOf(hex), when: arrival.when, first: index === 0, rank: arrival.order
		}));
	}
	for (const [key, record] of Object.entries(sources.shared?.hexes ?? {})) {
		const hex = parseHexKey(key);
		if (!hex) continue;
		// Kept beside the arrivals, they follow them within their Phase, in the order they were written.
		for (const told of record.told ?? []) entries.push({ kind: "told", view: viewOf(hex), when: told.when ?? null, note: told.note, rank: Infinity, at: told.at ?? 0 });
		for (const met of record.met ?? []) {
			const direction = edgeSide(sources.g, hex, met.edge);
			if (direction) entries.push({ kind: "met", view: viewOf(hex), when: met.when ?? null, direction, byName: met.byName, rank: Infinity, at: met.at ?? 0 });
		}
		if (record.party) entries.push({ kind: "noted", view: viewOf(hex), when: record.party.when ?? null, byName: record.party.byName, rank: Infinity, at: record.party.at ?? 0 });
	}
	// Within a day, by Phase, then the arrivals in the order travelled and the rest as written.
	entries.sort((a, b) => phaseIndex(a.when) - phaseIndex(b.when) || a.rank - b.rank || (a.at ?? 0) - (b.at ?? 0));

	const seasons = new Map();
	for (const { rank: _rank, at: _at, ...entry } of entries) {
		const season = seasonOf(entry.when);
		if (!seasons.has(season)) seasons.set(season, { when: entry.when, days: new Map() });
		const days = seasons.get(season).days;
		const day = dayOf(entry.when);
		if (!days.has(day)) days.set(day, { when: entry.when, entries: [] });
		days.get(day).entries.push(entry);
	}
	// The latest first, and the undated last, after every dated Season.
	const byDate = (a, b) => (!a.when) - (!b.when) || (a.when && b.when ? compareCalendars(b.when, a.when) : 0);
	return [...seasons.values()].sort(byDate).map(({ when, days }) => ({
		when,
		days: [...days.values()].sort(byDate).map(({ entries: kept }) => ({ entries: kept }))
	}));
}

/**
 * The words a hex shows the players, for its row and for searching. Only the
 * view goes in, so search can't find what the view doesn't show.
 * @param {PlayerHexView} view
 * @param {(key: string, data?: object) => string} t The language's words for a key.
 * @returns {{title: string, terrain: string, features: string[], sighted: string}}
 */
export function viewWords(view, t) {
	const holding = view.holding && holdingName(view.holding, t);
	const landmarkType = view.landmark && t(`realm.landmarks.${view.landmark.type}`);
	const landmark = view.landmark && (view.landmark.name ? `${landmarkType}: ${view.landmark.name}` : landmarkType);
	const features = [
		holding && (view.holding.seat ? t("realm.readout.seat", { name: holding }) : holding),
		view.myth && t("realm.readout.myth", { number: view.myth.number }),
		landmark,
		...(view.barriers ?? []).map((direction) => t("realm.readout.barrier", { direction: t(`realm.directions.${direction}`) }))
	].filter(Boolean);
	const place = view.holding?.name || view.landmark?.name || "";
	return {
		title: place ? `${place} (${t("realm.hex", view.hex)})` : t("realm.hex", view.hex),
		terrain: view.terrain ? t(`realm.terrain.${view.terrain}`) : "",
		features,
		sighted: view.sighted ? (view.sighted.note ? t("seenFromAfar.readoutNote", { note: view.sighted.note }) : t("seenFromAfar.readout")) : ""
	};
}

/**
 * All the words a hex can be searched by.
 * @param {PlayerHexView} view
 * @param {ReturnType<typeof viewWords>} words
 * @returns {string[]}
 */
export const viewSearchWords = (view, words) => [
	words.title,
	words.terrain,
	...words.features,
	words.sighted,
	...view.told.map((told) => told.note),
	view.party?.text ?? ""
].filter(Boolean);

/**
 * The hexes to mark as visited on the map.
 * @param {object} journey
 * @returns {{col: number, row: number}[]}
 */
export const visitedMarkHexes = (journey) => visitedNewestFirst(journey).map(({ hex }) => hex).filter(Boolean);

/**
 * Which Realm the players' record shows: the one chosen, while it's still a
 * Realm; else the one being looked at; else the active one; else where the
 * Company stands; else the first the Company has travelled; else the first.
 * @param {{id: string, viewed?: boolean, active?: boolean, company?: boolean, travelled?: boolean}[]} realms
 * @param {string|null} [chosen]
 * @returns {string|null}
 */
export function pickTravelsRealm(realms, chosen = null) {
	const list = realms ?? [];
	const found = (test) => list.find(test)?.id;
	return found((realm) => realm.id === chosen)
		?? found((realm) => realm.viewed)
		?? found((realm) => realm.active)
		?? found((realm) => realm.company)
		?? found((realm) => realm.travelled)
		?? list[0]?.id
		?? null;
}
