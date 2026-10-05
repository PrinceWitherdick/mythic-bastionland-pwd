import { hexLabel } from "../actions/hex-names.js";
import { companyTokenHex } from "../actions/company.js";
import { keepHexSparks, keepTableRoll, throwSparkDice, wildernessHexTables } from "../actions/hex-lore.js";
import { keepHexPerson, namesForHex, postPerson, rollPersonTables } from "../actions/people.js";
import { isRealmScene } from "../actions/realm.js";
import { rollSpark } from "../actions/referee-rolls.js";
import { loadArtIndex } from "../book-art/art-index.js";
import { postCard, t } from "../chat/cards.js";
import { read, reducesMotion } from "../client-settings.js";
import { tableView } from "../rules/gm-toolkit.js";
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
const animates = () => read(ANIMATE_SETTING, true) !== false;

/**
 * Wire an Animate selection tick box to the setting, so each window that shows
 * one leaves it the same for the others.
 * @param {HTMLElement} root
 */
function wireAnimateBox(root) {
	root.querySelector("[name=animate]")?.addEventListener("change", (event) => {
		game.settings.set(SYSTEM_ID, ANIMATE_SETTING, event.currentTarget.checked);
	});
}

/**
 * The page a wilderness hex is rolled on (p22): the Nature page's tables for
 * one, chosen by dice or by hand and kept in the hex together. It comes before
 * the book's own pages.
 */
export const WILD_PAGE = "wild";

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

/** The words for where rolls are kept: the Keep rolls box's, or the Wilderness Hex page's Save button's. */
const KEEP_IN = "spark.keepIn";
const WILD_KEEP_IN = "hexLore.wildHex.keepIn";

/**
 * @param {string} [key] KEEP_IN or WILD_KEEP_IN.
 * @param {{scene: Scene, hex: {col: number, row: number}}|null} [target] Where it keeps, if not where rolls are kept now.
 * @returns {{label: string, disabled: boolean}} What the Keep rolls box, or the Save button, says now.
 */
function keepWords(key = KEEP_IN, target = keepTarget()) {
	return target
		? { label: t(key, { hex: hexLabel(target.hex, target.scene) }), disabled: false }
		: { label: t("spark.keepNone"), disabled: true };
}

/**
 * Say again where rolls are kept, as the Lay of the Land opens on a hex, moves
 * or closes. The box and the Save button alone are touched: a redraw would cut
 * a running highlight short and wipe the entries it marked.
 */
