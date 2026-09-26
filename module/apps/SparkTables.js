import { rollSpark } from "../actions/referee-rolls.js";
import { loadArtIndex } from "../book-art/art-index.js";
import { postCard, t } from "../chat/cards.js";
import { read, reducesMotion } from "../client-settings.js";
import { SPARK_PAGES } from "../rules/spark-tables.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { spinTable } from "./roll-spin.js";
import { singletonOpener } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Whether a roll runs its highlight down the columns, as each browser left the tick box. */
const ANIMATE_SETTING = "sparkAnimate";

/** Register the Animate selection tick box's setting. Called during init. */
export function registerSparkTablesSetting() {
	game.settings.register(SYSTEM_ID, ANIMATE_SETTING, {
		scope: "client",
		config: false,
		type: Boolean,
		default: true
	});
}

/** @returns {boolean} Whether a roll on any Spark Table window runs its highlight. */
export const animates = () => read(ANIMATE_SETTING, true) !== false;

/**
 * Wire an Animate selection tick box to the setting, so each window that shows
 * one leaves it the same for the others.
 * @param {HTMLElement} root
 */
export function wireAnimateBox(root) {
	root.querySelector("[name=animate]")?.addEventListener("change", (event) => {
		game.settings.set(SYSTEM_ID, ANIMATE_SETTING, event.currentTarget.checked);
	});
}

/**
 * The Spark Tables read from the GM's own rulebook, one page at a time the way
 * the book lays them out. Rolling a table rolls a d12 for each column and posts
 * the prompt, while a highlight runs down each column to the entry it landed on.
 */
export class SparkTables extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-spark-window"],
		position: { width: 780, height: 760 },
		window: { title: "bastionland.spark.title", icon: "fa-solid fa-wand-sparkles", resizable: true },
		actions: {
			showPage: SparkTables.#onShowPage,
			roll: SparkTables.#onRoll
		}
	};

	static PARTS = {
		tables: {
			template: templatePath("apps/spark-tables.hbs"),
			scrollable: [".bastionland-spark__grid"]
		}
	};

	/** @type {object|null|undefined} The art index: undefined until loaded, null if never imported. */
	index;

	/** The page on show, one of SPARK_PAGES. */
	#page = SPARK_PAGES[0].key;

	/** @type {{page: string, table: number, rolls: number[]}|null} The last roll made here. */
	#last = null;

	/** A roll's highlight is still running. */
	#spinning = false;

	/** @returns {object|null} The page on show, as the art index holds it. */
	#shown() {
		return this.index?.spark?.find((page) => page.key === this.#page) ?? null;
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		if (this.index === undefined) this.index = await loadArtIndex();
		const imported = this.index?.spark ?? [];
		const shown = this.#shown();
		const last = this.#last?.page === this.#page ? this.#last : null;

		let notice = null;
		if (!this.index) notice = t("spark.noIndex");
		else if (!imported.length) notice = t("spark.noText");

		return Object.assign(context, {
			notice,
			animate: animates(),
			pages: SPARK_PAGES.map(({ key }) => ({
				key,
				label: imported.find((page) => page.key === key)?.name ?? t(`spark.pages.${key}`),
				active: key === this.#page
			})),
			reference: shown ? t("spark.reference", { page: shown.page }) : null,
			tables: (shown?.tables ?? []).map((table, index) => ({
				index,
				name: table.name,
				rollLabel: t("spark.rollTable", { name: table.name }),
				columns: table.columns,
				rows: table.rows.map((entries, row) => ({
					number: row + 1,
					entries: entries.map((entry, column) => ({
						entry,
						rolled: last?.table === index && last.rolls[column] === row + 1
					}))
				}))
			})),
			empty: Boolean(this.index?.spark) && !shown
		});
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		wireAnimateBox(this.element);
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {SparkTables} */
	static #onShowPage(_event, target) {
		if (this.#spinning) return;
		const { page } = target.dataset;
		if (!SPARK_PAGES.some(({ key }) => key === page) || page === this.#page) return;
		this.#page = page;
		return this.render();
	}

	/**
	 * Roll a table. The card goes out as the highlight starts down its columns,
	 * and the entries stay marked once it lands.
	 * @this {SparkTables}
	 */
	static async #onRoll(_event, target) {
		if (this.#spinning) return;
		const shown = this.#shown();
		const index = Number(target.dataset.table);
		const table = shown?.tables[index];
		if (!table) return;

		this.#spinning = true;
		try {
			const { roll, results, prompt } = await rollSpark(table);
			this.#last = { page: this.#page, table: index, rolls: results.map((result) => result.roll) };
			// The last roll's marks go as this one starts.
			for (const cell of this.element.querySelectorAll(".bastionland-spark__table td.is-rolled")) cell.classList.remove("is-rolled");

			const card = postCard(null, "spark", {
				name: table.name,
				tagline: t("spark.tagline", { page: shown.name, number: shown.page }),
				prompt,
				results
			}, { rolls: [roll] });
			const spin = spinTable(this.element.querySelector(`table[data-table="${index}"]`), table.columns.map((_, column) => column), results, {
				reduce: !animates() || reducesMotion()
			});
			await Promise.all([card, spin]);
		} finally {
			this.#spinning = false;
		}
		// No redraw: the entries it landed on are marked already, and a redraw would cut their flash short.
	}
}

/** Open the Spark Tables, bringing the window forward if it's already open. */
export const openSparkTables = singletonOpener(SparkTables);
