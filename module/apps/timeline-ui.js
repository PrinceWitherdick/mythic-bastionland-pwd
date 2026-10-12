import { CALENDAR_HOOK, ordinalWord, seasonLabel } from "../actions/calendar.js";
import { timelineNow } from "../actions/timeline-record.js";
import { createCustomTag, worldCustomTags } from "../actions/timeline-tags.js";
import { yearsOnHeading } from "../actions/travels.js";
import { companyPicture } from "../actions/company.js";
import { read } from "../client-settings.js";
import { COMPANY_TRACK, KIND_GROUPS, addEntry, documentUuid, isSeasonTurn, moveEntry, patchEntry, readEntries, realmSceneId, removeEntry } from "../rules/timeline.js";
import { CUSTOM_TAG_ICON, DEFAULT_TAG_COLOUR, KIND_ICONS, TAG_NAME_MAX, TIMELINE_TAGS_FLAG, cleanColour, isKindTag, kindColourProperty, readKindColours } from "../rules/timeline-tags.js";
import { boardView, defaultHiddenTracks, hiddenCount, kindMenu, periodChoices, threadMenu, trackView } from "../rules/timeline-view.js";
import { clampScale, scrubTicks } from "../rules/timeline-scroll.js";
import { escapeHTML } from "../rules/text.js";
import { toHex } from "../rules/colour.js";
import { parseSeasonKey, seasonKey } from "../rules/time.js";
import { t, warn } from "../chat/cards.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { reopeningWindows } from "../sheets/restore-open-sheets.js";
import { allSeasons, allTracks, findTimelineJournal, findTrackPage, isTimelinePage, mutateTrack, pageTrackId, trackDisplayName, trackFor } from "../actions/timeline-store.js";
import { hostState, timelineIn, wireTimeline } from "./timeline-scroll.js";
import { confirmDialog, inputDialog, renderWhenIdle } from "./ui.js";

/**
 * What the Timeline window, a sheet's Timeline tab, the Referee Toolkit's
 * Timeline page and a thread's journal page share: their settings, their
 * words, their buttons, their toolbar and their entry dialog.
 */

/** The reader's Filter, kept for each person: the kinds and tags unticked, and the threads (null until they choose). */
const FILTER_SETTING = "timelineFilter";

/** Down the page or across it, each reader's own. */
const LAYOUT_SETTING = "timelineLayout";

/** Where each Timeline was left, each reader's own, for a reload to bring back. */
const VIEWS_SETTING = "timelineViews";

/** The colour each kind is painted, the Referee's for the whole world. */
const COLOURS_SETTING = "timelineKindColours";

/** Whether the world has a Timeline at all. */
const SHOW_SETTING = "showTimeline";

/** The ways a Timeline can be laid out. */
export const TIMELINE_LAYOUTS = Object.freeze(["down", "across"]);

/** How long a burst of writes is let settle before a Timeline is drawn again: one event can write on several threads. */
export const TIMELINE_REDRAW_DELAY = 150;

/** Called by everything showing a Timeline when the reader's Filter or layout changes. */
export const TIMELINE_FILTER_HOOK = `${SYSTEM_ID}.timelineFilter`;

/** Register the Timeline's settings. Called during init. */
export function registerTimelineSettings() {
	const redraw = () => Hooks.callAll(TIMELINE_FILTER_HOOK);
	game.settings.register(SYSTEM_ID, FILTER_SETTING, {
		scope: "client",
		config: false,
		type: Object,
		default: { kinds: [], tracks: null },
		onChange: redraw
	});
	game.settings.register(SYSTEM_ID, LAYOUT_SETTING, {
		scope: "client",
		config: false,
		type: String,
		default: "down",
		onChange: redraw
	});
	game.settings.register(SYSTEM_ID, VIEWS_SETTING, {
		scope: "client",
		config: false,
		type: Object,
		default: {}
	});
	game.settings.register(SYSTEM_ID, COLOURS_SETTING, {
		scope: "world",
		config: false,
		type: Object,
		default: {},
		onChange: () => {
			applyKindColours();
			// The root's colours repaint every Timeline; only the Referee's Colours menu is drawn from the setting.
			if (game.user?.isGM) redraw();
		}
	});
	game.settings.register(SYSTEM_ID, SHOW_SETTING, {
		name: "bastionland.timeline.setting.name",
		hint: "bastionland.timeline.setting.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
		requiresReload: true
	});
}

/** @returns {boolean} Whether the world has the Timeline turned on. */
export const timelineShown = () => read(SHOW_SETTING, true) !== false;

/**
 * Say so, when the world has the Timeline turned off.
 * @returns {boolean} Whether it's off, so the caller does nothing.
 */
export function refuseHiddenTimeline() {
	if (timelineShown()) return false;
	warn("timeline.turnedOff");
	return true;
}

/** @returns {boolean} Whether this reader lays the Timeline across the page. */
export const layoutAcross = () => read(LAYOUT_SETTING, "down") === "across";

