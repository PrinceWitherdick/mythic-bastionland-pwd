import { SYSTEM_ID } from "../system-id.js";
import { CUSTOM_TAG_PREFIX, TIMELINE_TAGS_FLAG, cleanColour, cleanTagName, findTagByName, normalizeCustomTag, readCustomTags } from "../rules/timeline-tags.js";
import { findTimelineJournal } from "./timeline-store.js";

/**
 * Where the world's own Timeline tags are kept: a flag on the Timeline's
 * Journal entry, which every player owns, so a player can make the tag their
 * thread wants without a Referee. Each tag is its own key, so two people
 * naming tags at once both keep theirs.
 */

/**
 * @param {JournalEntry|null} [journal]
 * @returns {import("../rules/timeline-tags.js").CustomTag[]} By name; none before the Timeline is made.
 */
export const worldCustomTags = (journal = findTimelineJournal()) => readCustomTags(journal?.getFlag?.(SYSTEM_ID, TIMELINE_TAGS_FLAG) ?? null);

/**
 * Make a tag, or hand back the one already called that: a second "Feasts"
 * would be two Filter lines meaning one thing.
 * @param {{name: string, colour: string}} tag
 * @returns {Promise<{tag: import("../rules/timeline-tags.js").CustomTag|null, reason?: "name"|"colour"|"journal"}>}
 */
export async function createCustomTag({ name, colour }) {
	const journal = findTimelineJournal();
	const clean = cleanTagName(name);
	if (!clean) return { tag: null, reason: "name" };
	const hex = cleanColour(colour);
	if (!hex) return { tag: null, reason: "colour" };
	if (!journal?.isOwner) return { tag: null, reason: "journal" };
	const twin = findTagByName(worldCustomTags(journal), clean);
	if (twin) return { tag: twin };
	const tag = normalizeCustomTag({ name: clean, colour: hex }, `${CUSTOM_TAG_PREFIX}${foundry.utils.randomID()}`);
	await journal.update({ [`flags.${SYSTEM_ID}.${TIMELINE_TAGS_FLAG}.${tag.id}`]: tag });
	return { tag };
}
