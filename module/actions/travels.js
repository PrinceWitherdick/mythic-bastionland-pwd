import { t } from "../chat/cards.js";
import { reducesMotion } from "../client-settings.js";
import { ringShownHex } from "../canvas/shown-hex.js";
import { headingWords } from "../rules/hex-names.js";
import { hexCentre, inRealm, parseHexKey } from "../rules/realm-geometry.js";
import { realmPalette } from "../rules/realm-skins.js";
import { sightedMarks } from "../rules/sighted.js";
import { searchable } from "../rules/text.js";
import {
	TRAVELS_FILTERS,
	TRAVELS_SORTS,
	TRAVELS_VIEWS,
	holdingsKnown,
	journeyLog,
	hexViews,
	pickTravelsRealm,
	seasonYearsOn,
	sortViews,
	travelsList,
	viewSearchWords,
	viewTags,
	viewWords
} from "../rules/travels.js";
import { LEGEND_KINDS, legendGlyph, routeOf, travelsChart } from "../rules/travels-chart.js";
import { calendarLabel, seasonLabel } from "./calendar.js";
import { companyTokenHex, findCompanyToken } from "./company.js";
import { hexesWithPeopleIn } from "./hex-lore.js";
import { getHexNames } from "./hex-names.js";
import { getHexShared, partyNoteBy } from "./hex-shared.js";
import { getJourney, visitsLabel } from "./journey.js";
import { getRealm, getRealmLook, hexHiddenByHand, isRealmScene, sceneGeometry } from "./realm.js";
import { getSighted } from "./sighted.js";
import { keptFromMe, realmKnown } from "./solo.js";

/**
 * The players' record of the Realm, read off a Scene: what each window and
 * sheet page that shows it is drawn from. Only what a player could already
 * see goes in, whoever is looking, save the chosen hex's part for GMs.
 */

/**
 * @param {Scene|null} scene
 * @returns {import("../rules/travels.js").TravelsSources|null} Null for a Scene that isn't a Realm.
 */
export function travelsSources(scene) {
	const entry = getRealm(scene);
	if (!entry) return null;
	const handHidden = (hex) => hexHiddenByHand(scene, hex);
	return {
		realm: realmKnown(entry.realm),
		g: sceneGeometry(scene),
		journey: getJourney(scene),
		shared: getHexShared(scene),
		names: getHexNames(scene),
		// The marks are read off the whole Realm, as the map draws them, whoever is looking.
		marks: sightedMarks(entry.realm, getSighted(scene), handHidden),
		handHidden,
		companyHex: companyTokenHex(scene),
		gm: Boolean(game.user?.isGM)
	};
}

/**
 * @param {{count: number, last: {when: object|null}}|null} visits
 * @returns {string} How often the Company has been there, and when last.
 */
export const visitsText = (visits) => (visits ? visitsLabel(visits) : t("travels.visits.never"));

/**
 * @param {{direction: string, byName: string, when: object|null}[]} met
 * @returns {string[]} Each hidden Barrier the Company ran into from a hex, worded.
 */
export const barrierMetLines = (met) => (met ?? []).map(({ direction, byName, when }) => t(when ? "travels.met.when" : "travels.met.plain", {
	direction: t(`realm.directions.${direction}`),
	when: when ? calendarLabel(when) : "",
	name: byName || t("travels.party.someone")
}));

/**
 * @param {string} key Under bastionland, with a twin ending in GM.
 * @param {object} [data] What fills its blanks.
 * @returns {string} The GM's wording where one is reading, else the players'.
 */
const forReader = (key, data) => t(game.user?.isGM ? `${key}GM` : key, data);

/**
 * @param {{id: string, note: string, when: object|null}[]} told
 * @returns {{id: string, note: string, when: string|null}[]} What the players were told of a hex, each dated.
 */
export const toldLines = (told) => told.map(({ id, note, when }) => ({ id, note, when: when ? t("travels.told.when", { when: calendarLabel(when) }) : null }));

