/**
 * What a Timeline entry wears: its kind's chip and colour, and on a typed
 * entry one tag. Borrowed from the Stonetop system's timeline tags. A tag is
 * either a kind the game records (a typed Scar then reads as Wounds, chip,
 * colour and Filter line alike, though its source stays "hand") or one of the
 * table's own, a name and a colour kept for the whole world on the Timeline's
 * Journal entry (actions/timeline-tags.js). Pure, so it can be tested without
 * Foundry.
 */
import { HEX_COLOR } from "./colour.js";
import { KIND_GROUPS, sourceGroup } from "./timeline.js";

/** The flag on the Timeline's Journal entry that keeps the world's own tags, by id. */
export const TIMELINE_TAGS_FLAG = "timelineTags";

/** What every tag of the table's own is called by, so one is never taken for a kind. */
export const CUSTOM_TAG_PREFIX = "tag-";

/** The longest name a tag keeps: a chip is a word or two. */
export const TAG_NAME_MAX = 32;

/** The colour a new tag starts on, which no kind wears. */
export const DEFAULT_TAG_COLOUR = "#3f5f8a";

/** The glyph each kind wears beside its name, on a card's chip and in the Filter. */
export const KIND_ICONS = Object.freeze({
	hand: "fa-solid fa-feather-pointed",
	time: "fa-solid fa-hourglass-half",
	myth: "fa-solid fa-dragon",
	glory: "fa-solid fa-crown",
	wounds: "fa-solid fa-heart-crack",
	lineage: "fa-solid fa-sitemap",
	dominion: "fa-solid fa-chess-rook",
	travels: "fa-solid fa-route"
});

/** The glyph every tag of the table's own wears: its name and colour tell one from another. */
export const CUSTOM_TAG_ICON = "fa-solid fa-tag";

/** The glyph each kind of thread wears in the Filter. */
export const THREAD_ICONS = Object.freeze({
	company: "fa-solid fa-people-group",
	knight: "fa-solid fa-chess-knight",
	domain: "fa-solid fa-chess-rook",
	realm: "fa-solid fa-map"
});

/**
 * @param {unknown} value
 * @returns {string} A colour as "#rrggbb", or "" for anything that isn't one: it goes into a style.
 */
export function cleanColour(value) {
	const hex = String(value ?? "").trim().toLowerCase();
	return HEX_COLOR.test(hex) ? hex : "";
}

/** @returns {boolean} Whether it's a kind a typed entry can read as. */
export const isKindTag = (tag) => tag !== "hand" && Object.hasOwn(KIND_GROUPS, tag);

/** @returns {boolean} Whether it's one of the table's own tags' ids, kept or not. */
export function isCustomTagId(tag) {
	const id = String(tag ?? "");
	return id.startsWith(CUSTOM_TAG_PREFIX) && id.length > CUSTOM_TAG_PREFIX.length;
}

/** @returns {string} A tag's name as it's kept: one line, its spaces closed up, cut short. */
export const cleanTagName = (name) => String(name ?? "").replace(/\s+/g, " ").trim().slice(0, TAG_NAME_MAX).trim();

/**
 * @typedef {object} CustomTag
 * @property {string} id     CUSTOM_TAG_PREFIX and a random id.
 * @property {string} name
 * @property {string} colour "#rrggbb".
 */

/**
 * @param {unknown} raw One kept tag.
 * @param {string} [id]
 * @returns {CustomTag|null} Made whole, or null for anything that isn't a tag.
 */
export function normalizeCustomTag(raw, id = /** @type {any} */ (raw)?.id) {
	const tagId = String(id ?? "").replace(/\./g, "").trim();
	const name = cleanTagName(/** @type {any} */ (raw)?.name);
	const colour = cleanColour(/** @type {any} */ (raw)?.colour);
	if (!isCustomTagId(tagId) || !name || !colour) return null;
	return { id: tagId, name, colour };
}