/** @returns {string} This reader's layout, one of TIMELINE_LAYOUTS. */
const layoutName = () => (layoutAcross() ? "across" : "down");

/** @returns {Record<string, string>} The colours the Referee chose, by kind. */
const chosenColours = () => readKindColours(read(COLOURS_SETTING, {}));

/**
 * @param {string} [colour]
 * @returns {string} The style that paints a chip or line in it, or none.
 */
const kindStyle = (colour) => (colour ? `--timeline-kind: ${colour};` : "");

/** Paint each kind in the colour the Referee chose, on the page's root, so every Timeline takes it at once. */
export function applyKindColours() {
	const root = globalThis.document?.documentElement;
	if (!root) return;
	const chosen = chosenColours();
	for (const kind of Object.keys(KIND_GROUPS)) {
		if (chosen[kind]) root.style.setProperty(kindColourProperty(kind), chosen[kind]);
		else root.style.removeProperty(kindColourProperty(kind));
	}
}

/** @returns {{kinds: string[], tracks: string[]|null}} */
export function readFilter() {
	const { kinds, tracks } = read(FILTER_SETTING, {});
	return { kinds: Array.isArray(kinds) ? kinds : [], tracks: Array.isArray(tracks) ? tracks : null };
}

/** @param {{kinds?: string[], tracks?: string[]|null}} changes */
const writeFilter = (changes) => game.settings.set(SYSTEM_ID, FILTER_SETTING, { ...readFilter(), ...changes });

/**
 * @param {string} key The Timeline's host: "window", "toolkit" or an actor's.
 * @returns {{zoom: number, left: number, top: number, layout: string}|null} Where it was last left, in this layout.
 */
function keptView(key) {
	const view = read(VIEWS_SETTING, {})?.[key];
	const layout = layoutName();
	if (!view || view.layout !== layout || !Number.isFinite(view.left) || !Number.isFinite(view.top)) return null;
	return { zoom: clampScale(view.zoom), left: view.left, top: view.top, layout };
}

/** Each host's view waits a moment, so a run of scrolls is one write. */
let keepViews = null;
const pendingViews = {};

/**
 * @param {string} key
 * @param {{zoom: number, left: number, top: number}} view
 */
function keepView(key, view) {
	pendingViews[key] = { ...view, layout: layoutName() };
	keepViews ??= foundry.utils.debounce(writeViews, 500);
	keepViews();
}

/** Write the views waiting, dropping those of actors no longer in the world, and only when one has changed. */
function writeViews() {
	const kept = read(VIEWS_SETTING, {}) ?? {};
	const views = { ...kept, ...pendingViews };
	for (const key of Object.keys(pendingViews)) delete pendingViews[key];
	for (const key of Object.keys(views)) {
		if (key.startsWith("actor:") && !game.actors?.has(key.slice("actor:".length))) delete views[key];
	}
	if (!foundry.utils.objectsEqual(views, kept)) game.settings.set(SYSTEM_ID, VIEWS_SETTING, views);
}

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

/** A name as a link's label: the brackets a link is written with taken out. */
const linkLabel = (name) => String(name ?? "").replace(/[[\]{}]/g, "");

/** @returns {Promise<string>} A place as its card shows it: a link when it's a document dropped on the field. */
const placeHtml = ({ place, placeUuid }) => {
	const uuid = documentUuid(placeUuid);
	if (uuid) return enrich(`@UUID[${uuid}]{${escapeHTML(linkLabel(place) || uuid)}}`);
	return place ? enrich(escapeHTML(place)) : Promise.resolve("");
};

/** One card's words: its chip, its place and its body, each with any links written in it. */
async function wordCard(card, canEdit) {
	const { chip } = card;
	return {
		...card,
		canEdit,
		chipStyle: kindStyle(chip.colour),
		sourceLabel: chip.tagName || (chip.tagged ? kindName(chip.kind) : t(`timeline.sources.${card.source}`)),
		placeHtml: await placeHtml(card),
		bodyHtml: card.body ? await enrich(escapeHTML(card.body)) : ""
	};
}

const wordCards = (cards, canEdit) => Promise.all(cards.map((card) => wordCard(card, canEdit)));

/** A Season's turn as its heading shows it. */
const wordNotes = (notes, canEdit) => Promise.all(notes.map(async (note) => ({ ...note, canEdit: canEdit(note.trackId), bodyHtml: note.body ? await enrich(escapeHTML(note.body)) : "" })));

/**
 * A view's Seasons, worded.
 * @param {object[]} periods
 * @param {(trackId: string) => boolean} canEdit
 * @param {(period: object, heading: string) => Promise<object>} wordInside What else a Season's context carries: its cards, worded.
 */
const wordPeriods = (periods, canEdit, wordInside) => Promise.all(periods.map(async (period) => {
	const heading = periodHeading(period);
	return {
		...period,
		heading,
		ageHeading: period.startsAge ? ageHeading(period) : "",
		notes: await wordNotes(period.notes, canEdit),
		...(await wordInside(period, heading))
	};
}));

