import { keepHexSparks, throwSparkDice, wildernessHexTables } from "../actions/hex-lore.js";
import { t } from "../chat/cards.js";
import { tableView } from "../rules/gm-toolkit.js";
import { reducesMotion } from "../client-settings.js";
import { hexKey } from "../rules/realm-geometry.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { spinTable } from "./roll-spin.js";
import { animates, wireAnimateBox } from "./SparkTables.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Roll a wilderness hex on the tables the Nature page (p22) sets out for it,
 * laid out as the book prints them. The die rolls every table, a table's own
 * die rolls both its columns, a heading rolls its column, and a click on an
 * entry takes it by hand. Nothing is kept in the hex until the GM keeps it.
 * GMs only.
 */
export class WildernessHex extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-wilderness-hex-window"],
		position: { width: 820, height: "auto" },
		window: { icon: "fa-solid fa-wand-sparkles" },
		actions: {
			rollTable: WildernessHex.#onRollTable,
			pickRow: WildernessHex.#onPickRow,
			keep: WildernessHex.#onKeep
		}
	};

	static PARTS = {
		tables: { template: templatePath("apps/wilderness-hex.hbs") }
	};

	/**
	 * @param {object} options
	 * @param {Scene} options.scene
	 * @param {{col: number, row: number}} options.hex
	 * @param {{page: object, set: {index: number, table: object}[]}} options.tables From wildernessHexTables.
	 */
	constructor({ scene, hex, tables, ...options }) {
		super({ ...options, id: WildernessHex.idFor(scene, hex) });
		this.scene = scene;
		this.hex = hex;
		this.tables = tables;
		this.#taken = tables.set.map(({ table }) => table.columns.map(() => null));
	}

	/** @returns {string} The one window for a hex of a Realm. */
	static idFor(scene, hex) {
		return `bastionland-wilderness-hex-${scene.id}-${hexKey(hex).replace(",", "-")}`;
	}

	/** @type {(number|null)[][]} The row taken in each column of each table, from 1, or null. */
	#taken;

	/** Whether a roll's highlight is still running, so a second click waits for it. */
	#spinning = false;

	/** @override */
	get title() {
		return t("hexLore.wildHex.title", { hex: t("realm.hex", this.hex) });
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const { page, set } = this.tables;
		return Object.assign(context, {
			reference: t("hexLore.wildHex.reference", { page: page.page }),
			tables: set.map(({ table }, index) => ({
				index,
				name: table.name,
				rollLabel: t("hexLore.wildHex.rollTable", { name: table.name }),
				...tableView(table, this.#taken[index], (column) => t("hexLore.wildHex.rollColumn", { column }))
			})),
			nothingTaken: this.#taken.every((rows) => rows.every((row) => row === null)),
			animate: animates()
		});
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		wireAnimateBox(this.element);
	}

	/**
	 * Roll every table, one table's columns, or the column whose heading was
	 * clicked. Every highlight runs at once, and the rows stay taken once they land.
	 * @this {WildernessHex}
	 */
	static async #onRollTable(_event, target) {
		if (this.#spinning) return;
		const { table, column } = target.dataset;
		const tables = table === undefined ? this.tables.set.map((_, index) => index) : [Number(table)];
		const plan = tables.map((index) => ({
			index,
			columns: column === undefined ? this.tables.set[index].table.columns.map((_, at) => at) : [Number(column)]
		}));

		this.#spinning = true;
		try {
			const dice = await throwSparkDice(plan.reduce((count, { columns }) => count + columns.length, 0));
			// Closed while the dice were still rolling: nothing's left to spin, and nothing is kept.
			if (!this.rendered) return;
			let next = 0;
			const reduce = !animates() || reducesMotion();
			await Promise.all(plan.map(({ index, columns }) => {
				const rolls = columns.map(() => dice[next++]);
				columns.forEach((at, rolled) => (this.#taken[index][at] = rolls[rolled]));
				return spinTable(this.element.querySelector(`table[data-table="${index}"]`), columns, rolls.map((roll) => ({ roll })), { reduce });
			}));
		} finally {
			this.#spinning = false;
		}
		return this.render();
	}

	/**
	 * Take an entry by hand, or let it go if it's already the one taken.
	 * @this {WildernessHex}
	 */
	static #onPickRow(_event, target) {
		if (this.#spinning) return;
		const rows = this.#taken[Number(target.dataset.table)];
		const column = Number(target.dataset.column);
		const row = Number(target.dataset.row);
		if (!rows || !(column in rows)) return;
		rows[column] = rows[column] === row ? null : row;
		return this.render();
	}

	/**
	 * Keep what's taken in the hex, whisper the GMs its card, and close.
	 * @this {WildernessHex}
	 */
	static async #onKeep() {
		if (this.#spinning) return;
		const taken = this.tables.set.map(({ table }, index) => ({ table, rows: this.#taken[index] }));
		const kept = await keepHexSparks({ scene: this.scene, hex: this.hex, page: this.tables.page, taken });
		if (kept.length) return this.close();
	}
}

/**
 * Open the wilderness tables for a hex, bringing its window forward if it's
 * already open. GMs only.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}} options.hex
 * @returns {Promise<WildernessHex|null>} Null where Import PDF hasn't read the tables.
 */
export async function openWildernessHex({ scene, hex }) {
	if (!game.user.isGM || !scene || !hex) return null;
	const open = foundry.applications.instances.get(WildernessHex.idFor(scene, hex));
	if (open) {
		open.bringToFront();
		return open;
	}
	const tables = await wildernessHexTables();
	if (!tables) return null;
	const app = new WildernessHex({ scene, hex, tables });
	app.render({ force: true });
	return app;
}
