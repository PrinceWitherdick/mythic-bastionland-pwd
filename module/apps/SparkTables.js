import { rollSpark } from "../actions/referee-rolls.js";
import { loadArtIndex } from "../book-art/art-index.js";
import { postCard, t } from "../chat/cards.js";
import { SPARK_PAGES } from "../rules/spark-tables.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { singletonOpener } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The Spark Tables read from the GM's own rulebook, one page at a time the way
 * the book lays them out. Rolling a table rolls a d12 for each column and posts
 * the prompt, and the window marks the entries it landed on.
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

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {SparkTables} */
	static #onShowPage(_event, target) {
		const { page } = target.dataset;
		if (!SPARK_PAGES.some(({ key }) => key === page) || page === this.#page) return;
		this.#page = page;
		return this.render();
	}

	/** @this {SparkTables} */
	static async #onRoll(_event, target) {
		const shown = this.#shown();
		const index = Number(target.dataset.table);
		const table = shown?.tables[index];
		if (!table) return;

		const { roll, results, prompt } = await rollSpark(table);
		this.#last = { page: this.#page, table: index, rolls: results.map((result) => result.roll) };

		await postCard(null, "spark", {
			name: table.name,
			tagline: t("spark.tagline", { page: shown.name, number: shown.page }),
			prompt,
			results
		}, { rolls: [roll] });
		return this.render();
	}
}

/** Open the Spark Tables, bringing the window forward if it's already open. */
export const openSparkTables = singletonOpener(SparkTables);
