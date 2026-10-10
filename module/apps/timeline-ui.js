import { CALENDAR_HOOK, ordinalWord, seasonLabel } from "../actions/calendar.js";
import { timelineNow } from "../actions/timeline-record.js";
import { yearsOnHeading } from "../actions/travels.js";
import { read } from "../client-settings.js";
import { addEntry, moveEntry, patchEntry, removeEntry } from "../rules/timeline.js";
import { boardView, defaultHiddenTracks, kindMenu, periodChoices, threadMenu, trackView } from "../rules/timeline-view.js";
import { escapeHTML } from "../rules/text.js";
import { parseSeasonKey } from "../rules/time.js";
import { t, warn } from "../chat/cards.js";
import { SYSTEM_ID } from "../system-id.js";
import { allSeasons, allTracks, findTimelineJournal, findTrackPage, isTimelinePage, mutateTrack, pageTrackId, trackDisplayName, trackFor } from "../actions/timeline-store.js";
import { confirmDialog, inputDialog, renderWhenIdle } from "./ui.js";

/**
 * What the Timeline window, a sheet's Timeline tab and a thread's journal
 * page share: their words, their buttons and their Filter.
 */

/** The reader's Filter, kept for each person: the kinds unticked, and the threads (null until they choose). */
const FILTER_SETTING = "timelineFilter";

/** Called by everything showing a Timeline when the reader's Filter changes. */
export const TIMELINE_FILTER_HOOK = `${SYSTEM_ID}.timelineFilter`;

/** Register the reader's Filter. Called during init. */
export function registerTimelineSettings() {
	game.settings.register(SYSTEM_ID, FILTER_SETTING, {
		scope: "client",
		config: false,
		type: Object,
		default: { kinds: [], tracks: null },
		onChange: () => Hooks.callAll(TIMELINE_FILTER_HOOK)
	});
}

/** @returns {{kinds: string[], tracks: string[]|null}} */
export function readFilter() {
	const { kinds, tracks } = read(FILTER_SETTING, {});
	return { kinds: Array.isArray(kinds) ? kinds : [], tracks: Array.isArray(tracks) ? tracks : null };
}

/** @param {{kinds?: string[], tracks?: string[]|null}} changes */
const writeFilter = (changes) => game.settings.set(SYSTEM_ID, FILTER_SETTING, { ...readFilter(), ...changes });

/**
 * @param {{age: number|null}} age
 * @returns {string} Such as "The Second Age", or "Before the Tale".
 */
const ageHeading = ({ age }) => (age ? t("timeline.age", { age: ordinalWord(age) }) : t("timeline.undated"));

/**
 * @param {{undated: boolean, name: string|null, yearsOn: number}} period
 * @returns {string} Such as "Harvest", or "Harvest, a Year On" for the next in the same Age.
 */
export const periodHeading = ({ undated, name, yearsOn }) => (undated ? t("timeline.undated") : yearsOnHeading(t(`time.seasons.${name}`), yearsOn));

/**
 * @param {{trackId: string, page?: JournalEntryPage}} track
 * @returns {boolean} Whether this user can write on the thread.
 */
export function canWriteTrack({ trackId, page = findTrackPage(trackId) }) {
	if (page) return page.isOwner;
	return Boolean(game.user?.isGM || findTimelineJournal()?.isOwner);
}

