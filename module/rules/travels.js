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
import { hexSummary } from "./realm.js";
import { hexKey, parseHexKey, sameHex } from "./realm-geometry.js";

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
 * @property {{count: number, first: {when: object|null}, last: {when: object|null}}|null} visits
 * @property {string|null} terrain
 * @property {{style: string, name: string, seat: boolean}|null} holding
 * @property {{type: string, name: string}|null} landmark
 * @property {{number: number}|null} myth
 * @property {{note: string}|null} sighted
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
		visits: visits ? { count: visits.count, first: { when: visits.first.when }, last: { when: visits.last.when } } : null,
		terrain: seen.terrain,
		holding: seen.holding ? { style: seen.holding.style, name: seen.holding.name, seat: seen.holding.seat } : null,
		landmark: seen.landmark ? { type: seen.landmark.type, name: seen.landmark.name } : null,
		myth: seen.myth ? { number: seen.myth.number } : null,
		sighted: mark ? { note: mark.note } : null,
		// Kept oldest first; the players read the latest telling first.
		told: [...(record?.told ?? [])].reverse().map(({ id, note, when }) => ({ id, note, when })),
		party: record?.party ? { text: record.party.text, byName: record.party.byName, when: record.party.when, at: record.party.at } : null,
		here: sameHex(companyHex, hex),
		openable: Boolean(visits || record || mark)
	};
}

/** @returns {number} Column, then row. */
const byPlace = (a, b) => a.col - b.col || a.row - b.row;

/**
 * Every hex the players hold anything about.
 * @param {TravelsSources} sources
 * @returns {{visited: PlayerHexView[], heardOf: PlayerHexView[], count: number, total: number}}
 *   Visited hexes are the last reached first; the ones never reached but told
 *   of, written about or seen from afar follow by column, then row.
 */
export function travelsList(sources) {
	const visited = visitedMarkHexes(sources.journey);
	const keys = new Set(visited.map(hexKey));
	const heard = [
		...Object.keys(sources.shared?.hexes ?? {}).map(parseHexKey),
		...(sources.marks ?? []).map(({ hex }) => hex)
	].filter((hex) => hex && !keys.has(hexKey(hex)));
	const heardOf = [...new Map(heard.map((hex) => [hexKey(hex), hex])).values()].sort(byPlace);
	const g = sources.g;
	return {
		visited: visited.map((hex) => playerHexView(sources, hex)),
		heardOf: heardOf.map((hex) => playerHexView(sources, hex)),
		count: visited.length,
		total: g ? g.cols * g.rows : 0
	};
}

/**
 * The words a hex shows the players, for its row and for searching. Only the
 * view goes in, so search can't find what the view doesn't show.
 * @param {PlayerHexView} view
 * @param {(key: string, data?: object) => string} t The language's words for a key.
 * @returns {{title: string, terrain: string, features: string[], sighted: string}}
 */
export function viewWords(view, t) {
	const holding = view.holding && (view.holding.name || t(`realm.holdings.${view.holding.style}`));
	const landmarkType = view.landmark && t(`realm.landmarks.${view.landmark.type}`);
	const landmark = view.landmark && (view.landmark.name ? `${landmarkType}: ${view.landmark.name}` : landmarkType);
	const features = [
		holding && (view.holding.seat ? t("realm.readout.seat", { name: holding }) : holding),
		view.myth && t("realm.readout.myth", { number: view.myth.number }),
		landmark
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
