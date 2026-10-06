import { hexLabel } from "../actions/hex-names.js";
import { forgetHexRecord, getHexRecord } from "../actions/hex-lore.js";
import { forgetHexShared, getHexSharedRecord } from "../actions/hex-shared.js";
import { forgetHexVisits, getHexVisits } from "../actions/journey.js";
import { t } from "../chat/cards.js";
import { inputDialog } from "./ui.js";

/**
 * Forget what's kept in a hex, from the eraser at the end of its visits line
 * in Places: a dialog lists each kind of thing kept there, with how much,
 * and the Referee ticks which go. A Token dragged across the map while
 * preparing counts visits nobody made. One visit at a time, and each telling,
 * goes by its × on the Journey page; one Spark Table roll, or the GM's own
 * note, where the hex shows them.
 */

/** Each kind of thing a hex keeps, in the order the dialog lists them: the Referee's own first, then what the players see. */
export const HEX_FORGET_PARTS = Object.freeze(["visits", "sparks", "note", "told", "met", "party"]);

/**
 * How much of each kind a hex keeps.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {object} [read] What's kept there, where the caller has it already.
 * @param {object|null} [read.lore] Its hex lore record.
 * @param {object|null} [read.visits] Its visits.
 * @returns {Record<string, number>} Keyed by HEX_FORGET_PARTS; a note counts as one.
 */
export function hexForgetCounts(scene, hex, { lore = getHexRecord(scene, hex), visits = getHexVisits(scene, hex) } = {}) {
	const shared = getHexSharedRecord(scene, hex);
	return {
		visits: visits?.arrivals.length ?? 0,
		sparks: lore?.sparks.length ?? 0,
		note: lore?.note ? 1 : 0,
		told: shared?.told.length ?? 0,
		met: shared?.met?.length ?? 0,
		party: shared?.party ? 1 : 0
	};
}

/**
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {object} [read] What's kept there, where the caller has it already, as hexForgetCounts takes it.
 * @returns {{nothing: boolean}} Whether the eraser has nothing to forget.
 */
export function hexForgetContext(scene, hex, read) {
	return { nothing: !Object.values(hexForgetCounts(scene, hex, read)).some(Boolean) };
}

/**
 * What the eraser does, handed the window's Scene and hex, as the GM part's other actions are.
 * @type {Record<string, (at: {scene: Scene, hex: {col: number, row: number}}) => Promise<unknown>|undefined>}
 */
export const HEX_FORGET_ACTIONS = Object.freeze({
	async forgetHex({ scene, hex }) {
		const counts = hexForgetCounts(scene, hex);
		const kept = HEX_FORGET_PARTS.filter((key) => counts[key]);
		if (!kept.length) return;
		const data = await inputDialog({
			title: t("gmToolkit.visits.forgetTitle"),
			icon: "fa-solid fa-eraser",
			template: "hex-forget",
			context: {
				legend: t("gmToolkit.visits.forgetIntro", { hex: hexLabel(hex, scene) }),
				many: kept.length > 1,
				// Visits start ticked, as the likeliest to want forgetting: those a Token made while the Referee prepared.
				parts: kept.map((key) => ({
					key,
					label: t(`gmToolkit.visits.forgetParts.${key}.label`, { count: counts[key] }),
					detail: t(`gmToolkit.visits.forgetParts.${key}.detail`),
					checked: key === "visits"
				}))
			},
			ok: { label: t("gmToolkit.visits.forgetOk"), icon: "fa-solid fa-eraser" }
		});
		if (!data) return;
		// Each is a flag of its own, so the three writes needn't wait on one another; a part not ticked writes nothing.
		const on = (key) => Boolean(data[key]);
		await Promise.all([
			on("visits") && forgetHexVisits(scene, hex),
			forgetHexRecord(scene, hex, { sparks: on("sparks"), note: on("note") }),
			forgetHexShared(scene, hex, { told: on("told"), met: on("met"), party: on("party") })
		]);
	}
});
