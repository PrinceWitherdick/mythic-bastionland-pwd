import { inputDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { escapeHTML } from "../rules/text.js";
import { worldKnights } from "./knights.js";
import { timelineHeirNamed } from "./timeline-events.js";
import { isKnight } from "../rules/knight-types.js";

/**
 * @param {Actor} knight
 * @returns {Actor|null} The Knight or Squire they named to follow them, if they still exist.
 */
export function heirOf(knight) {
	const heir = knight.system.successor ? fromUuidSync(knight.system.successor) : null;
	return heir?.documentName === "Actor" && isKnight(heir) ? heir : null;
}

/**
 * Name a Knight's successor, and write it on their Timeline thread.
 * @param {Actor} knight
 * @param {Actor} heir
 * @param {object} [options]
 * @param {boolean} [options.record=true] False where the Age's turn already says it on the same thread.
 */
export async function nameSuccessor(knight, heir, { record = true } = {}) {
	if (knight.system.successor === heir.uuid) return;
	await knight.update({ "system.successor": heir.uuid });
	if (record) await timelineHeirNamed(knight, heir);
}

/**
 * Name a Knight's successor (Succession, p17): any other Knight in the world
 * whoever chooses can see, their own Squire offered first.
 * @param {Actor} knight
 * @param {object} [options] As nameSuccessor takes.
 * @returns {Promise<Actor|null>} The successor, or null if closed or left unnamed.
 */
export async function chooseSuccessor(knight, options) {
	const current = heirOf(knight) ?? (knight.system.squire ? fromUuidSync(knight.system.squire) : null);
	const candidates = worldKnights((actor) => actor !== knight && (actor.visible || actor === current));
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
