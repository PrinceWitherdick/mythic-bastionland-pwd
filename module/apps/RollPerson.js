import { hexLabel } from "../actions/hex-names.js";
import { peopleTables, saveHexPerson } from "../actions/people.js";
import { t } from "../chat/cards.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { noPicks, pickRow, pickTablesView } from "../rules/gm-toolkit.js";
import { sameHex } from "../rules/realm-geometry.js";
import { animates, rollPicks, wireAnimateBox } from "./SparkTables.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** @type {RollPerson|null} The window, once opened. */
let window_ = null;

/**
 * Roll a Person, from a hex's Lay of the Land: the People Spark Tables (p24)
 * alone, every one rolled as the window opens, as the Referee rolls a ruler or
 * a stranger (p200, p202). Any table or column can be rolled again or an entry
 * chosen by hand, and Save keeps the person in the hex with a name of their own.
 */
export class RollPerson extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-spark-window"],
		position: { width: 780, height: 720 },
		window: { title: "bastionland.people.roll", icon: "fa-solid fa-user", resizable: true },
		actions: {
			rollPick: RollPerson.#onRollPick,
			pickRow: RollPerson.#onPickRow,
			save: RollPerson.#onSave
		}
	};

	static PARTS = {
		person: {
			template: templatePath("apps/roll-person.hbs"),
			scrollable: [".bastionland-wilderness-hex"]
		}
	};

	/** @type {{scene: Scene, hex: {col: number, row: number}}|null} The hex the person is met in. */
	target = null;

	/** @type {object|null|undefined} The People page: undefined until read, null if Import PDF hasn't read it. */
	#page;

	/** @type {(number|null)[][]|null} The row taken in each column of each table, from 1, or null. */
	#taken = null;

	/** A roll's highlight is still running. */
	#spinning = false;

	/** @returns {boolean} Whether a roll is under way. */
	get spinning() {
		return this.#spinning;
	}

	/**
	 * Meet someone in another hex: whatever was taken for the last one goes.
	 * @param {{scene: Scene, hex: {col: number, row: number}}} target
	 */
	meet(target) {
		this.target = target;
		this.#taken = null;
		// The page is looked for again, should Import PDF have read it since.
		if (this.#page === null) this.#page = undefined;
	}

	/** @returns {boolean} Whether this is the hex the window is open for. */
	isFor({ scene, hex }) {
		const at = this.target;
		return Boolean(this.rendered && at && at.scene.id === scene.id && sameHex(at.hex, hex));
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		if (this.#page === undefined) this.#page = await peopleTables();
		const page = this.#page;
		if (!page) return Object.assign(context, { missing: true });
		this.#taken ??= noPicks(page.tables);
		return Object.assign(context, {
			animate: animates(),
			hint: t("people.window.hint", { hex: this.target ? hexLabel(this.target.hex, this.target.scene) : "" }),
			reference: t("hexLore.wildHex.reference", { page: page.page }),
			...pickTablesView(page.tables, this.#taken, {
				table: (name) => t("people.window.rollTable", { name }),
				column: (column) => t("people.window.rollColumn", { column })
			})
		});
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		wireAnimateBox(this.element);
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		this.#taken = null;
	}

	/**
	 * Roll every table, one table's columns, or one column (rollPicks).
	 * @param {{table?: string, column?: string}} [which] Neither for every table.
	 * @returns {Promise<RollPerson|undefined>}
	 */
	async roll(which = {}) {
		if (this.#spinning || !this.#page || !this.#taken) return;
		this.#spinning = true;
		try {
			// Closed while the dice were still rolling: nothing's left to spin.
			if (!(await rollPicks(this.#page.tables, this.#taken, which, () => (this.rendered ? this.element : null)))) return;
		} finally {
			this.#spinning = false;
		}
		return this.render();
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {RollPerson} */
	static #onRollPick(_event, target) {
		return this.roll(target.dataset);
	}

	/**
	 * Take an entry by hand, or let it go if it's already the one taken.
	 * @this {RollPerson}
	 */
	static #onPickRow(_event, target) {
		if (!this.#spinning && pickRow(this.#taken, target.dataset)) return this.render();
	}

	/**
	 * Keep the person in the hex, whisper the GMs their card, and close.
	 * @this {RollPerson}
	 */
	static async #onSave() {
		if (this.#spinning || !this.#page || !this.#taken || !this.target) return;
		const saved = await saveHexPerson({ ...this.target, page: this.#page, taken: this.#taken });
		if (saved) return this.close();
	}
}

/**
 * Open Roll a Person for a hex and roll every table. Already open for that hex,
 * it's brought forward as it stands.
 * @param {{scene: Scene, hex: {col: number, row: number}}} target
 * @returns {Promise<RollPerson>}
 */
export async function openRollPerson(target) {
	window_ ??= new RollPerson();
	if (window_.isFor(target) || window_.spinning) {
		window_.bringToFront();
		return window_;
	}
	window_.meet(target);
	await window_.render({ force: true });
	await window_.roll();
	return window_;
}