export function refreshSparkKeep() {
	if (!window_?.rendered) return;
	const box = window_.element.querySelector("[name=keep]");
	if (box) {
		const { label, disabled } = keepWords();
		box.disabled = disabled;
		const words = box.closest("label")?.querySelector(".bastionland-check__label");
		if (words) words.textContent = label;
	}
	const save = window_.element.querySelector("[data-keep-wild]");
	if (save) {
		const { label, disabled } = keepWords(WILD_KEEP_IN, window_.wildTarget);
		save.disabled = disabled || save.hasAttribute("data-nothing-taken");
		const words = save.querySelector("[data-keep-label]");
		if (words) words.textContent = label;
	}
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
			rollPerson: SparkTables.#onRollPerson,
			rollWild: SparkTables.#onRollWild,
			pickRow: SparkTables.#onPickRow,
			keepWild: SparkTables.#onKeepWild
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

	/** @type {{page: object, set: {index: number, table: object}[]}|null|undefined} The wilderness tables: undefined until read, null if the Nature page hasn't been. */
	#wild;

	/** @type {(number|null)[][]|null} The row taken in each column of each wilderness table, from 1, or null. */
	#taken = null;

	/** @type {{scene: Scene, hex: {col: number, row: number}}|null} The hex the wilderness rows were taken for, from the first one taken. */
	#takenFor = null;

	/**
	 * Where the Wilderness Hex page's Save keeps what's taken: the hex it was
	 * taken for, so a Lay of the Land turned to another hex since doesn't
	 * take it, or else where rolls are kept now.
	 * @returns {{scene: Scene, hex: {col: number, row: number}}|null}
	 */
	get wildTarget() {
		if (this.#takenFor && game.scenes.get(this.#takenFor.scene.id)) return this.#takenFor;
		return keepTarget();
	}

	/** Note the hex rows are taken for, as the first is; forget it once none are left. */
	#noteTakenFor() {
		const anyTaken = this.#taken?.some((rows) => rows.some((row) => row !== null));
		if (!anyTaken) this.#takenFor = null;
		else this.#takenFor ??= keepTarget();
	}

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
		const wildShown = this.#page === WILD_PAGE;
		const shown = wildShown ? null : this.#shown();
		const last = this.#last?.page === this.#page ? this.#last : null;

		let notice = null;
		if (!this.index) notice = t("spark.noIndex");
		else if (!imported.length) notice = t("spark.noText");

		return Object.assign(context, {
			notice,
			animate: animates(),
			keep: { checked: this.#keep, ...keepWords() },
			pages: [WILD_PAGE, ...SPARK_PAGES.map(({ key }) => key)].map((key) => ({
				key,
				label: imported.find((page) => page.key === key)?.name ?? t(`spark.pages.${key}`),
				active: key === this.#page
			})),
			wild: wildShown && this.index ? await this.#wildContext() : null,
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
			empty: Boolean(this.index?.spark) && !wildShown && !shown
		});
	}

	/** @returns {Promise<object>} The Wilderness Hex page: the Nature page's tables for a hex, and what's taken from them. */
	async #wildContext() {
		if (this.#wild === undefined) this.#wild = await wildernessHexTables();
		if (!this.#wild) return { missing: true };
		const { page, set } = this.#wild;
		this.#taken ??= set.map(({ table }) => table.columns.map(() => null));
		const nothingTaken = this.#taken.every((rows) => rows.every((row) => row === null));
		const save = keepWords(WILD_KEEP_IN, this.wildTarget);
		return {
			reference: t("hexLore.wildHex.reference", { page: page.page }),
			tables: set.map(({ table }, index) => ({
				index,
				name: table.name,
				rollLabel: t("hexLore.wildHex.rollTable", { name: table.name }),
				...tableView(table, this.#taken[index], (column) => t("hexLore.wildHex.rollColumn", { column }))
			})),
			nothingTaken,
			save: { label: save.label, disabled: save.disabled || nothingTaken }
		};
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
		if (page === this.#page) return;
		return this.turnTo(page);
	}

	/**
	 * Show one of the pages: the Wilderness Hex page or one of the book's.
	 * @param {string} page
	 * @returns {Promise<SparkTables>|undefined} Undefined when there's no such page, or a roll is still running.
	 */
	turnTo(page) {
		if (this.#spinning || (page !== WILD_PAGE && !SPARK_PAGES.some(({ key }) => key === page))) return;
		this.#page = page;
		return this.render({ force: true });
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

	/**
	 * Roll every wilderness table, one table's columns, or the column whose
	 * heading was clicked, where only the GMs see the dice. Every highlight runs
	 * at once, and the rows stay taken once they land. Nothing is kept yet.
	 * @this {SparkTables}
	 */
	static async #onRollWild(_event, target) {
		if (this.#spinning || !this.#wild || !this.#taken) return;
		const { table, column } = target.dataset;
		const tables = table === undefined ? this.#wild.set.map((_, index) => index) : [Number(table)];
		const plan = tables.map((index) => ({
			index,
			columns: column === undefined ? this.#wild.set[index].table.columns.map((_, at) => at) : [Number(column)]
		}));

		this.#spinning = true;
		try {
			const dice = await throwSparkDice(plan.reduce((count, { columns }) => count + columns.length, 0));
			// Closed, or turned from, while the dice were still rolling: nothing's left to spin.
			if (!this.rendered || this.#page !== WILD_PAGE) return;
			let next = 0;
			const reduce = !animates() || reducesMotion();
			// Every row rolled afresh is taken for the hex rolls are kept in now.
			if (table === undefined && column === undefined) this.#takenFor = null;
			await Promise.all(plan.map(({ index, columns }) => {
				const rolls = columns.map(() => dice[next++]);
				columns.forEach((at, rolled) => (this.#taken[index][at] = rolls[rolled]));
				this.#noteTakenFor();
				return spinTable(this.element.querySelector(`table[data-wild-table="${index}"]`), columns, rolls.map((roll) => ({ roll })), { reduce });
			}));
		} finally {
			this.#spinning = false;
		}
		return this.render();
	}

	/**
	 * Take a wilderness entry by hand, or let it go if it's already the one taken.
	 * @this {SparkTables}
	 */
	static #onPickRow(_event, target) {
		if (this.#spinning) return;
		const rows = this.#taken?.[Number(target.dataset.table)];
		const column = Number(target.dataset.column);
		const row = Number(target.dataset.row);
		if (!rows || !(column in rows)) return;
		rows[column] = rows[column] === row ? null : row;
		this.#noteTakenFor();
		return this.render();
	}

	/**
	 * Keep what's taken from the wilderness tables in the hex rolls are kept in,
	 * whisper the GMs its card, and clear the page for the next hex.
	 * @this {SparkTables}
	 */
	static async #onKeepWild() {
		const target = this.wildTarget;
		if (this.#spinning || !this.#wild || !this.#taken || !target) return;
		const taken = this.#wild.set.map(({ table }, index) => ({ table, rows: this.#taken[index] }));
		const kept = await keepHexSparks({ ...target, page: this.#wild.page, taken });
		if (!kept.length) return;
		this.#taken = null;
		this.#takenFor = null;
		return this.render();
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
			const [name] = namesForHex(target?.scene ?? null, target?.hex ?? null, 1);
			const kept = target ? keepHexPerson(target.scene, target.hex, person, name) : null;
			await Promise.all([postPerson(person, { name }), kept, ...spins]);
		} finally {
			this.#spinning = false;
			// The Company may have moved on since the box last said where rolls go.
			refreshSparkKeep();
		}
	}
}

/**
 * Open the Spark Tables, bringing the window forward if it's already open.
 * @param {object} [options]
 * @param {string} [options.page] The page to turn to, such as WILD_PAGE for a wilderness hex.
 * @returns {SparkTables}
 */
export function openSparkTables({ page } = {}) {
	window_ ??= new SparkTables();
	if (!page || !window_.turnTo(page)) window_.render({ force: true });
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