/** Only text with a link or a roll in it is enriched: most is plain, and every card is worded on each redraw. */
const enrich = (html) => (/@|\[\[|https?:\/\//.test(html) ? foundry.applications.ux.TextEditor.implementation.enrichHTML(html, { secrets: false }) : html);

/** One card's words: its kind, its place and its body, each with any links written in it. */
async function wordCard(card, canEdit) {
	return {
		...card,
		canEdit,
		sourceLabel: t(`timeline.sources.${card.source}`),
		placeHtml: card.place ? await enrich(escapeHTML(card.place)) : "",
		bodyHtml: card.body ? await enrich(escapeHTML(card.body)) : ""
	};
}

const wordCards = (cards, canEdit) => Promise.all(cards.map((card) => wordCard(card, canEdit)));

/**
 * A view's Ages and Seasons, worded.
 * @param {{age: number|null, periods: object[]}[]} ages
 * @param {(period: object) => Promise<object>} wordPeriod What else a Season's context carries: its cards, worded.
 */
const wordAges = (ages, wordPeriod) => Promise.all(ages.map(async (age) => ({
	heading: ageHeading(age),
	periods: await Promise.all(age.periods.map(async (period) => ({ ...period, heading: periodHeading(period), ...(await wordPeriod(period)) })))
})));

/**
 * The Filter's kinds, worded.
 * @param {string[]} hidden
 */
const kindsContext = (hidden) => kindMenu(hidden).map((line) => ({ ...line, label: t(`timeline.kinds.${line.group}`) }));

/**
 * One thread's page, worded: a sheet's Timeline tab, or its journal page.
 * @param {{trackId: string, kind: string, name: string}} track
 * @param {{editable?: boolean}} [options] Whether to offer its buttons.
 */
export async function trackContext(track, { editable = true } = {}) {
	const filter = readFilter();
	const page = findTrackPage(track.trackId);
	const canEdit = editable && canWriteTrack({ trackId: track.trackId, page });
	const view = trackView({ ...track, entries: page?.system?.entries ?? {} }, { hidden: filter.kinds, nowKey: timelineNow(), seasons: allSeasons() });
	return {
		...view,
		name: track.name,
		canEdit,
		filtered: filter.kinds.length > 0,
		kinds: kindsContext(filter.kinds),
		ages: await wordAges(view.ages, async (period) => ({ entries: await wordCards(period.entries, canEdit) }))
	};
}

/**
 * @param {{trackId: string}} track A Knight's or Domain's, as defaultHiddenTracks asks.
 * @returns {boolean} Whether this user's it is.
 */
const ownsTrack = ({ trackId }) => Boolean(game.actors?.get(trackId)?.isOwner);

/** Every thread side by side, worded: the Timeline window's page. */
export async function boardContext() {
	const filter = readFilter();
	const tracks = allTracks();
	const hiddenTracks = filter.tracks ?? (game.user?.isGM ? [] : defaultHiddenTracks(tracks, ownsTrack));
	const view = boardView(tracks, { hidden: filter.kinds, hiddenTracks, nowKey: timelineNow(), seasons: allSeasons(tracks) });
	const byId = new Map(tracks.map((track) => [track.trackId, track]));
	const editable = new Map(view.lanes.map(({ trackId }) => [trackId, canWriteTrack(byId.get(trackId) ?? { trackId })]));
	return {
		...view,
		hasJournal: Boolean(findTimelineJournal()),
		canWrite: [...editable.values()].some(Boolean) || Boolean(game.user?.isGM),
		filtered: filter.kinds.length > 0 || hiddenTracks.length > 0,
		kinds: kindsContext(filter.kinds),
		threads: threadMenu(tracks, hiddenTracks).map((line) => ({ ...line, label: byId.get(line.trackId)?.name ?? line.trackId, kindLabel: t(`timeline.threads.${line.kind}`) })),
		lanes: view.lanes.map((lane) => ({ ...lane, name: byId.get(lane.trackId)?.name ?? lane.trackId, kindLabel: t(`timeline.threads.${lane.kind}`) })),
		columns: view.lanes.length,
		ages: await wordAges(view.ages, async (period) => ({
			cells: await Promise.all(period.cells.map(async (cell) => ({ ...cell, entries: await wordCards(cell.entries, editable.get(cell.trackId)) })))
		}))
	};
}

/**
 * The dates a hand entry can take, worded.
 * @param {string} [current] The entry's own Season, when it's being edited.
 */
function dateChoices(current) {
	const nowKey = timelineNow();
	return periodChoices(allSeasons(), nowKey, current ?? nowKey).map((choice) => {
		const parsed = parseSeasonKey(choice.season);
		const heading = parsed ? `${periodHeading(choice)}, ${t("timeline.age", { age: ordinalWord(parsed.age) })}` : periodHeading(choice);
		return { value: choice.season, selected: choice.selected, label: choice.isNow ? t("timeline.nowChoice", { season: seasonLabel(parsed) }) : heading };
	});
}

/**
 * Ask for an entry's date, title, place and what happened.
 * @param {object} [entry] The one being edited.
 * @returns {Promise<{season: string, title: string, place: string, body: string}|null>}
 */
export async function promptTimelineEntry(entry = null) {
	const answer = await inputDialog({
		title: t(entry ? "timeline.entry.editTitle" : "timeline.entry.newTitle"),
		icon: "fa-solid fa-timeline",
		template: "timeline-entry",
		context: { dates: dateChoices(entry?.season), title: entry?.title ?? "", place: entry?.place ?? "", body: entry?.body ?? "" },
		ok: { label: t("timeline.entry.save") }
	});
	if (!answer) return null;
	return {
		season: String(answer.season ?? ""),
		title: String(answer.title ?? "").trim(),
		place: String(answer.place ?? "").trim(),
		body: String(answer.body ?? "").trim()
	};
}

/**
 * Ask which thread a new entry goes on.
 * @param {{trackId: string, name: string, kind: string}[]} tracks
 * @returns {Promise<string|null>}
 */
async function pickThread(tracks) {
	if (tracks.length < 2) return tracks[0]?.trackId ?? null;
	const answer = await inputDialog({
		title: t("timeline.pickThread.title"),
		icon: "fa-solid fa-timeline",
		template: "timeline-thread",
		context: { threads: tracks.map((track) => ({ id: track.trackId, name: track.name, detail: t(`timeline.threads.${track.kind}`) })) },
		ok: { label: t("timeline.pickThread.save") }
	});
	return answer?.thread ?? null;
}

/**
 * Run one of rules/timeline.js's changes on a thread, saying so if it fails.
 * @param {{trackId: string}} track
 * @param {(entries: object[]) => object} change
 */
async function write(track, edit) {
	try {
		return await mutateTrack(track, edit, { create: true });
	} catch (error) {
		console.error(`${SYSTEM_ID} | Timeline write failed`, error);
		warn("timeline.writeFailed");
		return null;
	}
}

/**
 * The thread a button is in: from its container's data, so a sheet's thread
 * with no page yet can still be written on.
 * @param {HTMLElement} target
 */
function trackOf(target) {
	const host = target.closest("[data-track-id]");
	if (!host) return null;
	const { trackId, trackKind: kind = "", trackName } = host.dataset;
	const page = findTrackPage(trackId);
	return { trackId, kind: kind || page?.system?.trackKind || "", name: trackName || trackDisplayName({ trackId, kind, page }) };
}

const entryOf = (track, id) => Object.values(findTrackPage(track.trackId)?.system?.entries ?? {}).find((entry) => entry?.id === id) ?? null;

/**
 * The one action every Timeline button takes, by its data-timeline: write a
 * new entry, edit, remove or move one, open the full Timeline, or tick the
 * Filter back to everything. For an ApplicationV2's `actions`.
 * @param {PointerEvent} event
 * @param {HTMLElement} target
 */
export async function onTimelineAction(event, target) {
	const what = target.dataset.timeline;
	if (what === "openFull") return game.system.api?.openTimeline?.();
	if (what === "showAll") return writeFilter({ kinds: [], tracks: [] });
	if (what === "new") {
		let track = trackOf(target);
		if (!track) {
			const writable = allTracks().filter(canWriteTrack);
			const id = await pickThread(writable);
			track = writable.find((each) => each.trackId === id) ?? null;
		}
		if (!track) return null;
		const entry = await promptTimelineEntry();
		if (!entry) return null;
		return write(track, (entries) => addEntry(entries, { ...entry, source: "hand", createdAt: Date.now(), authorId: game.user.id }, foundry.utils.randomID));
	}
	const track = trackOf(target);
	const id = target.closest("[data-entry-id]")?.dataset.entryId;
	if (!track || !id) return null;
	if (what === "earlier" || what === "later") return write(track, (entries) => moveEntry(entries, id, what === "earlier" ? -1 : 1));
	const entry = entryOf(track, id);
	if (!entry) return null;
	if (what === "edit") {
		const edited = await promptTimelineEntry(entry);
		return edited ? write(track, (entries) => patchEntry(entries, id, edited)) : null;
	}
	if (what === "remove") {
		const sure = await confirmDialog({
			title: t("timeline.removeEntry.title"),
			icon: "fa-solid fa-trash",
			message: escapeHTML(t("timeline.removeEntry.body", { title: entry.title || t("timeline.removeEntry.untitled"), thread: track.name }))
		});
		return sure ? write(track, (entries) => removeEntry(entries, id)) : null;
	}
	return null;
}

/**
 * Tick boxes in a Filter write the reader's Filter, and never reach the
 * form they're in: on a sheet they'd be taken for its own fields.
 * @param {HTMLElement} root
 * @param {object} [options]
 * @param {string[]} [options.trackIds] The threads the board offers, for unticking one.
 * @param {{open: boolean}} [options.state] Its owner's, so the Filter stays open across a redraw it caused.
 */
export function wireTimelineFilter(root, { trackIds = [], state = { open: false } } = {}) {
	for (const menu of root.querySelectorAll(".bastionland-timeline__filter")) {
		menu.open = state.open;
		menu.addEventListener("toggle", () => {
			state.open = menu.open;
		});
		menu.addEventListener("change", (event) => {
			event.stopPropagation();
			const box = event.target;
			if (box.dataset.timelineKind) {
				const kinds = new Set(readFilter().kinds);
				if (box.checked) kinds.delete(box.dataset.timelineKind);
				else kinds.add(box.dataset.timelineKind);
				writeFilter({ kinds: [...kinds] });
			} else if (box.dataset.timelineThread) {
				const shown = [...menu.querySelectorAll("[data-timeline-thread]")].filter((each) => each.checked).map((each) => each.dataset.timelineThread);
				writeFilter({ tracks: trackIds.filter((id) => !shown.includes(id)) });
			}
		});
	}
}

/**
 * Follow the Timeline: its pages, the calendar, the reader's Filter, and the
 * names of the threads' actors and Scenes.
 * @param {string|null} trackId One thread to follow, or null for every one.
 * @param {() => void} onChange
 * @returns {[string, number][]} The hooks, to take off on close.
 */
export function watchTimeline(trackId, onChange) {
	const ours = (page) => isTimelinePage(page) && (!trackId || pageTrackId(page) === trackId);
	const onPage = (page) => {
		if (ours(page)) onChange();
	};
	const onName = (document, changes) => {
		if (!trackId && "name" in (changes ?? {}) && trackFor(document)) onChange();
	};
	return [
		["createJournalEntryPage", onPage],
		["updateJournalEntryPage", onPage],
		["deleteJournalEntryPage", onPage],
		["updateActor", onName],
		["updateScene", onName],
		[CALENDAR_HOOK, () => onChange()],
		[TIMELINE_FILTER_HOOK, () => onChange()]
	].map(([name, handler]) => [name, Hooks.on(name, handler)]);
}

/**
 * @param {[string, number][]} hooks From watchTimeline.
 */
export const unwatchTimeline = (hooks) => {
	for (const [name, id] of hooks) Hooks.off(name, id);
};

/**
 * A sheet's Timeline tab: its actor's thread, gathered only while the tab is
 * the page open, and drawn again as it's opened if it missed a change while
 * hidden. The Knight's and the Domain's sheets each keep one.
 */
export class TimelineTab {
	/** @param {foundry.applications.api.ApplicationV2 & {actor: Actor}} sheet */
	constructor(sheet) {
		this.#sheet = sheet;
	}

	#sheet;
	#stale = false;
	#filter = { open: false };
	#hooks = [];

	/** The tab as last drawn, kept while it's hidden so the sheet's other redraws don't cost it a fresh one. */
	#last = null;

	get #open() {
		return this.#sheet.tabGroups?.primary === "timeline";
	}

	/**
	 * @param {object} [tabs] The sheet's tabs, to tell whether it has the page.
	 * @returns {Promise<object|null>} The tab's context, or null while it isn't the page open.
	 */
	async context(tabs) {
		if (!tabs?.timeline) return null;
		if (!this.#open) {
			if (!this.#last) this.#stale = true;
			return this.#last;
		}
		this.#stale = false;
		const track = trackFor(this.#sheet.actor);
		this.#last = track ? await trackContext(track) : null;
		return this.#last;
	}

	/** Called as the sheet changes tab: a tab that missed a change is drawn again. */
	shown(tab) {
		if (tab !== "timeline" || !this.#stale) return;
		this.#stale = false;
		this.#sheet.render();
	}

	/** @param {HTMLElement} root The sheet, just drawn. */
	wire(root) {
		const tab = root.querySelector('.tab[data-tab="timeline"]');
		if (tab) wireTimelineFilter(tab, { state: this.#filter });
	}

	/** Follow the thread while the sheet is open. */
	watch() {
		this.#hooks = watchTimeline(this.#sheet.actor.id, () => {
			if (this.#open) renderWhenIdle(this.#sheet);
			else this.#stale = true;
		});
	}

	unwatch() {
		unwatchTimeline(this.#hooks);
		this.#hooks = [];
	}
}

