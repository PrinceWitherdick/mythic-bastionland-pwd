import { confirmDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { COURT_ROLES, newCourtMember, normalizeCourt } from "../rules/court.js";
import { escapeHTML } from "../rules/text.js";

/**
 * Who serves a Domain outside its Council (The Court, p20). Each member is kept
 * under an id of their own, so the sheet writes one line at a time straight to
 * `system.court.<id>.<field>` and only joining and leaving come through here.
 */

/**
 * Take somebody new into the Court.
 * @param {Actor} domain
 * @param {string} role One of COURT_ROLES.
 * @param {{name?: string, note?: string}} [fields] What's already known of them.
 * @returns {Promise<string|null>} Their id, or null for a role the Court doesn't have.
 */
export async function addCourtMember(domain, role, fields = {}) {
	if (!COURT_ROLES.includes(role) || !domain?.isOwner) return null;
	const member = { ...newCourtMember(role, Date.now()), ...fields };
	const id = foundry.utils.randomID();
	await domain.update({ [`system.court.${id}`]: member });
	return id;
}

/**
 * Let somebody go from the Court. One who has been named is confirmed first,
 * since their line would be lost with them.
 * @param {Actor} domain
 * @param {string} id
 * @returns {Promise<boolean>} Whether they left.
 */
export async function removeCourtMember(domain, id) {
	const member = normalizeCourt(domain?.system.court)[id];
	if (!member || !domain.isOwner) return false;

	if (member.name) {
		const confirmed = await confirmDialog({
			title: t("domain.court.remove"),
			icon: "fa-solid fa-user-xmark",
			message: t("domain.court.removeConfirm", {
				name: escapeHTML(member.name),
				role: t(`domain.court.roles.${member.role}.one`)
			})
		});
		if (!confirmed) return false;
	}

	await domain.update({ [`system.court.-=${id}`]: null });
	return true;
}
