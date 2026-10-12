import { deletionUpdate } from "../compat.js";
import { designDone, grandDesigns, newDesign } from "../rules/grand-designs.js";
import { seasonKey } from "../rules/time.js";
import { getCalendar } from "./calendar.js";
import { timelineDesignBegun, timelineDesignForgotten } from "./timeline-events.js";

/**
 * A Domain's Grand Designs (p21), begun and struck off. What's being built is
 * written on the sheet afterwards, as any field is.
 */

/**
 * Begin a work, now, and write it on the Domain's Timeline thread.
 * @param {Actor} domain
 * @param {string} scale One of DESIGN_SCALES.
 * @returns {Promise<string|null>} The work's id, or null for a scale the book doesn't give.
 */
export async function beginDesign(domain, scale) {
	const design = newDesign(scale, getCalendar(), Date.now());
	if (!design) return null;
	const id = foundry.utils.randomID();
	await domain.update({ [`system.designs.${id}`]: design });
	await timelineDesignBegun(domain, id, design);
	return id;
}

/**
 * Strike a work off. One struck off in the Season it was begun, before it was
 * done, was most likely a slip, so its row comes off the Timeline too; any
 * other stays, since a work abandoned or finished is still the Domain's story.
 * @param {Actor} domain
 * @param {string} id
 */
export async function strikeOffDesign(domain, id) {
	if (!id) return null;
	const design = grandDesigns(domain.system.designs).find((each) => each.id === id);
	const calendar = getCalendar();
	await domain.update(deletionUpdate(`system.designs.${id}`));
	if (design && !designDone(design, calendar) && seasonKey(design.started) === seasonKey(calendar)) await timelineDesignForgotten(id);
	return id;
}