/**
 * The scrubber's stops: each Age drawn, before the tale too. A sheet's own
 * thread, short of two Ages, stops at each Season instead, as Stonetop's
 * does. None under two.
 * @param {{startsAge: boolean, ageKey: string, age: number|null, season: string, heading: string}[]} periods Worded.
 * @param {{bySeason?: boolean}} [options]
 */
function scrubContext(periods, { bySeason = false } = {}) {
	let by = "age";
	let stops = periods.filter((period) => period.startsAge).map((period) => ({ key: period.ageKey, label: ageHeading(period) }));
	if (stops.length < 2 && bySeason) {
		by = "period";
		stops = periods.filter((period) => period.season).map((period) => ({ key: period.season, label: period.heading }));
	}
	if (stops.length < 2) return null;
	const at = scrubTicks(stops);
	return { by, label: t(`timeline.scrub.${by}.label`), tooltip: t(`timeline.scrub.${by}.tooltip`), first: stops[0].label, stops: stops.map((stop, i) => ({ ...stop, at: at[i] })) };
}

/**
 * An add slot's words.
 * @param {string} heading Its Season's.
 * @param {string} [thread] Its lane's thread, on the board.
 */
const addLabel = (heading, thread) => (thread ? t("timeline.addHereThread", { season: heading, thread }) : t("timeline.addHere", { season: heading }));

/** A kind's short name, as a chip and the Colours menu say it. */
const kindName = (kind) => t(`timeline.kindChips.${kind}`);

/**
 * The toolbar's menus and switches, worded.
 * @param {object} options
 * @param {string[]} options.hidden The kinds and tags unticked.
 * @param {object[]} options.tags The world's own.
 * @param {object[]} [options.threads] The board's threads, worded, to tick off.
 * @param {string[]} [options.hiddenTracks]
 */
function toolbarContext({ hidden, tags, threads = [], hiddenTracks = [] }) {
	const kinds = kindMenu(hidden, tags).map((line) => ({ ...line, label: line.tagName || t(`timeline.kinds.${line.kind}`), style: kindStyle(line.colour) }));
	const count = hiddenCount(hidden, hiddenTracks, { kinds: kinds.map((line) => line.key), tracks: threads.map((thread) => thread.trackId) });
	const chosen = chosenColours();
	return {
		across: layoutAcross(),
		kinds,
		threads: threads.length > 1 ? threads : [],
		hiddenCount: count,
		hiddenLabel: t("timeline.filter.hidden", { count }),
		colours: game.user?.isGM ? Object.keys(KIND_GROUPS).map((kind) => ({ kind, icon: KIND_ICONS[kind], label: kindName(kind), value: chosen[kind] ?? "", repainted: Boolean(chosen[kind]) })) : null
	};
}

/**
 * The picture at the head of a thread's lane: a Knight's or Domain's own, the
 * Realm's map, or the Company's token.
 * @param {{trackId: string, kind: string}} track
 */
function portraitOf({ trackId, kind }) {
	if (kind === "company") return companyPicture(canvas?.scene ?? null);
	if (kind === "realm") return game.scenes?.get(realmSceneId(trackId))?.thumb ?? "";
	return game.actors?.get(trackId)?.img ?? "";
}

/**
 * One thread's page, worded: a sheet's Timeline tab, or its journal page.
 * @param {{trackId: string, kind: string, name: string}} track
 * @param {{editable?: boolean}} [options] Whether to offer its buttons, and its layouts: a journal page reads down, as a page.
 */
export async function trackContext(track, { editable = true } = {}) {
	const filter = readFilter();
	const tags = worldCustomTags();
	const page = findTrackPage(track.trackId);
	const canEdit = editable && canWriteTrack({ trackId: track.trackId, page });
	// Another thread writes the Company's Season turns in its headings (rules/timeline-view.js#trackView).
	const company = track.trackId === COMPANY_TRACK ? null : findTrackPage(COMPANY_TRACK)?.system?.entries;
	const view = trackView({ ...track, entries: page?.system?.entries ?? {} }, { hidden: filter.kinds, nowKey: timelineNow(), seasons: allSeasons(), tags, canEdit, company });
	const toolbar = toolbarContext({ hidden: filter.kinds, tags });
	// A Company turn's Edit writes on the Company's thread, so it asks that page.
	const canEditNote = (trackId) => (trackId === track.trackId ? canEdit : editable && canWriteTrack({ trackId }));
	const periods = await wordPeriods(view.periods, canEditNote, async (period, heading) => ({
		entries: await wordCards(period.entries, canEdit),
		addLabel: period.add ? addLabel(heading) : ""
	}));
	return {
		...view,
		...toolbar,
		across: editable && toolbar.across,
		name: track.name,
		canEdit,
		periods,
		scrub: editable ? scrubContext(periods, { bySeason: true }) : null
	};
}

/**
 * @param {{trackId: string}} track A Knight's or Domain's, as defaultHiddenTracks asks.
 * @returns {boolean} Whether this user's it is.
 */
