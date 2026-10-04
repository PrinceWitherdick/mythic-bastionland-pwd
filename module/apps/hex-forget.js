import { calendarLabel } from "../actions/calendar.js";
import { forgetHexRecord, getHexRecord } from "../actions/hex-lore.js";
import { forgetHexPartyNote, forgetHexShared, forgetHexTold, getHexSharedRecord, partyNoteView } from "../actions/hex-shared.js";
import { forgetHexVisit, forgetHexVisits, getHexVisits } from "../actions/journey.js";
import { toldLines } from "../actions/travels.js";
import { t } from "../chat/cards.js";
import { confirmDialog } from "./ui.js";

/**
 * Forget what's kept here, the GM's second fold in the Lay of the Land window: each
 * time the Company came into the hex, what the players were told of it and
 * their own note, to strike out one at a time or all at once. A Token dragged
 * across the map while preparing counts visits nobody made, and one of them
 * can go without the rest. The Spark Tables rolled here and the GM's own note
 * are struck out where the window already shows them.
 */

/**
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @returns {object}
 */
export function hexForgetContext(scene, hex) {
	const arrivals = getHexVisits(scene, hex)?.arrivals ?? [];
	const record = getHexRecord(scene, hex);
	const shared = getHexSharedRecord(scene, hex);
	return {
		// The last come into first, each numbered as the Company made them.
		visits: arrivals.map((arrival, index) => ({
			order: arrival.order,
			label: t("gmToolkit.visits.nth", { count: index + 1 }),
			when: arrival.when ? calendarLabel(arrival.when) : t("gmToolkit.visits.unknown")
		})).reverse(),
		told: toldLines([...(shared?.told ?? [])].reverse()),
		party: partyNoteView(shared?.party),
		noVisits: !arrivals.length,
		nothing: !arrivals.length && !record && !shared
	};
}

/**
 * What the fold's buttons do, each handed the window's Scene and hex and the button pressed.
 * @type {Record<string, (scene: Scene, hex: {col: number, row: number}, target: HTMLElement) => Promise<unknown>|undefined>}
 */
export const HEX_FORGET_ACTIONS = Object.freeze({
	forgetVisit(scene, hex, target) {
		const order = Number(target.dataset.order);
		if (Number.isFinite(order)) return forgetHexVisit(scene, hex, order);
	},
	forgetTold(scene, hex, target) {
		const { told } = target.dataset;
		if (told) return forgetHexTold(scene, hex, told);
	},
	forgetParty: (scene, hex) => forgetHexPartyNote(scene, hex),
	async forgetVisits(scene, hex) {
		const confirmed = await confirmDialog({
			title: t("gmToolkit.visits.forgetTitle"),
			icon: "fa-solid fa-route",
			message: t("gmToolkit.visits.forgetConfirm", { hex: t("realm.hex", hex) })
		});
		if (confirmed) await forgetHexVisits(scene, hex);
	},
	async forgetAll(scene, hex) {
		const confirmed = await confirmDialog({
			title: t("gmToolkit.visits.forgetAllTitle"),
			icon: "fa-solid fa-eraser",
			// Everything means the players' side of it too, and the Referee is told so before it goes.
			message: t(getHexSharedRecord(scene, hex) ? "gmToolkit.visits.forgetAllConfirmShared" : "gmToolkit.visits.forgetAllConfirm", { hex: t("realm.hex", hex) })
		});
		if (!confirmed) return;
		await forgetHexVisits(scene, hex);
		await forgetHexRecord(scene, hex);
		await forgetHexShared(scene, hex);
	}
});