/** The words each hex shows, worked out once for each view. */
const wordsByView = new WeakMap();

/**
 * @param {import("../rules/travels.js").PlayerHexView} view
 * @returns {ReturnType<typeof viewWords>} The words the hex shows the players.
 */
function wordsOf(view) {
	if (!wordsByView.has(view)) wordsByView.set(view, viewWords(view, t));
	return wordsByView.get(view);
}

/**
 * @param {import("../rules/travels.js").PlayerHexView} view
 * @returns {string} Everything a hex can be searched by, as one text.
 */
const searchText = (view) => searchable(viewSearchWords(view, wordsOf(view)).join(" "));

/**
 * The tag only a Referee narrows the places to, from their own hex lore: the
 * hexes with someone rolled up in them. The players' record never holds it.
 */
const PEOPLE_FILTER = "people";

/**
 * @param {import("../rules/travels.js").PlayerHexView} view
 * @param {Set<string>|null} people The hexes with someone rolled up in them, for a Referee.
 * @returns {string} What the hex holds, for the filters.
 */
const tagsOf = (view, people) => [...viewTags(view), ...(people?.has(view.key) ? [PEOPLE_FILTER] : [])].join(" ");

/** @returns {string} A hex's terrain and features, in a line. */
const aboutText = (words) => [words.terrain, ...words.features].filter(Boolean).join(", ");

/** @returns {string} How often the Company has been to a hex, or how the players know of it. */
const visitsLine = (view, words) => (view.visits ? visitsText(view.visits) : (words.sighted || t("travels.heardOf")));

/**
 * One hex of the list, worded.
 * @param {import("../rules/travels.js").PlayerHexView} view
 * @param {boolean} onMap Whether the Realm is the one on the canvas, so the hex can be shown there.
 * @param {string|null} selected The key of the hex chosen.
 * @param {Set<string>|null} [people] The hexes with someone rolled up in them, for a Referee.
 * @returns {object}
 */
function rowContext(view, onMap, selected, people = null) {
	const words = wordsOf(view);
	return {
		key: view.key,
		hex: view.key,
		title: words.title,
		name: words.name,
		terrain: words.terrain,
		// Under the title: where a named hex is, then what stands in it.
		lines: [words.name && words.coords, words.features.join(", ")].filter(Boolean),
		visits: visitsLine(view, words),
		here: view.here,
		told: view.told.length > 0,
		noted: Boolean(view.party),
		selected: view.key === selected,
		onMap,
		tags: tagsOf(view, people),
		search: searchText(view)
	};
}

/**
 * @param {import("../rules/travels.js").PlayerHexView} view
 * @returns {string} What a hex of the chart is, for its button and tooltip.
 */
function chartLabel(view) {
	const words = wordsOf(view);
	return [words.title, aboutText(words), visitsLine(view, words)].filter(Boolean).join(" — ");
}

/**
 * One line of the journey log, worded.
 * @param {import("../rules/travels.js").JourneyEntry} entry
 * @param {boolean} [forgettable] Whether it has an × to forget it, for a GM in the Places window.
 * @param {Set<string>|null} [people] The hexes with someone rolled up in them, for a Referee.
 * @returns {object}
 */
