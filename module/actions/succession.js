import { inputDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { escapeHTML } from "../rules/text.js";
import { worldKnights } from "./knights.js";

/**
 * @param {Actor} knight
 * @returns {Actor|null} The Knight or Squire they named to follow them, if they still exist.
 */
export function heirOf(knight) {
	const heir = knight.system.successor ? fromUuidSync(knight.system.successor) : null;
	return heir?.documentName === "Actor" && heir.type === "knight" ? heir : null;
}

/**
 * Name a Knight's successor (Succession, p17): any other Knight in the world,
 * their own Squire offered first.
 * @param {Actor} knight
 * @returns {Promise<Actor|null>} The successor, or null if closed or left unnamed.
 */
export async function chooseSuccessor(knight) {
	const current = heirOf(knight) ?? (knight.system.squire ? fromUuidSync(knight.system.squire) : null);
	const candidates = worldKnights((actor) => actor !== knight);
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
	if (heir && knight.system.successor !== heir.uuid) await knight.update({ "system.successor": heir.uuid });
	return heir;
}
