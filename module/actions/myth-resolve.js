import { loadArtIndex, mythLookup, pageNote } from "../book-art/art-index.js";
import { postCard, registerCardButtons, t, warn } from "../chat/cards.js";
import { placeFeature } from "../rules/realm-edits.js";
import { resolvedMyths } from "../rules/gm-toolkit.js";
import { mythGloryFor, mythNoteFor } from "../rules/myth-notes.js";
import { oncePerKey } from "../rules/queue.js";
import { completedMythId } from "../rules/season-log.js";
import { takeBackGlory } from "./glory.js";
import { rollFreeMyth } from "./gm-toolkit.js";
import { hexLabel } from "./hex-names.js";
import { editMythNote, getMythNotes } from "./myth-notes.js";
import { editRealm, getRealm, isRealmScene } from "./realm.js";
import { keptFromMe } from "./solo.js";
import { forgetMythCompleted, recordMythCompleted } from "./season-log.js";
import { timelineMythCompleted, timelineMythUndone } from "./timeline-events.js";

/**
 * A Myth resolved, or unresolved again, everywhere it's kept: its note on the
 * Realm, the Season's record in the Referee Toolkit, and the Timeline.
 */

/** Myths this client is resolving, or giving the Glory of, now: one award window each. */
const awarding = oncePerKey();

/**
 * @param {Scene} scene
 * @param {object} myth
 * @returns {boolean} Whether the Myth is marked resolved on its Realm.
 */
const isResolved = (scene, myth) => Boolean(mythNoteFor(getMythNotes(scene), myth).resolved);

/**
 * The group feels the Myth is resolved (p27): mark it so, keep it in this
 * Season's record, award the Glory that comes with it, and write it on the
 * Timeline once the Referee has said who played a part in it. It's marked
 * resolved before anyone is asked, so a second click, or another Referee, finds
 * it resolved already and gives its Glory no second time.
 * @param {Scene} scene The Realm it's in.
 * @param {object} myth As the Realm keeps it.
 * @param {object} options
 * @param {string} options.name
 * @param {() => Promise<Actor[]>} options.award Gives the Glory, saying to whom.
 * @param {string} [options.note] Written on its note as it's resolved.
 * @returns {Promise<boolean>} Whether it was resolved here.
 */
export async function resolveMyth(scene, myth, { name, award, note }) {
	const completed = { id: completedMythId(scene.id, myth), name };
	const resolved = await awarding(completed.id, async () => {
		if (isResolved(scene, myth)) return false;
		await editMythNote(scene, myth, { ...(note === undefined ? {} : { note }), resolved: true, glory: [] });
		// The Season's record needs nobody's name, so it's kept while the Glory is given.
		const recorded = recordMythCompleted(completed);
		const knights = await giveMythGlory(scene, myth, award);
		await Promise.all([recorded, timelineMythCompleted({ scene, completedId: completed.id, name, knights })]);
		return true;
	}, () => false);
	if (!resolved) warn("gmToolkit.myths.alreadyResolved");
	return resolved;
}

/**
 * Award the Glory of a Myth resolved with none given (p6, p27), as when the
 * window was closed as it was resolved. Who gains it is kept with the Myth, so
 * Unresolve can take it back. A Myth no longer resolved, or one whose Glory has
 * been given since, gives none. GMs only.
 * @param {Scene} scene
 * @param {object} myth
 * @param {() => Promise<Actor[]>} award Gives the Glory, saying to whom.
 * @returns {Promise<Actor[]>} Those given it.
 */
export async function awardMythGlory(scene, myth, award) {
	if (!game.user.isGM) return [];
	const given = await awarding(completedMythId(scene.id, myth), async () => {
		if (!isResolved(scene, myth) || mythGloryFor(getMythNotes(scene), myth).length) {
			warn("gmToolkit.myths.gloryGiven");
			return [];
		}
		return giveMythGlory(scene, myth, award);
	}, () => warn("cardButtons.alreadyPressed"));
	return given ?? [];
}

