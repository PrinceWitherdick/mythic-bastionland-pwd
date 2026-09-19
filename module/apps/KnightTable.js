import { rollKnightTable, setKnightTableRows } from "../actions/knight-tables.js";
import { t } from "../chat/cards.js";
import { askedColumns, tableView } from "../rules/gm-toolkit.js";
import { hasTable } from "../rules/knight-tables.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { spinTable } from "./roll-spin.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The d6 table on a Knight's page, laid out as the book prints it, for them to
 * roll on and keep what it gives. The die rolls every column, a heading rolls
 * its own, and a click on an entry takes it by hand. Anyone who can see the
 * Knight can read it; only their owners roll.
 */
export class KnightTable extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-knight-table-window"],
		position: { width: 480, height: "auto" },
		window: { icon: "fa-solid fa-dice-d6" },
		actions: {
			rollTable: KnightTable.#onRollTable,
			pickRow: KnightTable.#onPickRow,
			clearRolls: KnightTable.#onClearRolls
		}
	};

	static PARTS = {
		table: { template: templatePath("apps/knight-table.hbs") }
	};

	/** @param {Actor} knight */
	constructor(knight, options = {}) {
		super({ ...options, id: `bastionland-knight-table-${knight.id}` });
		this.knight = knight;
	}

	/** Whether a roll's highlight is still running, so a second click waits for it. */
	#spinning = false;

	/** @override */
	get title() {
		const stored = this.knight.system.bookTable;
		return hasTable(stored) ? `${this.knight.name}: ${stored.name}` : this.knight.name;
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const stored = this.knight.system.bookTable;
		if (!hasTable(stored)) return Object.assign(context, { missing: true });
		return Object.assign(context, {
			editable: this.knight.isOwner,
			reference: stored.page ? t("knightTable.reference", { page: stored.page }) : "",
			...tableView(stored, stored.rolls, (column) => t("knightTable.rollColumn", { column })),
			rolledAny: (stored.rolls ?? []).some(Boolean)
		});
	}

	/** @override */
	_onFirstRender(context, options) {
		super._onFirstRender(context, options);
		// Drawn again whenever the Knight changes, as their sheet is.
		this.knight.apps[this.id] = this;
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		delete this.knight.apps[this.id];
	}

	/**
	 * Roll every column, or the one whose heading was clicked. The card goes out
	 * as the highlight starts down the table, and the rolls are kept once it lands.
	 * @this {KnightTable}
	 */
	static async #onRollTable(_event, target) {
		if (this.#spinning) return;
		const columns = askedColumns(this.knight.system.bookTable, Number(target.dataset.column));
		this.#spinning = true;
		try {
			const rolled = await rollKnightTable(this.knight, columns);
			if (!rolled) return;
			await Promise.all([rolled.card, spinTable(this.element, columns, rolled.results)]);
			await rolled.save();
		} finally {
			this.#spinning = false;
		}
	}

	/**
	 * Take an entry by hand, or let it go if it's already the one taken.
	 * @this {KnightTable}
	 */
	static #onPickRow(_event, target) {
		if (this.#spinning) return;
		const column = Number(target.dataset.column);
		const row = Number(target.dataset.row);
		const taken = this.knight.system.bookTable.rolls?.[column] === row;
		return setKnightTableRows(this.knight, [column], [taken ? 0 : row]);
	}

	/** @this {KnightTable} */
	static #onClearRolls() {
		if (this.#spinning) return;
		const { columns } = this.knight.system.bookTable;
		return setKnightTableRows(this.knight, columns.map((_, index) => index), columns.map(() => 0));
	}
}

/**
 * Show a Knight's table, bringing it forward if it's already open.
 * @param {Actor} knight
 * @returns {KnightTable}
 */
export function openKnightTable(knight) {
	const open = foundry.applications.instances.get(`bastionland-knight-table-${knight.id}`);
	const app = open ?? new KnightTable(knight);
	app.render({ force: true });
	if (open) app.bringToFront();
	return app;
}