const ownsTrack = ({ trackId }) => Boolean(game.actors?.get(trackId)?.isOwner);

/** Every thread side by side, worded: the Timeline window's page and the Referee Toolkit's. */
export async function boardContext() {
	const filter = readFilter();
	const tags = worldCustomTags();
	const tracks = allTracks();
	const hiddenTracks = filter.tracks ?? (game.user?.isGM ? [] : defaultHiddenTracks(tracks, ownsTrack));
	const byId = new Map(tracks.map((track) => [track.trackId, track]));
	const writable = new Map(tracks.map((track) => [track.trackId, canWriteTrack(track)]));
	const canEdit = (trackId) => Boolean(writable.get(trackId));
	const view = boardView(tracks.map((track) => ({ ...track, portrait: portraitOf(track) })), {
		hidden: filter.kinds,
		hiddenTracks,
		nowKey: timelineNow(),
		seasons: allSeasons(tracks),
		tags,
		canEdit
	});
	const nameOf = (trackId) => byId.get(trackId)?.name ?? trackId;
	const threads = threadMenu(tracks, hiddenTracks).map((line) => ({ ...line, label: nameOf(line.trackId), kindLabel: t(`timeline.threads.${line.kind}`) }));
	const lane = (head) => ({ ...head, name: nameOf(head.trackId), kindLabel: t(`timeline.threads.${head.kind}`) });
	const periods = await wordPeriods(view.periods, canEdit, async (period, heading) => ({
		cells: await Promise.all(period.cells.map(async (cell) => ({
			...cell,
			entries: await wordCards(cell.entries, canEdit(cell.trackId)),
			addLabel: cell.add ? addLabel(heading, nameOf(cell.trackId)) : ""
		})))
	}));
	return {
		...view,
		...toolbarContext({ hidden: filter.kinds, tags, threads, hiddenTracks }),
		hasJournal: Boolean(findTimelineJournal()),
		canWrite: [...writable.values()].some(Boolean) || Boolean(game.user?.isGM),
		lanes: view.lanes.map(lane),
		columns: view.lanes.length,
		periods,
		// Read across, a thread's row holds the same worded cells as the Seasons read down.
		swimlanes: view.lanes.map((head, at) => ({ ...lane(head), cells: periods.map((period) => period.cells[at]) })),
		// Across, the thread names' column, then each Season's, with a narrow one for an Age's rule where it begins.
		swimColumns: ["13rem", ...periods.flatMap((period) => [...(period.startsAge ? ["auto"] : []), "minmax(15rem, 1fr)"])].join(" "),
		scrub: scrubContext(periods)
	};
}

/**
 * The dates a hand entry can take, worded.
 * @param {string} [current] The entry's own Season, or the one its add slot is in.
 */
function dateChoices(current) {
	const nowKey = timelineNow();
	return periodChoices(allSeasons(), nowKey, current ?? nowKey).map((choice) => {
		const parsed = parseSeasonKey(choice.season);
		const heading = parsed ? `${periodHeading(choice)}, ${ageHeading(choice)}` : periodHeading(choice);
		return { value: choice.season, selected: choice.selected, label: choice.isNow ? t("timeline.nowChoice", { season: seasonLabel(parsed) }) : heading };
	});
}

/**
 * The places this world can offer a new entry, to type over as freely as any:
 * where the Timeline already says things happened, and the Realms and Domains
 * this reader can see. Nothing the Referee keeps from them.
 * @returns {string[]}
 */
function placeSuggestions() {
	const seen = new Set();
	const names = [];
	const offer = (name) => {
		const clean = String(name ?? "").trim();
		if (!clean || seen.has(clean.toLocaleLowerCase())) return;
		seen.add(clean.toLocaleLowerCase());
		names.push(clean);
	};
	for (const track of allTracks()) for (const entry of readEntries(track.entries)) offer(entry.place);
	for (const scene of game.scenes ?? []) if (trackFor(scene) && scene.testUserPermission?.(game.user, "OBSERVER")) offer(scene.name);
	for (const actor of game.actors ?? []) if (actor.type === "domain" && actor.testUserPermission?.(game.user, "OBSERVER")) offer(actor.name);
	return names;
}

/**
 * @param {{id: string, name: string, colour: string}} tag One of the table's own.
 * @returns {object} As a tag choice in the entry dialog.
 */
const customTagChoice = (tag) => ({ value: tag.id, label: tag.name, icon: CUSTOM_TAG_ICON, kind: "custom", style: kindStyle(tag.colour) });

/**
 * The tags a typed entry can wear: none, a kind it reads as, or one of the table's own.
 * @param {string} current
 */