/**
 * @param {unknown} raw The Journal entry's flag, kept by id.
 * @returns {CustomTag[]} The world's own tags, by name.
 */
export function readCustomTags(raw) {
	if (!raw || typeof raw !== "object") return [];
	return Object.entries(raw)
		.map(([id, tag]) => normalizeCustomTag(tag, tag?.id || id))
		.filter(Boolean)
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/**
 * @param {CustomTag[]} tags
 * @param {string} name
 * @returns {CustomTag|null} The tag already called that, whatever its case and spacing.
 */
export function findTagByName(tags, name) {
	const wanted = cleanTagName(name).toLocaleLowerCase();
	if (!wanted) return null;
	return (tags ?? []).find((tag) => tag.name.toLocaleLowerCase() === wanted) ?? null;
}

/**
 * @param {CustomTag[]|Map<string, CustomTag>} tags
 * @returns {Map<string, CustomTag>} By id.
 */
export const indexCustomTags = (tags) => (tags instanceof Map ? tags : new Map((Array.isArray(tags) ? tags : []).map((tag) => [tag.id, tag])));

/** @returns {boolean} Whether the game wrote it, rather than a hand. */
const isMilestone = (entry) => Boolean(entry?.source) && entry.source !== "hand";

/**
 * The tag a typed entry wears, as the world has it now: a tag the world has
 * lost is none, so the entry reads as typed rather than as a chip with no name.
 * A milestone's kind is its source, never a tag.
 * @param {{source?: string, tag?: string}} entry
 * @param {CustomTag[]|Map<string, CustomTag>} tags
 * @returns {string} A kind, a custom tag's id, or "".
 */
export function liveTag(entry, tags) {
	if (isMilestone(entry)) return "";
	const tag = String(entry?.tag ?? "");
	if (isKindTag(tag)) return tag;
	return isCustomTagId(tag) && indexCustomTags(tags).has(tag) ? tag : "";
}

/**
 * The Filter line an entry answers to: a milestone's kind, a typed entry's
 * tag (a borrowed kind files with that kind), or "hand".
 * @param {{source?: string, tag?: string}} entry
 * @param {CustomTag[]|Map<string, CustomTag>} tags
 * @returns {string}
 */
export function filterKey(entry, tags) {
	if (isMilestone(entry)) return sourceGroup(entry.source);
	return liveTag(entry, tags) || "hand";
}

/**
 * The chip an entry wears: its kind's glyph and colour, and for a typed
 * entry with a tag, the tag's.
 * @param {{source?: string, tag?: string}} entry
 * @param {CustomTag[]|Map<string, CustomTag>} tags
 * @returns {{kind: string, icon: string, tagged: boolean, tagName: string, colour: string}}
 *   `kind` a KIND_GROUPS line, or "custom" for one of the table's tags, whose name and colour come with it.
 */
export function entryChip(entry, tags) {
	const key = filterKey(entry, tags);
	const tagged = !isMilestone(entry) && key !== "hand";
	if (Object.hasOwn(KIND_ICONS, key)) return { kind: key, icon: KIND_ICONS[key], tagged, tagName: "", colour: "" };
	const tag = indexCustomTags(tags).get(key);
	return { kind: "custom", icon: CUSTOM_TAG_ICON, tagged, tagName: tag?.name ?? "", colour: tag?.colour ?? "" };
}

/**
 * The colour each kind is painted, as the Referee chose: only a kind and a
 * real colour are kept, so nothing else reaches a style.
 * @param {unknown} raw The world's setting.
 * @returns {Record<string, string>} By kind.
 */
export function readKindColours(raw) {
	if (!raw || typeof raw !== "object") return {};
	return Object.fromEntries(Object.keys(KIND_GROUPS).map((kind) => [kind, cleanColour(raw[kind])]).filter(([, colour]) => colour));
}

/**
 * @param {string} kind
 * @returns {string} The custom property a kind's chosen colour is set in, on the page's root.
 */
export const kindColourProperty = (kind) => `--timeline-colour-${kind}`;