function journeyEntryContext(entry, forgettable = false, people = null) {
	const { view } = entry;
	const words = wordsOf(view);
	const place = words.title;
	const about = aboutText(words);
	const name = entry.byName || t("travels.party.someone");
	const said = {
		arrived: () => t(entry.first ? "travels.journey.arrivedFirst" : "travels.journey.arrived", { place }),
		told: () => forReader("travels.journey.told", { place }),
		met: () => t("travels.journey.met", { place, name, direction: t(`realm.directions.${entry.direction}`) }),
		noted: () => t("travels.journey.noted", { place, name })
	}[entry.kind]();
	return {
		kind: entry.kind,
		icon: { arrived: entry.first ? "fa-solid fa-flag" : "fa-solid fa-shoe-prints", told: "fa-solid fa-comment", met: "fa-solid fa-road-barrier", noted: "fa-solid fa-pen-nib" }[entry.kind],
		hex: view.key,
		phase: entry.when ? t(`time.phases.${entry.when.phase}`) : "",
		said,
		// What the hex is, the first time the Company comes into it.
		about: entry.kind === "arrived" && entry.first ? about : "",
		note: entry.kind === "told" ? entry.note : "",
		forget: forgettable ? { ref: entry.ref, label: t(`travels.journey.forget.${entry.kind}`) } : null,
		tags: tagsOf(view, people),
		search: searchable([said, about, entry.note ?? "", searchText(view)].join(" "))
	};
}

/**
 * @param {import("../rules/travels.js").JourneySeason[]} log
 * @param {boolean} [forgettable] Whether each line has an × to forget it.
 * @param {Set<string>|null} [people] The hexes with someone rolled up in them, for a Referee.
 * @returns {object[]} The journey log, worded: a heading for each Season, and its days.
 */
function journeyContext(log, forgettable = false, people = null) {
	const yearsOn = seasonYearsOn(log);
	return log.map((season, index) => ({
		heading: season.when ? seasonHeading(season.when, yearsOn[index]) : t("travels.journey.undated"),
		days: season.days.map((day) => ({ entries: day.entries.map((entry) => journeyEntryContext(entry, forgettable, people)) }))
	}));
}

/**
 * @param {import("../rules/time.js").Calendar} when
 * @param {number} on Years on from the log's first Season of that name, from seasonYearsOn.
 * @returns {string} Such as "Spring of the 2nd Age", or "Spring of the 2nd Age, a Year On".
 */
const seasonHeading = (when, on) => yearsOnHeading(seasonLabel(when), on);

/**
 * @param {string} season A Season's name or heading.
 * @param {number} on Years on from the first Season of that name, from seasonYearsOn.
 * @returns {string} Such as "Spring", or "Spring, a Year On".
 */
export function yearsOnHeading(season, on) {
	if (!(on >= 1)) return season;
	return t(on === 1 ? "travels.journey.yearOn" : "travels.journey.yearsOn", { season, n: on });
}

/**
 * The hex a page opens with chosen: the one asked for while the players may
 * open it, or any hex of the Realm for a GM, else where the Company stands,
 * else the last it reached.
 * @param {import("../rules/travels.js").PlayerHexView[]} views
 * @param {string|null} asked
 * @param {object|null} [anyIn] The Realm's geometry, for a GM, who may choose any of its hexes.
 * @returns {string|null}
 */
export function chosenHex(views, asked, anyIn = null) {
	const open = new Set(views.map((view) => view.key));
	if (asked && open.has(asked)) return asked;
	if (asked && anyIn && inRealm(anyIn, parseHexKey(asked))) return asked;
	return views.find((view) => view.here && view.openable)?.key ?? views.find((view) => view.visits)?.key ?? null;
}

/**
 * The Realms the players' record can show, the one shown first.
 * @param {string|null} [chosen] The id last chosen.
 * @returns {{scenes: {id: string, name: string, selected: boolean}[], scene: Scene|null}}
 */
export function travelsRealmChoice(chosen = null) {
	const scenes = (game.scenes?.contents ?? [...(game.scenes ?? [])]).filter((scene) => isRealmScene(scene));
	// Where the Company stands and where it has been are read only if nothing before them settles it.
	const id = pickTravelsRealm(scenes.map((scene) => ({
		id: scene.id,
		viewed: scene.id === canvas?.scene?.id,
		active: Boolean(scene.active),
		get company() {
			return Boolean(findCompanyToken(scene));
		},
		get travelled() {
			return Object.keys(getJourney(scene).hexes).length > 0;
		}
	})), chosen);
	return {
		scenes: scenes.map((scene) => ({ id: scene.id, name: scene.name, selected: scene.id === id })),
		scene: scenes.find((scene) => scene.id === id) ?? null
	};
}