function tagChoices(current) {
	const none = { value: "", label: t("timeline.entry.noTag"), icon: KIND_ICONS.hand, kind: "hand", style: "" };
	const kinds = Object.keys(KIND_GROUPS).filter(isKindTag).map((kind) => ({ value: kind, label: kindName(kind), icon: KIND_ICONS[kind], kind, style: "" }));
	const own = worldCustomTags().map(customTagChoice);
	const all = [none, ...kinds, ...own];
	const selected = all.some((choice) => choice.value === current) ? current : "";
	return all.map((choice) => ({ ...choice, checked: choice.value === selected }));
}

/**
 * The document a drop on the entry dialog carries, if it carries one. A drop
 * that does is taken before anything is awaited, or the browser would drop
 * the drag's text into the field as well.
 * @param {DragEvent} event
 * @returns {Promise<{uuid: string, name: string}|null>}
 */
async function droppedDocument(event) {
	const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
	const uuid = documentUuid(data?.uuid);
	if (!uuid) return null;
	event.preventDefault();
	const document = await fromUuid(uuid).catch(() => null);
	return document ? { uuid, name: document.name ?? "" } : null;
}

/**
 * The entry dialog's own doings: a document dropped on Place makes it a link
 * and typing there takes the link off; one dropped on What Happened is
 * written in as a link where the caret is; New Tag makes one of the table's
 * own and wears it.
 * @param {HTMLElement} element
 */
function wireEntryDialog(element) {
	const place = element.querySelector('input[name="place"]');
	const uuid = element.querySelector('input[name="placeUuid"]');
	const zone = element.querySelector(".bastionland-timeline-entry__place");
	place?.addEventListener("input", () => {
		uuid.value = "";
		zone.classList.remove("is-linked");
	});
	const allowDrop = (event) => event.preventDefault();
	zone?.addEventListener("dragover", allowDrop);
	zone?.addEventListener("drop", async (event) => {
		event.preventDefault();
		const dropped = await droppedDocument(event);
		if (!dropped) return;
		place.value = dropped.name;
		uuid.value = dropped.uuid;
		zone.classList.add("is-linked");
	});
	const body = element.querySelector('textarea[name="body"]');
	body?.addEventListener("dragover", allowDrop);
	body?.addEventListener("drop", async (event) => {
		const dropped = await droppedDocument(event);
		if (!dropped) return;
		const link = `@UUID[${dropped.uuid}]{${linkLabel(dropped.name)}}`;
		const at = body.selectionStart ?? body.value.length;
		body.value = `${body.value.slice(0, at)}${link}${body.value.slice(body.selectionEnd ?? at)}`;
		body.selectionStart = body.selectionEnd = at + link.length;
		body.focus();
	});
	const form = element.querySelector(".bastionland-timeline-entry__new-tag");
	// Enter in the tag's name adds the tag, rather than saving the entry before it's tagged.
	form?.querySelector("[data-timeline-tag-name]")?.addEventListener("keydown", (event) => {
		if (event.key !== "Enter") return;
		event.preventDefault();
		event.stopPropagation();
		form.querySelector("[data-timeline-tag-add]")?.click();
	});
	form?.querySelector("[data-timeline-tag-add]")?.addEventListener("click", async () => {
		const name = form.querySelector("[data-timeline-tag-name]");
		const colour = form.querySelector("[data-timeline-tag-colour]");
		const { tag, reason } = await createCustomTag({ name: name.value, colour: colour.value });
		if (!tag) return warn(`timeline.entry.tagRefused.${reason}`);
		const list = element.querySelector(".bastionland-timeline-entry__tags");
		let radio = list.querySelector(`input[name="tag"][value="${CSS.escape(tag.id)}"]`);
		if (!radio) {
			const html = await foundry.applications.handlebars.renderTemplate(templatePath("dialogs/parts/timeline-entry-tag.hbs"), { ...customTagChoice(tag), checked: true });
			list.insertAdjacentHTML("beforeend", html);
			radio = list.querySelector(`input[name="tag"][value="${CSS.escape(tag.id)}"]`);
		}
		radio.checked = true;
		name.value = "";
		form.open = false;
	});
}

/**
 * Ask for an entry's date, tag, title, place and what happened.
 * @param {object} [entry] The one being edited.
 * @param {{season?: string}} [options] The Season a new one is dated, from the add slot pressed.
 * @returns {Promise<{season: string, tag: string, title: string, place: string, placeUuid: string, body: string}|null>}
 */
