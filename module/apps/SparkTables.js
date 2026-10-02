import { companyTokenHex } from "../actions/company.js";
import { keepTableRoll } from "../actions/hex-lore.js";
import { keepHexPerson, postPerson, rollPersonTables } from "../actions/people.js";
import { isRealmScene } from "../actions/realm.js";
import { rollSpark } from "../actions/referee-rolls.js";
import { loadArtIndex } from "../book-art/art-index.js";
import { postCard, t } from "../chat/cards.js";
import { read, reducesMotion } from "../client-settings.js";
import { sparkKeepTarget } from "../rules/hex-lore.js";
import { PEOPLE_PAGE } from "../rules/people.js";
import { SPARK_PAGES } from "../rules/spark-tables.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { spinTable } from "./roll-spin.js";
import { toggleShown } from "./ui.js";

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

/** The Lay of the Land's window, found by its id since it's the one that opens these tables. */
const HEX_LORE_ID = "bastionland-hex-lore";

/** @type {SparkTables|null} The window, once opened. */
let window_ = null;

/**
 * Where a roll here is kept: the hex the Lay of the Land is open on, or else
 * the one the Company stands in on the Realm being viewed.
 * @returns {{scene: Scene, hex: {col: number, row: number}}|null}
 */
function keepTarget() {
	const open = foundry.applications.instances.get(HEX_LORE_ID);
	const loreScene = open?.rendered && open.hex ? game.scenes.get(open.sceneId) : null;
	const lore = isRealmScene(loreScene) ? { scene: loreScene, hex: open.hex } : null;
	const viewed = canvas?.scene ?? null;
	const companyHex = isRealmScene(viewed) ? companyTokenHex(viewed) : null;
	return sparkKeepTarget({ lore, company: companyHex ? { scene: viewed, hex: companyHex } : null });
}

/** @returns {{label: string, disabled: boolean}} What the Keep rolls box says now. */
function keepWords() {
	const target = keepTarget();
	return target
		? { label: t("spark.keepIn", { hex: t("realm.hex", target.hex) }), disabled: false }
		: { label: t("spark.keepNone"), disabled: true };
}

/**
 * Say again where rolls are kept, as the Lay of the Land opens on a hex, moves
 * or closes. The box alone is touched: a redraw would cut a running highlight
 * short and wipe the entries it marked.
 */
export function refreshSparkKeep() {
	const box = window_?.rendered ? window_.element.querySelector("[name=keep]") : null;
	if (!box) return;
	const { label, disabled } = keepWords();
	box.disabled = disabled;
	const words = box.closest("label")?.querySelector(".bastionland-check__label");
	if (words) words.textContent = label;
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
			roll: SparkTables.#onRoll,
			rollPerson: SparkTables.#onRollPerson
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

	/** @type {{page: string, tables: Record<number, number[]>}|null} The last roll made here: the rolls on each table it took in. */
	#last = null;

	/** A roll's highlight is still running. */
	#spinning = false;

	/** Whether rolls made here are kept in a hex. Ticked each time the window opens. */
	#keep = true;

	/** @returns {{scene: Scene, hex: {col: number, row: number}}|null} Where a roll made now is kept, if anywhere. */
	#keeping() {
		return this.#keep ? keepTarget() : null;
	}

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
			keep: { checked: this.#keep, ...keepWords() },
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
						rolled: last?.tables[index]?.[column] === row + 1
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
		this.element.querySelector("[name=keep]")?.addEventListener("change", (event) => {
			this.#keep = event.currentTarget.checked;
		});
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		this.#keep = true;
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
			this.#last = { page: this.#page, tables: { [index]: results.map((result) => result.roll) } };
			this.#clearMarks();

			const card = postCard(null, "spark", {
				name: table.name,
				tagline: t("spark.tagline", { page: shown.name, number: shown.page }),
				prompt,
				results
			}, { rolls: [roll] });
			const spin = spinTable(this.element.querySelector(`table[data-table="${index}"]`), table.columns.map((_, column) => column), results, {
				reduce: !animates() || reducesMotion()
			});
			const target = this.#keeping();
			const kept = target ? keepTableRoll({ ...target, page: shown, table, results }) : null;
			await Promise.all([card, spin, kept]);
		} finally {
			this.#spinning = false;
			refreshSparkKeep();
		}
		// No redraw: the entries it landed on are marked already, and a redraw would cut their flash short.
	}

	/** The last roll's marks go as the next one starts. */
	#clearMarks() {
		for (const cell of this.element.querySelectorAll(".bastionland-spark__table td.is-rolled")) cell.classList.remove("is-rolled");
	}

	/**
	 * Roll a person on every People table at once (p200, p202). The window turns
	 * to the People page so the highlight can run down each table, and one card
	 * goes out for the lot.
	 * @this {SparkTables}
	 */
	static async #onRollPerson() {
		if (this.#spinning) return;
		this.#spinning = true;
		try {
			const person = await rollPersonTables();
			if (!person) return;
			this.#last = { page: PEOPLE_PAGE, tables: Object.fromEntries(person.rolled.map(({ results }, index) => [index, results.map((result) => result.roll)])) };
			if (this.#page === PEOPLE_PAGE) this.#clearMarks();
			else {
				// Drawn with the roll already marked, which the highlight then runs down to.
				this.#page = PEOPLE_PAGE;
				await this.render();
			}
			const reduce = !animates() || reducesMotion();
			const spins = person.rolled.map(({ table, results }, index) => spinTable(
				this.element.querySelector(`table[data-table="${index}"]`),
				table.columns.map((_, column) => column),
				results,
				{ reduce }
			));
			const target = this.#keeping();
			const kept = target ? keepHexPerson(target.scene, target.hex, person) : null;
			await Promise.all([postPerson(person), kept, ...spins]);
		} finally {
			this.#spinning = false;
			// The Company may have moved on since the box last said where rolls go.
			refreshSparkKeep();
		}
	}
}

/**
 * Open the Spark Tables, bringing the window forward if it's already open.
 * @returns {SparkTables}
 */
export function openSparkTables() {
	window_ ??= new SparkTables();
	window_.render({ force: true });
	return window_;
}

/**
 * The Spark Tables hotkey: open them, or close them when they're already in front.
 * @returns {true} The key is taken, so the hotbar's own 6 doesn't run as well.
 */
export function toggleSparkTables() {
	if (!toggleShown(window_)) openSparkTables();
	return true;
}
