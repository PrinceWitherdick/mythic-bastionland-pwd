import { completedMythId } from "../rules/season-log.js";
import { editMythNote } from "./myth-notes.js";
import { forgetMythCompleted, recordMythCompleted } from "./season-log.js";
import { timelineMythCompleted, timelineMythUndone } from "./timeline-events.js";

/**
 * A Myth resolved, or unresolved again, everywhere it's kept: its note on the
 * Realm, the Season's record in the Referee Toolkit, and the Timeline.
 */

/**
 * The group feels the Myth is resolved (p27): mark it so, keep it in this
 * Season's record, award the Glory that comes with it, and write it on the
 * Timeline once the Referee has said who played a part in it.
 * @param {Scene} scene The Realm it's in.
 * @param {object} myth As the Realm keeps it.
 * @param {object} options
 * @param {string} options.name
 * @param {() => Promise<Actor[]>} options.award Gives the Glory, saying to whom.
 * @param {string} [options.note] Written on its note as it's resolved.
 * @returns {Promise<void>}
 */
export async function resolveMyth(scene, myth, { name, award, note }) {
	const completed = { id: completedMythId(scene.id, myth), name };
	const [, , knights] = await Promise.all([
		editMythNote(scene, myth, { ...(note === undefined ? {} : { note }), resolved: true }),
		recordMythCompleted(completed),
		award()
	]);
	await timelineMythCompleted({ scene, completedId: completed.id, name, knights: knights ?? [] });
}

/**
 * A Myth marked unresolved again comes out of the Season's record and off the Timeline.
 * @param {Scene} scene
 * @param {object} myth
 * @returns {Promise<void>}
 */
export async function unresolveMyth(scene, myth) {
	const completedId = completedMythId(scene.id, myth);
	await Promise.all([editMythNote(scene, myth, { resolved: false }), forgetMythCompleted(completedId), timelineMythUndone(completedId)]);
}