/**
 * Ask who gains a resolved Myth's Glory, and keep them with the Myth, so it can
 * be taken back if the Myth is unresolved. Unresolved while the window was
 * open, the Myth keeps nobody's name, and the Referee is offered to take back
 * the Glory just given, as Unresolve would have.
 * @param {Scene} scene
 * @param {object} myth
 * @param {() => Promise<Actor[]>} award
 * @returns {Promise<Actor[]>}
 */
async function giveMythGlory(scene, myth, award) {
	const knights = (await award()) ?? [];
	if (!knights.length) return knights;
	if (!isResolved(scene, myth)) {
		await takeBackGlory("myth", knights);
		return [];
	}
	await editMythNote(scene, myth, { glory: knights.map((knight) => knight.id) });
	return knights;
}

/**
 * A Myth marked unresolved again comes out of the Season's record and off the
 * Timeline. The Referee is offered to take back the Glory it gave, which closing
 * the question keeps.
 * @param {Scene} scene
 * @param {object} myth
 * @returns {Promise<void>}
 */
export async function unresolveMyth(scene, myth) {
	const completedId = completedMythId(scene.id, myth);
	const given = mythGloryFor(getMythNotes(scene), myth).map((id) => game.actors.get(id)).filter(Boolean);
	// The Glory it gave is offered back while it comes off everywhere it's kept.
	await Promise.all([editMythNote(scene, myth, { resolved: false }), forgetMythCompleted(completedId), timelineMythUndone(completedId), given.length && takeBackGlory("myth", given)]);
}

/**
 * Roll the new Myth that replaces a resolved one (p27), in the same hex and
 * under the same number, with none of its Omens met. A Realm never holds the
 * same Myth twice, so a Myth it already has, the resolved one included, is
 * rolled again. What was written about the old Myth stays with the old roll,
 * so taking the roll back with the Realm's Undo brings it back too. GMs only.
 * @param {Scene} scene The Realm it's in.
 * @param {object} myth As the Realm keeps it.
 * @param {object} [index] The book's art index, when it's already loaded.
 * @returns {Promise<boolean>} Whether a new Myth was rolled.
 */
export async function replaceMyth(scene, myth, index = null) {
	if (!game.user.isGM) return false;
	const { realm } = getRealm(scene);
	const { d6, d12, rolls } = await rollFreeMyth(realm);
	const rolled = { number: myth.number, d6, d12 };
	// What resolving a Myth brings about, so not for Undo on the map to take back.
	const written = await editRealm(scene, (realm, g) => placeFeature(realm, g, myth.hex, { kind: "myth", ...rolled, omen: 0, revealed: false }));
	if (!written) return false;
	// Played alone, the new Myth is met as the others were: by its first Omen.
	if (keptFromMe()) {
		await postCard(null, "omen", {
			title: t("solo.newMythTitle", { number: myth.number }),
			tagline: null,
			img: null,
			omen: t("solo.newMythText"),
			text: null,
			hint: null
		// The dice would say which Myth it is, so they're left off.
		}, { mode: "gm" });
		return true;
	}
	const { name, page, entry } = mythLookup(index ?? (await loadArtIndex()), rolled);
	await postCard(null, "omen", {
		title: `${myth.number}. ${name}`,
		tagline: pageNote(page),
		img: entry?.path ?? null,
		omen: t("gmToolkit.myths.newMythRolled", { hex: hexLabel(myth.hex, scene) }),
		text: null,
		hint: t("gmToolkit.myths.newMythHint")
	}, { rolls, mode: "gm" });
	return true;
}

/**
 * Wire up the Season card's buttons that roll a new Myth for each resolved one.
 * A Myth already replaced, or no longer resolved, isn't rolled again. Called during init.
 */
export function registerReplaceMyth() {
	registerCardButtons({
		selector: "[data-replace-myth]",
		gmOnly: true,
		// Gone for everybody once its Myth is rolled.
		once: true,
		handler: async (button) => {
			const scene = game.scenes.get(button.dataset.replaceMythScene ?? "");
			const number = Number(button.dataset.replaceMyth);
			const myth = isRealmScene(scene) ? resolvedMyths(getRealm(scene).realm, getMythNotes(scene)).find((resolved) => resolved.number === number) : null;
			if (!myth) {
				warn("time.due.mythGone");
				return false;
			}
			return Boolean(await replaceMyth(scene, myth));
		}
	});
}