/**
 * How the players' record is being looked at: which page, how the places are
 * narrowed and put in order, and which hex is chosen.
 * @typedef {object} TravelsLook
 * @property {string} [view]     One of TRAVELS_VIEWS.
 * @property {string} [filter]   One of TRAVELS_FILTERS, or "" for every place.
 * @property {string} [sort]     One of TRAVELS_SORTS.
 * @property {string|null} [selected] The key of the hex chosen.
 * @property {boolean} [route]   Whether the chart draws the way the Company went.
 * @property {boolean} [detail]  Whether the page shows the chosen hex beside its list.
 * @property {((scene: Scene, view: object) => object|null)|null} [gmPart] Builds what only a GM sees of the chosen hex.
 */

/**
 * Everything the list of places shows for a Realm.
 * @param {string|null} [chosen] The Realm last chosen.
 * @param {TravelsLook} [look]
 * @returns {object}
 */
export function travelsListContext(chosen = null, { view = TRAVELS_VIEWS[0], filter = "", sort = TRAVELS_SORTS[0], selected = null, route = false, detail = false, gmPart = null } = {}) {
	const { scenes, scene } = travelsRealmChoice(chosen);
	const sources = travelsSources(scene);
	if (!sources) return { realms: scenes, noRealm: true };
	const viewOf = hexViews(sources);
	const list = travelsList(sources, viewOf);
	const onMap = canvas?.scene?.id === scene.id;
	const every = [...list.visited, ...list.heardOf];
	const picked = chosenHex(every, selected, sources.gm ? sources.g : null);
	const chosenDetail = () => {
		if (!picked) return { empty: forReader("travels.detail.empty") };
		const one = viewOf(parseHexKey(picked));
		return hexDetail(one, onMap, gmPart?.(scene, one) ?? null);
	};
	// In the Places window, the one that builds a GM's part, a GM can narrow it to the hexes with People rolled up in them.
	const people = gmPart ? hexesWithPeopleIn(scene) : null;
	// People follow the Myths among the filters.
	const filterKeys = people ? TRAVELS_FILTERS.flatMap((key) => (key === "myth" ? [key, PEOPLE_FILTER] : [key])) : TRAVELS_FILTERS;
	const by = TRAVELS_SORTS.includes(sort) ? sort : TRAVELS_SORTS[0];
	const title = (one) => wordsOf(one).title;
	const rows = (views) => sortViews(views, by, title).map((one) => rowContext(one, onMap, picked, people));
	const shown = TRAVELS_VIEWS.includes(view) ? view : TRAVELS_VIEWS[0];
	const narrowed = filterKeys.includes(filter) ? filter : "";
	// A GM forgets a line of the journey in the Places window, never on a Knight's sheet.
	const log = journeyContext(journeyLog(sources, viewOf), Boolean(gmPart), people);
	const palette = realmPalette(getRealmLook(scene).palette);
	// A GM outside solo play sees the page as the players do, and the summary says so.
	const asPlayers = Boolean(game.user?.isGM) && !keptFromMe();
	return {
		realms: scenes,
		chooseRealm: scenes.length > 1,
		sceneId: scene.id,
		summary: t(asPlayers ? "travels.summaryGM" : "travels.summary", { count: list.count, total: list.total }),
		views: TRAVELS_VIEWS.map((key) => ({ key, label: t(`travels.views.${key}`), shown: key === shown })),
		viewShown: Object.fromEntries(TRAVELS_VIEWS.map((key) => [key, key === shown])),
		filters: [{ key: "", label: t("travels.filters.all") }, ...filterKeys.map((key) => ({ key, label: t(`travels.filters.${key}`) }))]
			.map((one) => ({ ...one, pressed: one.key === narrowed })),
		sorts: TRAVELS_SORTS.map((key) => ({ key, label: t(`travels.sort.${key}`), selected: key === by })),
		ofNote: rows(list.ofNote),
		wilderness: rows(list.wilderness),
		heardOf: rows(list.heardOf),
		chart: travelsChart(every, sources.g, {
			palette,
			title: t("travels.chart.title"),
			label: chartLabel,
			selected: picked,
			route: route ? routeOf(sources.journey) : null,
			holdings: holdingsKnown(sources, new Set(every.map((one) => one.key)), viewOf)
		}),
		route,
		legend: LEGEND_KINDS.map((kind) => ({ glyph: legendGlyph(kind, palette), label: t(`travels.chart.key.${kind}`) })),
		journey: log,
		journeyNone: !log.length,
		selected: picked,
		detail: detail ? chosenDetail() : null,
		none: !every.length,
		asPlayers
	};
}

