import { hexLabel } from "../actions/hex-names.js";
import { forgetHexRecord, getHexRecord } from "../actions/hex-lore.js";
import { forgetHexShared, getHexSharedRecord } from "../actions/hex-shared.js";
import { forgetHexVisits, getHexVisits } from "../actions/journey.js";
import { t } from "../chat/cards.js";
import { confirmDialog } from "./ui.js";

/**
 * Forget what's kept in a hex all at once, from the two icons at the end of
 * its visits line in Places: every visit, or everything. A Token dragged
 * across the map while preparing counts visits nobody made. One visit at a
 * time, and each telling, goes by its × on the Journey page; the Spark
 * Tables rolled here and the GM's own note go where the hex shows them.
 */

/**
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @returns {{noVisits: boolean, nothing: boolean}} Which of the two has nothing to forget.
 */
export function hexForgetContext(scene, hex) {
	const visited = Boolean(getHexVisits(scene, hex)?.arrivals.length);
	return {
		noVisits: !visited,
		nothing: !visited && !getHexRecord(scene, hex) && !getHexSharedRecord(scene, hex)
	};
}

/**
 * What the two icons do, each handed the window's Scene and hex, as the GM part's other actions are.
 * @type {Record<string, (at: {scene: Scene, hex: {col: number, row: number}}) => Promise<unknown>|undefined>}
 */
export const HEX_FORGET_ACTIONS = Object.freeze({
	async forgetVisits({ scene, hex }) {
		const confirmed = await confirmDialog({
			title: t("gmToolkit.visits.forgetTitle"),
			icon: "fa-solid fa-route",
			message: t("gmToolkit.visits.forgetConfirm", { hex: hexLabel(hex, scene) })
		});
		if (confirmed) await forgetHexVisits(scene, hex);
	},
	async forgetAll({ scene, hex }) {
		const confirmed = await confirmDialog({
			title: t("gmToolkit.visits.forgetAllTitle"),
			icon: "fa-solid fa-eraser",
			// Everything means the players' side of it too, and the Referee is told so before it goes.
			message: t(getHexSharedRecord(scene, hex) ? "gmToolkit.visits.forgetAllConfirmShared" : "gmToolkit.visits.forgetAllConfirm", { hex: hexLabel(hex, scene) })
		});
		if (!confirmed) return;
		await forgetHexVisits(scene, hex);
		await forgetHexRecord(scene, hex);
		await forgetHexShared(scene, hex);
	}
});
