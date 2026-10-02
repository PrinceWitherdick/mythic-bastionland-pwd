import { calendarLabel } from "../actions/calendar.js";
import { HEX_LORE_FLAG, forgetHexRecord, forgetHexSpark, getHexRecord, writeHexNote } from "../actions/hex-lore.js";
import { forgetHexPartyNote, forgetHexShared, forgetHexTold, getHexSharedRecord, partyNoteView } from "../actions/hex-shared.js";
import { JOURNEY_FLAG, forgetHexVisit, forgetHexVisits, getHexVisits } from "../actions/journey.js";
import { t } from "../chat/cards.js";
import { HEX_SHARED_FLAG } from "../rules/hex-shared.js";
import { hexKey } from "../rules/realm-geometry.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { sparkWhen } from "./HexLore.js";
import { confirmDialog } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Everything kept for one hex of a Realm, to forget a piece at a time or all
 * at once: each time the Company came into it, the Spark Tables rolled there,
 * what the GM wrote about it, what the players were told of it and their own note. A Token dragged across the map while
 * preparing counts visits nobody made, and one of them can go without the rest.
 * GMs only.
 */
export class HexVisits extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-hex-visits-window"],
		position: { width: 420, height: "auto" },
		window: { icon: "fa-solid fa-eraser", resizable: true },
		actions: {
			forgetVisit: HexVisits.#onForgetVisit,
			forgetSpark: HexVisits.#onForgetSpark,
			forgetNote: HexVisits.#onForgetNote,
			forgetTold: HexVisits.#onForgetTold,
			forgetParty: HexVisits.#onForgetParty,
			forgetVisits: HexVisits.#onForgetVisits,
			forgetAll: HexVisits.#onForgetAll
		}
	};

	static PARTS = {
		body: { template: templatePath("apps/hex-visits.hbs"), scrollable: [".bastionland-hex-visits__lists"] }
	};

	/**
	 * @param {object} options
	 * @param {Scene} options.scene
	 * @param {{col: number, row: number}} options.hex
	 */
	constructor({ scene, hex, ...options }) {
		super({ ...options, id: HexVisits.idFor(scene, hex) });
		this.scene = scene;
		this.hex = hex;
	}

	/** @returns {string} The one window for a hex of a Realm. */
	static idFor(scene, hex) {
		return `bastionland-hex-visits-${scene.id}-${hexKey(hex).replace(",", "-")}`;
	}

	/** @type {number|null} */
	#hook = null;

	/** @override */
	get title() {
		return t("gmToolkit.visits.windowTitle", { hex: t("realm.hex", this.hex) });
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const visits = getHexVisits(this.scene, this.hex);
		const record = getHexRecord(this.scene, this.hex);
		const shared = getHexSharedRecord(this.scene, this.hex);
		const arrivals = visits?.arrivals ?? [];
		return Object.assign(context, {
			// The last come into first, each numbered as the Company made them.
			visits: arrivals.map((arrival, index) => ({
				order: arrival.order,
				label: t("gmToolkit.visits.nth", { count: index + 1 }),
				when: arrival.when ? calendarLabel(arrival.when) : t("gmToolkit.visits.unknown")
			})).reverse(),
			sparks: [...(record?.sparks ?? [])].reverse().map((spark) => ({
				id: spark.id,
				table: spark.table,
				prompt: spark.prompt,
				when: sparkWhen(spark)
			})),
			note: record?.note ?? "",
			told: [...(shared?.told ?? [])].reverse().map((told) => ({
				id: told.id,
				note: told.note,
				when: told.when ? t("travels.told.when", { when: calendarLabel(told.when) }) : null
			})),
			party: partyNoteView(shared?.party),
			noVisits: !arrivals.length,
			nothing: !arrivals.length && !record && !shared
		});
	}

	/**
	 * Draw again whenever the hex's visits or lore change, so what's listed is
	 * what's kept, but not for the Scene's other writes, such as a paint stroke.
	 * @override
	 */
	_onFirstRender(context, options) {
		super._onFirstRender(context, options);
		this.#hook = Hooks.on("updateScene", (scene, changes) => {
			const flags = changes.flags?.[SYSTEM_ID];
			if (scene.id === this.scene.id && flags && (JOURNEY_FLAG in flags || HEX_LORE_FLAG in flags || HEX_SHARED_FLAG in flags)) this.render();
		});
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		if (this.#hook !== null) Hooks.off("updateScene", this.#hook);
		this.#hook = null;
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {HexVisits} */
	static #onForgetVisit(_event, target) {
		const order = Number(target.dataset.order);
		if (Number.isFinite(order)) return forgetHexVisit(this.scene, this.hex, order);
	}

	/** @this {HexVisits} */
	static #onForgetSpark(_event, target) {
		const { spark } = target.dataset;
		if (spark) return forgetHexSpark(this.scene, this.hex, spark);
	}

	/** @this {HexVisits} */
	static #onForgetNote() {
		return writeHexNote(this.scene, this.hex, "");
	}

	/** @this {HexVisits} */
	static #onForgetTold(_event, target) {
		const { told } = target.dataset;
		if (told) return forgetHexTold(this.scene, this.hex, told);
	}

	/** @this {HexVisits} */
	static #onForgetParty() {
		return forgetHexPartyNote(this.scene, this.hex);
	}

	/** @this {HexVisits} */
	static async #onForgetVisits() {
		const confirmed = await confirmDialog({
			title: t("gmToolkit.visits.forgetTitle"),
			icon: "fa-solid fa-route",
			message: t("gmToolkit.visits.forgetConfirm", { hex: t("realm.hex", this.hex) })
		});
		if (confirmed) await forgetHexVisits(this.scene, this.hex);
	}

	/** @this {HexVisits} */
	static async #onForgetAll() {
		const confirmed = await confirmDialog({
			title: t("gmToolkit.visits.forgetAllTitle"),
			icon: "fa-solid fa-eraser",
			// Everything means the players' side of it too, and the Referee is told so before it goes.
			message: t(getHexSharedRecord(this.scene, this.hex) ? "gmToolkit.visits.forgetAllConfirmShared" : "gmToolkit.visits.forgetAllConfirm", { hex: t("realm.hex", this.hex) })
		});
		if (!confirmed) return;
		await forgetHexVisits(this.scene, this.hex);
		await forgetHexRecord(this.scene, this.hex);
		await forgetHexShared(this.scene, this.hex);
	}
}

/**
 * Open what's kept for a hex, bringing its window forward if it's already open.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}} options.hex
 * @returns {HexVisits|null}
 */
export function openHexVisits({ scene, hex }) {
	if (!game.user.isGM || !scene || !hex) return null;
	const app = foundry.applications.instances.get(HexVisits.idFor(scene, hex)) ?? new HexVisits({ scene, hex });
	app.render({ force: true });
	return app;
}
