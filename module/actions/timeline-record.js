import { seasonKey } from "../rules/time.js";
import { upsertByKey } from "../rules/timeline.js";
import { SYSTEM_ID } from "../system-id.js";
import { getCalendar } from "./calendar.js";
import { mutateTrack, removeKeyEverywhere, trackFor } from "./timeline-store.js";

/**
 * Writing milestones on the Timeline as they happen. A milestone that can't
 * be written, as when nobody has made the Timeline yet, is let go with one
 * warning a session: whatever happened still happens.
 */

/** @returns {string} The Season it is now, or "" while the calendar can't be read. */
export function timelineNow() {
	try {
		return seasonKey(getCalendar());
	} catch {
		return "";
	}
}

let warned = false;
const warnOnce = (error) => {
	if (!warned) console.warn(`${SYSTEM_ID} | Couldn't write on the Timeline`, error);
	warned = true;
};

/**
 * @typedef {object} Milestone
 * @property {string} source  One of TIMELINE_SOURCES.
 * @property {string} key     What it is (timelineKeys), so it's written once.
 * @property {string} [title]
 * @property {string} [body]
 * @property {string} [place]
 * @property {string} [season] Its Season, when it isn't now's.
 * @property {string[]} [refresh] What a milestone written again changes on its row.
 * @property {(Actor|null)[]} [about] Who it tells of: kept off every thread the players read while any of them is kept from the players. Never written on the row.
 */

/**
 * @param {Actor|Scene|string|{trackId: string}} target
 * @returns {{trackId: string, kind: string, name: string}|null}
 */
const asTrack = (target) => (target?.trackId ? target : trackFor(target));

/**
 * @param {Actor|Scene|string|{trackId: string}|null} target
 * @returns {boolean} Whether its thread is kept for the Referee alone, so nothing of it belongs on a thread the players read.
 */
export function keptFromPlayers(target) {
	// trackFor counts a thread it can't tell as kept back: a row the players shouldn't read is worse than one missing.
	return Boolean(target && asTrack(target)?.secret);
}

/**
 * @param {{secret?: boolean}} track
 * @param {Milestone} milestone
 * @returns {boolean} Whether it may go on that thread: a thread the players read never tells of anyone kept from them.
 */
const belongsOn = (track, { about = [] }) => Boolean(track.secret) || !about.some(keptFromPlayers);

/**
 * Write milestones on one thread, each once.
 * @param {Actor|Scene|string|{trackId: string}} target An actor, a Realm's Scene, COMPANY_TRACK, or a thread.
 * @param {Milestone|Milestone[]} milestones
 * @param {{when?: string}} [options] Their Season, when it isn't now.
 * @returns {Promise<object|null>}
 */
export async function recordOnTrack(target, milestones, { when } = {}) {
	const track = asTrack(target);
	const list = track ? (Array.isArray(milestones) ? milestones : [milestones]).filter((milestone) => milestone && belongsOn(track, milestone)) : [];
	if (!list.length) return null;
	try {
		const season = when ?? timelineNow();
		const stamp = { createdAt: Date.now(), authorId: game.user?.id ?? "" };
		return await mutateTrack(track, (entries) => ({
			entries: list.reduce((current, { refresh = [], about: _about, ...milestone }) => upsertByKey(current, { season, ...stamp, ...milestone }, { refresh, makeId: foundry.utils.randomID }).entries, entries)
		}), { create: true });
	} catch (error) {
		warnOnce(error);
		return null;
	}
}

/**
 * Write the same milestone on several threads, each thread once.
 * @param {(Actor|Scene|string|{trackId: string}|null)[]} targets
 * @param {Milestone|Milestone[]} milestones
 * @param {{when?: string}} [options]
 */
export async function recordOnTracks(targets, milestones, options) {
	const tracks = new Map();
	for (const target of targets) {
		const track = target ? asTrack(target) : null;
		if (track && !tracks.has(track.trackId)) tracks.set(track.trackId, track);
	}
	return Promise.all([...tracks.values()].map((track) => recordOnTrack(track, milestones, options)));
}

/**
 * Take milestones' rows off every thread, as when a Myth is unresolved.
 * @param {string|string[]} key One key, or several taken off together.
 */
export async function forgetEverywhere(key) {
	try {
		await removeKeyEverywhere(key);
	} catch (error) {
		console.warn(`${SYSTEM_ID} | Couldn't take a milestone off the Timeline`, error);
	}
}