export async function promptTimelineEntry(entry = null, { season } = {}) {
	const typed = !entry || entry.source === "hand";
	const answer = await inputDialog({
		title: t(entry ? "timeline.entry.editTitle" : "timeline.entry.newTitle"),
		icon: "fa-solid fa-timeline",
		template: "timeline-entry",
		context: {
			dates: dateChoices(entry?.season ?? season),
			title: entry?.title ?? "",
			place: entry?.place ?? "",
			placeUuid: entry?.placeUuid ?? "",
			body: entry?.body ?? "",
			tags: typed ? tagChoices(entry?.tag ?? "") : null,
			canMakeTags: typed && Boolean(findTimelineJournal()?.isOwner),
			tagColour: DEFAULT_TAG_COLOUR,
			tagNameMax: TAG_NAME_MAX,
			places: placeSuggestions()
		},
		ok: { label: t("timeline.entry.save") },
		render: (_event, dialog) => wireEntryDialog(dialog.element)
	});
	if (!answer) return null;
	const placeUuid = documentUuid(answer.placeUuid);
	return {
		season: String(answer.season ?? ""),
		...(typed ? { tag: String(answer.tag ?? "") } : {}),
		title: String(answer.title ?? "").trim(),
		place: String(answer.place ?? "").trim(),
		placeUuid,
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
 * @param {(entries: object[]) => object} edit
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
 * Write a new entry on a thread, dated by the add slot pressed.
 * @param {{trackId: string}} track
 * @param {string} [season]
 */
async function writeNew(track, season) {
	const entry = await promptTimelineEntry(null, { season });
	if (!entry) return null;
	return write(track, (entries) => addEntry(entries, { ...entry, source: "hand", createdAt: Date.now(), authorId: game.user.id }, foundry.utils.randomID));
}

/** The Referee's colours, chosen but not yet saved, by kind; null puts a kind back to its own. */
const coloursDraft = new Map();

/** Show the draft on a Timeline, for the Referee to see before saving. */
function previewColours(timeline) {
	if (!timeline) return;
	for (const kind of Object.keys(KIND_GROUPS)) {
		const property = kindColourProperty(kind);
		if (!coloursDraft.has(kind)) timeline.style.removeProperty(property);
		else if (coloursDraft.get(kind)) timeline.style.setProperty(property, coloursDraft.get(kind));
		// Put back to its own: the root's chosen colour mustn't show through.
		else timeline.style.setProperty(property, "initial");
	}
}

/**
 * Drop the draft, from every Timeline showing it, and shut this one's menu.
 * @param {HTMLElement} timeline
 */
function closeColours(timeline) {
	coloursDraft.clear();
	for (const each of document.querySelectorAll(".bastionland-timeline")) previewColours(each);
	const menu = timeline?.querySelector('details[data-timeline-menu="colours"]');
	if (menu) menu.open = false;
}

/**
 * The one action every Timeline button takes, by its data-timeline: write a
 * new entry, here or anywhere; edit, remove or move one; open the full
 * Timeline; lay it down or across; tick the Filter back to everything; or
 * save the Referee's colours. For an ApplicationV2's `actions`.
 * @param {PointerEvent} event
 * @param {HTMLElement} target
 */
export async function onTimelineAction(event, target) {
	const what = target.dataset.timeline;
	const timeline = target.closest(".bastionland-timeline");
	if (what === "openFull") return game.system.api?.openTimeline?.();
	if (what === "showAll") return writeFilter({ kinds: [], tracks: [] });
	if (what === "layout") return game.settings.set(SYSTEM_ID, LAYOUT_SETTING, TIMELINE_LAYOUTS.includes(target.dataset.layout) ? target.dataset.layout : "down");
	if (what === "coloursReset") {
		coloursDraft.set(target.dataset.kind, null);
		target.closest("[data-kind]")?.classList.remove("is-repainted");
		return previewColours(timeline);
	}
	if (what === "coloursCancel") return closeColours(timeline);
	if (what === "coloursSave") {
		if (!game.user?.isGM) return null;
		const chosen = chosenColours();
		for (const [kind, colour] of coloursDraft) {
			if (colour) chosen[kind] = colour;
			else delete chosen[kind];
		}
		await game.settings.set(SYSTEM_ID, COLOURS_SETTING, chosen);
		return closeColours(timeline);
	}
	if (what === "new" || what === "addHere") {
		let track = trackOf(target);
		if (!track) {
			const writable = allTracks().filter(canWriteTrack);
			const id = await pickThread(writable);
			track = writable.find((each) => each.trackId === id) ?? null;
		}
		return track ? writeNew(track, what === "addHere" ? target.dataset.season : undefined) : null;
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
 * The colour a kind is painted on this page now, for its picker to open on.
 * @param {HTMLElement} row Wearing the kind's colour.
 * @returns {string} "#rrggbb".
 */
function shownColour(row) {
	const probe = document.createElement("span");
	probe.style.color = "var(--timeline-kind)";
	row.append(probe);
	const [r, g, b] = (getComputedStyle(probe).color.match(/\d+(\.\d+)?/g) ?? []).map(Number);
	probe.remove();
	return [r, g, b].every(Number.isFinite) ? toHex([r, g, b]) : DEFAULT_TAG_COLOUR;
}

/**
 * Tick boxes in a Filter write the reader's Filter, and never reach the
 * form they're in: on a sheet they'd be taken for its own fields. The
 * Referee's colour pickers show their colour on the Timeline as they move.
 * @param {HTMLElement} timeline
 * @param {string[]} trackIds The threads the board offers, for unticking one.
 * @param {AbortSignal} signal Takes the listeners off.
 */
function wireMenus(timeline, trackIds, signal) {
	const filter = timeline.querySelector('details[data-timeline-menu="filter"]');
	filter?.addEventListener("change", (event) => {
		event.stopPropagation();
		const box = event.target;
		if (box.dataset.timelineKind) {
			const kinds = new Set(readFilter().kinds);
			if (box.checked) kinds.delete(box.dataset.timelineKind);
			else kinds.add(box.dataset.timelineKind);
			writeFilter({ kinds: [...kinds] });
		} else if (box.dataset.timelineThread) {
			const shown = [...filter.querySelectorAll("[data-timeline-thread]")].filter((each) => each.checked).map((each) => each.dataset.timelineThread);
			writeFilter({ tracks: trackIds.filter((id) => !shown.includes(id)) });
		}
	}, { signal });
	const colours = timeline.querySelector('details[data-timeline-menu="colours"]');
	if (!colours) return;
	const fill = () => {
		for (const row of colours.querySelectorAll("[data-kind]")) {
			const picker = row.querySelector("input[type=color]");
			const draft = coloursDraft.get(row.dataset.kind);
			picker.value = draft || row.dataset.value || shownColour(row);
		}
	};
	if (colours.open) fill();
	// Shut any way but Save, the draft is let go, as Cancel does.
	colours.addEventListener("toggle", () => {
		if (colours.open) fill();
		else if (coloursDraft.size) closeColours(timeline);
	}, { signal });
	colours.addEventListener("input", (event) => {
		const row = event.target.closest("[data-kind]");
		if (!row) return;
		coloursDraft.set(row.dataset.kind, cleanColour(event.target.value) || null);
		row.classList.add("is-repainted");
		previewColours(timeline);
	}, { signal });
	colours.addEventListener("change", (event) => event.stopPropagation(), { signal });
	previewColours(timeline);
}

/**
 * Follow the Timeline: its pages, the world's tags, the calendar, the
 * reader's Filter and layout, and the names and pictures of the threads'
 * actors and Scenes.
 * @param {string|null} trackId One thread to follow, or null for every one.
 * @param {() => void} onChange
 * @returns {[string, number][]} The hooks, to take off on close.
 */
export function watchTimeline(trackId, onChange) {
	// One thread reads the Company's Season turns too (trackContext), so it redraws for the Company's
	// page as well as its own: but only when those turns moved. The Company's is the busiest thread
	// at the table, and a write to one of its cards changes nothing another thread draws.
	const readsCompany = Boolean(trackId) && trackId !== COMPANY_TRACK;
	let companySeen = readsCompany ? seasonTurnsOf(findTrackPage(COMPANY_TRACK)) : null;
	// A page made or deleted is always news; only an update can leave the turns as they were.
	const follows = (page, change, changes) => {
		const id = pageTrackId(page);
		if (id === trackId) return true;
		if (!readsCompany || id !== COMPANY_TRACK) return false;
		if (change === "update" && !("entries" in (changes?.system ?? {}))) return false;
		const now = change === "delete" ? NO_TURNS : seasonTurnsOf(page);
		if (change === "update" && now === companySeen) return false;
		companySeen = now;
		return true;
	};
	const ours = (page, change, changes) => isTimelinePage(page) && (!trackId || follows(page, change, changes));
	const onPage = (change) => (page, changes) => {
		if (ours(page, change, changes)) onChange();
	};
	const onLooks = (document, changes) => {
		if (!trackId && ("name" in (changes ?? {}) || "img" in (changes ?? {}) || "thumb" in (changes ?? {})) && trackFor(document)) onChange();
	};
	const onTags = (journal, changes) => {
		if (foundry.utils.hasProperty(changes ?? {}, `flags.${SYSTEM_ID}.${TIMELINE_TAGS_FLAG}`) && journal?.id === findTimelineJournal()?.id) onChange();
	};
	// The Timeline reads only the Season it is now (timelineNow): a Phase or a Day passing draws nothing new,
	// and a whole board drawn again for each would be a stall at every turn of the clock.
	const onCalendar = (after, before) => {
		if (!after || !before || seasonKey(after) !== seasonKey(before)) onChange();
	};
	return [
		["createJournalEntryPage", onPage("create")],
		["updateJournalEntryPage", onPage("update")],
		["deleteJournalEntryPage", onPage("delete")],
		["updateJournalEntry", onTags],
		["updateActor", onLooks],
		["updateScene", onLooks],
		[CALENDAR_HOOK, onCalendar],
		[TIMELINE_FILTER_HOOK, () => onChange()]
	].map(([name, handler]) => [name, Hooks.on(name, handler)]);
}

/** A page with no Season turns, as seasonTurnsOf writes it. */
const NO_TURNS = "[]";

/** Each Timeline page's Season turns as last read, by its entries, so every open sheet reads them once a write. */
const turnsRead = new WeakMap();

/**
 * @param {JournalEntryPage|null|undefined} page
 * @returns {string} The page's Season turns, to tell whether they moved.
 */
function seasonTurnsOf(page) {
	const entries = page?.system?.entries;
	if (!entries || typeof entries !== "object") return NO_TURNS;
	let read = turnsRead.get(entries);
	if (read === undefined) {
		read = JSON.stringify(readEntries(entries).filter(isSeasonTurn));
		turnsRead.set(entries, read);
	}
	return read;
}

/**
 * @param {[string, number][]} hooks From watchTimeline.
 */
export const unwatchTimeline = (hooks) => {
	for (const [name, id] of hooks) Hooks.off(name, id);
};

/**
 * What every place a Timeline is drawn keeps for it across its redraws: where
 * its board was left, its zoom, its open menus and the keyboard's place.
 */
export class TimelineHost {
	/**
	 * @param {string} key Its own, for the view a reload brings back: "window", "toolkit" or an actor's.
	 */
	constructor(key) {
		this.#key = key;
	}

	#key;
	#state = hostState();
	#unwire = () => {};
	#opened = false;

	/** Whether it was last drawn across the page. */
	#across = false;

	/**
	 * Wire the Timeline just drawn in `root`. The first time, a window reopened
	 * by a reload takes up where it was left; any other opens on the Season it
	 * is now, as does one drawn in another layout, where its old place means nothing.
	 * @param {HTMLElement} root
	 * @param {string[]} [trackIds] The board's threads, for its Filter.
	 */
	wire(root, trackIds = []) {
		this.unwire();
		const timeline = timelineIn(root);
		if (!timeline) return;
		const across = timeline.classList.contains("bastionland-timeline--across");
		if (!this.#opened) {
			this.#opened = true;
			const kept = reopeningWindows() ? keptView(this.#key) : null;
			this.#state.view = kept;
			this.#state.zoom = kept?.zoom ?? 1;
		} else if (across !== this.#across) this.#state.view = null;
		this.#across = across;
		const wiring = new AbortController();
		wireMenus(timeline, trackIds, wiring.signal);
		const unwire = wireTimeline(timeline, this.#state, { onView: (view) => keepView(this.#key, view) });
		this.#unwire = () => {
			wiring.abort();
			unwire();
		};
	}

	/** Take its listeners off what was drawn, keeping where it was left. */
	unwire() {
		this.#unwire();
		this.#unwire = () => {};
	}

	/** Shut: the next open starts afresh. */
	close() {
		this.unwire();
		this.#state = hostState();
		this.#opened = false;
	}
}

/**
 * A sheet's Timeline tab: its actor's thread, or on the Referee Toolkit every
 * thread side by side, gathered only while the tab is the page open, and drawn
 * again as it's opened if it missed a change while hidden. The Knight's, the
 * Domain's and the Toolkit's sheets each keep one.
 */
export class TimelineTab {
	/**
	 * @param {foundry.applications.api.ApplicationV2 & {actor: Actor}} sheet
	 * @param {object} [options]
	 * @param {boolean} [options.board] Every thread side by side, as the Timeline window shows them, rather than the actor's own.
	 * @param {() => void} [options.redraw] How the sheet draws the tab again; the whole sheet, by default.
	 */
	constructor(sheet, { board = false, redraw = () => renderWhenIdle(sheet) } = {}) {
		this.#sheet = sheet;
		this.#board = board;
		this.#redraw = redraw;
		this.#host = new TimelineHost(board ? "toolkit" : `actor:${sheet.actor?.id ?? sheet.id}`);
	}

	#sheet;
	#board;
	#redraw;
	#host;
	#stale = false;
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
		if (this.#board) {
			this.#last = await boardContext();
			return this.#last;
		}
		const track = trackFor(this.#sheet.actor);
		this.#last = track ? await trackContext(track) : null;
		return this.#last;
	}

	/** Called as the sheet changes tab: a tab that missed a change is drawn again. */
	shown(tab) {
		if (tab !== "timeline") return;
		if (this.#stale) {
			this.#stale = false;
			this.#redraw();
		} else this.wire(this.#sheet.element);
	}

	/**
	 * Wire the tab once it's drawn: on a sheet drawn a part at a time, only when
	 * its part is, since the listeners stay on what's already there. A hidden
	 * tab has its listeners taken off, since the sheet may have drawn it anew
	 * and left them on the old one; it's wired again as it's shown.
	 * @param {HTMLElement} root The sheet, just drawn.
	 */
	wire(root) {
		const tab = root?.querySelector('.tab[data-tab="timeline"]');
		if (!tab || !this.#open) {
			this.#host.unwire();
			return;
		}
		this.#host.wire(tab, this.#board ? (this.#last?.threads ?? []).map((thread) => thread.trackId) : []);
	}

	/** Follow the thread, or every thread, while the sheet is open. */
	watch() {
		this.#hooks = watchTimeline(this.#board ? null : this.#sheet.actor.id, () => {
			if (this.#open) this.#redraw();
			else this.#stale = true;
		});
	}

	unwatch() {
		unwatchTimeline(this.#hooks);
		this.#hooks = [];
		this.#host.close();
	}
}
