/**
 * A Journal entry for each Site, written out so it reads in Foundry's own
 * Journal beside the map: the whole Site for GMs, what the Company has found
 * of it, and a Notes page that is the GM's own. The entry is made hidden and
 * stays so until a GM shares it, and even then players see only what they've
 * found. Words come in as functions, so this is pure and can be tested
 * without Foundry.
 */
import { OWNERSHIP, block, inline, joined, section } from "./hex-journal.js";
import { numberedPoints, playerView, routesFrom, siteEdge } from "./sites.js";

/** The flag that marks an entry as a Site's journal, `{site}`: the Site's entry's id. */
export const SITE_JOURNAL_FLAG = "siteJournal";

/** The flag that marks the folder Site journals are filed in. */
export const SITE_JOURNALS_FOLDER_FLAG = "siteJournalsFolder";

/** Each page's part, kept in the page's own flag so it's found whatever it's renamed to. */
export const SITE_PAGE_ROLES = Object.freeze(["site", "found", "notes"]);

/**
 * The pages a Site's journal has. The Site and Found pages are written again
 * whenever the Site changes, and Notes is only ever made. Only the Found page
 * can be seen by players, once a GM shares the entry. The folder sorts by name.
 * @type {Readonly<import("./hex-journal.js").JournalLayout>}
 */
export const SITE_LAYOUT = Object.freeze({
	roles: SITE_PAGE_ROLES,
	written: Object.freeze(["site", "found"]),
	pageOwnership: Object.freeze({ site: OWNERSHIP.NONE, found: OWNERSHIP.OBSERVER, notes: OWNERSHIP.NONE }),
	sort: null
});

/**
 * @typedef {object} SiteJournalWords
 * @property {(number: number, kind: string) => string} point         "Point 1, Feature".
 * @property {(kind: string, number: number) => string} entrance       "Entrance at 1".
 * @property {(kind: string) => string} entranceAway                   An entrance known to a point not yet reached.
 * @property {(kind: string, to: number) => string} routeTo            "Open path to 2".
 * @property {(kind: string, from: number, to: number) => string} route "Open route between 1 and 2".
 * @property {(kind: string, from: number) => string} routeOut         A route from a point found to one not yet.
 * @property {(kind: string) => string} routeAway                      A route found between points not yet found.
 * @property {(count: number) => string} glimpsed                      How many places are glimpsed but not explored.
 * @property {object} labels
 * @property {string} labels.place      What the Site is, as a heading.
 * @property {string} labels.points
 * @property {string} labels.entrances
 * @property {string} labels.routes     The ways the Company knows, as a heading.
 * @property {string} labels.found
 * @property {string} labels.notFound
 * @property {string} labels.noPoints
 * @property {string} labels.nothingFound
 */

/** @returns {string} Whether players have found something, in italics. */
const foundMark = (words, found) => `*${inline(found ? words.labels.found : words.labels.notFound)}*`;

/** @returns {string} A line's own words after a colon, or nothing. */
const after = (text) => (text.trim() ? `: ${inline(text)}` : "");

/**
 * The Site page: everything drawn and written on the Site, for GMs.
 * @param {import("./sites.js").Site} site
 * @param {SiteJournalWords} words
 * @returns {string} Markdown.
 */
export function siteMarkdown(site, words) {
	const { labels } = words;
	const points = numberedPoints(site);
	const entrances = points
		.filter((key) => site.points[key].entrance)
		.map((key) => {
			const { entrance, entranceText, entranceFound, number } = site.points[key];
			return `- **${inline(words.entrance(entrance, number))}** · ${foundMark(words, entranceFound)}${after(entranceText)}`;
		});
	const lines = points.flatMap((key) => {
		const { kind, number, text, found } = site.points[key];
		const routes = routesFrom(site, key).map(({ kind: route, to, text: note, found: routeFound }) => {
			const mark = route === "hidden" ? ` · ${foundMark(words, routeFound)}` : "";
			return `  - ${inline(words.routeTo(route, to))}${mark}${after(note)}`;
		});
		return [`- **${inline(words.point(number, kind))}** · ${foundMark(words, found)}${after(text)}`, ...routes];
	});
	return joined([
		section(labels.place, [block(site.notes)]),
		section(labels.entrances, entrances),
		points.length ? section(labels.points, lines) : `*${inline(labels.noPoints)}*`
	]);
}

/**
 * The Found page: the Site as the players' map shows it, by kind and number,
 * and nothing the GM wrote.
 * @param {import("./sites.js").Site} site
 * @param {SiteJournalWords} words
 * @returns {string} Markdown.
 */
export function foundMarkdown(site, words) {
	const { labels } = words;
	const view = playerView(site);
	const known = new Set(view.points.map(({ key }) => key));
	const number = (key) => site.points[key].number;

	const points = view.points.map(({ kind, number: at }) => `- ${inline(words.point(at, kind))}`);
	const routes = view.routes.map(({ key, kind }) => {
		const ends = siteEdge(key).ends.filter((end) => known.has(end)).map(number).sort((a, b) => a - b);
		if (ends.length === 2) return `- ${inline(words.route(kind, ends[0], ends[1]))}`;
		if (ends.length === 1) return `- ${inline(words.routeOut(kind, ends[0]))}`;
		return `- ${inline(words.routeAway(kind))}`;
	});
	const entrances = view.entrances.map(({ key, kind }) => `- ${inline(known.has(key) ? words.entrance(kind, number(key)) : words.entranceAway(kind))}`);
	const empty = !points.length && !routes.length && !entrances.length;

	return joined([
		empty ? `*${inline(labels.nothingFound)}*` : "",
		section(labels.entrances, entrances),
		section(labels.points, points),
		section(labels.routes, routes),
		view.glimpsed.length ? `*${inline(words.glimpsed(view.glimpsed.length))}*` : ""
	]);
}
