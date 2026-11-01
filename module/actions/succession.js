import { inputDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { escapeHTML } from "../rules/text.js";
import { seenOrChosen, worldKnights } from "./knights.js";
import { timelineHeirNamed } from "./timeline-events.js";
import { isKnight } from "../rules/knight-types.js";
import { linkedActor } from "./belonging.js";

/**
 * @param {Actor} knight
 * @returns {Actor|null} The Knight or Squire they named to follow them, if they still exist, alive or not.
 */
export function namedHeirOf(knight) {
	const heir = knight.system.successor ? fromUuidSync(knight.system.successor) : null;
	return heir?.documentName === "Actor" && isKnight(heir) ? heir : null;
}

/**
 * @param {Actor} knight
 * @returns {Actor|null} The Knight or Squire they named to follow them, if they still exist and live:
 *   a Slain heir can't succeed anybody (p17).
 */
export function heirOf(knight) {
	const heir = namedHeirOf(knight);
	return heir && !heir.system.slain ? heir : null;
}

/**
 * Name a Knight's successor, and write it on their Timeline thread. The dead
 * follow nobody (p17), so a Slain heir is refused with a warning.
 * @param {Actor} knight
 * @param {Actor} heir
 * @param {object} [options]
 * @param {boolean} [options.record=true] False where the Age's turn already says it on the same thread.
 * @returns {Promise<boolean>} Whether the heir is now their successor.
 */
export async function nameSuccessor(knight, heir, { record = true } = {}) {
	if (heir.system?.slain) {
		ui.notifications.warn(t("successor.slain", { name: heir.name }));
		return false;
	}
	if (knight.system.successor === heir.uuid) return true;
	await knight.update({ "system.successor": heir.uuid });
	if (record) await timelineHeirNamed(knight, heir);
	return true;
}

/**
 * Name a Knight's successor (Succession, p17): any other living Knight in
 * the world whoever chooses can see, their own Squire offered first.
 * @param {Actor} knight
 * @param {object} [options] As nameSuccessor takes.
 * @returns {Promise<Actor|null>} The successor, or null if closed or left unnamed.
 */
export async function chooseSuccessor(knight, options) {
	const current = heirOf(knight) ?? linkedActor(knight.system.squire);
	const candidates = worldKnights((actor) => actor !== knight && !actor.system.slain).filter(seenOrChosen((actor) => actor === current));
	if (!candidates.length) {
		ui.notifications.info(t("successor.none", { name: knight.name }));
		return null;
	}
	const data = await inputDialog({
		title: t("successor.title"),
		icon: "fa-solid fa-crown",
		template: "successor",
		context: {
			intro: t("successor.intro", { name: escapeHTML(knight.name) }),
			candidates: candidates.map((actor) => ({
				uuid: actor.uuid,
				name: actor.system.isSquire ? t("successor.squire", { name: actor.name }) : actor.name,
				selected: actor === current
			}))
		},
		ok: { label: t("successor.name"), icon: "fa-solid fa-crown" }
	});
	const heir = candidates.find((actor) => actor.uuid === data?.successor) ?? null;
	if (heir) await nameSuccessor(knight, heir, options);
	return heir;
}