/**
 * The chosen hex's detail alone, for a pick that leaves the rest of the page as drawn.
 * @param {string|null} sceneId The Realm shown.
 * @param {string} key The hex chosen.
 * @param {((scene: Scene, view: object) => object|null)|null} [gmPart] Builds what only a GM sees of the hex, under what the players know.
 * @returns {object|null} Null where the Realm or the hex can't be read.
 */
export function travelsHexDetail(sceneId, key, gmPart = null) {
	const scene = sceneId ? game.scenes?.get(sceneId) : null;
	const sources = scene ? travelsSources(scene) : null;
	const hex = parseHexKey(key);
	if (!sources || !hex) return null;
	const view = hexViews(sources)(hex);
	return hexDetail(view, canvas?.scene?.id === scene.id, gmPart?.(scene, view) ?? null);
}

/**
 * Everything the chosen hex shows beside the list.
 * @param {import("../rules/travels.js").PlayerHexView} view
 * @param {boolean} onMap Whether the Realm is the one on the canvas.
 * @param {object|null} [gm] What only a GM sees of it.
 * @returns {object}
 */
function hexDetail(view, onMap, gm = null) {
	const words = wordsOf(view);
	return {
		hex: view.key,
		title: words.title,
		// Its name over its column and row; only a GM names a hex, by clicking it.
		heading: { ...headingWords(words.name, words.coords), rename: game.user?.isGM ? { value: view.name } : null },
		terrain: words.terrain,
		features: words.features,
		visits: visitsText(view.visits),
		here: view.here,
		sighted: words.sighted,
		met: barrierMetLines(view.met),
		told: toldLines(view.told),
		party: view.party?.text ?? "",
		partyBy: partyNoteBy(view.party),
		openable: view.openable,
		// A player's note goes through a GM, so with none here the box waits.
		canWrite: view.openable && (Boolean(game.user?.isGM) || Boolean(game.users?.activeGM)),
		noGM: !game.user?.isGM && !game.users?.activeGM,
		onMap,
		gm
	};
}

/**
 * Show a hex on the map this user is looking at, with a ping and a green
 * ring round its borders that only they see. The ring stays until they click
 * the map.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @returns {Promise<void>}
 */
export async function showHexOnMap(scene, hex) {
	if (!scene || canvas?.scene?.id !== scene.id) return;
	const point = hexCentre(sceneGeometry(scene), hex);
	ringShownHex(scene, hex);
	await canvas.animatePan({ ...point, duration: reducesMotion() ? 0 : 400 });
	canvas.controls?.drawPing?.(point, { style: CONFIG.Canvas.pings?.types?.PULSE ?? "pulse", user: game.user });
}

/**
 * Show a hex on the map as showHexOnMap does, bringing its Realm up first
 * when another Scene is on show.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @returns {Promise<boolean>} Whether the Realm came up and the hex was shown.
 */
export async function viewAndShowHex(scene, hex) {
	if (!scene || !hex) return false;
	if (canvas?.scene?.id !== scene.id) await scene.view();
	if (canvas?.scene?.id !== scene.id) return false;
	await showHexOnMap(scene, hex);
	return true;
}
